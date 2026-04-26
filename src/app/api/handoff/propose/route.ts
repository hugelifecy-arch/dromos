// POST /api/handoff/propose
// Proposes a peer-handoff for a confirmed leg to a trusted colleague.
//
// Body: { legId: uuid, recipientId: uuid, message?: string }
// Auth: required; user becomes the proposer.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import { proposeHandoff } from '@/lib/services/peer-handoff/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as
    | { legId?: string; recipientId?: string; message?: string }
    | null;

  if (!body?.legId || !body.recipientId) {
    return NextResponse.json(
      { error: 'body must be { legId: uuid, recipientId: uuid, message?: string }' },
      { status: 400 },
    );
  }

  const result = await proposeHandoff(
    supabase,
    body.legId,
    user.id,
    body.recipientId,
    body.message,
  );

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ proposalId: result.proposalId });
}
