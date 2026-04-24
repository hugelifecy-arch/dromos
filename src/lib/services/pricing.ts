// Pricing Engine for Cyprus empty-leg marketplace.
//
// Single source of truth for every quoted price on the platform: post-leg
// form, WhatsApp bot, flight-match suggestions, hotel concierge widget.
// See docs/cyprus-taxi-technical-spec.md §4.
//
// Regulatory invariants (also enforced by DB CHECK in migration 009):
//   floor    = 0.40 x regulated_meter    (hard)
//   ceiling  = 0.90 x regulated_meter    (hard legal cap, 2006 Motor Transport Law)
//   asking price must satisfy floor <= asking <= ceiling.
//
// The function is pure. Callers inject a MeterLookup so tests can run against
// in-memory fixtures and production can go to Supabase.

import type { LicenceDistrict } from '@/lib/constants/locations';

// --------------------------------------------------------------------------
// Constants - the regulatory anchors
// --------------------------------------------------------------------------

export const PRICING_FLOOR_MULTIPLIER = 0.40;
export const PRICING_CEILING_MULTIPLIER = 0.90;
export const PRICING_SUGGESTED_BASE_MULTIPLIER = 0.60;

// Night tariff window per Cypriot convention (23:00 - 06:00 Cyprus local).
const NIGHT_START_HOUR = 23;
const NIGHT_END_HOUR = 6;
const CYPRUS_TZ = 'Europe/Nicosia';

// Seasonality window - high season drives passenger demand for taxi returns.
const HIGH_SEASON_MONTHS = new Set([5, 6, 7, 8, 9]); // May-Sep inclusive (1-indexed)
const HIGH_SEASON_UPLIFT = 0.05;   // +5% toward ceiling
const LOW_SEASON_DISCOUNT = 0.05;  // -5% toward floor (within cap)

// Time-to-departure decay: closer to departure, steeper discount.
const TIME_URGENT_HOURS = 0.5;
const TIME_SOON_HOURS = 2;
const TIME_URGENT_DISCOUNT = 0.15;
const TIME_SOON_DISCOUNT = 0.10;

// Flight load factor influence: full inbound flight = stronger pricing power.
const FLIGHT_LOAD_UPLIFT_MAX = 0.10;

// Driver acceptance score: high-rated drivers hold firmer.
const DRIVER_SCORE_UPLIFT_MAX = 0.08;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface MeterRate {
  origin: LicenceDistrict;
  destination: LicenceDistrict;
  baseFareEur: number;
  perKmRateEur: number;
  distanceKm: number;
  nightMultiplier: number;
}

export type MeterLookup = (
  origin: LicenceDistrict,
  destination: LicenceDistrict,
  departure: Date,
) => MeterRate | null;

export interface PricingInput {
  originDistrict: LicenceDistrict;
  destinationDistrict: LicenceDistrict;
  departure: Date;
  now?: Date; // defaults to new Date(); injectable for tests
  flightLoadFactor?: number; // 0..1 - inbound flight occupancy
  driverAcceptanceScore?: number; // 0..1
  hasPassenger?: boolean;
}

export interface PricingOutput {
  regulatedMeterEur: number;
  floorEur: number;
  ceilingEur: number;
  suggestedEur: number;
  discountPct: number; // (meter - suggested) / meter, rounded to 2dp
  rationale: string[]; // shown to driver in UI
}

export class PricingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PricingError';
  }
}

// --------------------------------------------------------------------------
// Meter computation
// --------------------------------------------------------------------------

export function computeRegulatedMeterEur(rate: MeterRate, departure: Date): number {
  const { hour } = cyprusWallClock(departure);
  const isNight = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
  const daytimeMeter = rate.baseFareEur + rate.perKmRateEur * rate.distanceKm;
  const meter = isNight ? daytimeMeter * rate.nightMultiplier : daytimeMeter;
  return round2(meter);
}

// Read wall-clock time in Cyprus (Europe/Nicosia) regardless of server TZ.
// Cyprus tariffs, season boundaries, and urgency thresholds are all defined
// in local time; relying on Date.getHours() breaks on a UTC server (Vercel).
function cyprusWallClock(d: Date): { hour: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CYPRUS_TZ,
    hour: '2-digit',
    hour12: false,
    month: '2-digit',
  }).formatToParts(d);
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const monthStr = parts.find((p) => p.type === 'month')?.value ?? '1';
  // Intl may return "24" for midnight in some locales; normalise.
  const hour = parseInt(hourStr, 10) % 24;
  const month = parseInt(monthStr, 10);
  return { hour, month };
}

// --------------------------------------------------------------------------
// Main pricing function
// --------------------------------------------------------------------------

