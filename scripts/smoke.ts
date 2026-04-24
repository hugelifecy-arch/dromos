#!/usr/bin/env tsx
// Deploy smoke-test harness.
//
// Purpose: after a deploy (or a feature-flag flip per docs/runbook.md),
// run this to confirm every sandbox-dark integration is reachable, that
// its required tables exist in Supabase, and that its feature flag is in
// the state you expect.
//
// Not a replacement for the per-integration smoke tests in §3–§6 of the
// runbook. Those exercise real traffic end-to-end (a Twilio webhook, a
// JCC redirect, etc.). This script is the fast one you run first — it
// catches the common mistakes (missing table, flag inverted, service-
// role key rejected) before you spend an afternoon chasing a silent
// failure.
//
// Usage:
//
//   tsx scripts/smoke.ts
//       Runs against the env vars already exported in your shell. Reads
//       from process.env; never writes.
//
//   tsx scripts/smoke.ts --base-url https://dromos.cy
//       Also hits the public HTTP endpoints (auth-gated ones will 401/202
//       in dark mode — the harness expects that).
//
// Exits non-zero if any check fails, so it can gate a deploy.
//
// Dependencies: the existing Supabase client library (already in package.json).
// No new deps.

import { createClient } from '@supabase/supabase-js';

// --------------------------------------------------------------------------
// Types + formatting
// --------------------------------------------------------------------------

type Status = 'ok' | 'warn' | 'fail' | 'skip';

interface CheckResult {
  name: string;
  status: Status;
  detail?: string;
}

const ICON: Record<Status, string> = {
  ok: '[  OK  ]',
  warn: '[ WARN ]',
  fail: '[ FAIL ]',
  skip: '[ SKIP ]',
};

