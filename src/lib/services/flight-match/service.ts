// Orchestration layer: fetch arrivals from a provider, upsert into
// tracked_flights, score against open empty_legs, upsert flight_leg_matches.
//
// Shape chosen so the cron endpoint (src/app/api/flights/poll/route.ts) is a
// ~20-line wrapper: build the provider from env, call runPollCycle, return
// the summary as JSON. All the logic + test surface lives here.
//
// Idempotency rules (to make re-polling safe):
//  * tracked_flights has a unique (flight_number, scheduled_arrival) — we
//    upsert on that key so retries or overlapping cron ticks don't create
//    duplicate rows.
//  * flight_leg_matches has a unique (flight_id, leg_id). On re-match we
//    ONLY update rows still in status='suggested'; a dismissed or accepted
//    suggestion is sticky so the driver never sees it resurrected.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  computePricing,
  type PricingOutput,
} from '@/lib/services/pricing';
import {
  fetchMeterRate,
  staticMeterLookup,
} from '@/lib/services/whatsapp/meter-lookup';

import {
  scoreMatches,
  type CandidateLeg,
  type FlightSnapshot,
  type MatchResult,
} from './matcher';
import type {
  ArrivalsFeed,
  CyprusArrivalAirport,
  RawArrival,
} from './provider';

export interface PollWindow {
  /** Earliest scheduled arrival we care about (inclusive). */
  fromIso: string;
  /** Latest scheduled arrival we care about (exclusive). */
  toIso: string;
}

export interface PollCycleInput {
  supabase: SupabaseClient;
  feed: ArrivalsFeed;
  airports: CyprusArrivalAirport[];
  window: PollWindow;
  /** Reference 'now' for pricing; callers inject so tests are deterministic. */
  now: Date;
}

export interface PollCycleSummary {
  provider: string;
  airportsPolled: CyprusArrivalAirport[];
  flightsUpserted: number;
  flightsSkipped: number;      // dropped because the airline/route didn't resolve
  matchesCreated: number;
  matchesUpdated: number;
  matchesSkipped: number;
  errors: string[];
}

