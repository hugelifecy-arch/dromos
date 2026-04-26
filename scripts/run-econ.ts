// One-off helper: prints unit-econ scenario outputs for the docs.
// Run with `npx tsx scripts/run-econ.ts` from repo root.

import {
  computeUnitEcon,
  PESSIMISTIC,
  BASE,
  OPTIMISTIC,
  type UnitEconInput,
} from '../src/lib/services/unit-econ/model';

const fmt = (n: number): string => n.toLocaleString('en', { maximumFractionDigits: 0 });

const scenarios: Array<readonly [string, UnitEconInput]> = [
  ['PESSIMISTIC', PESSIMISTIC],
  ['BASE', BASE],
  ['OPTIMISTIC', OPTIMISTIC],
];

for (const [name, input] of scenarios) {
  const r = computeUnitEcon(input);
  console.log('===', name, '===');
  console.log('  drivers:', input.activeDrivers, '| hotels:', input.activeHotels);
  console.log('  avg-month revenue:', fmt(r.averageMonth.totalRevenueEur), 'EUR');
  console.log('    sub:', fmt(r.averageMonth.subscriptionRevenueEur),
              '| txn:', fmt(r.averageMonth.transactionalRevenueEur),
              '| hotel:', fmt(r.averageMonth.hotelSaasRevenueEur));
  console.log('  avg-month fixed costs:', fmt(r.averageMonth.totalFixedCostsEur), 'EUR');
  console.log('  avg-month NET:', fmt(r.averageMonth.netEur), 'EUR');
  console.log('  peak-month NET:', fmt(r.peakMonth.netEur), 'EUR');
  console.log('  offpeak-month NET:', fmt(r.offPeakMonth.netEur), 'EUR');
  console.log('  annual revenue:', fmt(r.annual.revenueEur), 'EUR');
  console.log('  annual NET:', fmt(r.annual.netEur), 'EUR');
  console.log('  off-peak valley (6 months total):', fmt(r.annual.cashFlowValleyEur), 'EUR');
  console.log('  driver ARPU:', r.ratios.driverArpuMonthlyEur.toFixed(2), 'EUR/mo');
  console.log('  driver payback:', r.ratios.driverPaybackMonths.toFixed(1), 'months');
  console.log('  hotel ARPU:', r.ratios.hotelArpuMonthlyEur.toFixed(2), 'EUR/mo');
  console.log('  hotel payback:', r.ratios.hotelPaybackMonths.toFixed(1), 'months');
  console.log();
}
