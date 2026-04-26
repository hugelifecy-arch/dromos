// Unit-economics model for the Cyprus empty-leg marketplace.
//
// Pure function. No DB, no I/O. Lets the founder compare scenarios
// (pessimistic / base / optimistic) without spreadsheet drift, and lets
// docs/unit-economics.md show worked numbers that stay in sync with code.
//
// Cyprus tourism is sharply seasonal — peak May–October, trough Nov–April.
// The model expresses this via two leg-rate inputs and reports the worst /
// best monthly net so the founder can see the cash-flow valley honestly.
//
// Conventions:
//   - All amounts EUR.
//   - "ARPU" = average revenue per user per month.
//   - "Payback" = CAC / monthly ARPU, in months. Lower is better.
//   - Driver mix shares must sum to 1.0 (validated).

export const PEAK_MONTHS = 6;     // May, Jun, Jul, Aug, Sep, Oct
export const OFF_PEAK_MONTHS = 6; // Nov, Dec, Jan, Feb, Mar, Apr

export interface DriverMix {
  free: number;
  plus: number;
  pro: number;
}

export interface UnitEconInput {
  /** Average active drivers across the year. */
  activeDrivers: number;
  /** Tier-share of active drivers. Must sum to 1.0. */
  driverMix: DriverMix;
  /** Average matched legs per driver per month, by season. */
  legsPerDriverPerMonth: { peak: number; offPeak: number };

  /** Monthly subscription prices the platform charges drivers. */
  plusMonthlyEur: number;
  proMonthlyEur: number;
  /** Per-matched-leg fee charged to free-tier drivers. */
  transactionalFeePerLegEur: number;

  /** Hotel SaaS line. */
  activeHotels: number;
  hotelMonthlyEur: number;

  /** Monthly fixed costs. */
  fixedCosts: {
    infra: number;
    twilio: number;
    aviationstack: number;
    jcc: number;
    legalRetainer: number;
    founderSalary: number;
  };

  /** Monthly marketing spend (counted as a fixed cost in this model). */
  marketingBudgetMonthlyEur: number;

  /** Acquisition costs. */
  driverCacEur: number;
  hotelCacEur: number;
}

export interface MonthlyBreakdown {
  /** Subscription revenue (Plus + Pro tiers). */
  subscriptionRevenueEur: number;
  /** Transactional fee revenue (free-tier × legs × fee). */
  transactionalRevenueEur: number;
  /** Hotel SaaS revenue. */
  hotelSaasRevenueEur: number;
  /** Sum of the three lines. */
  totalRevenueEur: number;
  /** Sum of the fixedCosts struct + marketing budget. */
  totalFixedCostsEur: number;
  /** revenue - fixed costs (no variable costs in v1; legs are revenue, not cost). */
  netEur: number;
}

export interface UnitEconScenario {
  /** Average month across the year (peak + off-peak averaged). */
  averageMonth: MonthlyBreakdown;
  /** Best month (peak season). */
  peakMonth: MonthlyBreakdown;
  /** Worst month (off-peak). */
  offPeakMonth: MonthlyBreakdown;
  /** 12-month aggregates. */
  annual: {
    revenueEur: number;
    netEur: number;
    cashFlowValleyEur: number; // sum of off-peak months only
  };
  /** Per-customer economics. */
  ratios: {
    driverArpuMonthlyEur: number;
    hotelArpuMonthlyEur: number;
    driverPaybackMonths: number;
    hotelPaybackMonths: number;
  };
}

function assertDriverMixValid(mix: DriverMix): void {
  const sum = mix.free + mix.plus + mix.pro;
  // Allow a small tolerance for floating-point arithmetic.
  if (Math.abs(sum - 1) > 1e-6) {
    throw new Error(`Driver mix must sum to 1.0, got ${sum.toFixed(4)}`);
  }
  if (mix.free < 0 || mix.plus < 0 || mix.pro < 0) {
    throw new Error('Driver mix shares must be non-negative');
  }
}

function monthlyAt(
  input: UnitEconInput,
  legsPerDriver: number,
): MonthlyBreakdown {
  const { activeDrivers, driverMix, plusMonthlyEur, proMonthlyEur, transactionalFeePerLegEur } = input;

  const freeDrivers = activeDrivers * driverMix.free;
  const plusDrivers = activeDrivers * driverMix.plus;
  const proDrivers = activeDrivers * driverMix.pro;

  const subscriptionRevenueEur = plusDrivers * plusMonthlyEur + proDrivers * proMonthlyEur;
  const transactionalRevenueEur = freeDrivers * legsPerDriver * transactionalFeePerLegEur;
  const hotelSaasRevenueEur = input.activeHotels * input.hotelMonthlyEur;

  const totalRevenueEur = subscriptionRevenueEur + transactionalRevenueEur + hotelSaasRevenueEur;

  const totalFixedCostsEur =
    input.fixedCosts.infra +
    input.fixedCosts.twilio +
    input.fixedCosts.aviationstack +
    input.fixedCosts.jcc +
    input.fixedCosts.legalRetainer +
    input.fixedCosts.founderSalary +
    input.marketingBudgetMonthlyEur;

  return {
    subscriptionRevenueEur,
    transactionalRevenueEur,
    hotelSaasRevenueEur,
    totalRevenueEur,
    totalFixedCostsEur,
    netEur: totalRevenueEur - totalFixedCostsEur,
  };
}

