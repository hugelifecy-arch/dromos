-- ============================================
-- DROMOS - Monetisation Schema (Option C)
-- Freemium + Subscription + Commission
-- ============================================

-- ============================================
-- SUBSCRIPTION TIERS
-- ============================================
create type subscription_tier as enum ('free', 'plus', 'pro');

create table public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  tier subscription_tier default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);

create policy "Service role can manage subscriptions"
  on public.subscriptions for all using (auth.role() = 'service_role');

-- ============================================
-- TRANSACTIONS / EARNINGS
-- ============================================
create type transaction_type as enum ('ride_payment', 'commission', 'payout', 'subscription', 'refund', 'bonus');

create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  booking_id uuid references public.bookings(id) on delete set null,
  type transaction_type not null,
  amount numeric(10,2) not null,
  currency text default 'EUR',
  description text,
  stripe_payment_intent_id text,
  created_at timestamptz default now()
);

alter table public.transactions enable row level security;

create policy "Users can view their own transactions"
  on public.transactions for select using (auth.uid() = user_id);

-- ============================================
-- CORPORATE ACCOUNTS
-- ============================================
create table public.corporate_accounts (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  domain text not null unique,
  logo_url text,
  admin_id uuid references public.profiles(id) on delete set null,
  max_employees integer default 50,
  monthly_budget numeric(10,2),
  stripe_customer_id text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table public.corporate_members (
  corporate_id uuid references public.corporate_accounts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'member' check (role in ('admin', 'manager', 'member')),
  monthly_allowance numeric(10,2) default 100.00,
  joined_at timestamptz default now(),
  primary key (corporate_id, user_id)
);

alter table public.corporate_accounts enable row level security;
alter table public.corporate_members enable row level security;

create policy "Corporate members can view their account"
  on public.corporate_accounts for select
  using (id in (
    select corporate_id from public.corporate_members where user_id = auth.uid()
  ));

create policy "Members can view co-members"
  on public.corporate_members for select
  using (corporate_id in (
    select corporate_id from public.corporate_members where user_id = auth.uid()
  ));

-- ============================================
-- FLIGHT TRACKING
-- ============================================
create table public.flight_watches (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  flight_number text not null,
  flight_date date not null,
  airline text,
  origin_airport text,
  destination_airport text,
  scheduled_arrival timestamptz,
  actual_arrival timestamptz,
  status text default 'scheduled',
  auto_create_ride boolean default false,
  created_at timestamptz default now(),
  unique(user_id, flight_number, flight_date)
);

alter table public.flight_watches enable row level security;

create policy "Users can view their own flights"
  on public.flight_watches for select using (auth.uid() = user_id);

create policy "Users can insert their own flights"
  on public.flight_watches for insert with check (auth.uid() = user_id);

create policy "Users can update their own flights"
  on public.flight_watches for update using (auth.uid() = user_id);

create policy "Users can delete their own flights"
  on public.flight_watches for delete using (auth.uid() = user_id);

-- ============================================
-- COMMISSION CONFIG
-- ============================================
-- Free: 15% commission
-- Plus: 8% commission, priority in search
-- Pro: 3% commission, priority + verified badge + analytics

create table public.platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

insert into public.platform_config (key, value) values
  ('commission_rates', '{"free": 0.15, "plus": 0.08, "pro": 0.03}'::jsonb),
  ('subscription_prices', '{"plus": {"monthly": 4.99, "yearly": 39.99}, "pro": {"monthly": 14.99, "yearly": 119.99}}'::jsonb),
  ('min_ride_price', '{"EUR": 2.00}'::jsonb);

-- Admin view
create table public.admin_users (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  role text default 'admin' check (role in ('admin', 'super_admin')),
  created_at timestamptz default now()
);

alter table public.admin_users enable row level security;

create policy "Admins can view admin table"
  on public.admin_users for select
  using (auth.uid() in (select user_id from public.admin_users));

-- Indexes
create index idx_subscriptions_user on public.subscriptions(user_id);
create index idx_subscriptions_stripe on public.subscriptions(stripe_customer_id);
create index idx_transactions_user on public.transactions(user_id);
create index idx_transactions_created on public.transactions(created_at desc);
create index idx_flight_watches_user on public.flight_watches(user_id);
create index idx_flight_watches_date on public.flight_watches(flight_date);
create index idx_corporate_members_user on public.corporate_members(user_id);
