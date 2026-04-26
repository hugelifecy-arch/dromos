// Self-checking tests for the unit-economics model.
// Run with `npx tsx`.

import assert from 'node:assert/strict';

import {
  BASE,
  OFF_PEAK_MONTHS,
  OPTIMISTIC,
  PEAK_MONTHS,
  PESSIMISTIC,
  computeUnitEcon,
  type UnitEconInput,
} from './model';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (err) {
    results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) });
  }
}

function approx(actual: number, expected: number, tolerance = 0.01): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

export function runUnitEconTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  runCase('PEAK + OFF_PEAK months sum to 12', () => {
    assert.equal(PEAK_MONTHS + OFF_PEAK_MONTHS, 12);
  }, results);

  runCase('rejects driver mix that does not sum to 1.0', () => {
    const bad: UnitEconInput = { ...BASE, driverMix: { free: 0.5, plus: 0.3, pro: 0.1 } };
    assert.throws(() => computeUnitEcon(bad), /sum to 1/i);
  }, results);

  runCase('rejects negative mix shares', () => {
    const bad: UnitEconInput = { ...BASE, driverMix: { free: 1.2, plus: -0.1, pro: -0.1 } };
    assert.throws(() => computeUnitEcon(bad), /non-negative/i);
  }, results);

  runCase('peakMonth.netEur >= offPeakMonth.netEur', () => {
    const r = computeUnitEcon(BASE);
    assert.ok(
      r.peakMonth.netEur >= r.offPeakMonth.netEur,
      `peak ${r.peakMonth.netEur} should be >= off-peak ${r.offPeakMonth.netEur}`,
    );
  }, results);

  runCase('annual revenue equals peak*6 + offPeak*6', () => {
    const r = computeUnitEcon(BASE);
    const expected =
      r.peakMonth.totalRevenueEur * PEAK_MONTHS +
      r.offPeakMonth.totalRevenueEur * OFF_PEAK_MONTHS;
    approx(r.annual.revenueEur, expected, 0.01);
  }, results);

  runCase('subscription revenue scales linearly with driver count', () => {
    const small = computeUnitEcon({ ...BASE, activeDrivers: 100 });
    const big = computeUnitEcon({ ...BASE, activeDrivers: 200 });
    approx(big.averageMonth.subscriptionRevenueEur, small.averageMonth.subscriptionRevenueEur * 2, 0.01);
  }, results);

  runCase('hotel SaaS revenue equals hotels × monthly fee', () => {
    const r = computeUnitEcon(BASE);
    approx(r.averageMonth.hotelSaasRevenueEur, BASE.activeHotels * BASE.hotelMonthlyEur, 0.01);
  }, results);

  runCase('zero hotels yields infinite hotel payback', () => {
    const r = computeUnitEcon({ ...BASE, activeHotels: 0 });
    assert.equal(r.ratios.hotelPaybackMonths, Infinity);
  }, results);

  runCase('zero drivers yields infinite driver payback', () => {
    const r = computeUnitEcon({
      ...BASE,
      activeDrivers: 0,
      // mix is irrelevant when count is zero, but must still be valid
      driverMix: { free: 1, plus: 0, pro: 0 },
    });
    assert.equal(r.ratios.driverPaybackMonths, Infinity);
  }, results);

  runCase('cashFlowValleyEur equals offPeak.netEur × OFF_PEAK_MONTHS', () => {
    const r = computeUnitEcon(BASE);
    approx(r.annual.cashFlowValleyEur, r.offPeakMonth.netEur * OFF_PEAK_MONTHS, 0.01);
  }, results);

  runCase('PESSIMISTIC scenario is annual-net-negative (founder eats it)', () => {
    const r = computeUnitEcon(PESSIMISTIC);
    assert.ok(
      r.annual.netEur < 0,
      `expected pessimistic to be loss-making, got ${r.annual.netEur.toFixed(2)} EUR`,
    );
  }, results);

  runCase('OPTIMISTIC scenario is annual-net-positive', () => {
    const r = computeUnitEcon(OPTIMISTIC);
    assert.ok(
      r.annual.netEur > 0,
      `expected optimistic to be profitable, got ${r.annual.netEur.toFixed(2)} EUR`,
    );
  }, results);

  runCase('driver ARPU only includes driver-side revenue (not hotel)', () => {
    const r = computeUnitEcon(BASE);
    const hotelArpuRolledIn =
      r.averageMonth.totalRevenueEur / BASE.activeDrivers;
    assert.ok(
      r.ratios.driverArpuMonthlyEur < hotelArpuRolledIn,
      'driver ARPU should exclude hotel revenue',
    );
  }, results);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('model.test.ts')) {
  const summary = runUnitEconTests();
  for (const r of summary.results) {
    const mark = r.passed ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${r.name}${r.error ? `\n        ${r.error}` : ''}`);
  }
  console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
  if (summary.failed > 0) process.exit(1);
}
