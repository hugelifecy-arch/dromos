-- ============================================
-- DROMOS - Peer Handoff (Συνάδελφος) - Sprint 18
-- ============================================
-- Lets a driver who has accepted an empty-leg booking hand it off to a
-- trusted colleague when the previous fare runs late. The platform records
-- the swap; money flow stays off-platform (cash between colleagues, by
-- convention).
--
-- See docs/superpowers/specs/2026-04-26-sprint-18-peer-handoff.md and
-- docs/cyprus-taxi-empty-leg-strategy.md §3 #5 ("Συνάδελφος Peer Coverage").
--
-- Three things in this migration:
--   1. trusted_driver_links — directional A→B trust graph.
--   2. handoff_proposals    — propose / accept / decline lifecycle table.
--   3. empty_legs           — two columns recording the handoff event.
--
-- Notification side-effects emit from the service layer (testable), not
-- from a trigger. New notification types are added by extending the
-- existing CHECK constraint on public.notifications.

-- --------------------------------------------------------------------------
-- 1. Trust graph
-- --------------------------------------------------------------------------

create table public.trusted_driver_links (
  owner_id        uuid not null references auth.users(id) on delete cascade,
  trusted_id      uuid not null references auth.users(id) on delete cascade,
  established_at  timestamptz not null default now(),
  primary key (owner_id, trusted_id),
  check (owner_id <> trusted_id)
);

comment on table public.trusted_driver_links is
  'Directional A→B trust links. A trusts B does not imply B trusts A. Mutual trust requires both rows.';

-- Lookup "who trusts me?" for the trusted driver's notifications inbox.
create index idx_trusted_driver_links_trusted_id
  on public.trusted_driver_links (trusted_id);

alter table public.trusted_driver_links enable row level security;

create policy "Users view trust links they own or where they're trusted"
  on public.trusted_driver_links
  for select
  using (auth.uid() = owner_id or auth.uid() = trusted_id);

create policy "Users manage their own trust links"
  on public.trusted_driver_links
  for insert
  with check (auth.uid() = owner_id);

create policy "Users delete their own trust links"
  on public.trusted_driver_links
  for delete
  using (auth.uid() = owner_id);

-- --------------------------------------------------------------------------
-- 2. Handoff proposals
-- --------------------------------------------------------------------------

create table public.handoff_proposals (
  id             uuid primary key default gen_random_uuid(),
  leg_id         uuid not null references public.empty_legs(id) on delete cascade,
  proposer_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id   uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending','accepted','declined','expired','cancelled')),
  message        text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  expires_at     timestamptz not null default (now() + interval '30 minutes'),
  check (proposer_id <> recipient_id)
);

comment on table public.handoff_proposals is
  'A pending/accepted/declined proposal to hand off a confirmed leg to a trusted colleague.';

-- Recipient's inbox query: pending proposals addressed to me, ordered fresh-first.
create index idx_handoff_proposals_recipient_pending
  on public.handoff_proposals (recipient_id, created_at desc)
  where status = 'pending';

-- Quick "who's bidding on this leg?" lookup, plus the partial unique below.
create index idx_handoff_proposals_leg
  on public.handoff_proposals (leg_id);

-- Only one pending proposal per leg at a time. Once it resolves, another
-- can be created (e.g. recipient declined → propose to a different colleague).
create unique index uq_handoff_proposals_one_pending_per_leg
  on public.handoff_proposals (leg_id)
  where status = 'pending';

alter table public.handoff_proposals enable row level security;

-- Either party (proposer / recipient) sees the proposal.
create policy "Parties view their handoff proposals"
  on public.handoff_proposals
  for select
  using (auth.uid() = proposer_id or auth.uid() = recipient_id);

-- Proposer creates a proposal addressed to themselves' trusted colleague.
-- Pre-condition checks (leg ownership, status, trust link, recipient
-- verification) are enforced in the service layer; this policy only checks
-- "is the writer the proposer?" because doing the full pre-check in SQL
-- would require multi-table joins inside the policy, which is fragile.
create policy "Proposers create their own proposals"
  on public.handoff_proposals
  for insert
  with check (auth.uid() = proposer_id);

-- Either party can update (proposer cancels, recipient accepts/declines).
-- Service layer enforces which transitions are allowed by which actor.
create policy "Parties update their handoff proposals"
  on public.handoff_proposals
  for update
  using (auth.uid() = proposer_id or auth.uid() = recipient_id);

-- --------------------------------------------------------------------------
-- 3. empty_legs handoff audit columns
-- --------------------------------------------------------------------------

alter table public.empty_legs
  add column handed_off_from uuid references auth.users(id),
  add column handed_off_at   timestamptz;

comment on column public.empty_legs.handed_off_from is
  'If non-null, the original buyer who handed this leg to the current buyer_id.';

create index idx_empty_legs_handed_off_from
  on public.empty_legs (handed_off_from)
  where handed_off_from is not null;

-- --------------------------------------------------------------------------
-- 4. Extend notifications CHECK to allow handoff types
-- --------------------------------------------------------------------------
--
-- The notifications.type column carries an inline CHECK enumerating allowed
-- values. Extending it = drop + recreate, since CHECK constraints don't
-- support ALTER. Naming the constraint explicitly here so future migrations
-- can find it.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'leg_claimed', 'leg_confirmed', 'leg_rejected', 'leg_cancelled',
    'new_message', 'counter_offer', 'counter_offer_response',
    'departure_reminder', 'new_leg_in_district', 'system',
    'handoff_proposed', 'handoff_accepted', 'handoff_declined', 'handoff_expired'
  ));

-- --------------------------------------------------------------------------
-- 5. Realtime
-- --------------------------------------------------------------------------
-- Drivers want immediate inbox updates when a handoff is proposed; piggy-back
-- on the existing supabase_realtime publication. Trust links don't need
-- realtime (the UI re-fetches on profile open).

alter publication supabase_realtime add table public.handoff_proposals;
