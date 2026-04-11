-- ============================================
-- DROMOS - Driver Verification & Airport Queue
-- ============================================
-- Driver Verification table
-- Every user must be a verified licensed Cyprus taxi driver

-- Verification status enum
create type verification_status as enum ('pending', 'approved', 'rejected');

-- Licence district enum
create type licence_district as enum ('nicosia', 'limassol', 'larnaca', 'paphos', 'famagusta');

-- Taxi type enum
create type taxi_type_enum as enum ('urban', 'rural', 'tourist', 'minibus');

create table public.driver_verification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,

  -- Licence Info
  licence_number text not null,
  licence_district licence_district not null,
  taxi_type taxi_type_enum not null,
  licence_photo_front_url text,
  licence_photo_back_url text,

  -- Vehicle Info
  vehicle_plate text not null,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  vehicle_colour text,
  vehicle_seats integer default 4 check (vehicle_seats between 1 and 8),
  wheelchair_accessible boolean default false,

  -- Verification
  verification_status verification_status not null default 'pending',
  verified_at timestamptz,
  verified_by text,
  rejection_reason text,

  -- Preferences (Phase 2.2)
  preferred_districts text[], -- Array of district names
  language_preference text default 'en' check (language_preference in ('en', 'el', 'tr')),

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_driver_verification_user on public.driver_verification(user_id);
create index idx_driver_verification_status on public.driver_verification(verification_status);
create index idx_driver_verification_district on public.driver_verification(licence_district);

-- Row Level Security
alter table public.driver_verification enable row level security;

-- Users can view their own verification
create policy "Users can view own verification" on public.driver_verification
  for select using (auth.uid() = user_id);

-- Users can insert their own verification
create policy "Users can submit verification" on public.driver_verification
  for insert with check (auth.uid() = user_id);

-- Users can update their own record (not verification status)
create policy "Users can update own record" on public.driver_verification
  for update using (auth.uid() = user_id);

-- Auto-update updated_at
create trigger update_driver_verification_updated_at
  before update on public.driver_verification
  for each row execute function public.update_updated_at_column();

-- ============================================
-- AIRPORT QUEUE LISTINGS
-- ============================================
-- Airport queue listings table (Phase 6.2 - created now for schema completeness)
create table public.airport_queue_listings (
  id uuid primary key default gen_random_uuid(),
  airport text not null check (airport in ('LCA', 'PFO')),
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid references auth.users(id) on delete set null,
  estimated_position integer not null,
  asking_price decimal(8,2) not null check (asking_price > 0),
  status text not null default 'open' check (status in ('open', 'claimed', 'completed', 'expired')),
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

alter table public.airport_queue_listings enable row level security;

create policy "Anyone can view open queue listings" on public.airport_queue_listings
  for select using (status = 'open' or seller_id = auth.uid() or buyer_id = auth.uid());

create policy "Drivers can post queue listings" on public.airport_queue_listings
  for insert with check (auth.uid() = seller_id);

create policy "Involved parties can update" on public.airport_queue_listings
  for update using (auth.uid() = seller_id or auth.uid() = buyer_id);