export function computePricing(input: PricingInput, lookup: MeterLookup): PricingOutput {
  const rate = lookup(input.originDistrict, input.destinationDistrict, input.departure);
  if (!rate) {
    throw new PricingError(
      `No meter rate for ${input.originDistrict} -> ${input.destinationDistrict}`,
      'METER_NOT_FOUND',
    );
  }

  const rationale: string[] = [];
  const meter = computeRegulatedMeterEur(rate, input.departure);
  const floor = round2(meter * PRICING_FLOOR_MULTIPLIER);
  const ceiling = round2(meter * PRICING_CEILING_MULTIPLIER);

  let suggestedMultiplier = PRICING_SUGGESTED_BASE_MULTIPLIER;
  rationale.push(`Base suggested: ${pct(PRICING_SUGGESTED_BASE_MULTIPLIER)} of regulated meter`);

  // Seasonality (Cyprus local month - matters at Dec 31 / Jan 1 boundary)
  const { month } = cyprusWallClock(input.departure);
  if (HIGH_SEASON_MONTHS.has(month)) {
    suggestedMultiplier += HIGH_SEASON_UPLIFT;
    rationale.push(`+${pct(HIGH_SEASON_UPLIFT)} high season (May-Sep)`);
  } else {
    suggestedMultiplier -= LOW_SEASON_DISCOUNT;
    rationale.push(`-${pct(LOW_SEASON_DISCOUNT)} low season`);
  }

  // Time-to-departure urgency
  const now = input.now ?? new Date();
  const hoursToDeparture = (input.departure.getTime() - now.getTime()) / 3_600_000;
  if (hoursToDeparture <= TIME_URGENT_HOURS) {
    suggestedMultiplier -= TIME_URGENT_DISCOUNT;
    rationale.push(`-${pct(TIME_URGENT_DISCOUNT)} departure within 30 min`);
  } else if (hoursToDeparture <= TIME_SOON_HOURS) {
    suggestedMultiplier -= TIME_SOON_DISCOUNT;
    rationale.push(`-${pct(TIME_SOON_DISCOUNT)} departure within 2 h`);
  }

  // Flight load factor (0..1)
  if (typeof input.flightLoadFactor === 'number') {
    const clamped = clamp(input.flightLoadFactor, 0, 1);
    const uplift = FLIGHT_LOAD_UPLIFT_MAX * clamped;
    suggestedMultiplier += uplift;
    if (uplift > 0) {
      rationale.push(`+${pct(uplift)} inbound flight load ${(clamped * 100).toFixed(0)}%`);
    }
  }

  // Driver acceptance score
  if (typeof input.driverAcceptanceScore === 'number') {
    const clamped = clamp(input.driverAcceptanceScore, 0, 1);
    const uplift = DRIVER_SCORE_UPLIFT_MAX * clamped;
    suggestedMultiplier += uplift;
    if (uplift > 0) {
      rationale.push(`+${pct(uplift)} driver rating`);
    }
  }

  // Passenger already on board: marginal cost, nudge toward floor
  if (input.hasPassenger) {
    suggestedMultiplier -= 0.05;
    rationale.push(`-5% existing passenger aboard`);
  }

  const suggestedRaw = meter * suggestedMultiplier;
  const suggested = round2(clamp(suggestedRaw, floor, ceiling));

  if (suggestedRaw > ceiling) {
    rationale.push(`Clamped to legal ceiling (${pct(PRICING_CEILING_MULTIPLIER)} of meter)`);
  }
  if (suggestedRaw < floor) {
    rationale.push(`Raised to floor (${pct(PRICING_FLOOR_MULTIPLIER)} of meter)`);
  }

  const discountPct = round2(((meter - suggested) / meter) * 100);

  return {
    regulatedMeterEur: meter,
    floorEur: floor,
    ceilingEur: ceiling,
    suggestedEur: suggested,
    discountPct,
    rationale,
  };
}

// --------------------------------------------------------------------------
// Validation helpers for callers writing to empty_legs
// --------------------------------------------------------------------------

export function validateAskingPrice(askingEur: number, output: PricingOutput): void {
  if (askingEur > output.ceilingEur) {
    throw new PricingError(
      `Asking price €${askingEur} exceeds legal ceiling €${output.ceilingEur}`,
      'EXCEEDS_CEILING',
    );
  }
  if (askingEur < output.floorEur) {
    throw new PricingError(
      `Asking price €${askingEur} below floor €${output.floorEur}`,
      'BELOW_FLOOR',
    );
  }
}

// --------------------------------------------------------------------------
// Small utilities - intentionally local so this file has zero external deps
// --------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}
