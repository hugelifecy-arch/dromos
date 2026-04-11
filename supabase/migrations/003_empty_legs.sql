-- ============================================
-- DROMOS - Empty Legs Marketplace
-- ============================================
-- Empty Legs table - core marketplace entity
-- Replaces the old rides model for B2B driver-to-driver leg trading

-- Create update_updated_at_column helper function if it doesn't exist
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Leg type enum
create type leg_type as enum ('standard', 'airport_inbound', 'airport_outbound', 'long_distance', 'repositioning');

-- Luggage capacity enum
create type luggage_capacity as enum ('none', 'small', 'medium', 'large');

-- Leg status enum
create type leg_status as enum ('open', 'claimed', 'confirmed', 'in_progress', 'completed', 'disputed', 'cancelled', 'expired');

create table public.empty_legs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid references auth.users(id) on delete set null,

  -- Route
  origin text not null,
  origin_lat double precision,
  origin_lng double precision,
  destination text not null,
  destination_lat double precision,
  destination_lng double precision,

  -- Timing
  departure_datetime timestamptz not null,
  is_time_flexible boolean default false,

  -- Pricing (MANDATORY - seller sets price)
  asking_price decimal(8,2) not null check (asking_price > 0),
  currency char(3) default 'EUR',

  -- Leg Classification
  leg_type leg_type not null default 'standard',
  passenger_capacity integer not null default 1 check (passenger_capacity between 1 and 8),
  luggage_capacity luggage_capacity default 'medium',

  -- Optional Passenger Context
  has_passenger boolean default false,
  passenger_count integer,
  passenger_name text,
  passenger_phone text,
  special_requirements text,

  -- Notes
  notes text,

  -- Status
  status leg_status not null default 'open',

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  claimed_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz
);

-- Indexes for marketplace queries
create index idx_empty_legs_status on public.empty_legs(status);
create index idx_empty_legs_seller on public.empty_legs(seller_id);
create index idx_empty_legs_buyer on public.empty_legs(buyer_id);
create index idx_empty_legs_departure on public.empty_legs(departure_datetime);
create index idx_empty_legs_origin on public.empty_legs(origin);
create index idx_empty_legs_destination on public.empty_legs(destination);
create index idx_empty_legs_leg_type on public.empty_legs(leg_type);
create index idx_empty_legs_open_legs on public.empty_legs(status, departure_datetime) where status = 'open';

-- Row Level Security
alter table public.empty_legs enable row level security;

-- Anyone authenticated can view open legs
create policy "Anyone can view open legs" on public.empty_legs
  for select using (status = 'open' or seller_id = auth.uid() or buyer_id = auth.uid());

-- Only verified drivers can insert
create policy "Verified drivers can post legs" on public.empty_legs
  for insert with check (auth.uid() = seller_id);

-- Sellers can update their own legs
create policy "Sellers can update own legs" on public.empty_legs
  for update using (auth.uid() = seller_id or auth.uid() = buyer_id);

-- Auto-update updated_at
create trigger update_empty_legs_updated_at
  before update on public.empty_legs
  for each row execute function public.update_updated_at_column();
