-- ============================================
-- DROMOS - WhatsApp Bot MVP (Sprint 11)
-- ============================================
-- Data model for the driver-facing WhatsApp intake channel described in
-- docs/cyprus-taxi-technical-spec.md §3.2 and §5.
--
-- MVP scope (this migration): text-only intents. The driver texts
--   "Λάρνακα → Λεμεσός 18:30 €25"
-- the bot parses it, drafts a leg, and asks for ΝΑΙ/ΟΧΙ confirmation.
-- Voice-note transcription (Whisper + LLM) is Sprint 12; columns for
-- raw_voice_url / transcript are added here so S12 is a pure write-path
-- change with no schema churn.
--
-- GDPR posture (spec §6): every phone number stored here must have an
-- explicit opt_in_at. STOP / ΔΙΑΓΡΑΦΗ sets opt_out_at and suppresses further
-- outbound. No hard delete — opt_out preserves the audit trail the bot needs
-- to prove consent to the regulator if ever challenged.

-- --------------------------------------------
-- Session state FSM
-- --------------------------------------------
-- awaiting_opt_in: first contact, waiting for consent reply
-- idle:            opted in, no draft in flight
-- awaiting_confirmation: draft created, waiting for ΝΑΙ / ΟΧΙ
-- opted_out:       STOP / ΔΙΑΓΡΑΦΗ received; no outbound until re-opt-in

create type whatsapp_session_state as enum (
  'awaiting_opt_in',
  'idle',
  'awaiting_confirmation',
  'opted_out'
);

create table public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),

  -- Identity. phone_e164 is the natural key; user_id is populated once the
  -- sender's number matches a verified driver's profile.phone.
  phone_e164 text not null unique,
  user_id uuid references auth.users(id) on delete set null,

  -- FSM
  state whatsapp_session_state not null default 'awaiting_opt_in',

  -- Current draft (if any) — enables "state machine in a row" pattern.
  active_draft_id uuid,

  -- Consent audit
  opt_in_at timestamptz,
  opt_in_message_sid text,   -- Twilio MessageSid that granted consent
  opt_out_at timestamptz,
  opt_out_message_sid text,

  -- Activity
  last_message_at timestamptz,
  last_inbound_sid text,
  last_locale text check (last_locale in ('el', 'en')),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Invariant: opted_out iff opt_out_at is set.
  constraint whatsapp_sessions_opt_out_consistent
    check ((state = 'opted_out') = (opt_out_at is not null))
);

comment on table public.whatsapp_sessions is
  'One row per phone number ever seen by the WhatsApp bot. Consent audit + FSM.';

create index idx_whatsapp_sessions_user on public.whatsapp_sessions(user_id);
create index idx_whatsapp_sessions_state on public.whatsapp_sessions(state);

alter table public.whatsapp_sessions enable row level security;

-- Only the service role writes to this table (webhook runs with service key).
-- Authenticated users can read their own session so the web app can show
-- "WhatsApp connected" on the profile page.
create policy "Users can view own whatsapp session" on public.whatsapp_sessions
  for select using (auth.uid() = user_id);

-- --------------------------------------------
-- Draft legs (pre-publication)
-- --------------------------------------------
-- A draft is what the parser / LLM extracted from the inbound message,
-- BEFORE the driver confirms with ΝΑΙ. On confirm we insert into empty_legs
-- and store the resulting id in confirmed_leg_id — which means draft rows
-- are also the audit trail for how a published leg was originally phrased.

create type whatsapp_draft_status as enum (
  'pending_confirmation',
  'confirmed',
  'rejected',
  'expired',
  'superseded'
);

create type whatsapp_draft_source as enum ('text', 'voice');

create table public.whatsapp_draft_legs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.whatsapp_sessions(id) on delete cascade,

  -- Provenance
  source whatsapp_draft_source not null default 'text',
  raw_message_sid text,          -- Twilio inbound MessageSid
  raw_body text,                 -- verbatim inbound text (or caption)
  raw_voice_url text,            -- Sprint 12: Twilio media URL
  transcript text,               -- Sprint 12: Whisper output
  transcript_lang text check (transcript_lang in ('el', 'en')),

  -- Parser / LLM output
  extracted_origin text,
  extracted_destination text,
  extracted_origin_district licence_district,
  extracted_destination_district licence_district,
  extracted_departure timestamptz,
  extracted_asking_price_eur decimal(8,2) check (extracted_asking_price_eur is null or extracted_asking_price_eur > 0),
  confidence numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  parse_error text,              -- human-readable reason when parse failed

  -- Pricing snapshot (populated at draft time so the confirmation prompt
  -- can show the regulated meter + ceiling in the Greek reply).
  pricing_meter_eur decimal(8,2),
  pricing_floor_eur decimal(8,2),
  pricing_ceiling_eur decimal(8,2),

  -- Lifecycle
  status whatsapp_draft_status not null default 'pending_confirmation',
  confirmed_leg_id uuid references public.empty_legs(id) on delete set null,
  rejection_reason text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz
);

comment on table public.whatsapp_draft_legs is
  'Draft leg extracted from a WhatsApp message, pre-confirmation. '
  'On ΝΑΙ, a row in empty_legs is created and linked via confirmed_leg_id.';

create index idx_whatsapp_drafts_session on public.whatsapp_draft_legs(session_id);
create index idx_whatsapp_drafts_status on public.whatsapp_draft_legs(status);
create index idx_whatsapp_drafts_confirmed_leg on public.whatsapp_draft_legs(confirmed_leg_id)
  where confirmed_leg_id is not null;

alter table public.whatsapp_draft_legs enable row level security;

-- Owning driver can see their own drafts. Service role bypasses RLS.
create policy "Users can view own whatsapp drafts" on public.whatsapp_draft_legs
  for select using (
    exists (
      select 1 from public.whatsapp_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

-- Back-reference from session -> active draft (deferred FK; session is created
-- before its first draft).
alter table public.whatsapp_sessions
  add constraint whatsapp_sessions_active_draft_fk
  foreign key (active_draft_id) references public.whatsapp_draft_legs(id)
  on delete set null
  deferrable initially deferred;

-- --------------------------------------------
-- Inbound / outbound message log
-- --------------------------------------------
-- Twilio keeps 30-day logs; we keep our own for longer so we can reconstruct
-- any conversation during a support or regulatory incident. Bodies are kept
-- because the parsed draft alone loses nuance (e.g. polite preamble the driver
-- added). Retention policy is handled in application code, not here.

create type whatsapp_message_direction as enum ('inbound', 'outbound');

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.whatsapp_sessions(id) on delete cascade,
  direction whatsapp_message_direction not null,
  twilio_sid text,
  from_number text not null,
  to_number text not null,
  body text,
  num_media integer default 0,
  media_urls text[],
  received_at timestamptz not null default now()
);

create index idx_whatsapp_messages_session on public.whatsapp_messages(session_id, received_at desc);
create index idx_whatsapp_messages_sid on public.whatsapp_messages(twilio_sid)
  where twilio_sid is not null;

alter table public.whatsapp_messages enable row level security;

create policy "Users can view own whatsapp messages" on public.whatsapp_messages
  for select using (
    exists (
      select 1 from public.whatsapp_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

-- --------------------------------------------
-- updated_at triggers
-- --------------------------------------------
create trigger update_whatsapp_sessions_updated_at
  before update on public.whatsapp_sessions
  for each row execute function public.update_updated_at_column();

create trigger update_whatsapp_draft_legs_updated_at
  before update on public.whatsapp_draft_legs
  for each row execute function public.update_updated_at_column();
