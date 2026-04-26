// Driver verification API.
//
//   GET  /api/driver-verification — fetch the current user's submission, if any.
//   POST /api/driver-verification — create a fresh submission. Insert-only;
//                                   updates / resubmissions go through admin
//                                   ops for now.
//
// The unique constraint on driver_verification.user_id means a second POST
// from the same user surfaces a 409. The UI gates the form on "no existing
// submission" so users don't try to double-submit.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import { LICENCE_DISTRICTS, TAXI_TYPES, CYPRUS_PLATE_REGEX } from '@/lib/constants/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PostBody {
  licence_number: string;
  licence_district: string;
  taxi_type: string;
  vehicle_plate: string;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: number | null;
  vehicle_colour?: string | null;
  vehicle_seats?: number;
  wheelchair_accessible?: boolean;
  language_preference?: 'en' | 'el' | 'tr';
}

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('driver_verification')
    .select('id, verification_status, rejection_reason, verified_at, licence_district, taxi_type, vehicle_plate, created_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({ verification: data ?? null });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as PostBody | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Validation — defensive duplicate of the client-side checks. Trust the
  // client to send shaped data but never to send valid data.
  if (!body.licence_number?.trim() || body.licence_number.trim().length < 4) {
    return NextResponse.json({ error: 'licence_number required (min 4 chars)' }, { status: 400 });
  }
  if (!LICENCE_DISTRICTS.includes(body.licence_district as typeof LICENCE_DISTRICTS[number])) {
    return NextResponse.json({ error: 'invalid licence_district' }, { status: 400 });
  }
  if (!TAXI_TYPES.includes(body.taxi_type as typeof TAXI_TYPES[number])) {
    return NextResponse.json({ error: 'invalid taxi_type' }, { status: 400 });
  }
  const plate = body.vehicle_plate?.trim().toUpperCase().replace(/\s/g, '') ?? '';
  if (!CYPRUS_PLATE_REGEX.test(plate)) {
    return NextResponse.json({ error: 'invalid vehicle_plate format' }, { status: 400 });
  }
  const seats = body.vehicle_seats ?? 4;
  if (seats < 1 || seats > 8) {
    return NextResponse.json({ error: 'vehicle_seats must be 1-8' }, { status: 400 });
  }
  if (body.vehicle_year != null) {
    const y = Number(body.vehicle_year);
    const maxY = new Date().getFullYear() + 1;
    if (!Number.isFinite(y) || y < 1980 || y > maxY) {
      return NextResponse.json({ error: 'vehicle_year out of range' }, { status: 400 });
    }
  }
  if (body.language_preference && !['en', 'el', 'tr'].includes(body.language_preference)) {
    return NextResponse.json({ error: 'invalid language_preference' }, { status: 400 });
  }

  const { error } = await supabase.from('driver_verification').insert({
    user_id: user.id,
    licence_number: body.licence_number.trim(),
    licence_district: body.licence_district,
    taxi_type: body.taxi_type,
    vehicle_plate: plate,
    vehicle_make: body.vehicle_make ?? null,
    vehicle_model: body.vehicle_model ?? null,
    vehicle_year: body.vehicle_year ?? null,
    vehicle_colour: body.vehicle_colour ?? null,
    vehicle_seats: seats,
    wheelchair_accessible: !!body.wheelchair_accessible,
    language_preference: body.language_preference ?? 'el',
    verification_status: 'pending',
  });

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'You already have a verification submission. Email verify@dromos.cy to update.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
