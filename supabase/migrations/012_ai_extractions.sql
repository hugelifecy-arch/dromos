-- ============================================
-- DROMOS - AI extraction cache (Sprint 12)
-- ============================================
-- Caches Whisper transcription + LLM extraction results for WhatsApp voice
-- notes, per spec §7 ("LLM cost control"):
--
--   "all WhatsApp extraction traffic caches by (audio sha256, model version)
--    in a new ai_extractions table. A driver sending the same recurring route
--    daily pays for one transcription, not thirty."
--
-- Key is (audio_sha256, model_version). A bump of the model version
-- (Whisper upgrade, Claude model switch, prompt revision) invalidates the
-- cache without touching rows — simply insert new ones.
--
-- This table stores NO phone numbers, NO user ids, NO media URLs. Just a
-- content hash and the structured output. GDPR posture: the cache is
-- derivative of audio content the driver sent; we keep it only as long as
-- the source message retention window (whatsapp_messages). Scheduled
-- cleanup is handled in application code.

create table public.ai_extractions (
  id uuid primary key default gen_random_uuid(),

  -- Cache key
  audio_sha256 text not null,
  model_version text not null,     -- e.g. 'whisper-1+claude-haiku-4-5-20251001'

  -- Whisper output
  transcript text,
  transcript_lang text check (transcript_lang is null or transcript_lang in ('el', 'en')),

  -- Structured extraction (PostLegData shape). Nullable so we can cache
  -- "Whisper succeeded, extraction failed" without re-paying for the audio.
  extraction jsonb,
  extraction_error text,           -- populated when LLM couldn't extract a valid leg

  -- Observability
  transcription_ms integer,
  extraction_ms integer,

  created_at timestamptz not null default now(),

  constraint ai_extractions_key_unique unique (audio_sha256, model_version)
);

comment on table public.ai_extractions is
  'Content-addressed cache for Whisper transcripts + LLM leg extractions. '
  'Deduplicates repeated voice notes (spec §7 cost control).';

create index idx_ai_extractions_created on public.ai_extractions(created_at desc);

-- Service role only. This is an internal cache; nothing user-facing reads it.
alter table public.ai_extractions enable row level security;
-- (No policies = no one but service_role gets in.)
