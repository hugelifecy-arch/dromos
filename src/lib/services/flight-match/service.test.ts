// Self-checking tests for the flight-match orchestration service.
//
// Uses an in-memory Supabase stand-in scoped to the three tables the service
// touches (tracked_flights, flight_leg_matches, empty_legs). We do NOT mock
// regulated_meter_rates — the pricing snapshot is best-effort, and a null
// lookup exercises the fallback branch (match still emitted, no snapshot).

import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createMockProvider } from './provider';
import { runPollCycle } from './service';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => Promise<void>, results: TestResult[]): Promise<void> {
  return fn()
    .then(() => { results.push({ name, passed: true }); })
    .catch((err) => { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); });
}

// --------------------------------------------------------------------------
// In-memory Supabase stand-in.
// --------------------------------------------------------------------------
// Only the chainable shapes the service actually uses. Keep it scrappy; the
// goal is to verify the orchestration, not re-implement postgrest.

interface FakeDB {
  tracked_flights: Record<string, unknown>[];
  flight_leg_matches: Record<string, unknown>[];
  empty_legs: Record<string, unknown>[];
  regulated_meter_rates: Record<string, unknown>[];
}

function makeFakeSupabase(db: FakeDB): SupabaseClient {
  const supabase = {
    from(table: keyof FakeDB) {
      return fakeTable(db, table);
    },
  };
  return supabase as unknown as SupabaseClient;
}

function fakeTable(db: FakeDB, table: keyof FakeDB) {
  return {
    select: (_cols?: string) => selectChain(db, table),
    insert: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      rows.forEach((r) => db[table].push({ ...r, id: `${table}-${db[table].length + 1}` }));
      return { data: null, error: null };
    },
    update: (patch: Record<string, unknown>) => ({
      eq: async (col: string, value: unknown) => {
        for (const row of db[table]) {
          if (row[col] === value) Object.assign(row, patch);
        }
        return { data: null, error: null };
      },
    }),
    upsert: (payload: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      const conflictCols = (opts?.onConflict ?? '').split(',').map((c) => c.trim()).filter(Boolean);
      const inserted: Record<string, unknown>[] = [];
      for (const row of rows) {
        const existing = db[table].find((r) =>
          conflictCols.every((c) => r[c] === row[c]),
        );
        if (existing) {
          Object.assign(existing, row);
          inserted.push(existing);
        } else {
          const withId = { ...row, id: `${table}-${db[table].length + 1}` };
          db[table].push(withId);
          inserted.push(withId);
        }
      }
      // Return a chainable thenable: callers can either await directly or
      // call .select() first (Supabase pattern).
      const ok = { data: inserted, error: null };
      return {
        select: () => Promise.resolve(ok),
        then: (resolve: (v: typeof ok) => unknown) => Promise.resolve(ok).then(resolve),
      };
    },
  };
}

