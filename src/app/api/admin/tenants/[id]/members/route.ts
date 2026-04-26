// Tenant member management API. Admin-only.
//
//   POST   /api/admin/tenants/[id]/members  body: { email, role }
//   DELETE /api/admin/tenants/[id]/members  body: { user_id }
//
// Add resolves the supplied email against public.profiles. We deliberately
// do NOT search auth.users.email — that's a privileged column and queries
// against it require service role anyway. Profile rows are populated at
// signup, so any user who has signed in is findable by their email here.
//
// Remove is by user_id (the primary surface delivers it from the listing).
// The composite primary key on tenant_members (tenant_id, user_id) means
// the delete is unambiguous.

import { NextResponse } from 'next/server';

import { createAdminClient, createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PostBody {
  email: string;
  role: 'owner' | 'staff';
}

interface DeleteBody {
  user_id: string;
}

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized', status: 401 } as const;

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return { error: 'forbidden', status: 403 } as const;

  return { ok: true, userId: user.id } as const;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: tenantId } = await params;
  const auth = await ensureAdmin();
  if (!('ok' in auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null) as PostBody | null;
  if (!body?.email?.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }
  if (body.role !== 'owner' && body.role !== 'staff') {
    return NextResponse.json({ error: 'role must be owner or staff' }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Resolve the email → user_id via profiles.
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', body.email.trim().toLowerCase())
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: `No registered user found for ${body.email.trim()}. They must sign up first.` },
      { status: 404 },
    );
  }

  // Confirm the tenant exists (cheap; surfaces a friendlier 404 than the
  // FK violation that would otherwise raise).
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
  }

  const { error } = await adminClient.from('tenant_members').insert({
    tenant_id: tenantId,
    user_id: profile.id,
    role: body.role,
  });

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'That user is already a member of this tenant.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: tenantId } = await params;
  const auth = await ensureAdmin();
  if (!('ok' in auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null) as DeleteBody | null;
  if (!body?.user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from('tenant_members')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', body.user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
