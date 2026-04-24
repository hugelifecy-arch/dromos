// Self-checking test module for pricing engine.
//
// No test framework is yet installed in this repo. This file uses Node's
// built-in `node:assert` and exports a runnable `runPricingTests()` so it
// can be wired into vitest / node --test later without rewriting.
//
// Manual run: `npx tsx src/lib/services/pricing.test.ts`
//
// Every test here encodes a regulatory or user-facing invariant from
// docs/cyprus-taxi-technical-spec.md §4.

import assert from 'node:assert/strict';

import {
  PRICING_CEILING_MULTIPLIER,
  PRICING_FLOOR_MULTIPLIER,
  PRICING_SUGGESTED_BASE_MULTIPLIER,
  PricingError,
  computePricing,
  computeRegulatedMeterEur,
  validateAskingPrice,
  type MeterLookup,
  type MeterRate,
  type PricingInput,
} from './pricing';

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const LCA_TO_LIMASSOL: MeterRate = {
  origin: 'larnaca',
  destination: 'limassol',
  baseFareEur: 3.40,
  perKmRateEur: 0.73,
  distanceKm: 70,
  nightMultiplier: 1.30,
};

const NIC_TO_LIM: MeterRate = {
  origin: 'nicosia',
  destination: 'limassol',
  baseFareEur: 3.40,
  perKmRateEur: 0.73,
  distanceKm: 85,
  nightMultiplier: 1.30,
};

function fixtureLookup(rates: MeterRate[]): MeterLookup {
  return (origin, destination) =>
    rates.find((r) => r.origin === origin && r.destination === destination) ?? null;
}

// High season, comfortable lead time, no extras
const baseInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  originDistrict: 'larnaca',
  destinationDistrict: 'limassol',
  departure: new Date('2026-07-15T14:00:00+03:00'), // summer afternoon
  now: new Date('2026-07-15T08:00:00+03:00'), // 6h lead
  ...overrides,
});

