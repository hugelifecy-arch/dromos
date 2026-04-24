-- ============================================
-- DROMOS - Pricing Regulation (Sprint 9)
-- ============================================
-- Implements the regulated-meter reference layer required by the Cyprus taxi
-- empty-leg strategy. Every empty-leg price is anchored to a Ministry of
-- Transport tariff so the platform can defend its "driver-set discount
-- voucher" framing under the 2006 Motor Transport Law.
--
-- Invariant enforced here: asking_price <= pricing_ceiling_eur (= 0.90 ×
-- regulated meter). Application code computes the ceiling; the DB CHECK is
-- defense in depth because a regulatory breach is existential, not a UX bug.
--
-- Companion spec: docs/cyprus-taxi-technical-spec.md §4, §6.

create table public.regulated_meter_rates (
  id uuid primary key default gen_random_uuid(),
  origin_district licence_district not null,
  destination_district licence_district not null,
  base_fare_eur decimal(6,2) not null check (base_fare_eur > 0),
  per_km_rate_eur decimal(6,3) not null check (per_km_rate_eur > 0),
  distance_km decimal(6,2) not null check (distance_km > 0),
  night_multiplier decimal(3,2) not null default 1.30 check (night_multiplier >= 1.00),
  effective_from date not null,
  effective_to date,
  source text not null, -- Ministry tariff notice reference or placeholder tag
  notes text,
  created_at timestamptz default now(),
  unique (origin_district, destination_district, effective_from)
);

comment on table public.regulated_meter_rates is
  'Ministry of Transport tariff reference for inter-district taxi fares. '
  'All empty-leg pricing must anchor to a row here.';

create index idx_meter_rates_lookup on public.regulated_meter_rates
  (origin_district, destination_district, effective_from desc);

alter table public.regulated_meter_rates enable row level security;

-- Public read: every authenticated user must be able to see the tariff they
-- are being quoted against (transparency is part of the regulatory posture).
create policy "Tariff rates are publicly readable" on public.regulated_meter_rates
  for select using (true);

-- Only service role can write. Tariff changes require a deploy + audit trail.

-- --------------------------------------------
-- Pricing columns on empty_legs
-- --------------------------------------------
-- Nullable for backwards compatibility with rows posted before this migration.
-- New listings must populate these via src/lib/services/pricing.ts.

alter table public.empty_legs
  add column regulated_meter_reference_eur decimal(8,2),
  add column pricing_discount_pct decimal(5,2),
  add column pricing_floor_eur decimal(8,2),
  add column pricing_ceiling_eur decimal(8,2);

comment on column public.empty_legs.regulated_meter_reference_eur is
  'Snapshot of the Ministry meter rate at time of posting. Required for audit.';
comment on column public.empty_legs.pricing_ceiling_eur is
  'Hard legal ceiling (typically 0.90 x regulated meter). asking_price must not exceed.';

-- The regulatory invariant. Permissive on NULL so existing rows survive the
-- migration; all new posts go through pricing.ts which always populates.
alter table public.empty_legs
  add constraint empty_legs_respects_pricing_ceiling
  check (pricing_ceiling_eur is null or asking_price <= pricing_ceiling_eur);

alter table public.empty_legs
  add constraint empty_legs_respects_pricing_floor
  check (pricing_floor_eur is null or asking_price >= pricing_floor_eur);

-- --------------------------------------------
-- Seed: placeholder tariff data
-- --------------------------------------------
-- NOTE: these figures are realistic-shape PLACEHOLDERS derived from public
-- knowledge of Cypriot taxi tariffs. They MUST be replaced with verified
-- Ministry of Transport tariff notice figures before any production pricing
-- decision is made. The pre-clearance meeting referenced in the strategy doc
-- (§5 "Actionable Next Steps" week 9-10) is the blocking gate.

insert into public.regulated_meter_rates
  (origin_district, destination_district, base_fare_eur, per_km_rate_eur, distance_km, effective_from, source)
values
  -- Larnaca (LCA) corridors
  ('larnaca',  'nicosia',   3.40, 0.73,  50.0, '2024-01-01', 'PLACEHOLDER-2024: LCA->Nicosia corridor'),
  ('larnaca',  'limassol',  3.40, 0.73,  70.0, '2024-01-01', 'PLACEHOLDER-2024: LCA->Limassol corridor'),
  ('larnaca',  'paphos',    3.40, 0.73, 135.0, '2024-01-01', 'PLACEHOLDER-2024: LCA->Paphos corridor'),
  ('larnaca',  'famagusta', 3.40, 0.73,  40.0, '2024-01-01', 'PLACEHOLDER-2024: LCA->Ayia Napa corridor'),
  -- Paphos (PFO) corridors
  ('paphos',   'limassol',  3.40, 0.73,  65.0, '2024-01-01', 'PLACEHOLDER-2024: PFO->Limassol corridor'),
  ('paphos',   'nicosia',   3.40, 0.73, 145.0, '2024-01-01', 'PLACEHOLDER-2024: PFO->Nicosia corridor'),
  ('paphos',   'larnaca',   3.40, 0.73, 135.0, '2024-01-01', 'PLACEHOLDER-2024: PFO->Larnaca corridor'),
  -- Inter-city commuter corridors
  ('nicosia',  'limassol',  3.40, 0.73,  85.0, '2024-01-01', 'PLACEHOLDER-2024: Nicosia<->Limassol commuter'),
  ('limassol', 'famagusta', 3.40, 0.73, 120.0, '2024-01-01', 'PLACEHOLDER-2024: Limassol->Ayia Napa tourist'),
  ('nicosia',  'famagusta', 3.40, 0.73,  90.0, '2024-01-01', 'PLACEHOLDER-2024: Nicosia->Famagusta corridor')
on conflict do nothing;

-- Reverse directions inherit the same distance; insert mirrors so lookup is
-- direction-agnostic at the DB layer (application code may still prefer
-- directional pricing).
insert into public.regulated_meter_rates
  (origin_district, destination_district, base_fare_eur, per_km_rate_eur, distance_km, effective_from, source)
select destination_district, origin_district, base_fare_eur, per_km_rate_eur, distance_km,
       effective_from, source || ' (reverse)'
from public.regulated_meter_rates
where effective_to is null and source like 'PLACEHOLDER-2024:%'
on conflict do nothing;
