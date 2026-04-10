-- ============================================
-- DROMOS - Initial Database Schema
-- ============================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

-- ============================================
-- PROFILES
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  avatar_url text,
  phone text,
  bio text,
  date_of_birth date,
  is_driver boolean default false,
  is_verified boolean default false,
  rating_avg numeric(3,2) default 0,
  rating_count integer default 0,
  total_rides integer default 0,
  total_drives integer default 0,
  car_make text,
  car_model text,
  car_year integer,
  car_color text,
  car_plate text,
  locale text default 'el' check (locale in ('el', 'en')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- ============================================
-- RIDES
-- ============================================
create type ride_status as enum ('upcoming', 'in_progress', 'completed', 'cancelled');

create table public.rides (
  id uuid default uuid_generate_v4() primary key,
  driver_id uuid references public.profiles(id) on delete cascade not null,
  origin_address text not null,
  origin_lat double precision not null,
  origin_lng double precision not null,
  destination_address text not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  departure_time timestamptz not null,
  arrival_time_est timestamptz,
  seats_total integer not null default 3,
  seats_available integer not null default 3,
  price_per_seat numeric(10,2) not null,
  currency text default 'EUR',
  status ride_status default 'upcoming',
  notes text,
  is_recurring boolean default false,
  recurrence_days integer[] default '{}',
  allow_detours boolean default false,
  max_detour_minutes integer default 15,
  luggage_size text default 'medium' check (luggage_size in ('small', 'medium', 'large')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.rides enable row level security;

create policy "Rides are viewable by everyone"
  on public.rides for select using (true);

create policy "Drivers can insert rides"
  on public.rides for insert with check (auth.uid() = driver_id);

create policy "Drivers can update their rides"
  on public.rides for update using (auth.uid() = driver_id);

create policy "Drivers can delete their rides"
  on public.rides for delete using (auth.uid() = driver_id);

-- ============================================
-- BOOKINGS
-- ============================================
create type booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed');

create table public.bookings (
  id uuid default uuid_generate_v4() primary key,
  ride_id uuid references public.rides(id) on delete cascade not null,
  passenger_id uuid references public.profiles(id) on delete cascade not null,
  seats_booked integer not null default 1,
  status booking_status default 'pending',
  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_address text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  total_price numeric(10,2) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(ride_id, passenger_id)
);

alter table public.bookings enable row level security;

create policy "Users can view their own bookings"
  on public.bookings for select
  using (auth.uid() = passenger_id or auth.uid() in (
    select driver_id from public.rides where id = ride_id
  ));

create policy "Users can insert bookings"
  on public.bookings for insert with check (auth.uid() = passenger_id);

create policy "Users can update their bookings"
  on public.bookings for update
  using (auth.uid() = passenger_id or auth.uid() in (
    select driver_id from public.rides where id = ride_id
  ));

-- ============================================
-- MESSAGES
-- ============================================
create table public.conversations (
  id uuid default uuid_generate_v4() primary key,
  ride_id uuid references public.rides(id) on delete set null,
  created_at timestamptz default now()
);

create table public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now()
);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create policy "Participants can view conversations"
  on public.conversations for select
  using (id in (
    select conversation_id from public.conversation_participants where user_id = auth.uid()
  ));

create policy "Participants can view participants"
  on public.conversation_participants for select
  using (conversation_id in (
    select conversation_id from public.conversation_participants where user_id = auth.uid()
  ));

create policy "Participants can view messages"
  on public.messages for select
  using (conversation_id in (
    select conversation_id from public.conversation_participants where user_id = auth.uid()
  ));

create policy "Participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id and
    conversation_id in (
      select conversation_id from public.conversation_participants where user_id = auth.uid()
    )
  );

-- ============================================
-- REVIEWS
-- ============================================
create table public.reviews (
  id uuid default uuid_generate_v4() primary key,
  booking_id uuid references public.bookings(id) on delete cascade not null unique,
  reviewer_id uuid references public.profiles(id) on delete cascade not null,
  reviewee_id uuid references public.profiles(id) on delete cascade not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz default now()
);

alter table public.reviews enable row level security;

create policy "Reviews are viewable by everyone"
  on public.reviews for select using (true);

create policy "Users can insert reviews for their bookings"
  on public.reviews for insert with check (auth.uid() = reviewer_id);

-- ============================================
-- FEED POSTS
-- ============================================
create table public.feed_posts (
  id uuid default uuid_generate_v4() primary key,
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  image_url text,
  ride_id uuid references public.rides(id) on delete set null,
  likes_count integer default 0,
  comments_count integer default 0,
  created_at timestamptz default now()
);

create table public.feed_likes (
  post_id uuid references public.feed_posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table public.feed_comments (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.feed_posts(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.feed_posts enable row level security;
alter table public.feed_likes enable row level security;
alter table public.feed_comments enable row level security;

create policy "Feed posts are viewable by everyone"
  on public.feed_posts for select using (true);

create policy "Users can create feed posts"
  on public.feed_posts for insert with check (auth.uid() = author_id);

create policy "Users can delete their own posts"
  on public.feed_posts for delete using (auth.uid() = author_id);

create policy "Likes are viewable by everyone"
  on public.feed_likes for select using (true);

create policy "Users can like posts"
  on public.feed_likes for insert with check (auth.uid() = user_id);

create policy "Users can unlike posts"
  on public.feed_likes for delete using (auth.uid() = user_id);

create policy "Comments are viewable by everyone"
  on public.feed_comments for select using (true);

create policy "Users can comment"
  on public.feed_comments for insert with check (auth.uid() = author_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Update profile rating after review
create or replace function public.update_profile_rating()
returns trigger as $$
begin
  update public.profiles
  set
    rating_avg = (select avg(rating)::numeric(3,2) from public.reviews where reviewee_id = new.reviewee_id),
    rating_count = (select count(*) from public.reviews where reviewee_id = new.reviewee_id)
  where id = new.reviewee_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_review_created
  after insert on public.reviews
  for each row execute procedure public.update_profile_rating();

-- Update seats on booking
create or replace function public.update_seats_on_booking()
returns trigger as $$
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    update public.rides
    set seats_available = seats_available - new.seats_booked
    where id = new.ride_id and seats_available >= new.seats_booked;
  elsif tg_op = 'UPDATE' and old.status = 'confirmed' and new.status = 'cancelled' then
    update public.rides
    set seats_available = seats_available + old.seats_booked
    where id = new.ride_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_booking_change
  after insert or update on public.bookings
  for each row execute procedure public.update_seats_on_booking();

-- Update feed post counts
create or replace function public.update_post_likes_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.feed_posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.feed_posts set likes_count = likes_count - 1 where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger on_like_change
  after insert or delete on public.feed_likes
  for each row execute procedure public.update_post_likes_count();

-- Indexes
create index idx_rides_departure on public.rides(departure_time);
create index idx_rides_driver on public.rides(driver_id);
create index idx_rides_status on public.rides(status);
create index idx_bookings_ride on public.bookings(ride_id);
create index idx_bookings_passenger on public.bookings(passenger_id);
create index idx_messages_conversation on public.messages(conversation_id);
create index idx_feed_posts_author on public.feed_posts(author_id);
create index idx_feed_posts_created on public.feed_posts(created_at desc);
