// Tenant-scope resolver for the /concierge/* surface.
//
// Every concierge-side page + API route is gated by "is the signed-in user a
// member of at least one tenant?" This module is the single place that
// answers. Non-members get null; callers decide whether to 404, redirect to
// a marketing page, or show a "request access" form.
//
// A user can belong to multiple tenants (staff transfers between hotels
// happen). resolveTenantScope returns the full list plus a default pick —
// the most recently created membership, which for a fresh user is just "the
// one tenant they joined".
//
// Why not a Next.js middleware: middleware runs on every request including
// static assets; we only need the check inside the handful of route handlers
// that touch tenant data, and doing it there keeps the fast paths fast.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { LicenceDistrict } from '@/lib/constants/locations';

export type TenantType = 'hotel' | 'agency';
export type TenantMemberRole = 'owner' | 'staff';

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  type: TenantType;
  district: LicenceDistrict;
  role: TenantMemberRole;
}

export interface TenantScope {
  userId: string;
  tenants: TenantSummary[];
  /** Most recently joined tenant; callers use this as the default "current" tenant. */
  defaultTenantId: string;
}

/**
 * Returns the scope for the currently-authenticated user, or null if no auth
 * or no memberships. Does NOT throw on missing auth — callers need the
 * 401-vs-404 distinction.
 */
export async function resolveTenantScope(
  supabase: SupabaseClient,
): Promise<TenantScope | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('tenant_members')
    .select(`
      role,
      created_at,
      tenants!inner (
        id,
        slug,
        name,
        type,
        district
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) return null;

  const tenants: TenantSummary[] = [];
  // Supabase's generated types model joined rows as arrays; at runtime an
  // !inner join on a 1:1 FK returns a single object. Cast through unknown
  // so the shape matches what we actually get back.
  for (const row of data as unknown as Array<{
    role: TenantMemberRole;
    created_at: string;
    tenants: {
      id: string;
      slug: string;
      name: string;
      type: TenantType;
      district: LicenceDistrict;
    };
  }>) {
    tenants.push({
      id: row.tenants.id,
      slug: row.tenants.slug,
      name: row.tenants.name,
      type: row.tenants.type,
      district: row.tenants.district,
      role: row.role,
    });
  }

  return {
    userId: user.id,
    tenants,
    defaultTenantId: tenants[0].id,
  };
}

/**
 * True when the user is a member of the given tenant. Used by insert-path
 * code where RLS will also catch the mismatch — this check just produces a
 * cleaner 403 than the DB error would.
 */
export function isMemberOf(scope: TenantScope, tenantId: string): boolean {
  return scope.tenants.some((t) => t.id === tenantId);
}

/**
 * Resolve a tenant by its public slug. Does NOT require auth — used by the
 * embed widget. Returns only the fields the widget legitimately needs (name
 * + district), no contact details or seat counts.
 */
export interface PublicTenant {
  id: string;
  slug: string;
  name: string;
  district: LicenceDistrict;
}

export async function resolveTenantBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<PublicTenant | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, district')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as PublicTenant;
}