function log(r: CheckResult): void {
  // eslint-disable-next-line no-console
  console.log(`${ICON[r.status]}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------

interface Args { baseUrl?: string }

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base-url' && argv[i + 1]) {
      out.baseUrl = argv[++i];
    } else if (a.startsWith('--base-url=')) {
      out.baseUrl = a.slice('--base-url='.length);
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Check: required env vars
// --------------------------------------------------------------------------

const REQUIRED_CORE = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;

// Groups matching docs/runbook.md §1. Presence-of-flag is reported even
// when the flag is off; presence-of-credential is only reported when the
// matching flag is on.
interface FlagGroup {
  label: string;
  flag?: string;     // feature flag name (optional; some groups are always-on)
  creds: string[];   // credential env vars required when enabled
}

const FLAG_GROUPS: FlagGroup[] = [
  { label: 'WhatsApp bot (S11)',       flag: 'WHATSAPP_BOT_ENABLED', creds: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WEBHOOK_URL'] },
  { label: 'WhatsApp voice (S12)',     flag: 'WHATSAPP_VOICE_ENABLED', creds: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'] },
  { label: 'Flight auto-match (S13)',  flag: 'FLIGHT_MATCH_ENABLED', creds: ['AVIATIONSTACK_ACCESS_KEY', 'FLIGHT_MATCH_CRON_SECRET'] },
  { label: 'JCC Payments (S16)',       flag: 'JCC_ENABLED', creds: ['JCC_MER_ID', 'JCC_ACQ_ID', 'JCC_SECRET', 'JCC_RETURN_URL'] },
];

function checkEnv(): CheckResult[] {
  const results: CheckResult[] = [];

  for (const key of REQUIRED_CORE) {
    results.push({
      name: `env: ${key}`,
      status: process.env[key] ? 'ok' : 'fail',
      detail: process.env[key] ? undefined : 'missing (required)',
    });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  results.push({
    name: 'env: SUPABASE_SERVICE_ROLE_KEY',
    status: serviceRoleKey ? 'ok' : 'warn',
    detail: serviceRoleKey
      ? undefined
      : 'not set — cron + JCC callback need this; service-role checks below will skip',
  });

  for (const group of FLAG_GROUPS) {
    const flagVal = group.flag ? process.env[group.flag] : undefined;
    const enabled = flagVal === 'true';
    results.push({
      name: `flag: ${group.flag ?? group.label}`,
      status: enabled ? 'ok' : 'skip',
      detail: group.flag
        ? (flagVal === undefined ? 'unset (dark)' : `= ${flagVal}${enabled ? '' : ' (dark)'}`)
        : 'no flag',
    });
    if (enabled) {
      for (const c of group.creds) {
        results.push({
          name: `  creds: ${c}`,
          status: process.env[c] ? 'ok' : 'fail',
          detail: process.env[c] ? 'present' : 'missing while flag is on',
        });
      }
    }
  }

  return results;
}

// --------------------------------------------------------------------------
// Check: Supabase reachability + schema
// --------------------------------------------------------------------------

// One representative table per migration. If the row read lands (even with
// 0 rows), the table exists and RLS lets the service role in. A failure
// likely means the migration wasn't applied or the key is wrong.
const MIGRATION_TABLES: Array<{ migration: string; table: string }> = [
  { migration: '003 empty_legs',              table: 'empty_legs' },
  { migration: '004 driver_verification',     table: 'driver_verification' },
  { migration: '009 regulated_meter_rates',   table: 'regulated_meter_rates' },
  { migration: '010 tracked_flights',         table: 'tracked_flights' },
  { migration: '010 flight_leg_matches',      table: 'flight_leg_matches' },
  { migration: '011 whatsapp_sessions',       table: 'whatsapp_sessions' },
  { migration: '011 whatsapp_draft_legs',     table: 'whatsapp_draft_legs' },
  { migration: '012 ai_extractions',          table: 'ai_extractions' },
  { migration: '014 tenants',                 table: 'tenants' },
  { migration: '014 tenant_members',          table: 'tenant_members' },
  { migration: '014 concierge_bookings',      table: 'concierge_bookings' },
  { migration: '015 jcc_transactions',        table: 'jcc_transactions' },
  { migration: '016 tax_exports',             table: 'tax_exports' },
];

async function checkSupabase(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    results.push({
      name: 'supabase: schema inspection',
      status: 'skip',
      detail: 'needs NEXT_PUBLIC_SUPABASE_URL',
    });
    return results;
  }

  // Prefer service-role: bypasses RLS so "table exists + RLS denied" and
  // "table exists + RLS allowed" both resolve cleanly. Fall back to anon key
  // which is enough to distinguish "missing" (PostgREST 404 / PGRST205) from
  // "exists" (any other status including RLS denials).
  if (serviceRoleKey) {
    const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    for (const { migration, table } of MIGRATION_TABLES) {
      try {
        const { error } = await client
          .from(table)
          .select('*', { head: true, count: 'exact' })
          .limit(0);
        if (error) {
          results.push({ name: `db: ${migration}`, status: 'fail', detail: error.message });
        } else {
          results.push({ name: `db: ${migration}`, status: 'ok' });
        }
      } catch (err) {
        results.push({
          name: `db: ${migration}`,
          status: 'fail',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  if (anonKey) {
    // Anon-key REST probe. Distinguishes "table missing" (PGRST205 / 404)
    // from "table exists" (200 or 401/403 due to RLS). Doesn't need a
    // service-role secret — handy when running from a laptop that only has
    // the publishable key in .env.local.
    results.push({
      name: 'supabase: schema probe mode',
      status: 'warn',
      detail: 'no service role key; falling back to anon-key REST probe (coarser)',
    });
    for (const { migration, table } of MIGRATION_TABLES) {
      try {
        const res = await fetch(
          `${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}?select=*&limit=0`,
          {
            headers: {
              apikey: anonKey,
              authorization: `Bearer ${anonKey}`,
            },
          },
        );
        if (res.status === 200 || res.status === 206) {
          results.push({ name: `db: ${migration}`, status: 'ok', detail: 'exists (RLS permitted anon)' });
        } else if (res.status === 401 || res.status === 403) {
          results.push({ name: `db: ${migration}`, status: 'ok', detail: `exists (HTTP ${res.status} — RLS blocks anon, table is there)` });
        } else if (res.status === 404) {
          // PostgREST returns 404 + body.code='PGRST205' when a table is
          // missing from its schema cache. Other 404s could mean the URL
          // itself is wrong; we surface the code either way.
          const body = await res.text().catch(() => '');
          const codeMatch = body.match(/"code":"([^"]+)"/);
          results.push({
            name: `db: ${migration}`,
            status: 'fail',
            detail: `missing (HTTP 404${codeMatch ? ` ${codeMatch[1]}` : ''})`,
          });
        } else {
          results.push({
            name: `db: ${migration}`,
            status: 'fail',
            detail: `unexpected HTTP ${res.status}`,
          });
        }
      } catch (err) {
        results.push({
          name: `db: ${migration}`,
          status: 'fail',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  results.push({
    name: 'supabase: schema inspection',
    status: 'skip',
    detail: 'needs SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
  });
  return results;
}

// --------------------------------------------------------------------------
// Check: HTTP endpoints
// --------------------------------------------------------------------------
//
// These hit the deployed app with no credentials; we expect specific status
// codes that prove the route exists and is in the right mode. A 500 means
// something's broken. A 200 where we expect 401 means auth is mis-wired.

interface RouteCheck {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  expect: number[];            // any status in this list is OK
  body?: unknown;              // for POSTs
  headers?: Record<string, string>;
}

const ROUTES: RouteCheck[] = [
  // WhatsApp webhook: when disabled it returns empty TwiML with 200.
  { name: 'http: /api/whatsapp/webhook (TwiML ack)',    method: 'POST', path: '/api/whatsapp/webhook', expect: [200, 401] },
  // Flight poll: authed via bearer. No token -> 401 if secret set, else
  // runs (and returns skipped:true when flag off).
  { name: 'http: /api/flights/poll (no auth)',          method: 'POST', path: '/api/flights/poll', expect: [200, 401] },
  // Flight matches inbox: needs session auth -> 401.
  { name: 'http: /api/flight-matches',                  method: 'GET',  path: '/api/flight-matches', expect: [401] },
  // Concierge: tenants list is auth-gated.
  { name: 'http: /api/concierge/tenants',               method: 'GET',  path: '/api/concierge/tenants', expect: [401] },
  // Concierge quote with a bad body: 400 (auth-agnostic path via slug).
  { name: 'http: /api/concierge/quote (bad body)',      method: 'POST', path: '/api/concierge/quote', expect: [400] },
  // JCC checkout: needs auth -> 401 or 503 (if enabled but creds missing).
  { name: 'http: /api/payments/jcc/checkout',           method: 'POST', path: '/api/payments/jcc/checkout', expect: [200, 202, 401, 503] },
  // Tax export: no auth -> 401.
  { name: 'http: /api/tax/export',                      method: 'GET',  path: '/api/tax/export?year=2026&quarter=1&format=csv', expect: [401] },
];

async function checkHttp(baseUrl: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const r of ROUTES) {
    try {
      const res = await fetch(new URL(r.path, baseUrl).toString(), {
        method: r.method,
        headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
        body: r.method === 'POST' ? JSON.stringify(r.body ?? {}) : undefined,
      });
      if (r.expect.includes(res.status)) {
        results.push({ name: r.name, status: 'ok', detail: `HTTP ${res.status}` });
      } else {
        results.push({
          name: r.name,
          status: 'fail',
          detail: `HTTP ${res.status}; expected one of ${r.expect.join(', ')}`,
        });
      }
    } catch (err) {
      results.push({
        name: r.name,
        status: 'fail',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  console.log('Dromos deploy smoke test');
  // eslint-disable-next-line no-console
  console.log('------------------------');

  const envResults = checkEnv();
  envResults.forEach(log);

  // eslint-disable-next-line no-console
  console.log('');
  const dbResults = await checkSupabase();
  dbResults.forEach(log);

  const all: CheckResult[] = [...envResults, ...dbResults];

  if (args.baseUrl) {
    // eslint-disable-next-line no-console
    console.log('');
    const httpResults = await checkHttp(args.baseUrl);
    httpResults.forEach(log);
    all.push(...httpResults);
  } else {
    // eslint-disable-next-line no-console
    console.log('\n(no --base-url; skipping HTTP checks)');
  }

  const fails = all.filter((r) => r.status === 'fail').length;
  const warns = all.filter((r) => r.status === 'warn').length;
  const ok = all.filter((r) => r.status === 'ok').length;
  const skip = all.filter((r) => r.status === 'skip').length;

  // eslint-disable-next-line no-console
  console.log('\n------------------------');
  // eslint-disable-next-line no-console
  console.log(`${ok} ok · ${warns} warn · ${skip} skip · ${fails} fail`);

  process.exit(fails > 0 ? 1 : 0);
}

void main();
