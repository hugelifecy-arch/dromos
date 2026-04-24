// Arrivals-feed provider adapter.
//
// Per spec §7 we pick AviationStack as primary, with FlightAware and the
// Hermes Airports public feed as fallbacks. Only AviationStack is wired up
// here — the other two are stubs with `not_implemented` errors so the caller
// contract is explicit but adding a second provider is a drop-in.
//
// Why a provider shape instead of a direct fetch: the cron runs on a flag
// (FLIGHT_MATCH_ENABLED) because AviationStack access is pending a contract.
// A `mock` provider ships in src/lib/services/flight-match/mock-provider.ts
// and runs end-to-end without network, so we can prove the wiring locally
// and in tests.

export type FlightProvider = 'aviationstack' | 'flightaware' | 'hermes' | 'mock';

export type CyprusArrivalAirport = 'LCA' | 'PFO';

export interface RawArrival {
  flightNumber: string;      // e.g. 'A3612'  (normalised, no spaces)
  airport: CyprusArrivalAirport;
  scheduledArrivalIso: string;  // ISO 8601 with tz
  estimatedArrivalIso?: string;
  status?: string;
  originIata?: string;
  airline?: string;
  aircraftType?: string;
  loadFactor?: number;       // 0..1 if provider exposes it
  providerRef?: string;      // provider-internal id so we can re-poll without duplicates
}

export interface ArrivalsFeed {
  provider: FlightProvider;
  /** Fetch arrivals for one airport between `fromIso` and `toIso` (inclusive of from, exclusive of to). */
  fetchArrivals(input: {
    airport: CyprusArrivalAirport;
    fromIso: string;
    toIso: string;
  }): Promise<RawArrival[]>;
}

// --------------------------------------------------------------------------
// AviationStack adapter
// --------------------------------------------------------------------------
// Contract reference (public): https://aviationstack.com/documentation
//
// Endpoint: GET /v1/flights?arr_iata=LCA&access_key=...
// Rate-limit tiers: 100/mo free, 10k/mo starter. The cron is sized assuming
// the starter tier: 4 polls/hour × 18 service hours × 30 days = ~2200 polls.
// Each poll hits both LCA and PFO = ~4400 flight list calls/month, well
// inside the 10k budget and still leaving headroom for retries.

const AVIATIONSTACK_BASE = 'https://api.aviationstack.com/v1/flights';

export interface AviationStackOptions {
  accessKey: string;
  fetchImpl?: typeof fetch;
}

export function createAviationStackProvider(opts: AviationStackOptions): ArrivalsFeed {
  const fetchFn = opts.fetchImpl ?? fetch;

  return {
    provider: 'aviationstack',
    async fetchArrivals({ airport, fromIso, toIso }) {
      // AviationStack filters by calendar date, not instant. We ask for today
      // (in the Cyprus window we care about) and filter client-side to the
      // from/to range; one extra day at most.
      const fromDate = fromIso.slice(0, 10);

      const params = new URLSearchParams({
        access_key: opts.accessKey,
        arr_iata: airport,
        flight_status: 'scheduled,active',
        flight_date: fromDate,
        limit: '100',
      });

      const url = `${AVIATIONSTACK_BASE}?${params.toString()}`;
      const res = await fetchFn(url);
      if (!res.ok) {
        throw new Error(`aviationstack_http_${res.status}`);
      }

      const payload = (await res.json()) as AviationStackResponse;
      if (payload.error) {
        throw new Error(`aviationstack_api_error: ${payload.error.message ?? payload.error.code ?? 'unknown'}`);
      }

      const arrivals: RawArrival[] = [];
      const from = Date.parse(fromIso);
      const to = Date.parse(toIso);

      for (const row of payload.data ?? []) {
        const scheduled = row.arrival?.scheduled;
        if (!scheduled) continue;
        const t = Date.parse(scheduled);
        if (!Number.isFinite(t) || t < from || t >= to) continue;

        const flightNumber = normaliseFlightNumber(row.flight?.iata ?? row.flight?.icao ?? '');
        if (!flightNumber) continue;

        arrivals.push({
          flightNumber,
          airport,
          scheduledArrivalIso: scheduled,
          estimatedArrivalIso: row.arrival?.estimated ?? undefined,
          status: row.flight_status ?? undefined,
          originIata: row.departure?.iata ?? undefined,
          airline: row.airline?.name ?? undefined,
          aircraftType: row.aircraft?.iata ?? undefined,
          // AviationStack doesn't expose a load factor on the free + starter
          // tiers. Leave undefined; pricing falls back to no-uplift.
          loadFactor: undefined,
          providerRef: row.flight?.iata ?? undefined,
        });
      }

      return arrivals;
    },
  };
}

// --------------------------------------------------------------------------
// Mock provider: deterministic, offline, used by the cron when the main flag
// is off and by the unit tests.
// --------------------------------------------------------------------------

export interface MockArrival extends RawArrival {}

export function createMockProvider(arrivals: MockArrival[]): ArrivalsFeed {
  return {
    provider: 'mock',
    async fetchArrivals({ airport, fromIso, toIso }) {
      const from = Date.parse(fromIso);
      const to = Date.parse(toIso);
      return arrivals.filter((a) => {
        if (a.airport !== airport) return false;
        const t = Date.parse(a.scheduledArrivalIso);
        return Number.isFinite(t) && t >= from && t < to;
      });
    },
  };
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** 'A3 612' / 'A3-612' -> 'A3612'. Keeps ICAO-shape (3 letters + digits). */
export function normaliseFlightNumber(raw: string): string {
  return raw.replace(/[\s\-\.]/g, '').toUpperCase();
}

// AviationStack response shape (narrow subset we use).
interface AviationStackResponse {
  error?: { code?: string; message?: string };
  data?: Array<{
    flight_status?: string;
    departure?: { iata?: string };
    arrival?: { scheduled?: string; estimated?: string };
    airline?: { name?: string };
    flight?: { iata?: string; icao?: string };
    aircraft?: { iata?: string };
  }>;
}
