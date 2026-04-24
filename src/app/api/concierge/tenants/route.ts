// GET /api/concierge/tenants
//
// Returns the signed-in user's tenant memberships so the concierge UI can
// render the tenant-switcher + "which tenant am I acting as?" state.
//
// Shape: { defaultTenantId, tenants: TenantSummary[] }
//
// Not-a-member -> 403. Unauthenticated -> 401.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import { resolveTenantScope } from '@/lib/services/concierge/tenant-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const scope = await resolveTenantScope(supabase);
  if (!scope) return NextResponse.json({ error: 'not_a_tenant_member' }, { status: 403 });

  return NextResponse.json({
    defaultTenantId: scope.defaultTenantId,
    tenants: scope.tenants,
  });
}
