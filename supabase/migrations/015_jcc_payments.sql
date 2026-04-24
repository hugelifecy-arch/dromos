-- ============================================
-- DROMOS - JCC Payments integration (Sprint 16)
-- ============================================
-- JCC is Cyprus' domestic card-present / card-not-present processor. Every
-- Cypriot SME + hotel + taxi company banks on JCC; Stripe covers
-- international tourists but JCC is the only gateway local drivers and
-- hotels trust for euro SEPA settlement. See spec §7 ("Payments — domestic
-- SME", primary = JCC Payments).
--
-- Integration shape:
--   We use the JCC Gateway hosted-redirect model. Our /api/payments/jcc/
--   checkout endpoint computes a signed form and returns it to the client;
--   the client POSTs to JCC's page; JCC collects card details + runs 3-D
--   Secure; JCC calls our /api/payments/jcc/callback with a signed response.
--
-- What we persist, and why:
--   jcc_transactions is the durable record of a payment intent. We write on
--   checkout start (pending), update on callback (succeeded / failed), and
--   never let the app-level code trust a JCC response that didn't verify
--   against the shared secret.
--
-- Scope seats (spec §2 roadmap):
--   Phase A (this migration): driver Pro-tier subscription top-ups +
--     concierge-portal seat-count invoices. Low volume, high trust.
--   Phase B (future): passenger-side transfers paid by guests. Requires a
--     payer identity model we don't yet have.
--
-- Sandbox posture: migration runs unconditionally. The /api/payments/jcc/*
-- routes gate on JCC_ENABLED (see src/lib/services/jcc/config.ts), which
-- defaults to false. The merchant account + production secret are the real
-- blocker; code ships dark.

-- --------------------------------------------
-- Enums
-- --------------------------------------------

create type jcc_transaction_status as enum (
  'pending',       -- checkout started, user redirected to JCC
  'succeeded',
  'failed',
  'cancelled',     -- user backed out on JCC's page
  'expired'        -- JCC never called back within the TTL (default 30 min)
);

create type jcc_transaction_kind as enum (
  'driver_subscription',
  'concierge_seat',
  'guest_transfer'   -- reserved for Phase B
);

-- --------------------------------------------
-- Transactions
-- --------------------------------------------

create table public.jcc_transactions (
  id uuid primary key default gen_random_uuid(),

  -- Order id is what JCC echoes back on the callback. Unique + URL-safe so
  -- it can land in the redirect URL if we ever need it there.
  order_id text not null unique
    check (order_id ~ '^[A-Za-z0-9_-]+$' and length(order_id) between 6 and 64),

  kind jcc_transaction_kind not null,

  -- Who's paying. Exactly one of user_id / tenant_id is set; the CHECK
  -- below enforces that.
  user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,

  -- What they're paying for. Nullable because not every kind has a
  -- subscription / seat reference (guest_transfer, which is Phase B, links
  -- a concierge_bookings row via `booking_id` instead).
  subscription_tier text,
  seat_count integer,
  booking_id uuid references public.concierge_bookings(id) on delete set null,

  -- Amount + currency. Stored in whole euros and cents to match the
  -- existing empty_legs + earnings columns; the gateway layer converts to
  -- JCC minor units at send time.
  amount_eur decimal(10,2) not null check (amount_eur > 0),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),

  -- Lifecycle
  status jcc_transaction_status not null default 'pending',
  status_reason text,                 -- JCC's ReasonCode + text on failure
  status_code text,                   -- JCC's ResponseCode on any callback
  jcc_reference text,                 -- JCC's transaction id (3DSECURE Ref / TRXID)

  -- Signatures travel for audit. We store the computed request signature
  -- and the verified response signature so a post-mortem can reconstruct
  -- what JCC saw. Raw card data is NEVER stored (it never enters our
  -- servers — the hosted redirect runs on JCC's domain).
  request_signature text,
  response_signature text,

  -- Idempotency for the callback. JCC can deliver callbacks more than once
  -- (network retries). If we see this order_id + response_code combo
  -- twice, the second write is a no-op at the app layer.
  callback_received_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Exactly one payer (user or tenant). We allow both to be null for a
  -- transient race window in Phase B where a guest pays without an
  -- account; tighten once that flow exists.
  constraint jcc_transactions_payer_oneof
    check (not (user_id is not null and tenant_id is not null)),

  -- kind <-> required foreign-key mapping.
  constraint jcc_transactions_kind_consistent
    check (
      (kind = 'driver_subscription' and user_id is not null and subscription_tier is not null)
      or (kind = 'concierge_seat' and tenant_id is not null and seat_count is not null)
      or (kind = 'guest_transfer' and booking_id is not null)
    )
);

comment on table public.jcc_transactions is
  'Durable record of every JCC payment intent. Written on checkout; updated on callback. No card data is ever stored.';

create index idx_jcc_tx_user on public.jcc_transactions(user_id) where user_id is not null;
create index idx_jcc_tx_tenant on public.jcc_transactions(tenant_id) where tenant_id is not null;
create index idx_jcc_tx_status on public.jcc_transactions(status);
create index idx_jcc_tx_pending_recent on public.jcc_transactions(created_at desc)
  where status = 'pending';

alter table public.jcc_transactions enable row level security;

-- Payer can see their own transactions.
create policy "Users can view own jcc transactions" on public.jcc_transactions
  for select using (user_id = auth.uid());

create policy "Tenant members can view tenant jcc transactions" on public.jcc_transactions
  for select using (
    tenant_id is not null and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = jcc_transactions.tenant_id and m.user_id = auth.uid()
    )
  );

-- Writes go through the service-role key inside /api/payments/jcc/*.

create trigger update_jcc_transactions_updated_at
  before update on public.jcc_transactions
  for each row execute function public.update_updated_at_column();
