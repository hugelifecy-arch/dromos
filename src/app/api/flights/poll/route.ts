// Cron-driven poll of the arrivals feed → suggestion inbox.
//
// POST /api/flights/poll
// Intended to be triggered by Vercel Cron (every 15 min) or any scheduler
// that can authenticate with the shared secret in `FLIGHT_MATCH_CRON_SECRET`.
//
// Sandbox posture (same pattern as S11/S12):
//   FLIGHT_MATCH_ENABLED=false  (default) — route returns a no-op 200 with
//                                  the provider set to 'mock' and no DB
//                                  writes. Lets us run E2E from the UI
//                                  while the AviationStack contract lands.
//   FLIGHT_MATCH_ENABLED=true   — reads AVIATIONSTACK_ACCESS_KEY and runs
//                                  a real poll. Missing key -> 503.
//
// Why POST not GET: cron secrets in a GET URL leak into logs / referrers.

import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase-server';
import {
  createAviationStackProvider,
  createMockProvider,
  type ArrivalsFeed,
  type CyprusArrivalAirport,
} from '@/lib/services/flight-match/provider';
import { runPollCycle } from '@/lib/services/flight-match/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 15-minute cron tick * window covering the next 6h gives every arrival 24
// opportunities to be re-polled (status slips, ETA updates) before it lands.
const LOOKAHEAD_HOURS = 6;
const AIRPORTS: CyprusArrivalAirport[] = ['LCA', 'PFO'];

export async function POST(request: Request): Promise<Response> {
  const enabled = process.env.FLIGHT_MATCH_ENABLED === 'true';

  // ---- Auth gate ----
  // When the feature is dark we still allow the cron to hit the endpoint so
  // the scheduler wiring can be verified end-to-end — just return a no-op.
  const secret = process.env.FLIGHT_MATCH_CRON_SECRET;
  if (secret) {
    const got = request.headers.get('authorization') ?? '';
    if (got !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  if (!enabled) {
    return NextResponse.json({
      skipped: true,
      reason: 'FLIGHT_MATCH_ENABLED=false',
    });
  }

  // ---- Provider selection ----
  let feed: ArrivalsFeed;
  const key = process.env.AVIATIONSTACK_ACCESS_KEY;
  if (key) {
    feed = createAviationStackProvider({ accessKey: key });
  } else {
    // Enabled but no key -> dev-mode with mock provider, surfaces in the
    // summary so ops sees the misconfig without a hard failure.
    feed = createMockProvider([]);
  }

  // ---- Window ----
  const now = new Date();
  const fromIso = now.toISOString();
  const toIso = new Date(now.getTime() + LOOKAHEAD_HOURS * 3_600_000).toISOString();

  const supabase = createAdminClient();

  const summary = await runPollCycle({
    supabase,
    feed,
    airports: AIRPORTS,
    window: { fromIso, toIso },
    now,
  });

  const ok = summary.errors.length === 0;
  return NextResponse.json(summary, { status: ok ? 200 : 207 });
}
