// POST /api/empty-legs — server-side creation of an empty-leg listing.
//
// Reason this exists (spec §4 / §6): the regulatory pricing invariants live
// in a single function — computePricing. The WhatsApp bot honours them; so
// must the web /app/post form, the hotel concierge widget (future), and
// any other caller that writes into empty_legs. A DB CHECK catches violators
// but the driver sees a 500 instead of "raise your price above the €X floor".
// This route wraps both in one place so the web form gets the same helpful
// errors the bot gives.
//
// Resolution path:
//   1. Authn (anon cookie client) — seller_id = auth.uid().
//   2. Free-text origin/destination → LicenceDistrict via district-resolver.
//      If either is unrecognised we fall through to a plain insert; the
//      DB CHECK is the backstop and the user will have to retype with a
//      known Cyprus locality.
//   3. If both districts resolve AND we have a meter rate, run
//      computePricing and snapshot floor/ceiling/meter into the row.
//   4. Validate asking_price against the pricing output; return 422 with
//      a localised message if it fails.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import { resolveDistrictFromText } from '@/lib/services/district-resolver';
import { fetchMeterRate } from '@/lib/services/whatsapp/meter-lookup';
import {
  PricingError,
  computePricing,
  type PricingInput,
  type PricingOutput,
} from '@/lib/services/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PostBody {
  origin: string;
  destination: string;
  leg_type: 'standard' | 'airport_inbound' | 'airport_outbound' | 'long_distance' | 'repositioning';
  departure_datetime: string; // ISO
  is_time_flexible?: boolean;
  passenger_capacity: number;
  luggage_capacity: 'none' | 'small' | 'medium' | 'large';
  asking_price: number;
  has_passenger?: boolean;
  passenger_count?: number | null;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  special_requirements?: string | null;
  notes?: string | null;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const askingPrice = Number(body.asking_price);
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) {
    return NextResponse.json({ error: 'asking_price must be > 0' }, { status: 400 });
  }

  const departure = new Date(body.departure_datetime);
  if (Number.isNaN(departure.getTime())) {
    return NextResponse.json({ error: 'Invalid departure_datetime' }, { status: 400 });
  }

  // --- Regulatory pricing gate ------------------------------------------
  // Best-effort: if we can pin both endpoints to a district AND we have a
  // Ministry tariff row, snapshot the pricing into the leg and enforce the
  // 40-90% band in application code. If either is missing the DB CHECK
  // still catches wildly illegal prices; the user just doesn't get the
  // nice hint.
  const originDistrict = resolveDistrictFromText(body.origin);
  const destinationDistrict = resolveDistrictFromText(body.destination);

  let pricing: PricingOutput | null = null;
  if (originDistrict && destinationDistrict && originDistrict !== destinationDistrict) {
    const rate = await fetchMeterRate(supabase, originDistrict, destinationDistrict, departure);
    if (rate) {
      const input: PricingInput = {
        originDistrict,
        destinationDistrict,
        departure,
        hasPassenger: !!body.has_passenger,
      };
      try {
        pricing = computePricing(input, () => rate);
      } catch (err) {
        if (!(err instanceof PricingError)) throw err;
        // METER_NOT_FOUND shouldn't happen since we just fetched it, but
        // belt-and-braces: fall through to plain insert.
        pricing = null;
      }
    }
  }

  if (pricing) {
    if (askingPrice > pricing.ceilingEur) {
      return NextResponse.json(
        {
          error: 'price_above_ceiling',
          message:
            `€${askingPrice.toFixed(2)} exceeds the legal ceiling of ` +
            `€${pricing.ceilingEur.toFixed(2)} (90% of regulated meter €${pricing.regulatedMeterEur.toFixed(2)}). ` +
            `Lower your asking price.`,
          ceilingEur: pricing.ceilingEur,
          regulatedMeterEur: pricing.regulatedMeterEur,
        },
        { status: 422 },
      );
    }
    if (askingPrice < pricing.floorEur) {
      return NextResponse.json(
        {
          error: 'price_below_floor',
          message:
            `€${askingPrice.toFixed(2)} is below the floor of ` +
            `€${pricing.floorEur.toFixed(2)} (40% of regulated meter €${pricing.regulatedMeterEur.toFixed(2)}). ` +
            `Raise your asking price.`,
          floorEur: pricing.floorEur,
          regulatedMeterEur: pricing.regulatedMeterEur,
        },
        { status: 422 },
      );
    }
  }

  // --- Insert ------------------------------------------------------------
  const discountPct =
    pricing && pricing.regulatedMeterEur > 0
      ? Math.round(((pricing.regulatedMeterEur - askingPrice) / pricing.regulatedMeterEur) * 10000) / 100
      : null;

  const { data: inserted, error } = await supabase
    .from('empty_legs')
    .insert({
      seller_id: user.id,
      origin: body.origin,
      destination: body.destination,
      leg_type: body.leg_type,
      departure_datetime: departure.toISOString(),
      is_time_flexible: !!body.is_time_flexible,
      passenger_capacity: body.passenger_capacity,
      luggage_capacity: body.luggage_capacity,
      asking_price: askingPrice,
      currency: 'EUR',
      has_passenger: !!body.has_passenger,
      passenger_count: body.has_passenger ? body.passenger_count ?? null : null,
      passenger_name: body.has_passenger ? body.passenger_name ?? null : null,
      passenger_phone: body.has_passenger ? body.passenger_phone ?? null : null,
      special_requirements: body.has_passenger ? body.special_requirements ?? null : null,
      notes: body.notes ?? null,
      status: 'open',
      regulated_meter_reference_eur: pricing?.regulatedMeterEur ?? null,
      pricing_discount_pct: discountPct,
      pricing_floor_eur: pricing?.floorEur ?? null,
      pricing_ceiling_eur: pricing?.ceilingEur ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // 23514 = check_violation — asking_price outside floor/ceiling. Surface
    // as a 422 so the form shows the user something actionable instead of
    // a generic 500. This fires in the "district unresolvable" path where
    // we skipped the app-level gate.
    if ((error as { code?: string }).code === '23514') {
      return NextResponse.json(
        {
          error: 'pricing_constraint_violation',
          message:
            'Price outside the legal range (40% floor, 90% ceiling of the regulated meter). ' +
            'Adjust and try again.',
        },
        { status: 422 },
      );
    }
    console.error('[empty-legs] insert error', error);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ leg: inserted }, { status: 201 });
}