function selectChain(db: FakeDB, table: keyof FakeDB) {
  let filters: Array<(r: Record<string, unknown>) => boolean> = [];

  const applyFilters = () => db[table].filter((r) => filters.every((f) => f(r)));

  const chain = {
    eq(col: string, value: unknown) { filters.push((r) => r[col] === value); return chain; },
    gte(col: string, value: unknown) { filters.push((r) => String(r[col]) >= String(value)); return chain; },
    lt(col: string, value: unknown)  { filters.push((r) => String(r[col]) < String(value)); return chain; },
    lte(col: string, value: unknown) { filters.push((r) => String(r[col]) <= String(value)); return chain; },
    order() { return chain; },
    limit() { return chain; },
    async maybeSingle() {
      const rows = applyFilters();
      return { data: rows[0] ?? null, error: null };
    },
    then(onFulfilled: (res: { data: Record<string, unknown>[]; error: null }) => unknown) {
      return Promise.resolve({ data: applyFilters(), error: null }).then(onFulfilled);
    },
  };
  return chain;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

export async function runFlightMatchServiceTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  await runCase('emits a suggestion for a matching arrival + open leg', async () => {
    const db: FakeDB = {
      tracked_flights: [],
      flight_leg_matches: [],
      empty_legs: [{
        id: 'leg-1',
        seller_id: 'driver-1',
        origin: 'Larnaca Airport (LCA)',
        destination: 'Nicosia',
        leg_type: 'airport_inbound',
        passenger_capacity: 4,
        departure_datetime: '2026-04-24T14:45:00+03:00',
        asking_price: 28,
        status: 'open',
      }],
      regulated_meter_rates: [],
    };
    const feed = createMockProvider([{
      flightNumber: 'A3612',
      airport: 'LCA',
      scheduledArrivalIso: '2026-04-24T14:25:00+03:00',
      originIata: 'ATH',
      airline: 'Aegean',
      status: 'active',
    }]);

    const summary = await runPollCycle({
      supabase: makeFakeSupabase(db),
      feed,
      airports: ['LCA'],
      window: { fromIso: '2026-04-24T13:00:00+03:00', toIso: '2026-04-24T16:00:00+03:00' },
      now: new Date('2026-04-24T12:00:00+03:00'),
    });

    assert.equal(summary.errors.length, 0, summary.errors.join(', '));
    assert.equal(summary.flightsUpserted, 1);
    assert.equal(summary.matchesCreated, 1);
    assert.equal(db.flight_leg_matches.length, 1);
    const m = db.flight_leg_matches[0] as Record<string, unknown>;
    assert.equal(m.leg_id, 'leg-1');
    assert.equal(m.status, 'suggested');
    const score = Number(m.score);
    assert.ok(score >= 0.9, `expected high score, got ${score}`);
  }, results);

  await runCase('re-poll updates an existing suggestion, not duplicates', async () => {
    const db: FakeDB = {
      tracked_flights: [],
      flight_leg_matches: [],
      empty_legs: [{
        id: 'leg-1',
        seller_id: 'driver-1',
        origin: 'Larnaca',
        destination: 'Nicosia',
        leg_type: 'standard',
        passenger_capacity: 3,
        departure_datetime: '2026-04-24T14:45:00+03:00',
        asking_price: 28,
        status: 'open',
      }],
      regulated_meter_rates: [],
    };
    const feed = createMockProvider([{
      flightNumber: 'A3612',
      airport: 'LCA',
      scheduledArrivalIso: '2026-04-24T14:25:00+03:00',
    }]);
    const args = {
      supabase: makeFakeSupabase(db),
      feed,
      airports: ['LCA' as const],
      window: { fromIso: '2026-04-24T13:00:00+03:00', toIso: '2026-04-24T16:00:00+03:00' },
      now: new Date('2026-04-24T12:00:00+03:00'),
    };

    const first = await runPollCycle(args);
    assert.equal(first.matchesCreated, 1);
    assert.equal(first.matchesUpdated, 0);

    const second = await runPollCycle(args);
    assert.equal(second.matchesCreated, 0);
    assert.equal(second.matchesUpdated, 1);
    assert.equal(db.flight_leg_matches.length, 1);
    assert.equal(db.tracked_flights.length, 1);
  }, results);

  await runCase('a rejected suggestion is not resurrected by re-poll', async () => {
    const db: FakeDB = {
      tracked_flights: [],
      flight_leg_matches: [],
      empty_legs: [{
        id: 'leg-1',
        seller_id: 'driver-1',
        origin: 'Larnaca',
        destination: 'Nicosia',
        leg_type: 'standard',
        passenger_capacity: 3,
        departure_datetime: '2026-04-24T14:45:00+03:00',
        asking_price: 28,
        status: 'open',
      }],
      regulated_meter_rates: [],
    };
    const feed = createMockProvider([{
      flightNumber: 'A3612',
      airport: 'LCA',
      scheduledArrivalIso: '2026-04-24T14:25:00+03:00',
    }]);
    const args = {
      supabase: makeFakeSupabase(db),
      feed,
      airports: ['LCA' as const],
      window: { fromIso: '2026-04-24T13:00:00+03:00', toIso: '2026-04-24T16:00:00+03:00' },
      now: new Date('2026-04-24T12:00:00+03:00'),
    };

    await runPollCycle(args);
    // Driver rejects it.
    (db.flight_leg_matches[0] as Record<string, unknown>).status = 'rejected';
    const prevScore = (db.flight_leg_matches[0] as Record<string, unknown>).score;

    const second = await runPollCycle(args);
    assert.equal(second.matchesCreated, 0);
    assert.equal(second.matchesUpdated, 0);
    assert.equal(second.matchesSkipped, 1);
    // Status unchanged.
    assert.equal((db.flight_leg_matches[0] as Record<string, unknown>).status, 'rejected');
    assert.equal((db.flight_leg_matches[0] as Record<string, unknown>).score, prevScore);
  }, results);

  await runCase('mismatched arrival airport produces no suggestions', async () => {
    const db: FakeDB = {
      tracked_flights: [],
      flight_leg_matches: [],
      empty_legs: [{
        id: 'leg-1',
        seller_id: 'driver-1',
        origin: 'Larnaca',
        destination: 'Nicosia',
        leg_type: 'standard',
        passenger_capacity: 3,
        departure_datetime: '2026-04-24T14:45:00+03:00',
        asking_price: 28,
        status: 'open',
      }],
      regulated_meter_rates: [],
    };
    const feed = createMockProvider([{
      flightNumber: 'CY201',
      airport: 'PFO',
      scheduledArrivalIso: '2026-04-24T14:25:00+03:00',
    }]);

    const summary = await runPollCycle({
      supabase: makeFakeSupabase(db),
      feed,
      airports: ['PFO'],
      window: { fromIso: '2026-04-24T13:00:00+03:00', toIso: '2026-04-24T16:00:00+03:00' },
      now: new Date('2026-04-24T12:00:00+03:00'),
    });
    assert.equal(summary.flightsUpserted, 1);
    assert.equal(summary.matchesCreated, 0);
    assert.equal(db.flight_leg_matches.length, 0);
  }, results);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}

const isDirectRun =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  // @ts-ignore
  require.main === module;

if (isDirectRun) {
  runFlightMatchServiceTests().then(({ passed, failed, results }) => {
    for (const r of results) {
      const mark = r.passed ? 'OK  ' : 'FAIL';
      // eslint-disable-next-line no-console
      console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
    }
    // eslint-disable-next-line no-console
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  });
}
