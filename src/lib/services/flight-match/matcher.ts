// Flight <-> empty-leg matcher.
//
// Inputs: one inbound arrival + a set of candidate open empty_legs.
// Output: zero or more (leg, score, reason) suggestions.
//
// Score shape (0..1):
//   * 0.5 base credit if the leg *starts at the airport district*.
//   * +0.3 if the leg departs 10-120 min after the flight lands. Earlier = risk
//          the driver can't get to the airport, much later = the passenger
//          has already left.
//   * +0.15 if the leg carries 2+ passenger capacity (bag+airport = group).
//   * +0.05 if the driver marked the leg as "airport_inbound" type.
//
// The thresholds are spec-§9 calibration targets (>85% useful), not magic
// constants, and they live in this file so a human reviewer can audit.

import type { LicenceDistrict } from '@/lib/constants/locations';

import type { CyprusArrivalAirport } from './provider';

export interface CandidateLeg {
  id: string;
  sellerId: string;
  originDistrict: LicenceDistrict;
  destinationDistrict: LicenceDistrict;
  legType: string;
  passengerCapacity: number;
  departureIso: string; // empty_legs.departure_datetime
  askingPriceEur: number;
}

export interface FlightSnapshot {
  airport: CyprusArrivalAirport;
  scheduledArrivalIso: string;
  estimatedArrivalIso?: string;
}

export interface MatchResult {
  legId: string;
  score: number;           // 0..1, rounded to 3dp
  reason: string;          // one-line, for audit + UI tooltip
}

/** Airport IATA -> origin district a leg must *start from* to qualify. */
const AIRPORT_DISTRICT: Record<CyprusArrivalAirport, LicenceDistrict> = {
  LCA: 'larnaca',
  PFO: 'paphos',
};

const MIN_OFFSET_MINUTES = 10;
const MAX_OFFSET_MINUTES = 120;
const SCORE_THRESHOLD = 0.5; // below this we drop the suggestion entirely

export function scoreMatch(flight: FlightSnapshot, leg: CandidateLeg): MatchResult | null {
  if (leg.originDistrict !== AIRPORT_DISTRICT[flight.airport]) {
    return null; // driver can't pick up passengers from somewhere they aren't
  }

  const arrivalMs = Date.parse(flight.estimatedArrivalIso ?? flight.scheduledArrivalIso);
  const departureMs = Date.parse(leg.departureIso);
  if (!Number.isFinite(arrivalMs) || !Number.isFinite(departureMs)) return null;

  const offsetMin = (departureMs - arrivalMs) / 60_000;

  let score = 0.5; // base: airport match
  const reasons: string[] = [`${flight.airport} arrival -> ${leg.originDistrict} leg`];

  if (offsetMin >= MIN_OFFSET_MINUTES && offsetMin <= MAX_OFFSET_MINUTES) {
    score += 0.3;
    reasons.push(`departs ${Math.round(offsetMin)}min after landing`);
  } else {
    // Outside the window isn't necessarily fatal (the driver may be handling
    // other flows). But we cap it so a 6h-later leg doesn't look as good as
    // a 30min-later one.
    if (offsetMin < MIN_OFFSET_MINUTES) {
      return null; // before the plane lands -> useless
    }
    score += 0.1;
    reasons.push(`departs ${Math.round(offsetMin)}min after landing (outside ideal window)`);
  }

  if (leg.passengerCapacity >= 2) {
    score += 0.15;
    reasons.push(`${leg.passengerCapacity} seats`);
  }

  if (leg.legType === 'airport_inbound') {
    score += 0.05;
    reasons.push('driver flagged as airport_inbound');
  }

  // Clamp + round.
  score = Math.min(1, Math.max(0, score));
  score = Math.round(score * 1000) / 1000;

  if (score < SCORE_THRESHOLD) return null;

  return {
    legId: leg.id,
    score,
    reason: reasons.join(' · '),
  };
}

/** Score a batch and sort best-first. */
export function scoreMatches(flight: FlightSnapshot, legs: CandidateLeg[]): MatchResult[] {
  const results: MatchResult[] = [];
  for (const leg of legs) {
    const r = scoreMatch(flight, leg);
    if (r) results.push(r);
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
