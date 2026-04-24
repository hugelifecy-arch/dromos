// Endpoints the driver uses to work their flight-match suggestion inbox.
//
//   GET  /api/flight-matches     — list open suggestions for the signed-in
//                                  driver's legs, newest first.
//   POST /api/flight-matches     — { id, action: 'accept' | 'reject' } to
//                                  resolve one. RLS guarantees the driver
//                                  can only resolve their own.
//
// Acceptance semantics (intentionally minimal for this sprint):
//   * accept  → match row transitions to 'accepted'; the leg itself is NOT
//               mutated. The UI reflects the acceptance and the driver can
//               still edit the leg freely. Future work: auto-bump
//               pricing_meter_eur / suggested_price_eur onto empty_legs.
//   * reject  → match row transitions to 'rejected'; stays out of the inbox.
//               The cron is coded to never resurrect a rejected suggestion.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // RLS restricts to matches on the driver's own legs; we redundantly filter
  // by status so the list view stays predictable.
  const { data, error } = await supabase
    .from('flight_leg_matches')
    .select(`
      id,
      leg_id,
      score,
      reason,
      suggested_price_eur,
      pricing_meter_eur,
      pricing_floor_eur,
      pricing_ceiling_eur,
      created_at,
      tracked_flights!inner (
        flight_number,
        airport,
        scheduled_arrival,
        estimated_arrival,
        origin_iata,
        airline,
        status
      ),
      empty_legs!inner (
        origin,
        destination,
        departure_datetime,
        asking_price,
        passenger_capacity,
        status
      )
    `)
    .eq('status', 'suggested')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ matches: data ?? [] });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { id?: string; action?: string } | null;
  if (!body?.id || (body.action !== 'accept' && body.action !== 'reject')) {
    return NextResponse.json(
      { error: 'body must be { id: uuid, action: "accept" | "reject" }' },
      { status: 400 },
    );
  }

  const newStatus = body.action === 'accept' ? 'accepted' : 'rejected';
  const { error } = await supabase
    .from('flight_leg_matches')
    .update({
      status: newStatus,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .eq('status', 'suggested'); // don't double-resolve

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: newStatus });
}
