// Quarterly Cyprus tax computation for a self-employed taxi driver.
//
// Pure function over a batch of transactions. Callers inject the rows; this
// module never touches the DB. That keeps the math testable (see
// compute.test.ts) and lets the /api/tax/export route do the one Supabase
// fetch before handing results to serialise.
//
// Rates and thresholds (as of 2024 — update with a PR when the Ministry
// bumps them):
//
//   Social Insurance (ΚΣ)          self-employed: 16.6% of net earnings
//   General Health (ΓεΣΥ)                          4.0% of net earnings
//   VAT (ΦΠΑ) registration threshold              €15,600 rolling 12-month turnover
//   VAT rate (standard)                           19% on taxable turnover
//
// "Net" here means gross ride_payment income minus refunds. Platform
// commission is NOT deducted from the driver's tax base — the driver pays
// tax on the gross they received before commission, which is how self-
// employed taxi income is treated under Cypriot law (platform is a
// service provider, not an employer).
//
// VAT is only applied once trailing-12m turnover crosses the threshold.
// Drivers below the threshold are VAT-exempt; the exporter sets vat_due_eur
// to 0 for them.

export const SOCIAL_INSURANCE_RATE = 0.166;
export const GESY_RATE = 0.04;
export const VAT_REGISTRATION_THRESHOLD_EUR = 15_600;
export const VAT_STANDARD_RATE = 0.19;

/** The subset of `transactions` columns we need. */
export interface TxRow {
  type: 'ride_payment' | 'commission' | 'payout' | 'subscription' | 'refund' | 'bonus';
  amount: number;         // EUR
  created_at: string;     // ISO
}

export interface QuarterKey {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export interface QuarterlyTotals {
  grossEur: number;
  refundsEur: number;
  netEur: number;
  socialInsuranceEur: number;
  gesyEur: number;
  vatDueEur: number;
  trailing12mTurnoverEur: number;
  vatRegistered: boolean;
  rowCount: number;
}

// --------------------------------------------------------------------------
// Date helpers
// --------------------------------------------------------------------------

/**
 * ISO date range [from, to) in UTC for the given quarter. The quarter runs
 * from the first millisecond of its first month to the first millisecond
 * of the month after the quarter.
 */
export function quarterRange(key: QuarterKey): { fromIso: string; toIso: string } {
  const startMonth = (key.quarter - 1) * 3;      // 0, 3, 6, 9
  const from = new Date(Date.UTC(key.year, startMonth, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(key.year, startMonth + 3, 1, 0, 0, 0, 0));
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/**
 * ISO date range [from, to) covering the 12 months ending at the quarter's
 * close. Used for the VAT-threshold turnover calc.
 */
export function trailing12mRange(key: QuarterKey): { fromIso: string; toIso: string } {
  const { toIso } = quarterRange(key);
  const to = new Date(toIso);
  const from = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1, 0, 0, 0, 0));
  return { fromIso: from.toISOString(), toIso };
}

// --------------------------------------------------------------------------
// Core computation
// --------------------------------------------------------------------------

/**
 * Compute totals for a quarter given ALL transactions in the trailing 12m
 * window ending at the quarter's close. The caller fetches that window
 * once (cheaper than two queries); we slice locally.
 *
 * Returning rowCount includes the quarter's rows only (for the audit trail).
 */
export function computeQuarterly(rows: TxRow[], key: QuarterKey): QuarterlyTotals {
  const quarter = quarterRange(key);
  const trailing = trailing12mRange(key);

  let grossQuarter = 0;
  let refundsQuarter = 0;
  let turnoverTrailing = 0;
  let quarterRowCount = 0;

  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (!Number.isFinite(t)) continue;

    // Trailing 12m turnover: rides + bonuses, minus refunds. Subscription
    // payments aren't turnover to the driver — the driver paid them. They
    // might be VAT-deductible but that's a future return, not current-
    // quarter output VAT.
    if (t >= Date.parse(trailing.fromIso) && t < Date.parse(trailing.toIso)) {
      if (r.type === 'ride_payment' || r.type === 'bonus') {
        turnoverTrailing += r.amount;
      } else if (r.type === 'refund') {
        turnoverTrailing -= Math.abs(r.amount);
      }
    }

    // Per-quarter income (what the driver reports this period).
    if (t >= Date.parse(quarter.fromIso) && t < Date.parse(quarter.toIso)) {
      quarterRowCount += 1;
      if (r.type === 'ride_payment' || r.type === 'bonus') {
        grossQuarter += r.amount;
      } else if (r.type === 'refund') {
        refundsQuarter += Math.abs(r.amount);
      }
    }
  }

  const netQuarter = grossQuarter - refundsQuarter;

  const socialInsurance = round2(netQuarter * SOCIAL_INSURANCE_RATE);
  const gesy = round2(netQuarter * GESY_RATE);

  const vatRegistered = turnoverTrailing >= VAT_REGISTRATION_THRESHOLD_EUR;
  // VAT is OUTPUT vat: 19% on taxable turnover realised in-quarter. Simple
  // shape for v1 — rides are standard-rated; there is no reduced-rate or
  // zero-rated output on the taxi side. Input VAT (fuel, vehicle repairs)
  // is out of scope until we add an expenses ledger.
  const vatDue = vatRegistered ? round2(netQuarter * VAT_STANDARD_RATE) : 0;

  return {
    grossEur: round2(grossQuarter),
    refundsEur: round2(refundsQuarter),
    netEur: round2(netQuarter),
    socialInsuranceEur: socialInsurance,
    gesyEur: gesy,
    vatDueEur: vatDue,
    trailing12mTurnoverEur: round2(turnoverTrailing),
    vatRegistered,
    rowCount: quarterRowCount,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
