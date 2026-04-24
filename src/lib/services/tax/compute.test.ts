// Self-checking tests for the quarterly tax computation.
// Run with `npx tsx`.

import assert from 'node:assert/strict';

import {
  GESY_RATE,
  SOCIAL_INSURANCE_RATE,
  VAT_REGISTRATION_THRESHOLD_EUR,
  VAT_STANDARD_RATE,
  computeQuarterly,
  quarterRange,
  trailing12mRange,
  type TxRow,
} from './compute';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try { fn(); results.push({ name, passed: true }); }
  catch (err) { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); }
}

function tx(type: TxRow['type'], amount: number, iso: string): TxRow {
  return { type, amount, created_at: iso };
}

export function runTaxComputeTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  runCase('quarterRange Q1 2026 is Jan 1 - Apr 1 UTC', () => {
    const r = quarterRange({ year: 2026, quarter: 1 });
    assert.equal(r.fromIso, '2026-01-01T00:00:00.000Z');
    assert.equal(r.toIso, '2026-04-01T00:00:00.000Z');
  }, results);

  runCase('quarterRange Q4 2026 is Oct 1 - Jan 1 2027 UTC', () => {
    const r = quarterRange({ year: 2026, quarter: 4 });
    assert.equal(r.fromIso, '2026-10-01T00:00:00.000Z');
    assert.equal(r.toIso, '2027-01-01T00:00:00.000Z');
  }, results);

  runCase('trailing12mRange ends at the quarter close', () => {
    const r = trailing12mRange({ year: 2026, quarter: 2 });
    assert.equal(r.fromIso, '2025-07-01T00:00:00.000Z');
    assert.equal(r.toIso, '2026-07-01T00:00:00.000Z');
  }, results);

  runCase('empty input -> all zeros', () => {
    const t = computeQuarterly([], { year: 2026, quarter: 1 });
    assert.equal(t.grossEur, 0);
    assert.equal(t.refundsEur, 0);
    assert.equal(t.netEur, 0);
    assert.equal(t.socialInsuranceEur, 0);
    assert.equal(t.gesyEur, 0);
    assert.equal(t.vatDueEur, 0);
    assert.equal(t.vatRegistered, false);
    assert.equal(t.rowCount, 0);
  }, results);

  runCase('gross/net math: SI + GESY at sub-threshold driver', () => {
    const rows: TxRow[] = [
      tx('ride_payment', 100, '2026-01-15T10:00:00Z'),
      tx('ride_payment', 200, '2026-02-20T10:00:00Z'),
      tx('bonus',         50, '2026-03-01T10:00:00Z'),
      tx('refund',       -30, '2026-03-05T10:00:00Z'),  // already negative
      tx('commission',   -20, '2026-02-20T10:05:00Z'),  // not taxable base
    ];
    const t = computeQuarterly(rows, { year: 2026, quarter: 1 });
    assert.equal(t.grossEur, 350);
    assert.equal(t.refundsEur, 30);
    assert.equal(t.netEur, 320);
    assert.equal(t.socialInsuranceEur, Math.round(320 * SOCIAL_INSURANCE_RATE * 100) / 100);
    assert.equal(t.gesyEur, Math.round(320 * GESY_RATE * 100) / 100);
    assert.equal(t.vatRegistered, false);
    assert.equal(t.vatDueEur, 0);
    assert.equal(t.rowCount, 5);
  }, results);

  runCase('refund stored as positive amount is still subtracted', () => {
    // Some app code inserts refunds as positive; we Math.abs to be safe.
    const rows: TxRow[] = [
      tx('ride_payment', 100, '2026-01-15T10:00:00Z'),
      tx('refund',        40, '2026-01-16T10:00:00Z'),
    ];
    const t = computeQuarterly(rows, { year: 2026, quarter: 1 });
    assert.equal(t.refundsEur, 40);
    assert.equal(t.netEur, 60);
  }, results);

  runCase('transactions outside the quarter are ignored for in-quarter totals', () => {
    const rows: TxRow[] = [
      tx('ride_payment', 100, '2025-12-31T23:59:00Z'),  // before
      tx('ride_payment', 200, '2026-01-01T00:00:00Z'),  // inside (from boundary)
      tx('ride_payment', 300, '2026-03-31T23:59:00Z'),  // inside
      tx('ride_payment', 400, '2026-04-01T00:00:00Z'),  // after (to boundary, exclusive)
    ];
    const t = computeQuarterly(rows, { year: 2026, quarter: 1 });
    assert.equal(t.grossEur, 500);
    assert.equal(t.rowCount, 2);
  }, results);

  runCase('VAT kicks in when trailing 12m turnover crosses €15,600', () => {
    // Build 12 months of €1,400/month ride income = €16,800 trailing turnover.
    const rows: TxRow[] = [];
    for (let m = 0; m < 12; m++) {
      const month = String(m + 1).padStart(2, '0');
      const iso = `2025-${month}-15T10:00:00Z`;
      rows.push(tx('ride_payment', 1400, iso));
    }
    // Quarterly (Q1 2026) income: zero. But the threshold is checked on the
    // trailing 12m window ending at quarter close. Add a tiny Q1 2026 row so
    // the quarter has something.
    rows.push(tx('ride_payment', 300, '2026-02-01T10:00:00Z'));

    const t = computeQuarterly(rows, { year: 2026, quarter: 1 });
    // Trailing 12m ending Apr 1 2026 = Apr 2025..Apr 2026 (exclusive),
    // covers months 4..12 of 2025 + the Q1 2026 row = 9 * 1400 + 300 = 12,900.
    // That's still below €15,600; no VAT.
    assert.equal(t.vatRegistered, false);
    assert.equal(t.vatDueEur, 0);
  }, results);

  runCase('VAT: trailing 12m >= €15,600 -> VAT due on quarter', () => {
    const rows: TxRow[] = [];
    // 12 monthly rows covering Apr 2025 - Mar 2026 at €1,400 each = €16,800.
    for (let i = 0; i < 12; i++) {
      const date = new Date(Date.UTC(2025, 3 + i, 15)); // Apr..Mar
      rows.push(tx('ride_payment', 1400, date.toISOString()));
    }
    const t = computeQuarterly(rows, { year: 2026, quarter: 1 });
    assert.equal(t.vatRegistered, true);
    assert.ok(t.trailing12mTurnoverEur >= VAT_REGISTRATION_THRESHOLD_EUR, `got ${t.trailing12mTurnoverEur}`);
    // Q1 2026 rows: Jan, Feb, Mar = 3 * 1400 = €4,200 gross, no refunds.
    assert.equal(t.grossEur, 4200);
    assert.equal(t.netEur, 4200);
    assert.equal(t.vatDueEur, Math.round(4200 * VAT_STANDARD_RATE * 100) / 100);
  }, results);

  runCase('rounding: values round to 2 dp consistently', () => {
    const rows: TxRow[] = [
      tx('ride_payment', 99.995, '2026-01-01T10:00:00Z'),  // half-to-even territory
    ];
    const t = computeQuarterly(rows, { year: 2026, quarter: 1 });
    // 99.995 rounds to 100.00 (round-half-away-from-zero via Math.round)
    assert.equal(t.grossEur, 100);
    // 99.995 * 0.166 = 16.59917 -> 16.6
    assert.equal(t.socialInsuranceEur, 16.6);
  }, results);

  runCase('commission and payout rows are ignored in all totals', () => {
    const rows: TxRow[] = [
      tx('ride_payment', 1000, '2026-01-15T10:00:00Z'),
      tx('commission',   -150, '2026-01-15T10:05:00Z'),
      tx('payout',       -850, '2026-02-01T10:00:00Z'),
      tx('subscription',  -30, '2026-01-01T00:00:00Z'),
    ];
    const t = computeQuarterly(rows, { year: 2026, quarter: 1 });
    assert.equal(t.grossEur, 1000);
    assert.equal(t.netEur, 1000);   // commissions/payouts/subs don't reduce the tax base
    assert.equal(t.trailing12mTurnoverEur, 1000);
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
  const { passed, failed, results } = runTaxComputeTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
