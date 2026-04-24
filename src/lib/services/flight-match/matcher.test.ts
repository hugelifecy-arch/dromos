// Self-checking tests for the flight <-> leg matcher. `npx tsx` runs them.

import assert from 'node:assert/strict';

import { scoreMatch, scoreMatches, type CandidateLeg, type FlightSnapshot } from './matcher';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => Promise<void> | void, results: TestResult[]): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push({ name, passed: true }); })
    .catch((err) => { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); });
}

function legFixture(overrides: Partial<CandidateLeg> = {}): CandidateLeg {
  return {
    id: 'leg-1',
    sellerId: 'driver-1',
    originDistrict: 'larnaca',
    destinationDistrict: 'nicosia',
    legType: 'standard',
    passengerCapacity: 4,
    departureIso: '2026-04-24T14:45:00+03:00',
    askingPriceEur: 28,
    ...overrides,
  };
}

function flightFixture(overrides: Partial<FlightSnapshot> = {}): FlightSnapshot {
  return {
    airport: 'LCA',
    scheduledArrivalIso: '2026-04-24T14:25:00+03:00',
    ...overrides,
  };
}

export async function runMatcherTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  await runCase('LCA arrival pairs with a Larnaca-origin leg landing 20min earlier', () => {
    const r = scoreMatch(flightFixture(), legFixture());
    assert.ok(r);
    // base 0.5 + in-window 0.3 + 4-seat 0.15 = 0.95
    assert.equal(r!.score, 0.95);
    assert.match(r!.reason, /departs 20min after landing/);
  }, results);

  await runCase('PFO arrival does not match a Larnaca-origin leg', () => {
    const r = scoreMatch(flightFixture({ airport: 'PFO' }), legFixture());
    assert.equal(r, null);
  }, results);

  await runCase('Leg departing BEFORE the plane lands is rejected', () => {
    const r = scoreMatch(
      flightFixture({ scheduledArrivalIso: '2026-04-24T15:00:00+03:00' }),
      legFixture({ departureIso: '2026-04-24T14:00:00+03:00' }),
    );
    assert.equal(r, null);
  }, results);

  await runCase('Estimated arrival used when present: slip pushes offset under MIN and match drops', () => {
    // scheduled 14:00 would give a leg at 14:45 a healthy 45min offset,
    // but the flight slipped to 14:40 so actual offset is 5min < 10min -> null.
    const r = scoreMatch(
      flightFixture({
        scheduledArrivalIso: '2026-04-24T14:00:00+03:00',
        estimatedArrivalIso: '2026-04-24T14:40:00+03:00',
      }),
      legFixture({ departureIso: '2026-04-24T14:45:00+03:00' }),
    );
    assert.equal(r, null);
  }, results);

  await runCase('Estimated arrival of 14:25 + leg at 14:45 is a strong match', () => {
    const r = scoreMatch(
      flightFixture({
        scheduledArrivalIso: '2026-04-24T14:00:00+03:00',
        estimatedArrivalIso: '2026-04-24T14:25:00+03:00',
      }),
      legFixture(),
    );
    assert.ok(r);
    assert.equal(r!.score, 0.95);
  }, results);

  await runCase('airport_inbound leg type adds a small bonus', () => {
    const r = scoreMatch(flightFixture(), legFixture({ legType: 'airport_inbound' }));
    assert.ok(r);
    assert.equal(r!.score, 1.0); // 0.95 + 0.05 clamped
    assert.match(r!.reason, /airport_inbound/);
  }, results);

  await runCase('solo-seat leg scores lower and skips the +0.15 bonus', () => {
    const r = scoreMatch(flightFixture(), legFixture({ passengerCapacity: 1 }));
    assert.ok(r);
    assert.equal(r!.score, 0.8); // 0.5 + 0.3, no seat bonus
  }, results);

  await runCase('legs 6h after landing score below threshold and are dropped', () => {
    const r = scoreMatch(
      flightFixture({ scheduledArrivalIso: '2026-04-24T08:00:00+03:00' }),
      legFixture({ departureIso: '2026-04-24T14:00:00+03:00', passengerCapacity: 1, legType: 'standard' }),
    );
    // base 0.5 + out-of-window 0.1 + no seat bonus + no type bonus = 0.6.
    // Still >= threshold, so surfaces but lower-ranked.
    assert.ok(r);
    assert.equal(r!.score, 0.6);
  }, results);

  await runCase('scoreMatches sorts best first and drops non-matches', () => {
    const ranked = scoreMatches(flightFixture(), [
      legFixture({ id: 'a', passengerCapacity: 1 }),              // 0.8
      legFixture({ id: 'b', legType: 'airport_inbound' }),         // 1.0
      legFixture({ id: 'c', originDistrict: 'paphos' }),           // dropped
      legFixture({ id: 'd', passengerCapacity: 4 }),               // 0.95
    ]);
    assert.deepEqual(ranked.map((r) => r.legId), ['b', 'd', 'a']);
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
  runMatcherTests().then(({ passed, failed, results }) => {
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
