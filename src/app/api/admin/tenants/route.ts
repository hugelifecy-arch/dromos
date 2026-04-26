// Admin tenants API.
//
//   POST /api/admin/tenants — create a new tenant. Admin-only.
//
// Input shape:
//   {
//     name: string,
//     type: 'hotel' | 'agency',
//     slug: string,           // URL-safe; immutable once issued
//     district: licence_district,
//     contact_email?: string | null,
//     contact_phone?: string | null,
//     seat_count?: number | null,
//     assign_self_as_owner?: boolean
//   }
//
// On success the route inserts the tenant row, optionally assigns the
// caller as `owner` via tenant_members, and returns the new tenant id.
// Returns 409 on slug clash.
//
// Why this isn't a service-role-only endpoint: the middleware admin gate
// already runs on /admin/* but not /api/admin/*. We re-verify admin
// status here so a stray cookie or a rogue API client can't create
// tenants. RLS on tenants currently has no INSERT policy (writes go via
// service role) so we use the admin client to bypass that explicitly.

import { NextResponse } from 'next/server';

import { createAdminClient, createClient } from '@/lib/supabase-server';
import { LICENCE_DISTRICTS } from '@/lib/constants/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface PostBody {
  name: string;
  type: 'hotel' | 'agency';
  slug: string;
  district: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  seat_count?: number | null;
  assign_self_as_owner?: boolean;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Admin check. Mirrors the middleware gate so a direct API hit can't
  // bypass /admin's protection.
  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as PostBody | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Validation. Defensive duplicate of the form-side checks.
  if (!body.name?.trim() || body.name.trim().length < 2) {
    return NextResponse.json({ error: 'name required (min 2 chars)' }, { status: 400 });
  }
  if (body.type !== 'hotel' && body.type !== 'agency') {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }
  if (!body.slug?.trim() || body.slug.length < 2 || body.slug.length > 64 || !SLUG_REGEX.test(body.slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }
  if (!LICENCE_DISTRICTS.includes(body.district as typeof LICENCE_DISTRICTS[number])) {
    return NextResponse.json({ error: 'invalid district' }, { status: 400 });
  }
  if (body.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact_email)) {
    return NextResponse.json({ error: 'invalid contact_email' }, { status: 400 });
  }
  if (body.seat_count != null) {
    const n = Number(body.seat_count);
    if (!Number.isFinite(n) || n < 1 || n > 1000) {
      return NextResponse.json({ error: 'seat_count out of range (1-1000)' }, { status: 400 });
    }
  }

  // Use the admin client to bypass RLS on tenants and tenant_members.
  // The admin gate above is the actual access control.
  const adminClient = createAdminClient();

  const { data: tenant, error: insertError } = await adminClient
    .from('tenants')
    .insert({
      name: body.name.trim(),
      type: body.type,
      slug: body.slug.trim(),
      district: body.district,
      contact_email: body.contact_email ?? null,
      contact_phone: body.contact_phone ?? null,
      seat_count: body.seat_count ?? null,
    })
    .select('id')
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'A tenant with that slug already exists.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (body.assign_self_as_owner) {
    const { error: memberError } = await adminClient
      .from('tenant_members')
      .insert({
        tenant_id: tenant.id,
        user_id: user.id,
        role: 'owner',
      });
    // Membership failure is logged but not fatal — the tenant exists.
    // Admin can re-add membership manually from the listing.
    if (memberError) {
      // eslint-disable-next-line no-console
      console.error('[admin/tenants] failed to assign owner', memberError);
    }
  }

  return NextResponse.json({ id: tenant.id }, { status: 201 });
}
