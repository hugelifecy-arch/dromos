// POST /api/handoff/expire-stale
// Cron-driven sweep of pending handoff_proposals past their expires_at.
// Mirrors the auth + return-shape pattern of /api/flights/poll (S13).
//
// Schedule: every 5 minutes (Vercel Cron / GitHub Actions / whatever).
// Auth: HANDOFF_EXPIRE_CRON_SECRET via Authorization: Bearer <secret>.
//
// No external integration; this endpoint is enabled by default. The only
// reason to skip is if HANDOFF_EXPIRE_CRON_SECRET is unset (local dev),
// in which case the route refuses to run rather than silently ticking.

import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase-server';
import { expireStaleProposals } from '@/lib/services/peer-handoff/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.HANDOFF_EXPIRE_CRON_SECRET;
  if (!secret) {
    // Refuse to run unsecured — easier to debug than a silent no-op.
    return NextResponse.json(
      { error: 'HANDOFF_EXPIRE_CRON_SECRET not configured' },
      { status: 503 },
    );
  }

  const got = request.headers.get('authorization') ?? '';
  if (got !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Service-role client: this loop has to read pending rows owned by
  // arbitrary users and then write notifications scoped to the proposer.
  // RLS on handoff_proposals would block both ends.
  const supabase = createAdminClient();
  const { expiredCount } = await expireStaleProposals(supabase);

  return NextResponse.json({ ok: true, expiredCount });
}