export async function runPollCycle(input: PollCycleInput): Promise<PollCycleSummary> {
  const summary: PollCycleSummary = {
    provider: input.feed.provider,
    airportsPolled: input.airports,
    flightsUpserted: 0,
    flightsSkipped: 0,
    matchesCreated: 0,
    matchesUpdated: 0,
    matchesSkipped: 0,
    errors: [],
  };

  const allArrivals: RawArrival[] = [];
  for (const airport of input.airports) {
    try {
      const rows = await input.feed.fetchArrivals({
        airport,
        fromIso: input.window.fromIso,
        toIso: input.window.toIso,
      });
      allArrivals.push(...rows);
    } catch (err) {
      summary.errors.push(`${airport}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (allArrivals.length === 0) return summary;

  // Upsert flights first so every subsequent match has a valid FK.
  const flightIdByKey = await upsertTrackedFlights(input.supabase, input.feed.provider, allArrivals, summary);

  // Candidate legs: any open leg departing inside [window.from, window.to +
  // MAX_OFFSET]. We fetch once; the matcher filters per flight.
  const candidates = await fetchCandidateLegs(input.supabase, input.window);
  if (candidates.length === 0) return summary;

  // For each flight, score and upsert match rows.
  for (const arrival of allArrivals) {
    const flightKey = trackedFlightKey(arrival);
    const flightId = flightIdByKey.get(flightKey);
    if (!flightId) continue;

    const snapshot: FlightSnapshot = {
      airport: arrival.airport,
      scheduledArrivalIso: arrival.scheduledArrivalIso,
      estimatedArrivalIso: arrival.estimatedArrivalIso,
    };
    const matches = scoreMatches(snapshot, candidates);

    for (const match of matches) {
      const leg = candidates.find((l) => l.id === match.legId);
      if (!leg) continue;
      await upsertMatch(
        input.supabase,
        flightId,
        leg,
        match,
        arrival,
        input.now,
        summary,
      );
    }
  }

  return summary;
}

// --------------------------------------------------------------------------
// Tracked flights: upsert on (flight_number, scheduled_arrival)
// --------------------------------------------------------------------------

async function upsertTrackedFlights(
  supabase: SupabaseClient,
  provider: string,
  arrivals: RawArrival[],
  summary: PollCycleSummary,
): Promise<Map<string, string>> {
  const rows = arrivals.map((a) => ({
    flight_number: a.flightNumber,
    airport: a.airport,
    scheduled_arrival: a.scheduledArrivalIso,
    estimated_arrival: a.estimatedArrivalIso ?? null,
    status: a.status ?? null,
    origin_iata: a.originIata ?? null,
    airline: a.airline ?? null,
    aircraft_type: a.aircraftType ?? null,
    load_factor: a.loadFactor ?? null,
    provider,
    provider_ref: a.providerRef ?? null,
    last_polled_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('tracked_flights')
    .upsert(rows, { onConflict: 'flight_number,scheduled_arrival' })
    .select('id, flight_number, scheduled_arrival');

  if (error) {
    summary.errors.push(`upsert_tracked_flights: ${error.message}`);
    return new Map();
  }

  summary.flightsUpserted = data?.length ?? 0;
  summary.flightsSkipped = arrivals.length - summary.flightsUpserted;

  const out = new Map<string, string>();
  for (const row of data ?? []) {
    out.set(trackedFlightKey({
      flightNumber: row.flight_number as string,
      scheduledArrivalIso: row.scheduled_arrival as string,
    }), row.id as string);
  }
  return out;
}

function trackedFlightKey(arrival: { flightNumber: string; scheduledArrivalIso: string }): string {
  return `${arrival.flightNumber}|${arrival.scheduledArrivalIso}`;
}

// --------------------------------------------------------------------------
// Candidate legs: open, departing in the cron window
// --------------------------------------------------------------------------

const MAX_OFFSET_MS = 120 * 60_000;

async function fetchCandidateLegs(
  supabase: SupabaseClient,
  window: PollWindow,
): Promise<CandidateLeg[]> {
  const departureFrom = window.fromIso;
  // A leg could depart up to MAX_OFFSET after the last arrival in the window
  // and still be a valid match for that arrival.
  const departureTo = new Date(Date.parse(window.toIso) + MAX_OFFSET_MS).toISOString();

  const { data, error } = await supabase
    .from('empty_legs')
    .select('id, seller_id, origin_district, destination_district, leg_type, passenger_capacity, departure_datetime, asking_price')
    .eq('status', 'open')
    .gte('departure_datetime', departureFrom)
    .lt('departure_datetime', departureTo);

  if (error || !data) return [];

  // empty_legs stores origin/destination as free text today, so we resolve
  // to a licence district via the shared resolver. If it fails the leg is
  // skipped — safer than guessing at a district for a regulatory snapshot.
  const { resolveDistrictFromText } = await import('@/lib/services/district-resolver');

  const out: CandidateLeg[] = [];
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const originText = (r.origin as string | undefined) ?? '';
    const destText = (r.destination as string | undefined) ?? '';

    const originDistrict = resolveDistrictFromText(originText);
    const destDistrict = resolveDistrictFromText(destText);
    if (!originDistrict || !destDistrict) continue;

    out.push({
      id: row.id as string,
      sellerId: row.seller_id as string,
      originDistrict,
      destinationDistrict: destDistrict,
      legType: (row.leg_type as string) ?? 'standard',
      passengerCapacity: Number(row.passenger_capacity ?? 1),
      departureIso: row.departure_datetime as string,
      askingPriceEur: Number(row.asking_price ?? 0),
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// Match upsert with sticky resolution.
// --------------------------------------------------------------------------

async function upsertMatch(
  supabase: SupabaseClient,
  flightId: string,
  leg: CandidateLeg,
  match: MatchResult,
  arrival: RawArrival,
  now: Date,
  summary: PollCycleSummary,
): Promise<void> {
  // Is there already a row for (flight_id, leg_id)? If yes and not suggested,
  // skip — we respect the driver's prior decision.
  const { data: existing } = await supabase
    .from('flight_leg_matches')
    .select('id, status, score, reason')
    .eq('flight_id', flightId)
    .eq('leg_id', leg.id)
    .maybeSingle();

  if (existing && existing.status !== 'suggested') {
    summary.matchesSkipped += 1;
    return;
  }

  const pricing = await computePricingSnapshot(supabase, leg, arrival, now);

  const payload: Record<string, unknown> = {
    flight_id: flightId,
    leg_id: leg.id,
    score: match.score,
    reason: match.reason,
    status: 'suggested',
  };
  if (pricing) {
    payload.suggested_price_eur = pricing.suggestedEur;
    payload.pricing_meter_eur = pricing.regulatedMeterEur;
    payload.pricing_floor_eur = pricing.floorEur;
    payload.pricing_ceiling_eur = pricing.ceilingEur;
  }

  if (existing) {
    const { error } = await supabase
      .from('flight_leg_matches')
      .update(payload)
      .eq('id', existing.id);
    if (error) {
      summary.errors.push(`update_match: ${error.message}`);
      return;
    }
    summary.matchesUpdated += 1;
  } else {
    const { error } = await supabase.from('flight_leg_matches').insert(payload);
    if (error) {
      summary.errors.push(`insert_match: ${error.message}`);
      return;
    }
    summary.matchesCreated += 1;
  }
}

async function computePricingSnapshot(
  supabase: SupabaseClient,
  leg: CandidateLeg,
  arrival: RawArrival,
  now: Date,
): Promise<PricingOutput | null> {
  const departure = new Date(leg.departureIso);
  try {
    const rate = await fetchMeterRate(supabase, leg.originDistrict, leg.destinationDistrict, departure);
    if (!rate) return null;
    return computePricing(
      {
        originDistrict: leg.originDistrict,
        destinationDistrict: leg.destinationDistrict,
        departure,
        now,
        flightLoadFactor: arrival.loadFactor,
      },
      staticMeterLookup(rate),
    );
  } catch {
    // Pricing failure shouldn't nuke the match — we just skip the snapshot.
    return null;
  }
}
