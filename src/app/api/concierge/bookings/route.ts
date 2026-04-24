// /api/concierge/bookings
//
//   GET  — list the caller's tenant's bookings (most recent first, capped).
//   POST — create a booking. Re-runs the pricing engine server-side so the
//          price snapshot is authoritative even if the client tampered with
//          the number shown in the UI. quoted_price_eur must be inside
//          [floor, ceiling]; any mismatch returns 422.
//
// Auth: the caller must be a member of the target tenant. RLS enforces the
// same rule on the DB side; the explicit check here gives a cleaner error.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import {
  PricingError,
  computePricing,
  validateAskingPrice,
} from '@/lib/services/pricing';
import {
  fetchMeterRate,
  staticMeterLookup,
} from '@/lib/services/whatsapp/meter-lookup';
import { resolveTenantScope, isMemberOf } from '@/lib/services/concierge/tenant-scope';
import type { LicenceDistrict } from '@/lib/constants/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_DISTRICTS: ReadonlySet<LicenceDistrict> = new Set<LicenceDistrict>([
  'nicosia', 'limassol', 'larnaca', 'paphos', 'famagusta',
]);

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const scope = await resolveTenantScope(supabase);
  if (!scope) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId') ?? scope.defaultTenantId;
  if (!isMemberOf(scope, tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('concierge_bookings')
    .select(`
      id, tenant_id, leg_id, guest_name, guest_phone, passenger_count,
      pickup_text, pickup_district, dropoff_text, dropoff_district, pickup_ts,
      quoted_price_eur, pricing_meter_eur, pricing_floor_eur, pricing_ceiling_eur,
      status, source, created_at
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: data ?? [] });
}

interface CreateBookingBody {
  tenantId: string;
  guestName: string;
  guestPhone?: string;
  passengerCount?: number;
  pickupText: string;
  pickupDistrict: string;
  dropoffText: string;
  dropoffDistrict: string;
  pickupIso: string;
  /** The concierge agreed to this price with the guest. We validate it against computePricing. */
  quotedPriceEur: number;
  notes?: string;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const scope = await resolveTenantScope(supabase);
  if (!scope) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null) as CreateBookingBody | null;
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  // ---- Input validation ----
  if (!isMemberOf(scope, body.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (typeof body.guestName !== 'string' || body.guestName.length < 1) {
    return NextResponse.json({ error: 'missing_guest_name' }, { status: 400 });
  }
  if (
    !ALLOWED_DISTRICTS.has(body.pickupDistrict as LicenceDistrict) ||
    !ALLOWED_DISTRICTS.has(body.dropoffDistrict as LicenceDistrict)
  ) {
    return NextResponse.json({ error: 'invalid_districts' }, { status: 400 });
  }
  const pickup = new Date(body.pickupIso);
  if (Number.isNaN(pickup.getTime())) {
    return NextResponse.json({ error: 'invalid_pickup_ts' }, { status: 400 });
  }
  if (typeof body.quotedPriceEur !== 'number' || body.quotedPriceEur <= 0) {
    return NextResponse.json({ error: 'invalid_quoted_price' }, { status: 400 });
  }

  // ---- Server-side pricing authority ----
  const rate = await fetchMeterRate(
    supabase,
    body.pickupDistrict as LicenceDistrict,
    body.dropoffDistrict as LicenceDistrict,
    pickup,
  );
  if (!rate) {
    return NextResponse.json({ error: 'no_meter_rate' }, { status: 422 });
  }
  let pricing;
  try {
    pricing = computePricing(
      {
        originDistrict: body.pickupDistrict as LicenceDistrict,
        destinationDistrict: body.dropoffDistrict as LicenceDistrict,
        departure: pickup,
      },
      staticMeterLookup(rate),
    );
    validateAskingPrice(body.quotedPriceEur, pricing);
  } catch (err) {
    if (err instanceof PricingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 422 });
    }
    throw err;
  }

  // ---- Insert ----
  const { data, error } = await supabase
    .from('concierge_bookings')
    .insert({
      tenant_id: body.tenantId,
      guest_name: body.guestName,
      guest_phone: body.guestPhone ?? null,
      passenger_count: body.passengerCount ?? 1,
      pickup_text: body.pickupText,
      pickup_district: body.pickupDistrict,
      dropoff_text: body.dropoffText,
      dropoff_district: body.dropoffDistrict,
      pickup_ts: pickup.toISOString(),
      quoted_price_eur: body.quotedPriceEur,
      pricing_meter_eur: pricing.regulatedMeterEur,
      pricing_floor_eur: pricing.floorEur,
      pricing_ceiling_eur: pricing.ceilingEur,
      status: 'placed',
      placed_by: scope.userId,
      source: 'staff',
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ booking: data }, { status: 201 });
}
