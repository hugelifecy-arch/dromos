-- ============================================
-- Sprint 6: Fleet & Admin
-- Multi-vehicle fleet, admin tools, verification management
-- ============================================

-- 1. VEHICLES TABLE (multi-vehicle fleet)
create table if not exists public.vehicles (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  make text not null,
  model text not null,
  year integer check (year >= 1990 and year <= 2030),
  color text,
  plate text not null,
  vehicle_type text default 'sedan' check (vehicle_type in ('sedan', 'minivan', 'van', 'luxury')),
  seats integer default 4 check (seats >= 1 and seats <= 8),
  wheelchair_accessible boolean default false,
  photo_url text,
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.vehicles enable row level security;

create policy "Vehicles viewable by everyone"
  on public.vehicles for select using (true);

create policy "Owners can insert vehicles"
  on public.vehicles for insert with check (auth.uid() = owner_id);

create policy "Owners can update vehicles"
  on public.vehicles for update using (auth.uid() = owner_id);

create policy "Owners can delete vehicles"
  on public.vehicles for delete using (auth.uid() = owner_id);

create index idx_vehicles_owner on public.vehicles(owner_id);
create index idx_vehicles_active on public.vehicles(owner_id) where is_active = true;

-- Ensure only one active vehicle per driver
create or replace function public.set_active_vehicle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active = true then
    update public.vehicles
    set is_active = false, updated_at = now()
    where owner_id = new.owner_id and id != new.id and is_active = true;

    -- Sync car info to profiles table
    update public.profiles
    set car_make = new.make,
        car_model = new.model,
        car_year = new.year,
        car_color = new.color,
        car_plate = new.plate,
        updated_at = now()
    where id = new.owner_id;
  end if;
  return new;
end;
$$;

create trigger on_vehicle_active_change
  after insert or update of is_active on public.vehicles
  for each row execute function public.set_active_vehicle();

-- 2. ADMIN: REPORTED CONTENT TABLE
create table if not exists public.reported_content (
  id uuid default uuid_generate_v4() primary key,
  reporter_id uuid references public.profiles(id) on delete set null,
  content_type text not null check (content_type in ('post', 'comment', 'ride', 'message', 'profile')),
  content_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'scam', 'other')),
  description text,
  status text default 'pending' check (status in ('pending', 'reviewed', 'action_taken', 'dismissed')),
  reviewed_by uuid references public.admin_users(user_id),
  reviewed_at timestamptz,
  action_taken text,
  created_at timestamptz default now()
);

alter table public.reported_content enable row level security;

-- Users can report content
create policy "Users can create reports"
  on public.reported_content for insert with check (auth.uid() = reporter_id);

-- Users can view their own reports
create policy "Users can view own reports"
  on public.reported_content for select using (auth.uid() = reporter_id);

-- Admins can view all reports (checked via admin_users)
create policy "Admins can view all reports"
  on public.reported_content for select
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

-- Admins can update reports
create policy "Admins can update reports"
  on public.reported_content for update
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

create index idx_reported_content_status on public.reported_content(status);
create index idx_reported_content_type on public.reported_content(content_type, content_id);

-- 3. ADMIN: PLATFORM ANALYTICS HELPER
create or replace function public.get_platform_analytics(p_days integer default 30)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'new_users', (
      select count(*) from public.profiles
      where created_at >= now() - (p_days || ' days')::interval
    ),
    'new_rides', (
      select count(*) from public.rides
      where created_at >= now() - (p_days || ' days')::interval
    ),
    'completed_rides', (
      select count(*) from public.rides
      where status = 'completed'
        and updated_at >= now() - (p_days || ' days')::interval
    ),
    'new_bookings', (
      select count(*) from public.bookings
      where created_at >= now() - (p_days || ' days')::interval
    ),
    'revenue', (
      select coalesce(sum(abs(amount)), 0) from public.transactions
      where type = 'commission'
        and created_at >= now() - (p_days || ' days')::interval
    ),
    'pending_verifications', (
      select count(*) from public.driver_verification
      where verification_status = 'pending'
    ),
    'active_drivers', (
      select count(*) from public.profiles
      where is_driver = true and is_verified = true
    ),
    'daily_signups', (
      select json_agg(row_to_json(d)) from (
        select date_trunc('day', created_at)::date as day, count(*) as count
        from public.profiles
        where created_at >= now() - (p_days || ' days')::interval
        group by date_trunc('day', created_at)::date
        order by day
      ) d
    ),
    'daily_rides', (
      select json_agg(row_to_json(d)) from (
        select date_trunc('day', created_at)::date as day, count(*) as count
        from public.rides
        where created_at >= now() - (p_days || ' days')::interval
        group by date_trunc('day', created_at)::date
        order by day
      ) d
    )
  );
$$;

-- 4. ADMIN: VERIFICATION MANAGEMENT POLICIES
-- Allow admins to update driver_verification (approve/reject)
create policy "Admins can update verifications"
  on public.driver_verification for update
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

create policy "Admins can view all verifications"
  on public.driver_verification for select
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));
