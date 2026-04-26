// Self-checking tests for the peer-handoff service.
// Run with `npx tsx`.
//
// Uses an in-memory Supabase stand-in scoped to the four tables the service
// touches (empty_legs, trusted_driver_links, handoff_proposals, notifications,
// driver_verification). Same pattern as flight-match service tests.

import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  acceptHandoff,
  addTrustedDriver,
  canProposeHandoff,
  cancelHandoff,
  declineHandoff,
  expireStaleProposals,
  listTrustedDrivers,
  proposeHandoff,
  removeTrustedDriver,
} from './service';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => Promise<void>, results: TestResult[]): Promise<void> {
  return fn()
    .then(() => { results.push({ name, passed: true }); })
    .catch((err) => { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); });
}

// --------------------------------------------------------------------------
// Fake Supabase
// --------------------------------------------------------------------------

interface FakeDB {
  empty_legs: Array<Record<string, unknown>>;
  trusted_driver_links: Array<Record<string, unknown>>;
  handoff_proposals: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  driver_verification: Array<Record<string, unknown>>;
}

function emptyDb(): FakeDB {
  return {
    empty_legs: [],
    trusted_driver_links: [],
    handoff_proposals: [],
    notifications: [],
    driver_verification: [],
  };
}

function makeFakeSupabase(db: FakeDB): SupabaseClient {
  const supabase = {
    from(table: keyof FakeDB) {
      return fakeTable(db, table);
    },
  };
  return supabase as unknown as SupabaseClient;
}

// .insert(...) returns a promise-like that ALSO supports .select().single() /
// .select().maybeSingle() for the supabase pattern of "insert and return the
// inserted row". Two flavours: callers that just await get { data, error };
// callers that chain .select().single() get the first inserted row.
function makeInsertResult(
  awaited: { data: unknown; error: unknown },
  inserted: Array<Record<string, unknown>>,
) {
  const select = () => ({
    async single() {
      return { data: inserted[0] ?? null, error: awaited.error ?? (inserted[0] ? null : { code: 'PGRST116' }) };
    },
    async maybeSingle() {
      return { data: inserted[0] ?? null, error: awaited.error };
    },
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      return Promise.resolve({ data: inserted, error: awaited.error }).then(resolve);
    },
  });
  return {
    select,
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(awaited).then(resolve),
  };
}

