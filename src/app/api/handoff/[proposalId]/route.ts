// POST /api/handoff/[proposalId]
// Resolves a handoff proposal: accept | decline | cancel.
//
// Body: { action: 'accept' | 'decline' | 'cancel' }
// Auth: required.
//   - accept / decline: caller must be the recipient.
//   - cancel:           caller must be the proposer.
// All three branches are enforced by the service layer.

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase-server';
import {
  acceptHandoff,
  cancelHandoff,
  declineHandoff,
} from '@/lib/services/peer-handoff/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Action = 'accept' | 'decline' | 'cancel';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
): Promise<Response> {
  const { proposalId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { action?: Action } | null;
  if (!body?.action || !['accept', 'decline', 'cancel'].includes(body.action)) {
    return NextResponse.json(
      { error: 'body must be { action: "accept" | "decline" | "cancel" }' },
      { status: 400 },
    );
  }

  let result: { ok: true } | { error: string };
  if (body.action === 'accept') {
    result = await acceptHandoff(supabase, proposalId, user.id);
  } else if (body.action === 'decline') {
    result = await declineHandoff(supabase, proposalId, user.id);
  } else {
    result = await cancelHandoff(supabase, proposalId, user.id);
  }

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