// --------------------------------------------------------------------------
// Test cases
// --------------------------------------------------------------------------

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (err) {
    results.push({
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function runPricingTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];
  const lookup = fixtureLookup([LCA_TO_LIMASSOL, NIC_TO_LIM]);

  // ------ Meter computation ------

  runCase('daytime meter = base + per_km * distance', () => {
    const departure = new Date('2026-07-15T14:00:00+03:00');
    const meter = computeRegulatedMeterEur(LCA_TO_LIMASSOL, departure);
    assert.equal(meter, 54.5); // 3.40 + 0.73*70 = 54.50
  }, results);

  runCase('night meter applies night multiplier', () => {
    const departure = new Date('2026-07-15T23:30:00+03:00');
    const meter = computeRegulatedMeterEur(LCA_TO_LIMASSOL, departure);
    assert.equal(meter, 70.85); // 54.5 * 1.30 = 70.85
  }, results);

  runCase('early-morning (05:00) counts as night', () => {
    const departure = new Date('2026-07-15T05:00:00+03:00');
    const meter = computeRegulatedMeterEur(LCA_TO_LIMASSOL, departure);
    assert.equal(meter, 70.85);
  }, results);

  // ------ Floor / Ceiling invariants ------

  runCase('floor is 40% of meter', () => {
    const out = computePricing(baseInput(), lookup);
    assert.equal(out.floorEur, round2(out.regulatedMeterEur * PRICING_FLOOR_MULTIPLIER));
  }, results);

  runCase('ceiling is 90% of meter - hard legal cap', () => {
    const out = computePricing(baseInput(), lookup);
    assert.equal(out.ceilingEur, round2(out.regulatedMeterEur * PRICING_CEILING_MULTIPLIER));
  }, results);

  runCase('suggested always within [floor, ceiling]', () => {
    // Exercise many input combinations; the clamp must hold for all of them.
    const scenarios: PricingInput[] = [];
    for (const hour of [0, 6, 10, 14, 18, 22, 23]) {
      for (const leadMinutes of [5, 30, 90, 240, 1440]) {
        for (const load of [0, 0.5, 1]) {
          for (const score of [0, 0.5, 1]) {
            for (const pax of [false, true]) {
              const departure = new Date(Date.UTC(2026, 6, 15, hour, 0));
              const now = new Date(departure.getTime() - leadMinutes * 60_000);
              scenarios.push({
                originDistrict: 'larnaca',
                destinationDistrict: 'limassol',
                departure,
                now,
                flightLoadFactor: load,
                driverAcceptanceScore: score,
                hasPassenger: pax,
              });
            }
          }
        }
      }
    }

    for (const s of scenarios) {
      const out = computePricing(s, lookup);
      assert.ok(
        out.suggestedEur >= out.floorEur,
        `suggested ${out.suggestedEur} < floor ${out.floorEur}`,
      );
      assert.ok(
        out.suggestedEur <= out.ceilingEur,
        `suggested ${out.suggestedEur} > ceiling ${out.ceilingEur}`,
      );
      assert.ok(out.floorEur < out.ceilingEur);
    }
  }, results);

  // ------ Suggestion-shaping behaviour ------

  runCase('high season raises suggested vs low season', () => {
    const summer = computePricing(baseInput({
      departure: new Date('2026-07-15T14:00:00+03:00'),
      now: new Date('2026-07-15T08:00:00+03:00'),
    }), lookup);
    const winter = computePricing(baseInput({
      departure: new Date('2026-02-15T14:00:00+02:00'),
      now: new Date('2026-02-15T08:00:00+02:00'),
    }), lookup);
    assert.ok(
      summer.suggestedEur > winter.suggestedEur,
      `summer ${summer.suggestedEur} not > winter ${winter.suggestedEur}`,
    );
  }, results);

  runCase('urgent departure (< 30 min) lowers suggested', () => {
    const comfortable = computePricing(baseInput(), lookup);
    const urgent = computePricing(baseInput({
      now: new Date('2026-07-15T13:45:00+03:00'), // 15 min lead
    }), lookup);
    assert.ok(
      urgent.suggestedEur < comfortable.suggestedEur,
      `urgent ${urgent.suggestedEur} not < comfortable ${comfortable.suggestedEur}`,
    );
  }, results);

  runCase('higher flight load raises suggested', () => {
    const empty = computePricing(baseInput({ flightLoadFactor: 0 }), lookup);
    const full = computePricing(baseInput({ flightLoadFactor: 1 }), lookup);
    assert.ok(full.suggestedEur > empty.suggestedEur);
  }, results);

  runCase('higher driver score raises suggested', () => {
    const rookie = computePricing(baseInput({ driverAcceptanceScore: 0 }), lookup);
    const veteran = computePricing(baseInput({ driverAcceptanceScore: 1 }), lookup);
    assert.ok(veteran.suggestedEur >= rookie.suggestedEur);
  }, results);

  runCase('existing passenger nudges price down', () => {
    const empty = computePricing(baseInput({ hasPassenger: false }), lookup);
    const shared = computePricing(baseInput({ hasPassenger: true }), lookup);
    assert.ok(shared.suggestedEur < empty.suggestedEur);
  }, results);

  // ------ Base-multiplier sanity ------

  runCase('base suggested multiplier is between floor and ceiling', () => {
    assert.ok(PRICING_SUGGESTED_BASE_MULTIPLIER > PRICING_FLOOR_MULTIPLIER);
    assert.ok(PRICING_SUGGESTED_BASE_MULTIPLIER < PRICING_CEILING_MULTIPLIER);
  }, results);

  // ------ Error paths ------

  runCase('throws PricingError when meter lookup fails', () => {
    const emptyLookup: MeterLookup = () => null;
    assert.throws(
      () => computePricing(baseInput(), emptyLookup),
      (err: unknown) => err instanceof PricingError && (err as PricingError).code === 'METER_NOT_FOUND',
    );
  }, results);

  runCase('validateAskingPrice rejects above ceiling', () => {
    const out = computePricing(baseInput(), lookup);
    assert.throws(
      () => validateAskingPrice(out.ceilingEur + 1, out),
      (err: unknown) => err instanceof PricingError && (err as PricingError).code === 'EXCEEDS_CEILING',
    );
  }, results);

  runCase('validateAskingPrice rejects below floor', () => {
    const out = computePricing(baseInput(), lookup);
    assert.throws(
      () => validateAskingPrice(out.floorEur - 1, out),
      (err: unknown) => err instanceof PricingError && (err as PricingError).code === 'BELOW_FLOOR',
    );
  }, results);

  runCase('validateAskingPrice accepts on boundaries', () => {
    const out = computePricing(baseInput(), lookup);
    validateAskingPrice(out.floorEur, out);
    validateAskingPrice(out.ceilingEur, out);
    validateAskingPrice(out.suggestedEur, out);
  }, results);

  // ------ Rationale is non-empty ------

  runCase('rationale is human-readable and non-empty', () => {
    const out = computePricing(baseInput({ flightLoadFactor: 0.9 }), lookup);
    assert.ok(out.rationale.length > 0);
    assert.ok(out.rationale.every((r) => r.length > 0));
  }, results);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Manual entry point: `npx tsx src/lib/services/pricing.test.ts`
// Tolerant of the many ways tsx / node can be invoked.
const isDirectRun =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  // @ts-ignore - require.main is not in all TS lib targets
  require.main === module;

if (isDirectRun) {
  const { passed, failed, results } = runPricingTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