export function computeUnitEcon(input: UnitEconInput): UnitEconScenario {
  assertDriverMixValid(input.driverMix);

  const peakMonth = monthlyAt(input, input.legsPerDriverPerMonth.peak);
  const offPeakMonth = monthlyAt(input, input.legsPerDriverPerMonth.offPeak);

  // Average across the year: 6 peak + 6 off-peak months, equal-weighted by month count.
  const avgLegsPerDriver =
    (input.legsPerDriverPerMonth.peak * PEAK_MONTHS +
      input.legsPerDriverPerMonth.offPeak * OFF_PEAK_MONTHS) /
    (PEAK_MONTHS + OFF_PEAK_MONTHS);
  const averageMonth = monthlyAt(input, avgLegsPerDriver);

  const annualRevenueEur =
    peakMonth.totalRevenueEur * PEAK_MONTHS + offPeakMonth.totalRevenueEur * OFF_PEAK_MONTHS;
  const annualNetEur =
    peakMonth.netEur * PEAK_MONTHS + offPeakMonth.netEur * OFF_PEAK_MONTHS;
  const cashFlowValleyEur = offPeakMonth.netEur * OFF_PEAK_MONTHS;

  const driverArpuMonthlyEur =
    input.activeDrivers > 0
      ? (averageMonth.subscriptionRevenueEur + averageMonth.transactionalRevenueEur) /
        input.activeDrivers
      : 0;
  const hotelArpuMonthlyEur =
    input.activeHotels > 0 ? averageMonth.hotelSaasRevenueEur / input.activeHotels : 0;

  const driverPaybackMonths =
    driverArpuMonthlyEur > 0 ? input.driverCacEur / driverArpuMonthlyEur : Infinity;
  const hotelPaybackMonths =
    hotelArpuMonthlyEur > 0 ? input.hotelCacEur / hotelArpuMonthlyEur : Infinity;

  return {
    averageMonth,
    peakMonth,
    offPeakMonth,
    annual: {
      revenueEur: annualRevenueEur,
      netEur: annualNetEur,
      cashFlowValleyEur,
    },
    ratios: {
      driverArpuMonthlyEur,
      hotelArpuMonthlyEur,
      driverPaybackMonths,
      hotelPaybackMonths,
    },
  };
}

// --------------------------------------------------------------------------
// Named scenarios — defaults the founder can riff on.
//
// All numbers are placeholder until validation produces real ones. Each is
// labelled with the assumption that produced it.
// --------------------------------------------------------------------------

export const PESSIMISTIC: UnitEconInput = {
  activeDrivers: 50,
  driverMix: { free: 0.85, plus: 0.13, pro: 0.02 },
  legsPerDriverPerMonth: { peak: 6, offPeak: 1 },
  plusMonthlyEur: 19,
  proMonthlyEur: 29,
  transactionalFeePerLegEur: 0.5,
  activeHotels: 3,
  hotelMonthlyEur: 49,
  fixedCosts: {
    infra: 80,        // Supabase Pro + Vercel Pro
    twilio: 30,
    aviationstack: 50,
    jcc: 0,
    legalRetainer: 100,
    founderSalary: 0, // unpaid until revenue covers it
  },
  marketingBudgetMonthlyEur: 200,
  driverCacEur: 30,   // mostly time, light ad spend
  hotelCacEur: 250,   // in-person sales burns founder hours
};

export const BASE: UnitEconInput = {
  activeDrivers: 250,
  driverMix: { free: 0.6, plus: 0.3, pro: 0.1 },
  legsPerDriverPerMonth: { peak: 12, offPeak: 3 },
  plusMonthlyEur: 19,
  proMonthlyEur: 29,
  transactionalFeePerLegEur: 0.75,
  activeHotels: 15,
  hotelMonthlyEur: 79,
  fixedCosts: {
    infra: 200,
    twilio: 80,
    aviationstack: 50,
    jcc: 30,
    legalRetainer: 200,
    founderSalary: 1500,
  },
  marketingBudgetMonthlyEur: 800,
  driverCacEur: 25,
  hotelCacEur: 200,
};

export const OPTIMISTIC: UnitEconInput = {
  activeDrivers: 600,
  driverMix: { free: 0.4, plus: 0.4, pro: 0.2 },
  legsPerDriverPerMonth: { peak: 20, offPeak: 5 },
  plusMonthlyEur: 19,
  proMonthlyEur: 29,
  transactionalFeePerLegEur: 1.0,
  activeHotels: 40,
  hotelMonthlyEur: 99,
  fixedCosts: {
    infra: 400,
    twilio: 200,
    aviationstack: 80,
    jcc: 60,
    legalRetainer: 300,
    founderSalary: 3000,
  },
  marketingBudgetMonthlyEur: 2000,
  driverCacEur: 20,
  hotelCacEur: 150,
};
