// Trusted-drivers API.
//
//   GET    /api/trusted-drivers    — list current user's trusted colleagues
//                                    enriched with profile info.
//   POST   /api/trusted-drivers    — body: { trustedId } add a trust link.
//   DELETE /api/trusted-drivers    — body: { trustedId } remove a trust link.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import {
  addTrustedDriver,
  listTrustedDrivers,
  removeTrustedDriver,
} from '@/lib/services/peer-handoff/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const links = await listTrustedDrivers(supabase, user.id);
  if (links.length === 0) {
    return NextResponse.json({ trusted: [] });
  }

  // Enrich with profile info so the UI can show name + district without a
  // second round-trip. RLS allows users to read profiles; this stays
  // unprivileged.
  const ids = links.map((l) => l.trusted_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', ids);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const trusted = links.map((l) => ({
    trusted_id: l.trusted_id,
    established_at: l.established_at,
    profile: profileById.get(l.trusted_id) ?? null,
  }));

  return NextResponse.json({ trusted });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { trustedId?: string } | null;
  if (!body?.trustedId) {
    return NextResponse.json({ error: 'body must be { trustedId: uuid }' }, { status: 400 });
  }

  const result = await addTrustedDriver(supabase, user.id, body.trustedId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { trustedId?: string } | null;
  if (!body?.trustedId) {
    return NextResponse.json({ error: 'body must be { trustedId: uuid }' }, { status: 400 });
  }

  const result = await removeTrustedDriver(supabase, user.id, body.trustedId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
