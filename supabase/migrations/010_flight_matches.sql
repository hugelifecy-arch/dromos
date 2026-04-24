-- ============================================
-- DROMOS - Flight auto-match (Sprint 13)
-- ============================================
-- Data model for the inbound-flight -> empty-leg suggestion pipeline
-- described in docs/cyprus-taxi-technical-spec.md §3.1, §3.2, §8.
--
-- Shape of the feature: a cron job polls an arrivals feed (AviationStack
-- primary, FlightAware or Hermes Airports as fallback) every few minutes for
-- LCA + PFO inbound arrivals in the next N hours. For each arrival we score
-- every currently-open empty_leg whose route plausibly carries passengers
-- away from that airport, and emit a suggestion a driver can accept with one
-- tap. The driver stays in control; we only suggest, never auto-publish.
--
-- Why the tables look like this:
--  * tracked_flights is an upsert target keyed by (flight_number,
--    scheduled_arrival) so re-polling the same flight is idempotent and we
--    accumulate status + estimated_arrival updates on the same row.
--  * flight_leg_matches is the join table AND the driver-facing inbox. We
--    keep status on the match row (not just a read/unread flag) so a
--    rejection survives the next poll — otherwise the cron would resurrect a
--    suggestion the driver already dismissed.
--  * score is stored so a human reviewer (spec §9 "weekly human review of 20
--    random pairs") can audit the ranker without re-running it.
--
-- Sandbox posture: this migration runs the moment it lands. The cron that
-- writes to tracked_flights is gated behind FLIGHT_MATCH_ENABLED=false by
-- default, mirroring the Twilio/AI sandbox-dark pattern from S11/S12.

-- --------------------------------------------
-- Provider enum — one row per external arrivals API we support.
-- --------------------------------------------
-- 'mock' is the deterministic in-memory provider used in tests and local dev
-- when FLIGHT_MATCH_ENABLED is false; it lets the cron loop run end-to-end
-- without a live contract.

create type flight_provider as enum ('aviationstack', 'flightaware', 'hermes', 'mock');

-- --------------------------------------------
-- Tracked flights — snapshot of each inbound arrival we care about.
-- --------------------------------------------

create table public.tracked_flights (
  id uuid primary key default gen_random_uuid(),

  flight_number text not null,
  airport char(3) not null check (airport in ('LCA', 'PFO')),

  -- Schedule
  scheduled_arrival timestamptz not null,
  estimated_arrival timestamptz,
  status text, -- provider-specific free text: 'scheduled', 'active', 'landed', ...

  -- Passenger context for pricing. load_factor is 0..1; some providers don't
  -- supply it, in which case we leave null and pricing falls back to its
  -- default (no flight-load uplift).
  origin_iata char(3),
  airline text,
  aircraft_type text,
  load_factor numeric(4,3) check (load_factor is null or (load_factor >= 0 and load_factor <= 1)),

  -- Provenance / polling bookkeeping
  provider flight_provider not null,
  provider_ref text,           -- provider-internal id (AviationStack flight.id etc.)
  last_polled_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  unique (flight_number, scheduled_arrival)
);

comment on table public.tracked_flights is
  'One row per inbound arrival we have polled. (flight_number, scheduled_arrival) is the natural key; repolls upsert status + estimated_arrival.';

create index idx_tracked_flights_airport_arrival
  on public.tracked_flights (airport, scheduled_arrival);

create index idx_tracked_flights_arrival_window
  on public.tracked_flights (scheduled_arrival)
  where status is null or status not in ('landed', 'cancelled');

alter table public.tracked_flights enable row level security;

-- Drivers need to read so the suggestions UI can show "Flight A3 612 from
-- ATH, landing 14:25" context next to the proposed leg.
create policy "Authenticated users can read tracked flights" on public.tracked_flights
  for select to authenticated using (true);

-- Writes go through the cron runner which uses the service role key.

-- --------------------------------------------
-- Flight -> leg match inbox.
-- --------------------------------------------
-- Each row is "here is an arrival that might feed your empty leg — take it
-- or dismiss it." Status lives on the row so a dismissal survives the next
-- poll.
--
-- A match row is keyed by (flight_id, leg_id). Re-running the matcher on the
-- same pair is an upsert: it may update score and reason but never resurrect
-- a rejected/confirmed suggestion.

create type flight_match_status as enum (
  'suggested',
  'accepted',
  'rejected',
  'expired'
);

create table public.flight_leg_matches (
  id uuid primary key default gen_random_uuid(),

  flight_id uuid not null references public.tracked_flights(id) on delete cascade,
  leg_id uuid not null references public.empty_legs(id) on delete cascade,

  -- Ranker output
  score numeric(4,3) not null check (score >= 0 and score <= 1),
  reason text,                  -- one-line human-readable ("flight lands 14:25, leg departs 14:40 from LCA")

  -- Pricing snapshot at suggestion time. Flight load uplift + time-to-
  -- departure were both pulled through computePricing; we store the
  -- result so the driver sees the same quote they'd get if they opened
  -- the leg editor, and so audit can prove the snapshot never exceeded
  -- the regulated ceiling.
  suggested_price_eur decimal(8,2),
  pricing_meter_eur   decimal(8,2),
  pricing_floor_eur   decimal(8,2),
  pricing_ceiling_eur decimal(8,2),

  -- Lifecycle
  status flight_match_status not null default 'suggested',
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (flight_id, leg_id),

  -- If the driver resolved it, we have a timestamp. Belt and braces for the
  -- "suggestion was dismissed days ago" case so the UI can filter cleanly.
  constraint flight_leg_matches_resolved_consistent
    check ((status = 'suggested') = (resolved_at is null))
);

comment on table public.flight_leg_matches is
  'Inbox of auto-generated suggestions pairing an inbound flight with a driver`s open empty leg. Driver accepts or dismisses.';

create index idx_flight_matches_leg_status
  on public.flight_leg_matches (leg_id, status);

create index idx_flight_matches_flight
  on public.flight_leg_matches (flight_id);

create index idx_flight_matches_open
  on public.flight_leg_matches (created_at desc)
  where status = 'suggested';

alter table public.flight_leg_matches enable row level security;

-- A driver sees only suggestions against legs they own. Admin / service role
-- bypasses RLS.
create policy "Drivers can view matches for their own legs" on public.flight_leg_matches
  for select using (
    exists (
      select 1 from public.empty_legs l
      where l.id = leg_id and l.seller_id = auth.uid()
    )
  );

-- Drivers can transition a suggestion to accepted/rejected but cannot create
-- rows (only the service-role cron does). Update policy covers status +
-- resolved_by; RLS + the CHECK above stop them fabricating suggestions.
create policy "Drivers can resolve their own match suggestions" on public.flight_leg_matches
  for update using (
    exists (
      select 1 from public.empty_legs l
      where l.id = leg_id and l.seller_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.empty_legs l
      where l.id = leg_id and l.seller_id = auth.uid()
    )
  );

create trigger update_flight_leg_matches_updated_at
  before update on public.flight_leg_matches
  for each row execute function public.update_updated_at_column();
