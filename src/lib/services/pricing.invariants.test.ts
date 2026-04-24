// Property-based invariant tests for the regulated-meter pricing engine.
//
// Why this file exists:
// The spec's headline regulatory promise is "asking_price always sits between
// 0.40× and 0.90× of the Cyprus Ministry of Transport meter tariff" (see
// cyprus-taxi-technical-spec.md §4). Violating it is existential — it
// exposes Dromos to a 2006 Motor Transport Law challenge. Three layers
// protect the invariant today:
//
//   1. computePricing clamps its output to [floor, ceiling] (pricing.ts).
//   2. empty_legs has a CHECK (asking_price <= pricing_ceiling_eur).
//   3. concierge_bookings has the same CHECK (migration 014).
//
// The DB CHECKs catch violations at write time; they do NOT prove
// computePricing is the thing clamping. A bug that pushes suggestedEur
// above ceilingEur would ONLY fire when someone tries to write that row —
// by which point the UI has already quoted an illegal price to a guest.
// This file tests layer 1 directly: we generate thousands of plausible
// PricingInputs and assert the output respects the invariants.
//
// Runner: `npx tsx`. No test framework; same shape as the other .test.ts
// files in this tree.
//
// Determinism: we seed a small PRNG so failures are reproducible — a
// property-based test that can't be reproduced is of limited diagnostic
// value.

import assert from 'node:assert/strict';

import {
  PRICING_CEILING_MULTIPLIER,
  PRICING_FLOOR_MULTIPLIER,
  computePricing,
  type MeterLookup,
  type MeterRate,
  type PricingInput,
} from './pricing';
import type { LicenceDistrict } from '@/lib/constants/locations';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try { fn(); results.push({ name, passed: true }); }
  catch (err) { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); }
}

// --------------------------------------------------------------------------
// Tiny seeded PRNG (mulberry32). Good enough for property-generation;
// deterministic so a failing case prints its seed + index.
// --------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------------------
// Input generators
// --------------------------------------------------------------------------

const DISTRICTS: LicenceDistrict[] = ['nicosia', 'limassol', 'larnaca', 'paphos', 'famagusta'];

interface Generated {
  input: PricingInput;
  rate: MeterRate;
  lookup: MeterLookup;
}

function generateScenario(rng: () => number): Generated {
  // Pick distinct origin + destination. Property tests don't care about
  // realism; they care about covering edge cells.
  const origin = DISTRICTS[Math.floor(rng() * DISTRICTS.length)];
  let dest: LicenceDistrict;
  do {
    dest = DISTRICTS[Math.floor(rng() * DISTRICTS.length)];
  } while (dest === origin);

  // Meter rate: cover the full sensible envelope of Cypriot tariffs.
  const baseFareEur = round2(2 + rng() * 5);             // €2 - €7
  const perKmRateEur = round2(0.5 + rng() * 1.5);        // €0.50 - €2.00
  const distanceKm = round2(5 + rng() * 110);            // 5 - 115 km covers Nicosia<->Paphos
  const nightMultiplier = round2(1.0 + rng() * 0.4);     // 1.00 - 1.40

  const rate: MeterRate = { origin, destination: dest, baseFareEur, perKmRateEur, distanceKm, nightMultiplier };
  const lookup: MeterLookup = () => rate;

  // Departure: random moment in a year-wide band so season + night both get
  // exercised. Now: random moment up to 72 h before departure so urgency
  // bands (urgent < 30 min, soon < 2 h, otherwise) all hit.
  const departureEpoch = Date.UTC(2026, 0, 1) + Math.floor(rng() * 365 * 86_400_000);
  const hoursAhead = rng() * 72;
  const nowEpoch = departureEpoch - hoursAhead * 3_600_000;

  const input: PricingInput = {
    originDistrict: origin,
    destinationDistrict: dest,
    departure: new Date(departureEpoch),
    now: new Date(nowEpoch),
    // Include all the optional signals so every branch of computePricing
    // gets exercised across the sample.
    flightLoadFactor: rng() < 0.5 ? rng() : undefined,
    driverAcceptanceScore: rng() < 0.5 ? rng() : undefined,
    hasPassenger: rng() < 0.3,
  };

  return { input, rate, lookup };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// --------------------------------------------------------------------------
// Invariants
// --------------------------------------------------------------------------
// Each takes a generated scenario + its pricing output and throws on
// violation. Keeping them as small named functions so a failure message
// names the broken invariant, not just a line number.

function invariantFloorBelowCeiling(_in: Generated, out: { floorEur: number; ceilingEur: number }): void {
  assert.ok(out.floorEur < out.ceilingEur, `floor ${out.floorEur} must be < ceiling ${out.ceilingEur}`);
}

function invariantSuggestedInsideRange(_in: Generated, out: { floorEur: number; ceilingEur: number; suggestedEur: number }): void {
  assert.ok(
    out.suggestedEur >= out.floorEur,
    `suggested ${out.suggestedEur} must be >= floor ${out.floorEur}`,
  );
  assert.ok(
    out.suggestedEur <= out.ceilingEur,
    `suggested ${out.suggestedEur} must be <= ceiling ${out.ceilingEur}`,
  );
}

function invariantFloorEqualsMultiplier(_in: Generated, out: { regulatedMeterEur: number; floorEur: number }): void {
  // The floor is the 2006 Motor Transport Law regulatory anchor; it must
  // equal exactly 0.40 × meter (rounded to 2dp), never more, never less.
  const expected = Math.round(out.regulatedMeterEur * PRICING_FLOOR_MULTIPLIER * 100) / 100;
  assert.equal(
    out.floorEur, expected,
    `floor ${out.floorEur} must equal 0.40 × meter (${expected})`,
  );
}

function invariantCeilingEqualsMultiplier(_in: Generated, out: { regulatedMeterEur: number; ceilingEur: number }): void {
  const expected = Math.round(out.regulatedMeterEur * PRICING_CEILING_MULTIPLIER * 100) / 100;
  assert.equal(
    out.ceilingEur, expected,
    `ceiling ${out.ceilingEur} must equal 0.90 × meter (${expected})`,
  );
}

function invariantRationaleNonEmpty(_in: Generated, out: { rationale: string[] }): void {
  assert.ok(out.rationale.length > 0, 'rationale must not be empty');
}

function invariantRoundedToTwoDp(_in: Generated, out: { floorEur: number; ceilingEur: number; suggestedEur: number; regulatedMeterEur: number }): void {
  for (const [name, value] of [
    ['floor', out.floorEur],
    ['ceiling', out.ceilingEur],
    ['suggested', out.suggestedEur],
    ['meter', out.regulatedMeterEur],
  ] as const) {
    const scaled = value * 100;
    assert.ok(
      Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) < 1e-9,
      `${name} ${value} is not rounded to 2dp`,
    );
  }
}

