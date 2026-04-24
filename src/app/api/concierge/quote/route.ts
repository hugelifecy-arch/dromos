// POST /api/concierge/quote
//
// Price a proposed guest trip through the single-source-of-truth pricing
// engine. Returns floor / ceiling / suggested + a rationale the concierge
// can read aloud to a guest ("€X, based on the regulated meter and…").
//
// Called by:
//   * the staff /concierge/new page (authed, tenant member)
//   * the /concierge/embed/[slug] iframe (unauthenticated — a slug is
//     public and lookup-only; this endpoint does NO writes).
//
// Request body:
//   {
//     slug?: string,              // embed-widget path; public
//     tenantId?: string,          // staff path; must match a tenant the caller belongs to
//     pickupDistrict: string,     // licence_district
//     dropoffDistrict: string,
//     pickupIso: string,
//     passengerCount?: number,
//   }
//
// Auth posture: if `slug` is set we resolve the tenant by slug without
// requiring auth. If `tenantId` is set we require the caller be a member of
// that tenant. Both paths go through the same pricing code — no caller can
// bypass floor/ceiling regardless of origin.
//
// Rate limiting: not in this route; we rely on Vercel's edge limits for v1.
// If we see abuse we drop in an IP-bucket in front of just the embed path.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import {
  PricingError,
  computePricing,
} from '@/lib/services/pricing';
import {
  fetchMeterRate,
  staticMeterLookup,
} from '@/lib/services/whatsapp/meter-lookup';
import { resolveTenantBySlug, resolveTenantScope, isMemberOf } from '@/lib/services/concierge/tenant-scope';
import type { LicenceDistrict } from '@/lib/constants/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_DISTRICTS: ReadonlySet<LicenceDistrict> = new Set<LicenceDistrict>([
  'nicosia', 'limassol', 'larnaca', 'paphos', 'famagusta',
]);

interface QuoteBody {
  slug?: string;
  tenantId?: string;
  pickupDistrict?: string;
  dropoffDistrict?: string;
  pickupIso?: string;
  passengerCount?: number;
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as QuoteBody | null;
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  if (!body.slug && !body.tenantId) {
    return NextResponse.json({ error: 'missing_tenant_ref' }, { status: 400 });
  }
  if (
    typeof body.pickupDistrict !== 'string' ||
    typeof body.dropoffDistrict !== 'string' ||
    !ALLOWED_DISTRICTS.has(body.pickupDistrict as LicenceDistrict) ||
    !ALLOWED_DISTRICTS.has(body.dropoffDistrict as LicenceDistrict)
  ) {
    return NextResponse.json({ error: 'invalid_districts' }, { status: 400 });
  }
  if (typeof body.pickupIso !== 'string') {
    return NextResponse.json({ error: 'missing_pickup_ts' }, { status: 400 });
  }
  const pickup = new Date(body.pickupIso);
  if (Number.isNaN(pickup.getTime())) {
    return NextResponse.json({ error: 'invalid_pickup_ts' }, { status: 400 });
  }

  const supabase = await createClient();

  // ---- Tenant gate ----
  let tenantName: string | null = null;
  if (body.slug) {
    const t = await resolveTenantBySlug(supabase, body.slug);
    if (!t) return NextResponse.json({ error: 'unknown_tenant' }, { status: 404 });
    tenantName = t.name;
  } else if (body.tenantId) {
    const scope = await resolveTenantScope(supabase);
    if (!scope || !isMemberOf(scope, body.tenantId)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    tenantName = scope.tenants.find((t) => t.id === body.tenantId)?.name ?? null;
  }

  // ---- Pricing ----
  try {
    const rate = await fetchMeterRate(
      supabase,
      body.pickupDistrict as LicenceDistrict,
      body.dropoffDistrict as LicenceDistrict,
      pickup,
    );
    if (!rate) {
      return NextResponse.json({ error: 'no_meter_rate' }, { status: 422 });
    }
    const pricing = computePricing(
      {
        originDistrict: body.pickupDistrict as LicenceDistrict,
        destinationDistrict: body.dropoffDistrict as LicenceDistrict,
        departure: pickup,
      },
      staticMeterLookup(rate),
    );
    return NextResponse.json({
      tenantName,
      pricing,
    });
  } catch (err) {
    if (err instanceof PricingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 422 });
    }
    throw err;
  }
}
