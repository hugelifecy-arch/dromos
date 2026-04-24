-- ============================================
-- DROMOS - Hotel concierge portal skeleton (Sprint 15)
-- ============================================
-- First cross-tenant surface. Up to now every authenticated user has been a
-- driver; S15 adds hotels (and leaves room for travel agencies / other B2B
-- resellers) as a separate principal class. See spec §3.1 (concierge-portal
-- service), §3.2 (tenant model hinted for migration 015).
--
-- Shape:
--   tenants              one row per hotel / agency; slug is the embed-widget
--                        URL key, must be stable once issued.
--   tenant_members       join users to tenants with a role. A staff member
--                        at two hotels gets two rows.
--   concierge_bookings   request-first: the concierge places a booking for a
--                        guest; the driver sees it in their inbox and
--                        accepts. leg_id is optional so a concierge can open
--                        a request before a matching leg exists; once a
--                        driver accepts, leg_id is populated.
--
-- Why request-first (not hard-match):
--   A hotel concierge doesn't know (and shouldn't have to know) which
--   driver's empty leg is available for their guest. They describe what
--   they need; the matching system — or a driver manually — fulfils it.
--   This also future-proofs for a world where drivers respond with counter-
--   offers via the existing counter_offers service.
--
-- Regulatory posture: the same pricing engine governs every quote (spec
-- §4). The embed widget and the staff "new booking" flow both run
-- quoted_price_eur through computePricing so the concierge never shows a
-- guest a price that violates floor/ceiling.

-- --------------------------------------------
-- Enums
-- --------------------------------------------
create type tenant_type as enum ('hotel', 'agency');

create type tenant_member_role as enum ('owner', 'staff');

create type concierge_booking_status as enum (
  'quoted',       -- embed widget produced a price but no commitment
  'placed',       -- concierge (or guest) committed; no driver yet
  'confirmed',    -- a driver accepted and a leg is assigned
  'cancelled',
  'expired'
);

-- --------------------------------------------
-- Tenants
-- --------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  type tenant_type not null,
  name text not null,

  -- URL-safe slug used by the embed widget (/concierge/embed/<slug>).
  -- Once issued it should not change — external sites iframe against it.
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 64),

  -- Primary-office district (used to default the matching-legs filter to
  -- "near me" for the concierge flow). Must be a valid licence district so
  -- the pricing engine can quote a meter rate for transfers originating
  -- from the hotel.
  district licence_district not null,

  contact_email text,
  contact_phone text,
  seat_count integer,            -- # of concierge desks / staff the tenant paid for

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is
  'Hotel / agency tenants that book empty legs on behalf of guests. Slug is stable once issued.';

create index idx_tenants_slug on public.tenants(slug);
create index idx_tenants_district on public.tenants(district);

alter table public.tenants enable row level security;

-- Members can read their own tenants.
create policy "Members can view their tenants" on public.tenants
  for select using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = id and m.user_id = auth.uid()
    )
  );

-- Writes go through the service role for now (ops onboards new hotels).

create trigger update_tenants_updated_at
  before update on public.tenants
  for each row execute function public.update_updated_at_column();

-- --------------------------------------------
-- Membership
-- --------------------------------------------
create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role tenant_member_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

comment on table public.tenant_members is
  'Links auth.users to tenants. One user can belong to multiple tenants.';

create index idx_tenant_members_user on public.tenant_members(user_id);
create index idx_tenant_members_tenant on public.tenant_members(tenant_id);

alter table public.tenant_members enable row level security;

-- A member can see their own membership row (for "which tenants am I in?").
create policy "Users can view own memberships" on public.tenant_members
  for select using (auth.uid() = user_id);

-- Owners can add/remove members of their own tenants.
create policy "Owners can manage members" on public.tenant_members
  for all using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenant_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- --------------------------------------------
-- Concierge bookings
-- --------------------------------------------
-- request-first: the concierge describes what the guest needs; a driver
-- fulfils by accepting and linking an empty_legs row. leg_id nullable until
-- that happens.

create table public.concierge_bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- Optional link to the empty_leg that fulfilled the request. Null until a
  -- driver accepts; populated exactly once.
  leg_id uuid references public.empty_legs(id) on delete set null,

  -- Guest contact. Stored so the driver can reach the guest directly; the
  -- hotel is the commercial counterparty but the driver needs to talk to
  -- the traveller.
  guest_name text not null,
  guest_phone text,             -- E.164 preferred but not enforced (international guests)
  passenger_count integer not null default 1 check (passenger_count between 1 and 8),

  -- Trip shape. Free text for human-readable context + districts for
  -- pricing.
  pickup_text text not null,
  pickup_district licence_district not null,
  dropoff_text text not null,
  dropoff_district licence_district not null,
  pickup_ts timestamptz not null,

  -- Pricing snapshot from computePricing at placement time. The quoted
  -- price is what the guest sees; floor/ceiling snapshot is audit
  -- evidence the quote never exceeded the regulated ceiling.
  quoted_price_eur decimal(8,2) not null check (quoted_price_eur > 0),
  pricing_meter_eur decimal(8,2),
  pricing_floor_eur decimal(8,2),
  pricing_ceiling_eur decimal(8,2),

  -- Lifecycle
  status concierge_booking_status not null default 'placed',

  -- Provenance
  placed_by uuid references auth.users(id) on delete set null, -- null when placed via embed widget
  source text not null default 'staff' check (source in ('staff', 'embed_widget')),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- If a leg is linked the status must be confirmed/cancelled/expired — a
  -- "placed" booking with a leg would mean we forgot to flip status on
  -- acceptance.
  constraint concierge_bookings_leg_status_consistent
    check (leg_id is null or status in ('confirmed', 'cancelled', 'expired')),

  -- quoted price must respect the ceiling snapshot (defense in depth; the
  -- app already enforces via computePricing).
  constraint concierge_bookings_respects_ceiling
    check (pricing_ceiling_eur is null or quoted_price_eur <= pricing_ceiling_eur)
);

comment on table public.concierge_bookings is
  'Guest trip requests from hotel / agency tenants. Request-first: a driver accepts and links a leg.';

create index idx_concierge_bookings_tenant on public.concierge_bookings(tenant_id, created_at desc);
create index idx_concierge_bookings_status on public.concierge_bookings(status)
  where status in ('placed', 'confirmed');
create index idx_concierge_bookings_pickup on public.concierge_bookings(pickup_ts)
  where status = 'placed';
create index idx_concierge_bookings_leg on public.concierge_bookings(leg_id)
  where leg_id is not null;

alter table public.concierge_bookings enable row level security;

-- Tenant members can see their own tenant's bookings.
create policy "Members can view tenant bookings" on public.concierge_bookings
  for select using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenant_id and m.user_id = auth.uid()
    )
  );

-- Tenant members can create and update bookings for their own tenant.
create policy "Members can create tenant bookings" on public.concierge_bookings
  for insert with check (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenant_id and m.user_id = auth.uid()
    )
  );

create policy "Members can update tenant bookings" on public.concierge_bookings
  for update using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenant_id and m.user_id = auth.uid()
    )
  );

-- Drivers see bookings that have been linked to one of their legs. This is
-- how a driver notices a concierge request got attached to their flow.
create policy "Drivers view bookings linked to their legs" on public.concierge_bookings
  for select using (
    leg_id is not null and exists (
      select 1 from public.empty_legs l
      where l.id = leg_id and l.seller_id = auth.uid()
    )
  );

create trigger update_concierge_bookings_updated_at
  before update on public.concierge_bookings
  for each row execute function public.update_updated_at_column();