function fakeTable(db: FakeDB, table: keyof FakeDB) {
  return {
    select: (_cols?: string) => selectChain(db, table),
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      // Enforce the partial unique on handoff_proposals (one pending per leg).
      if (table === 'handoff_proposals') {
        for (const row of rows) {
          if (row.status === 'pending' || row.status === undefined) {
            const dup = db.handoff_proposals.find(
              (r) => r.leg_id === row.leg_id && r.status === 'pending',
            );
            if (dup) {
              const err = { data: null, error: { code: '23505', message: 'duplicate pending proposal' } };
              return makeInsertResult(err, []);
            }
          }
        }
      }
      // Enforce primary-key on trusted_driver_links (owner_id, trusted_id).
      if (table === 'trusted_driver_links') {
        for (const row of rows) {
          const dup = db.trusted_driver_links.find(
            (r) => r.owner_id === row.owner_id && r.trusted_id === row.trusted_id,
          );
          if (dup) {
            const err = { data: null, error: { code: '23505', message: 'duplicate trust link' } };
            return makeInsertResult(err, []);
          }
        }
      }
      const stamped = rows.map((r, i) => ({
        ...r,
        id: r.id ?? `${String(table)}-${db[table].length + i + 1}`,
        created_at: r.created_at ?? new Date().toISOString(),
      }));
      db[table].push(...stamped);
      return makeInsertResult({ data: stamped, error: null }, stamped);
    },
    update: (patch: Record<string, unknown>) => {
      const builder = {
        _filters: [] as Array<(r: Record<string, unknown>) => boolean>,
        eq(col: string, value: unknown) {
          builder._filters.push((r) => r[col] === value);
          return builder;
        },
        async then(resolve: (v: { data: null; error: null }) => unknown) {
          for (const row of db[table]) {
            if (builder._filters.every((f) => f(row))) Object.assign(row, patch);
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
    delete: () => {
      const builder = {
        _filters: [] as Array<(r: Record<string, unknown>) => boolean>,
        eq(col: string, value: unknown) {
          builder._filters.push((r) => r[col] === value);
          return builder;
        },
        async then(resolve: (v: { data: null; error: null }) => unknown) {
          for (let i = db[table].length - 1; i >= 0; i--) {
            if (builder._filters.every((f) => f(db[table][i]))) db[table].splice(i, 1);
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
}

function selectChain(db: FakeDB, table: keyof FakeDB) {
  const filters: Array<(r: Record<string, unknown>) => boolean> = [];
  let limitN = Infinity;
  const applyFilters = () => db[table].filter((r) => filters.every((f) => f(r))).slice(0, limitN);

  const chain = {
    eq(col: string, value: unknown) { filters.push((r) => r[col] === value); return chain; },
    neq(col: string, value: unknown) { filters.push((r) => r[col] !== value); return chain; },
    lt(col: string, value: unknown) { filters.push((r) => String(r[col]) < String(value)); return chain; },
    lte(col: string, value: unknown) { filters.push((r) => String(r[col]) <= String(value)); return chain; },
    gte(col: string, value: unknown) { filters.push((r) => String(r[col]) >= String(value)); return chain; },
    in(col: string, values: unknown[]) { filters.push((r) => values.includes(r[col])); return chain; },
    is(col: string, value: unknown) { filters.push((r) => r[col] === value); return chain; },
    order() { return chain; },
    limit(n: number) { limitN = n; return chain; },
    async maybeSingle() {
      const rows = applyFilters();
      return { data: rows[0] ?? null, error: null };
    },
    async single() {
      const rows = applyFilters();
      return { data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116', message: 'no rows' } };
    },
    then(onFulfilled: (res: { data: Record<string, unknown>[]; error: null }) => unknown) {
      return Promise.resolve({ data: applyFilters(), error: null }).then(onFulfilled);
    },
  };
  return chain;
}

// --------------------------------------------------------------------------
// Fixture builders
// --------------------------------------------------------------------------

interface FixtureOpts {
  /** Make leg1 confirmed and assigned to A as buyer. */
  legBuyer?: 'A' | 'B' | null;
  /** Make A trust B. */
  aTrustsB?: boolean;
  /** Approve B's verification. */
  bApproved?: boolean;
  /** Pre-existing pending proposal for leg1. */
  pendingProposalForLeg?: boolean;
  /** Override leg status. */
  legStatus?: string;
  /** Mark leg as already handed off. */
  handedOff?: boolean;
}

function fixture(opts: FixtureOpts = {}): FakeDB {
  const db = emptyDb();
  db.empty_legs.push({
    id: 'leg1',
    seller_id: 'S',
    buyer_id: opts.legBuyer === null ? null : opts.legBuyer ?? 'A',
    status: opts.legStatus ?? 'confirmed',
    origin: 'Larnaca',
    destination: 'Limassol',
    asking_price: 25,
    handed_off_from: opts.handedOff ? 'X' : null,
    handed_off_at: opts.handedOff ? new Date().toISOString() : null,
  });
  if (opts.aTrustsB !== false) {
    db.trusted_driver_links.push({
      owner_id: 'A', trusted_id: 'B', established_at: new Date().toISOString(),
    });
  }
  if (opts.bApproved !== false) {
    db.driver_verification.push({
      user_id: 'B', verification_status: 'approved',
    });
  }
  if (opts.pendingProposalForLeg) {
    db.handoff_proposals.push({
      id: 'p-existing', leg_id: 'leg1', proposer_id: 'A', recipient_id: 'B',
      status: 'pending', created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  }
  return db;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

export async function runPeerHandoffTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  // ---- canProposeHandoff ---------------------------------------------------

  await runCase('canProposeHandoff: rejects when leg not found', async () => {
    const db = fixture();
    const r = await canProposeHandoff(makeFakeSupabase(db), 'no-such-leg', 'A', 'B');
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; reason: string }).reason, /leg/i);
  }, results);

  await runCase('canProposeHandoff: rejects when proposer is not the buyer', async () => {
    const db = fixture({ legBuyer: 'someone-else' });
    const r = await canProposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B');
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; reason: string }).reason, /buyer/i);
  }, results);

  await runCase('canProposeHandoff: rejects when leg status is not confirmed', async () => {
    const db = fixture({ legStatus: 'open' });
    const r = await canProposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B');
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; reason: string }).reason, /confirmed/i);
  }, results);

  await runCase('canProposeHandoff: rejects when leg already handed off', async () => {
    const db = fixture({ handedOff: true });
    const r = await canProposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B');
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; reason: string }).reason, /already.*handed/i);
  }, results);

  await runCase('canProposeHandoff: rejects when no trust link', async () => {
    const db = fixture({ aTrustsB: false });
    const r = await canProposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B');
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; reason: string }).reason, /trust/i);
  }, results);

  await runCase('canProposeHandoff: rejects when recipient not approved', async () => {
    const db = fixture({ bApproved: false });
    const r = await canProposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B');
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; reason: string }).reason, /verif|approved/i);
  }, results);

  await runCase('canProposeHandoff: rejects when there is already a pending proposal', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    const r = await canProposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B');
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; reason: string }).reason, /pending/i);
  }, results);

  await runCase('canProposeHandoff: ok when all preconditions pass', async () => {
    const db = fixture();
    const r = await canProposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B');
    assert.equal(r.ok, true);
  }, results);

  // ---- proposeHandoff ------------------------------------------------------

  await runCase('proposeHandoff: writes the proposal row and a recipient notification', async () => {
    const db = fixture();
    const r = await proposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B', 'help me out');
    assert.ok('proposalId' in r, JSON.stringify(r));
    assert.equal(db.handoff_proposals.length, 1);
    assert.equal(db.handoff_proposals[0].leg_id, 'leg1');
    assert.equal(db.handoff_proposals[0].proposer_id, 'A');
    assert.equal(db.handoff_proposals[0].recipient_id, 'B');
    assert.equal(db.handoff_proposals[0].message, 'help me out');
    assert.equal(db.handoff_proposals[0].status, 'pending');
    assert.equal(db.notifications.length, 1);
    assert.equal(db.notifications[0].user_id, 'B');
    assert.equal(db.notifications[0].type, 'handoff_proposed');
  }, results);

  await runCase('proposeHandoff: surfaces canPropose precondition failures', async () => {
    const db = fixture({ aTrustsB: false });
    const r = await proposeHandoff(makeFakeSupabase(db), 'leg1', 'A', 'B');
    assert.ok('error' in r, 'expected error');
    assert.equal(db.handoff_proposals.length, 0);
    assert.equal(db.notifications.length, 0);
  }, results);

  // ---- acceptHandoff -------------------------------------------------------

  await runCase('acceptHandoff: swaps buyer_id, sets handed_off_*, emits proposer notification', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    const r = await acceptHandoff(makeFakeSupabase(db), 'p-existing', 'B');
    assert.equal((r as { ok: true }).ok, true);
    const leg = db.empty_legs[0];
    assert.equal(leg.buyer_id, 'B');
    assert.equal(leg.handed_off_from, 'A');
    assert.ok(leg.handed_off_at);
    const prop = db.handoff_proposals[0];
    assert.equal(prop.status, 'accepted');
    assert.ok(prop.resolved_at);
    assert.equal(db.notifications.length, 1);
    assert.equal(db.notifications[0].user_id, 'A');
    assert.equal(db.notifications[0].type, 'handoff_accepted');
  }, results);

  await runCase('acceptHandoff: rejects when proposal not found', async () => {
    const db = fixture();
    const r = await acceptHandoff(makeFakeSupabase(db), 'no-such', 'B');
    assert.ok('error' in r);
  }, results);

  await runCase('acceptHandoff: rejects when caller is not the recipient', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    const r = await acceptHandoff(makeFakeSupabase(db), 'p-existing', 'C');
    assert.ok('error' in r);
    assert.equal(db.empty_legs[0].buyer_id, 'A');
  }, results);

  await runCase('acceptHandoff: rejects when proposal already resolved', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    db.handoff_proposals[0].status = 'declined';
    const r = await acceptHandoff(makeFakeSupabase(db), 'p-existing', 'B');
    assert.ok('error' in r);
    assert.equal(db.empty_legs[0].buyer_id, 'A');
  }, results);

  await runCase('acceptHandoff: rejects when leg already handed off (concurrency)', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    db.empty_legs[0].handed_off_from = 'X';
    db.empty_legs[0].handed_off_at = new Date().toISOString();
    const r = await acceptHandoff(makeFakeSupabase(db), 'p-existing', 'B');
    assert.ok('error' in r);
  }, results);

  await runCase('acceptHandoff: rejects when trust revoked between propose and accept', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    // simulate trust revocation
    db.trusted_driver_links = [];
    const r = await acceptHandoff(makeFakeSupabase(db), 'p-existing', 'B');
    assert.ok('error' in r);
    assert.equal(db.empty_legs[0].buyer_id, 'A');
  }, results);

  // ---- declineHandoff ------------------------------------------------------

  await runCase('declineHandoff: marks proposal declined and emits proposer notification', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    const r = await declineHandoff(makeFakeSupabase(db), 'p-existing', 'B');
    assert.equal((r as { ok: true }).ok, true);
    assert.equal(db.handoff_proposals[0].status, 'declined');
    assert.equal(db.empty_legs[0].buyer_id, 'A'); // leg unchanged
    assert.equal(db.notifications[0].type, 'handoff_declined');
    assert.equal(db.notifications[0].user_id, 'A');
  }, results);

  await runCase('declineHandoff: rejects when caller is not the recipient', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    const r = await declineHandoff(makeFakeSupabase(db), 'p-existing', 'C');
    assert.ok('error' in r);
    assert.equal(db.handoff_proposals[0].status, 'pending');
  }, results);

  // ---- cancelHandoff -------------------------------------------------------

  await runCase('cancelHandoff: marks proposal cancelled by proposer', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    const r = await cancelHandoff(makeFakeSupabase(db), 'p-existing', 'A');
    assert.equal((r as { ok: true }).ok, true);
    assert.equal(db.handoff_proposals[0].status, 'cancelled');
  }, results);

  await runCase('cancelHandoff: rejects when caller is not the proposer', async () => {
    const db = fixture({ pendingProposalForLeg: true });
    const r = await cancelHandoff(makeFakeSupabase(db), 'p-existing', 'B');
    assert.ok('error' in r);
    assert.equal(db.handoff_proposals[0].status, 'pending');
  }, results);

  // ---- trust graph ---------------------------------------------------------

  await runCase('addTrustedDriver: inserts the link', async () => {
    const db = emptyDb();
    const r = await addTrustedDriver(makeFakeSupabase(db), 'A', 'B');
    assert.equal((r as { ok: true }).ok, true);
    assert.equal(db.trusted_driver_links.length, 1);
    assert.equal(db.trusted_driver_links[0].owner_id, 'A');
    assert.equal(db.trusted_driver_links[0].trusted_id, 'B');
  }, results);

  await runCase('addTrustedDriver: rejects adding self', async () => {
    const db = emptyDb();
    const r = await addTrustedDriver(makeFakeSupabase(db), 'A', 'A');
    assert.ok('error' in r);
    assert.equal(db.trusted_driver_links.length, 0);
  }, results);

  await runCase('addTrustedDriver: idempotent on duplicate', async () => {
    const db = emptyDb();
    await addTrustedDriver(makeFakeSupabase(db), 'A', 'B');
    const r = await addTrustedDriver(makeFakeSupabase(db), 'A', 'B');
    assert.equal((r as { ok: true }).ok, true);
    assert.equal(db.trusted_driver_links.length, 1);
  }, results);

  await runCase('removeTrustedDriver: deletes the link', async () => {
    const db = emptyDb();
    db.trusted_driver_links.push({ owner_id: 'A', trusted_id: 'B' });
    db.trusted_driver_links.push({ owner_id: 'C', trusted_id: 'D' });
    const r = await removeTrustedDriver(makeFakeSupabase(db), 'A', 'B');
    assert.equal((r as { ok: true }).ok, true);
    assert.equal(db.trusted_driver_links.length, 1);
    assert.equal(db.trusted_driver_links[0].owner_id, 'C');
  }, results);

  await runCase('listTrustedDrivers: returns links owned by ownerId', async () => {
    const db = emptyDb();
    db.trusted_driver_links.push({ owner_id: 'A', trusted_id: 'B', established_at: 't1' });
    db.trusted_driver_links.push({ owner_id: 'A', trusted_id: 'C', established_at: 't2' });
    db.trusted_driver_links.push({ owner_id: 'X', trusted_id: 'Y', established_at: 't3' });
    const r = await listTrustedDrivers(makeFakeSupabase(db), 'A');
    assert.equal(r.length, 2);
    assert.deepEqual(r.map((l) => l.trusted_id).sort(), ['B', 'C']);
  }, results);

  // ---- expireStaleProposals -----------------------------------------------

  await runCase('expireStaleProposals: marks pending proposals past expires_at as expired', async () => {
    const db = emptyDb();
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    db.handoff_proposals.push(
      { id: 'p-stale', leg_id: 'leg1', proposer_id: 'A', recipient_id: 'B', status: 'pending', expires_at: past, created_at: past },
      { id: 'p-fresh', leg_id: 'leg2', proposer_id: 'A', recipient_id: 'C', status: 'pending', expires_at: future, created_at: past },
      { id: 'p-old-but-resolved', leg_id: 'leg3', proposer_id: 'A', recipient_id: 'D', status: 'declined', expires_at: past, created_at: past },
    );
    const r = await expireStaleProposals(makeFakeSupabase(db));
    assert.equal(r.expiredCount, 1);
    assert.equal(db.handoff_proposals.find((p) => p.id === 'p-stale')!.status, 'expired');
    assert.equal(db.handoff_proposals.find((p) => p.id === 'p-fresh')!.status, 'pending');
    assert.equal(db.handoff_proposals.find((p) => p.id === 'p-old-but-resolved')!.status, 'declined');
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
  runPeerHandoffTests().then(({ passed, failed, results }) => {
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
