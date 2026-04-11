-- ============================================
-- Sprint 4: Feed & Community
-- Follows, feed enhancements, image storage
-- ============================================

-- 1. FOLLOWS TABLE
create table if not exists public.follows (
  follower_id uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id != following_id)
);

alter table public.follows enable row level security;

create policy "Follows are viewable by everyone"
  on public.follows for select using (true);

create policy "Users can follow others"
  on public.follows for insert with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete using (auth.uid() = follower_id);

create index idx_follows_follower on public.follows(follower_id);
create index idx_follows_following on public.follows(following_id);

-- 2. ADD FOLLOWER COUNTS TO PROFILES
alter table public.profiles
  add column if not exists followers_count integer default 0,
  add column if not exists following_count integer default 0;

-- 3. TRIGGER: AUTO-UPDATE FOLLOWER COUNTS
create or replace function public.update_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.following_id;
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger on_follow_change
  after insert or delete on public.follows
  for each row execute function public.update_follow_counts();

-- 4. ADD POST TYPE AND DISTRICT TO FEED POSTS
alter table public.feed_posts
  add column if not exists post_type text default 'general' check (post_type in ('general', 'leg_share', 'question', 'tip', 'milestone')),
  add column if not exists district text;

create index if not exists idx_feed_posts_type on public.feed_posts(post_type);
create index if not exists idx_feed_posts_district on public.feed_posts(district);

-- 5. ADD COMMENTS COUNT TRIGGER (was missing — likes had one but comments didn't)
create or replace function public.update_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.feed_posts set comments_count = comments_count + 1 where id = new.post_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.feed_posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger on_comment_change
  after insert or delete on public.feed_comments
  for each row execute function public.update_comments_count();

-- 6. FEED COMMENTS INDEX
create index if not exists idx_feed_comments_post on public.feed_comments(post_id, created_at);

-- 7. STORAGE BUCKET FOR POST IMAGES
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Storage policies for post images
create policy "Anyone can view post images"
  on storage.objects for select
  using (bucket_id = 'post-images');

create policy "Authenticated users can upload post images"
  on storage.objects for insert
  with check (bucket_id = 'post-images' and auth.role() = 'authenticated');

create policy "Users can delete own post images"
  on storage.objects for delete
  using (bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- 8. ENABLE REALTIME ON NEW TABLES
alter publication supabase_realtime add table follows;