// --------------------------------------------------------------------------
// Driver: generate N scenarios, run all invariants on each.
// --------------------------------------------------------------------------

export function runPricingInvariantTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  // Two seeds so a flake on one doesn't mask a deterministic bug reachable
  // from the other. Bump iterations if a bug surfaces and we want a
  // tighter search.
  const seeds = [1, 42];
  const iterationsPerSeed = 1500;

  runCase(`invariants hold across ${seeds.length * iterationsPerSeed} random scenarios`, () => {
    for (const seed of seeds) {
      const rng = mulberry32(seed);
      for (let i = 0; i < iterationsPerSeed; i++) {
        const scenario = generateScenario(rng);
        const out = computePricing(scenario.input, scenario.lookup);
        try {
          invariantFloorBelowCeiling(scenario, out);
          invariantSuggestedInsideRange(scenario, out);
          invariantFloorEqualsMultiplier(scenario, out);
          invariantCeilingEqualsMultiplier(scenario, out);
          invariantRationaleNonEmpty(scenario, out);
          invariantRoundedToTwoDp(scenario, out);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `seed=${seed} iter=${i} ${msg}\n` +
            `  input: ${JSON.stringify({
              origin: scenario.input.originDistrict,
              destination: scenario.input.destinationDistrict,
              departure: scenario.input.departure?.toISOString(),
              now: scenario.input.now?.toISOString(),
              flightLoadFactor: scenario.input.flightLoadFactor,
              driverAcceptanceScore: scenario.input.driverAcceptanceScore,
              hasPassenger: scenario.input.hasPassenger,
            })}\n` +
            `  rate: ${JSON.stringify(scenario.rate)}\n` +
            `  output: ${JSON.stringify(out)}`,
          );
        }
      }
    }
  }, results);

  // Extreme inputs deserve dedicated cases so a regression in the clamp
  // logic can't hide behind the random sampler.
  runCase('extreme flight load + driver score still respects ceiling', () => {
    const rate: MeterRate = {
      origin: 'larnaca', destination: 'nicosia',
      baseFareEur: 3.5, perKmRateEur: 1.2, distanceKm: 50, nightMultiplier: 1.3,
    };
    const out = computePricing(
      {
        originDistrict: 'larnaca',
        destinationDistrict: 'nicosia',
        departure: new Date('2026-07-15T12:00:00+03:00'),
        now: new Date('2026-07-14T12:00:00+03:00'),
        flightLoadFactor: 1.0,
        driverAcceptanceScore: 1.0,
        hasPassenger: false,
      },
      () => rate,
    );
    assert.ok(out.suggestedEur <= out.ceilingEur);
    assert.ok(out.ceilingEur === Math.round(out.regulatedMeterEur * 0.9 * 100) / 100);
  }, results);

  runCase('urgent + low-season + existing passenger still respects floor', () => {
    const rate: MeterRate = {
      origin: 'limassol', destination: 'paphos',
      baseFareEur: 3.5, perKmRateEur: 1.2, distanceKm: 70, nightMultiplier: 1.3,
    };
    const departure = new Date('2026-01-20T14:00:00+02:00');
    const out = computePricing(
      {
        originDistrict: 'limassol',
        destinationDistrict: 'paphos',
        departure,
        now: new Date(departure.getTime() - 10 * 60_000),   // 10 min away
        hasPassenger: true,
      },
      () => rate,
    );
    assert.ok(out.suggestedEur >= out.floorEur);
    assert.ok(out.floorEur === Math.round(out.regulatedMeterEur * 0.4 * 100) / 100);
  }, results);

  runCase('night-tariff departure still respects the same multipliers', () => {
    // 02:00 local -> night multiplier kicks in on the meter. Floor/ceiling
    // scale accordingly but the 0.40/0.90 contract must hold.
    const rate: MeterRate = {
      origin: 'nicosia', destination: 'larnaca',
      baseFareEur: 3.0, perKmRateEur: 1.0, distanceKm: 45, nightMultiplier: 1.3,
    };
    const out = computePricing(
      {
        originDistrict: 'nicosia',
        destinationDistrict: 'larnaca',
        departure: new Date('2026-05-15T02:00:00+03:00'),
        now: new Date('2026-05-15T00:00:00+03:00'),
      },
      () => rate,
    );
    assert.equal(out.floorEur, Math.round(out.regulatedMeterEur * 0.4 * 100) / 100);
    assert.equal(out.ceilingEur, Math.round(out.regulatedMeterEur * 0.9 * 100) / 100);
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
  const { passed, failed, results } = runPricingInvariantTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
