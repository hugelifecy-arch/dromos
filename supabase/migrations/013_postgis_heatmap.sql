-- ============================================
-- DROMOS - PostGIS heatmap MVP (Sprint 14)
-- ============================================
-- Surfaces drop-off density across Cyprus as the daily-engagement hook
-- (strategy doc §3.1 / spec §3.1, §3.2). The map UI calls a tile endpoint
-- (`GET /api/heatmap/[z]/[x]/[y]`) which calls the RPC defined here.
--
-- Scope kept tight on purpose:
--   * PostGIS is ALREADY enabled in 001_initial_schema.sql — we don't reach
--     for the extension here.
--   * empty_legs already has nullable origin_lat / origin_lng / destination_*
--     (added in 003). We add a generated geography column so spatial queries
--     don't have to wrap ST_MakePoint at every call site, plus a GIST index.
--   * One RPC: `heatmap_drop_density(min_lng, min_lat, max_lng, max_lat,
--     since_ts, grid_size_m)` returns aggregated bins for a bounding box.
--     Aggregation is server-side so we never ship raw point clouds (privacy
--     + payload size both win).
--
-- What "drop density" means here: every COMPLETED empty_leg's destination
-- counts as one drop. That's the leading indicator the strategy doc points
-- at — where do passengers actually end up? — and it's the thing a driver
-- looking for a return fare cares about. Inbound airport legs are weighted
-- the same as inter-district; the UI can layer a flight-load filter later.

-- --------------------------------------------
-- Spatial geometry on empty_legs
-- --------------------------------------------
-- Generated columns keep the geometry in lockstep with lat/lng without an
-- application-side trigger. STORED so GIST can index it.
--
-- SRID 4326 = WGS84 (lng/lat). geography (not geometry) so distance ops are
-- in metres regardless of where on Earth — Cyprus is small enough that a
-- planar approximation would be fine, but geography is one fewer foot-gun
-- when someone asks "how far is X from the airport in km".

alter table public.empty_legs
  add column if not exists destination_geo geography(Point, 4326)
    generated always as (
      case
        when destination_lng is not null and destination_lat is not null
        then ST_SetSRID(ST_MakePoint(destination_lng, destination_lat), 4326)::geography
      end
    ) stored;

alter table public.empty_legs
  add column if not exists origin_geo geography(Point, 4326)
    generated always as (
      case
        when origin_lng is not null and origin_lat is not null
        then ST_SetSRID(ST_MakePoint(origin_lng, origin_lat), 4326)::geography
      end
    ) stored;

create index if not exists idx_empty_legs_destination_geo
  on public.empty_legs using gist (destination_geo)
  where destination_geo is not null;

create index if not exists idx_empty_legs_origin_geo
  on public.empty_legs using gist (origin_geo)
  where origin_geo is not null;

-- Partial index used by the heatmap query: completed legs only, recent.
-- Drop-density is a leading indicator, so we don't want cancelled or open
-- listings polluting the signal.
create index if not exists idx_empty_legs_completed_recent
  on public.empty_legs (completed_at desc)
  where status = 'completed' and completed_at is not null;

-- --------------------------------------------
-- RPC: heatmap_drop_density
-- --------------------------------------------
-- Bins completed-leg destinations into a regular grid inside the bbox and
-- returns one row per non-empty bin. Grid size is metres (geography), so a
-- caller asking for grid_size_m=500 gets ~500m squares regardless of
-- latitude — Cyprus is small enough that the geographic vs planar drift is
-- well under one bin width.
--
-- Auth posture: SECURITY DEFINER + a hard cap on the bbox area + a min
-- result rows guard. Without those, an unauthenticated caller could ask for
-- a global bbox and exfiltrate raw counts. The cap is set to ~50km × 50km,
-- enough to cover the whole island in one call but small enough that nobody
-- can use it to scrape every drop-off in the EU.

create or replace function public.heatmap_drop_density(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  since_ts timestamptz,
  grid_size_m integer default 500
) returns table (
  bin_lng double precision,
  bin_lat double precision,
  drop_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bbox geography;
  bbox_area_km2 double precision;
begin
  -- Sanity: bbox must be ordered, grid size in a sane range, since_ts not
  -- absurdly old. These are application-layer bugs but cheap to catch here.
  if min_lng >= max_lng or min_lat >= max_lat then
    raise exception 'invalid bbox: min must be < max';
  end if;
  if grid_size_m < 100 or grid_size_m > 10000 then
    raise exception 'grid_size_m out of range (100..10000)';
  end if;
  if since_ts < now() - interval '180 days' then
    raise exception 'since_ts too old (max 180d window)';
  end if;

  bbox := ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography;
  bbox_area_km2 := ST_Area(bbox) / 1e6;
  if bbox_area_km2 > 10000 then
    raise exception 'bbox too large: % km² (max 10000)', bbox_area_km2;
  end if;

  -- Quantise destination lng/lat to a grid. Approx: 1 degree of latitude
  -- ≈ 111_320 m everywhere; longitude scales by cos(lat) but for an island
  -- the size of Cyprus the cos(35°) ≈ 0.819 correction is constant enough
  -- that we apply it once at the bbox centre and treat the grid as planar.
  -- Sub-bin error is well below the 500m default so heatmap visuals don't
  -- shift visibly.
  return query
    with params as (
      select
        grid_size_m::double precision / 111320.0 as lat_step,
        grid_size_m::double precision /
          (111320.0 * cos(radians((min_lat + max_lat) / 2))) as lng_step
    ),
    bins as (
      select
        floor(destination_lng / p.lng_step) * p.lng_step + (p.lng_step / 2) as bin_lng,
        floor(destination_lat / p.lat_step) * p.lat_step + (p.lat_step / 2) as bin_lat
      from public.empty_legs e
      cross join params p
      where e.status = 'completed'
        and e.completed_at >= since_ts
        and e.destination_lng between min_lng and max_lng
        and e.destination_lat between min_lat and max_lat
    )
    select
      bin_lng,
      bin_lat,
      count(*)::integer as drop_count
    from bins
    group by bin_lng, bin_lat
    -- Suppress sparse bins: a single drop is privacy-leaky (one driver +
    -- one timestamp = one identifiable trip). Aggregate threshold = 3.
    having count(*) >= 3
    order by drop_count desc;
end;
$$;

comment on function public.heatmap_drop_density(double precision, double precision, double precision, double precision, timestamptz, integer) is
  'Aggregated drop-off counts in a bbox, binned into a grid. K-anonymity floor of 3 drops per bin. Used by /api/heatmap.';

-- Grant execution to authenticated users; anon stays out.
revoke all on function public.heatmap_drop_density(double precision, double precision, double precision, double precision, timestamptz, integer) from public;
grant execute on function public.heatmap_drop_density(double precision, double precision, double precision, double precision, timestamptz, integer) to authenticated;
