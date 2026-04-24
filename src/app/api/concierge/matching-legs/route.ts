// GET /api/concierge/matching-legs
//
// Returns open empty_legs that plausibly fulfil the concierge's pickup
// needs: origin district = tenant's district (or query-supplied),
// departing in the next 48h, sorted by departure time ascending.
//
// This is a helper for the /concierge/new page — it shows the concierge
// "legs already going your way" so they can prefer an existing driver over
// opening a brand-new request. The booking flow itself doesn't require a
// matching leg; leg_id stays null until a driver accepts.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import { resolveTenantScope, isMemberOf } from '@/lib/services/concierge/tenant-scope';
import type { LicenceDistrict } from '@/lib/constants/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOOKAHEAD_HOURS = 48;

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const scope = await resolveTenantScope(supabase);
  if (!scope) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId') ?? scope.defaultTenantId;
  if (!isMemberOf(scope, tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const tenant = scope.tenants.find((t) => t.id === tenantId);
  if (!tenant) return NextResponse.json({ error: 'unknown_tenant' }, { status: 404 });

  // Allow the caller to override the origin district (e.g. the guest is
  // being picked up at the airport, not the hotel).
  const qsOrigin = url.searchParams.get('originDistrict');
  const originDistrict = (qsOrigin ?? tenant.district) as LicenceDistrict;

  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3_600_000);

  // empty_legs stores origin as free text; filter on that with a case-
  // insensitive match. This is cruder than the flight-match service's
  // resolveDistrictFromText, but the concierge UI only needs "approximately
  // these legs"; an extra entry isn't a bug.
  const { data, error } = await supabase
    .from('empty_legs')
    .select('id, seller_id, origin, destination, departure_datetime, asking_price, passenger_capacity, leg_type, status')
    .eq('status', 'open')
    .gte('departure_datetime', now.toISOString())
    .lt('departure_datetime', until.toISOString())
    .ilike('origin', `%${originDistrict}%`)
    .order('departure_datetime', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    tenantDistrict: tenant.district,
    originDistrict,
    legs: data ?? [],
  });
}
