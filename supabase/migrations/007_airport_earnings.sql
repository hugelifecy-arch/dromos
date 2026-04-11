-- ============================================
-- Sprint 5: Airport & Earnings
-- Airport queue, earnings analytics
-- ============================================

-- 1. AIRPORT QUEUE TABLE
create table if not exists public.airport_queue (
  id uuid default uuid_generate_v4() primary key,
  airport text not null check (airport in ('LCA', 'PFO')),
  driver_id uuid references public.profiles(id) on delete cascade not null,
  position integer not null default 0,
  asking_price numeric(10,2) not null,
  passenger_capacity integer not null default 4,
  vehicle_type text default 'sedan' check (vehicle_type in ('sedan', 'minivan', 'van', 'luxury')),
  notes text,
  status text default 'waiting' check (status in ('waiting', 'matched', 'completed', 'left', 'expired')),
  joined_at timestamptz default now(),
  matched_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz default (now() + interval '4 hours'),
  created_at timestamptz default now()
);

alter table public.airport_queue enable row level security;

create policy "Airport queue is viewable by everyone"
  on public.airport_queue for select using (true);

create policy "Drivers can join queue"
  on public.airport_queue for insert with check (auth.uid() = driver_id);

create policy "Drivers can update own queue entry"
  on public.airport_queue for update using (auth.uid() = driver_id);

create policy "Drivers can leave queue"
  on public.airport_queue for delete using (auth.uid() = driver_id);

create index idx_airport_queue_airport on public.airport_queue(airport, status);
create index idx_airport_queue_driver on public.airport_queue(driver_id);
create index idx_airport_queue_position on public.airport_queue(airport, position) where status = 'waiting';

-- 2. AUTO-ASSIGN POSITION ON JOIN
create or replace function public.assign_queue_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_position integer;
begin
  select coalesce(max(position), 0) + 1 into next_position
  from public.airport_queue
  where airport = new.airport and status = 'waiting';

  new.position := next_position;
  return new;
end;
$$;

create trigger on_queue_join
  before insert on public.airport_queue
  for each row execute function public.assign_queue_position();

-- 3. EARNINGS PERIODS VIEW (for analytics)
-- Add a period column helper for grouping transactions
create or replace function public.get_earnings_summary(
  p_user_id uuid,
  p_days integer default 30
)
returns table (
  period date,
  total_earned numeric,
  total_commission numeric,
  net_earnings numeric,
  transaction_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    date_trunc('day', created_at)::date as period,
    coalesce(sum(case when type = 'ride_payment' then amount else 0 end), 0) as total_earned,
    coalesce(sum(case when type = 'commission' then abs(amount) else 0 end), 0) as total_commission,
    coalesce(sum(case when type = 'ride_payment' then amount else 0 end), 0) -
    coalesce(sum(case when type = 'commission' then abs(amount) else 0 end), 0) as net_earnings,
    count(*) as transaction_count
  from public.transactions
  where user_id = p_user_id
    and created_at >= now() - (p_days || ' days')::interval
  group by date_trunc('day', created_at)::date
  order by period desc;
$$;

-- 4. FLIGHT WATCHES TABLE
create table if not exists public.flight_watches (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  flight_number text not null,
  flight_date date not null,
  airline text,
  origin_airport text,
  destination_airport text,
  scheduled_arrival timestamptz,
  actual_arrival timestamptz,
  status text default 'scheduled' check (status in ('scheduled', 'delayed', 'landed', 'cancelled', 'unknown')),
  auto_create_ride boolean default false,
  created_at timestamptz default now()
);

alter table public.flight_watches enable row level security;

create policy "Users can view own flight watches"
  on public.flight_watches for select using (auth.uid() = user_id);

create policy "Users can insert own flight watches"
  on public.flight_watches for insert with check (auth.uid() = user_id);

create policy "Users can update own flight watches"
  on public.flight_watches for update using (auth.uid() = user_id);

create policy "Users can delete own flight watches"
  on public.flight_watches for delete using (auth.uid() = user_id);

create index idx_flight_watches_user on public.flight_watches(user_id);
create index idx_flight_watches_date on public.flight_watches(flight_date);

-- 5. ENABLE REALTIME ON AIRPORT QUEUE
alter publication supabase_realtime add table airport_queue;
