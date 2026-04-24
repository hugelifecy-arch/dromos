// Core orchestration for the WhatsApp bot.
//
// Wires together: parser + session state + pricing + empty_legs insert +
// Greek reply templates. Returns a plain string reply so the webhook can
// emit it as TwiML without further logic.
//
// All DB writes go through a Supabase admin client (service role). RLS
// does not apply — we enforce invariants in application code and rely on
// the regulatory CHECK constraint in migration 009 as the backstop (spec §4).

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PricingError,
  computePricing,
  type PricingInput,
  type PricingOutput,
} from '@/lib/services/pricing';
import { fetchMeterRate, staticMeterLookup } from './meter-lookup';
import {
  isConfirmWord,
  parseMessage,
  type DepartureLocal,
  type ParsedIntent,
  type PostLegData,
} from './parser';
import {
  confirmationPrompt,
  consentPrompt,
  emptyTwiml,
  errorReply,
  helpReply,
  missingPriceReply,
  missingTimeReply,
  noMeterRateReply,
  notVerifiedReply,
  optedInReply,
  optedOutReply,
  priceAboveCeilingReply,
  priceBelowFloorReply,
  publishedReply,
  rejectedDraftReply,
  twiml,
  unknownReply,
  voiceDisabledReply,
  voiceExtractionFailedReply,
  voiceTranscriptionFailedReply,
  type BotLocale,
} from './replies';
import {
  processVoiceMessage,
  readVoiceEnv,
  type VoiceEnv,
  type VoiceOutcome,
} from './voice';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface InboundMessage {
  fromE164: string;          // without "whatsapp:" prefix
  toE164: string;            // our number
  body: string;
  twilioSid: string;
  /** Optional Twilio media. MediaUrl0 + MediaContentType0. */
  media?: { url: string; contentType: string };
}

export interface HandlerContext {
  supabase: SupabaseClient;
  appUrl: string;            // NEXT_PUBLIC_APP_URL
  now?: Date;                // injectable for tests
  /** Optional overrides for voice env + fetch — set by tests. */
  voiceEnv?: VoiceEnv;
  fetchImpl?: typeof fetch;
}

interface Session {
  id: string;
  phone_e164: string;
  user_id: string | null;
  state: 'awaiting_opt_in' | 'idle' | 'awaiting_confirmation' | 'opted_out';
  active_draft_id: string | null;
  last_locale: BotLocale | null;
  opt_in_at: string | null;
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

export async function handleInbound(
  msg: InboundMessage,
  ctx: HandlerContext,
): Promise<string> {
  const session = await loadOrCreateSession(ctx.supabase, msg.fromE164);
  await logMessage(ctx.supabase, session.id, 'inbound', msg);

  // Voice notes require consent first (same GDPR bar as text) — we defer
  // until the session is past awaiting_opt_in. Voice also bypasses the text
  // parser entirely: we go straight to Whisper + Claude.
  const hasVoice = !!msg.media && msg.media.contentType.startsWith('audio/');

  // Opt-out short-circuits everything — GDPR requirement. We still parse the
  // text body on voice messages because Twilio may include a Body alongside
  // the media (e.g. a caption); if the caption says STOP we honour it.
  const intent = parseMessage(msg.body);
  if (intent.kind === 'opt_out') return respondOptOut(ctx.supabase, session, msg);

  if (session.state === 'opted_out') {
    if (intent.kind === 'opt_in') return respondOptIn(ctx.supabase, session, msg);
    return emptyTwiml();
  }

  if (session.state === 'awaiting_opt_in') {
    if (intent.kind === 'opt_in') return respondOptIn(ctx.supabase, session, msg);
    return twiml(consentPrompt(session.last_locale ?? 'el'));
  }

  // From here on, session.state in {idle, awaiting_confirmation}.

  if (hasVoice) {
    return handleVoiceMessage(ctx, session, msg);
  }

  if (intent.kind === 'help') {
    return twiml(helpReply(session.last_locale ?? 'el'));
  }

  if (session.state === 'awaiting_confirmation') {
    return handleConfirmationState(ctx, session, msg, intent);
  }

  // idle state
  if (intent.kind === 'post_leg') {
    return handlePostLeg(ctx, session, msg, intent.data);
  }

  return twiml(unknownReply(session.last_locale ?? 'el'));
}

// --------------------------------------------------------------------------
// Voice branch (Sprint 12)
// --------------------------------------------------------------------------

async function handleVoiceMessage(
  ctx: HandlerContext,
  session: Session,
  msg: InboundMessage,
): Promise<string> {
  const locale = session.last_locale ?? 'el';
  if (!msg.media) return twiml(errorReply(locale));

  if (!session.user_id) {
    return twiml(notVerifiedReply(locale));
  }

  const outcome: VoiceOutcome = await processVoiceMessage({
    supabase: ctx.supabase,
    mediaUrl: msg.media.url,
    mediaContentType: msg.media.contentType,
    nowIso: (ctx.now ?? new Date()).toISOString(),
    env: ctx.voiceEnv ?? readVoiceEnv(),
    fetchImpl: ctx.fetchImpl,
  });

  if (outcome.kind === 'disabled') {
    return twiml(voiceDisabledReply(locale));
  }
  if (outcome.kind === 'transcription_failed') {
    return twiml(voiceTranscriptionFailedReply(locale));
  }
  if (outcome.kind === 'extraction_failed') {
    return twiml(voiceExtractionFailedReply(outcome.transcript, locale));
  }

  // Voice extraction succeeded — reuse the text post-leg path with voice
  // provenance threaded through so the draft records transcript + URL.
  const data: PostLegData = {
    originRaw: outcome.extraction.originRaw,
    destinationRaw: outcome.extraction.destinationRaw,
    originDistrict: outcome.extraction.originDistrict,
    destinationDistrict: outcome.extraction.destinationDistrict,
    departureLocal: outcome.extraction.departureLocal,
    askingPriceEur: outcome.extraction.askingPriceEur,
  };

  return handlePostLeg(ctx, session, msg, data, {
    source: 'voice',
    rawVoiceUrl: outcome.audioUrl,
    transcript: outcome.transcript,
    transcriptLang: outcome.transcriptLang,
    confidence: outcome.extraction.confidence,
  });
}

interface VoiceMeta {
  source: 'voice';
  rawVoiceUrl: string;
  transcript: string;
  transcriptLang: 'el' | 'en';
  confidence: number;
}

// --------------------------------------------------------------------------
// Session loading
// --------------------------------------------------------------------------

async function loadOrCreateSession(
  supabase: SupabaseClient,
  phoneE164: string,
): Promise<Session> {
  const existing = await supabase
    .from('whatsapp_sessions')
    .select('id, phone_e164, user_id, state, active_draft_id, last_locale, opt_in_at')
    .eq('phone_e164', phoneE164)
    .maybeSingle();

  if (existing.data) {
    // Best-effort link: if a verified driver now has this number, attach.
    if (!existing.data.user_id) {
      const linked = await linkToDriverByPhone(supabase, phoneE164);
      if (linked) {
        await supabase
          .from('whatsapp_sessions')
          .update({ user_id: linked.user_id, last_locale: linked.locale })
          .eq('id', existing.data.id);
        return { ...existing.data, user_id: linked.user_id, last_locale: linked.locale };
      }
    }
    return existing.data as Session;
  }

  const linked = await linkToDriverByPhone(supabase, phoneE164);
  const inserted = await supabase
    .from('whatsapp_sessions')
    .insert({
      phone_e164: phoneE164,
      state: 'awaiting_opt_in',
      user_id: linked?.user_id ?? null,
      last_locale: linked?.locale ?? 'el',
      last_message_at: new Date().toISOString(),
    })
    .select('id, phone_e164, user_id, state, active_draft_id, last_locale, opt_in_at')
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error(`failed to create whatsapp session: ${inserted.error?.message}`);
  }
  return inserted.data as Session;
}

interface LinkedDriver {
  user_id: string;
  locale: BotLocale;
}

async function linkToDriverByPhone(
  supabase: SupabaseClient,
  phoneE164: string,
): Promise<LinkedDriver | null> {
  // profiles.phone is free-text; normalise before comparison.
  // (Drivers may have "+357 99 123456" vs "+35799123456".)
  const { data } = await supabase
    .from('profiles')
    .select('id, phone, locale')
    .not('phone', 'is', null);

  if (!data) return null;
  const hit = data.find((p) => normalisePhone(p.phone) === phoneE164);
  if (!hit) return null;

  // Only link to *verified* drivers. Unverified users go through the normal
  // onboarding flow before they can post legs.
  const { data: verification } = await supabase
    .from('driver_verification')
    .select('verification_status')
    .eq('user_id', hit.id)
    .maybeSingle();

  if (!verification || verification.verification_status !== 'approved') return null;

  return {
    user_id: hit.id,
    locale: (hit.locale === 'en' ? 'en' : 'el') as BotLocale,
  };
}

function normalisePhone(raw: string | null): string {
  if (!raw) return '';
  return raw.replace(/\s+/g, '').replace(/[-()]/g, '');
}

// --------------------------------------------------------------------------
// State handlers
// --------------------------------------------------------------------------

async function handlePostLeg(
  ctx: HandlerContext,
  session: Session,
  msg: InboundMessage,
  data: PostLegData,
  voice?: VoiceMeta,
): Promise<string> {
  const locale = session.last_locale ?? 'el';

  if (!session.user_id) {
    return twiml(notVerifiedReply(locale));
  }

  if (data.departureLocal.hour < 0) {
    return twiml(missingTimeReply(locale));
  }

  const departure = resolveDeparture(data.departureLocal, ctx.now ?? new Date());

  const rate = await fetchMeterRate(ctx.supabase, data.originDistrict, data.destinationDistrict, departure);
  if (!rate) {
    await recordDraft(ctx.supabase, session.id, msg, data, null, 'no_meter_rate', voice);
    return twiml(noMeterRateReply(locale));
  }

  const pricingInput: PricingInput = {
    originDistrict: data.originDistrict,
    destinationDistrict: data.destinationDistrict,
    departure,
    now: ctx.now,
    hasPassenger: false,
  };
  let pricing: PricingOutput;
  try {
    pricing = computePricing(pricingInput, staticMeterLookup(rate));
  } catch (err) {
    if (err instanceof PricingError) {
      return twiml(noMeterRateReply(locale));
    }
    throw err;
  }

  // If the driver proposed a price, validate it *before* asking for
  // confirmation — pointless to let them ΝΑΙ a leg we would then refuse to
  // publish. If not proposed, fall back to the pricing engine's suggestion.
  let askingPriceEur = data.askingPriceEur ?? pricing.suggestedEur;

  if (data.askingPriceEur != null) {
    if (data.askingPriceEur > pricing.ceilingEur) {
      await recordDraft(ctx.supabase, session.id, msg, data, pricing, 'above_ceiling', voice);
      return twiml(priceAboveCeilingReply(data.askingPriceEur, pricing.ceilingEur, locale));
    }
    if (data.askingPriceEur < pricing.floorEur) {
      await recordDraft(ctx.supabase, session.id, msg, data, pricing, 'below_floor', voice);
      return twiml(priceBelowFloorReply(data.askingPriceEur, pricing.floorEur, locale));
    }
  } else {
    // No price → don't create a draft yet; prompt for one.
    return twiml(missingPriceReply(data, locale));
  }

  const draftId = await createDraft(ctx.supabase, session.id, msg, data, departure, pricing, askingPriceEur, voice);

  await supersedeOtherDraftsAndPromote(ctx.supabase, session.id, draftId);

  return twiml(
    confirmationPrompt(
      {
        data,
        departureIso: departure.toISOString(),
        regulatedMeterEur: pricing.regulatedMeterEur,
        ceilingEur: pricing.ceilingEur,
        floorEur: pricing.floorEur,
        askingPriceEur,
      },
      locale,
    ),
  );
}

async function handleConfirmationState(
  ctx: HandlerContext,
  session: Session,
  msg: InboundMessage,
  intent: ParsedIntent,
): Promise<string> {
  const locale = session.last_locale ?? 'el';

  // ΝΑΙ in this state = publish the active draft (parser returns opt_in for
  // all YES-like tokens; the FSM disambiguates).
  if (intent.kind === 'opt_in' || isConfirmWord(msg.body)) {
    if (!session.active_draft_id) {
      await demoteToIdle(ctx.supabase, session.id);
      return twiml(unknownReply(locale));
    }
    return publishDraft(ctx, session, session.active_draft_id);
  }

  if (intent.kind === 'reject') {
    if (session.active_draft_id) {
      await ctx.supabase
        .from('whatsapp_draft_legs')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', session.active_draft_id);
    }
    await demoteToIdle(ctx.supabase, session.id);
    return twiml(rejectedDraftReply(locale));
  }

  // Anything else while we're waiting: treat as a fresh post_leg attempt
  // (supersedes the pending draft) if it parses, otherwise re-prompt.
  if (intent.kind === 'post_leg') {
    return handlePostLeg(ctx, session, msg, intent.data);
  }

  return twiml(unknownReply(locale));
}

async function publishDraft(
  ctx: HandlerContext,
  session: Session,
  draftId: string,
): Promise<string> {
  const locale = session.last_locale ?? 'el';

  const { data: draft, error } = await ctx.supabase
    .from('whatsapp_draft_legs')
    .select('id, status, extracted_origin, extracted_destination, extracted_origin_district, extracted_destination_district, extracted_departure, extracted_asking_price_eur, pricing_meter_eur, pricing_floor_eur, pricing_ceiling_eur')
    .eq('id', draftId)
    .single();

  if (error || !draft || draft.status !== 'pending_confirmation') {
    await demoteToIdle(ctx.supabase, session.id);
    return twiml(errorReply(locale));
  }

  // Defensive: the DB CHECK (migration 009) also blocks this. Double-check
  // in app code so the user sees a sensible Greek message, not a 500.
  if (
    draft.extracted_asking_price_eur == null ||
    draft.pricing_ceiling_eur == null ||
    draft.pricing_floor_eur == null ||
    Number(draft.extracted_asking_price_eur) > Number(draft.pricing_ceiling_eur)
  ) {
    return twiml(
      priceAboveCeilingReply(
        Number(draft.extracted_asking_price_eur ?? 0),
        Number(draft.pricing_ceiling_eur ?? 0),
        locale,
      ),
    );
  }

  const discountPct =
    draft.pricing_meter_eur != null
      ? Number((((Number(draft.pricing_meter_eur) - Number(draft.extracted_asking_price_eur)) /
          Number(draft.pricing_meter_eur)) *
          100).toFixed(2))
      : null;

  const { data: inserted, error: insertError } = await ctx.supabase
    .from('empty_legs')
    .insert({
      seller_id: session.user_id,
      origin: draft.extracted_origin,
      destination: draft.extracted_destination,
      departure_datetime: draft.extracted_departure,
      asking_price: draft.extracted_asking_price_eur,
      currency: 'EUR',
      leg_type: 'standard',
      passenger_capacity: 4,
      luggage_capacity: 'medium',
      has_passenger: false,
      status: 'open',
      regulated_meter_reference_eur: draft.pricing_meter_eur,
      pricing_discount_pct: discountPct,
      pricing_floor_eur: draft.pricing_floor_eur,
      pricing_ceiling_eur: draft.pricing_ceiling_eur,
      notes: 'Δημοσιεύτηκε μέσω WhatsApp',
    })
    .select('id, asking_price')
    .single();

  if (insertError || !inserted) {
    return twiml(errorReply(locale));
  }

  await ctx.supabase
    .from('whatsapp_draft_legs')
    .update({
      status: 'confirmed',
      confirmed_leg_id: inserted.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', draftId);

  await demoteToIdle(ctx.supabase, session.id);

  return twiml(
    publishedReply(inserted.id, Number(inserted.asking_price), ctx.appUrl, locale),
  );
}

// --------------------------------------------------------------------------
// Persistence helpers
// --------------------------------------------------------------------------

async function respondOptOut(
  supabase: SupabaseClient,
  session: Session,
  msg: InboundMessage,
): Promise<string> {
  await supabase
    .from('whatsapp_sessions')
    .update({
      state: 'opted_out',
      opt_out_at: new Date().toISOString(),
      opt_out_message_sid: msg.twilioSid,
      active_draft_id: null,
    })
    .eq('id', session.id);
  return twiml(optedOutReply(session.last_locale ?? 'el'));
}

async function respondOptIn(
  supabase: SupabaseClient,
  session: Session,
  msg: InboundMessage,
): Promise<string> {
  await supabase
    .from('whatsapp_sessions')
    .update({
      state: 'idle',
      opt_in_at: new Date().toISOString(),
      opt_in_message_sid: msg.twilioSid,
      opt_out_at: null,
      opt_out_message_sid: null,
    })
    .eq('id', session.id);
  const locale = session.last_locale ?? 'el';
  return session.user_id
    ? twiml(optedInReply(locale))
    : twiml(notVerifiedReply(locale));
}

async function createDraft(
  supabase: SupabaseClient,
  sessionId: string,
  msg: InboundMessage,
  data: PostLegData,
  departure: Date,
  pricing: PricingOutput,
  askingPriceEur: number,
  voice?: VoiceMeta,
): Promise<string> {
  const { data: inserted, error } = await supabase
    .from('whatsapp_draft_legs')
    .insert({
      session_id: sessionId,
      source: voice ? 'voice' : 'text',
      raw_message_sid: msg.twilioSid,
      raw_body: msg.body,
      raw_voice_url: voice?.rawVoiceUrl ?? null,
      transcript: voice?.transcript ?? null,
      transcript_lang: voice?.transcriptLang ?? null,
      extracted_origin: data.originRaw,
      extracted_destination: data.destinationRaw,
      extracted_origin_district: data.originDistrict,
      extracted_destination_district: data.destinationDistrict,
      extracted_departure: departure.toISOString(),
      extracted_asking_price_eur: askingPriceEur,
      confidence: voice?.confidence ?? 0.9,
      pricing_meter_eur: pricing.regulatedMeterEur,
      pricing_floor_eur: pricing.floorEur,
      pricing_ceiling_eur: pricing.ceilingEur,
      status: 'pending_confirmation',
    })
    .select('id')
    .single();
  if (error || !inserted) throw new Error(`failed to create draft: ${error?.message}`);
  return inserted.id;
}

async function recordDraft(
  supabase: SupabaseClient,
  sessionId: string,
  msg: InboundMessage,
  data: PostLegData,
  pricing: PricingOutput | null,
  parseError: string,
  voice?: VoiceMeta,
): Promise<void> {
  await supabase.from('whatsapp_draft_legs').insert({
    session_id: sessionId,
    source: voice ? 'voice' : 'text',
    raw_message_sid: msg.twilioSid,
    raw_body: msg.body,
    raw_voice_url: voice?.rawVoiceUrl ?? null,
    transcript: voice?.transcript ?? null,
    transcript_lang: voice?.transcriptLang ?? null,
    extracted_origin: data.originRaw,
    extracted_destination: data.destinationRaw,
    extracted_origin_district: data.originDistrict,
    extracted_destination_district: data.destinationDistrict,
    extracted_asking_price_eur: data.askingPriceEur ?? null,
    confidence: voice?.confidence ?? null,
    pricing_meter_eur: pricing?.regulatedMeterEur ?? null,
    pricing_floor_eur: pricing?.floorEur ?? null,
    pricing_ceiling_eur: pricing?.ceilingEur ?? null,
    status: 'rejected',
    rejection_reason: parseError,
    resolved_at: new Date().toISOString(),
  });
}

async function supersedeOtherDraftsAndPromote(
  supabase: SupabaseClient,
  sessionId: string,
  draftId: string,
): Promise<void> {
  // Any prior pending draft for this session is superseded the moment a new
  // one is created.
  await supabase
    .from('whatsapp_draft_legs')
    .update({ status: 'superseded', resolved_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('status', 'pending_confirmation')
    .neq('id', draftId);

  await supabase
    .from('whatsapp_sessions')
    .update({ state: 'awaiting_confirmation', active_draft_id: draftId })
    .eq('id', sessionId);
}

async function demoteToIdle(supabase: SupabaseClient, sessionId: string): Promise<void> {
  await supabase
    .from('whatsapp_sessions')
    .update({ state: 'idle', active_draft_id: null })
    .eq('id', sessionId);
}

async function logMessage(
  supabase: SupabaseClient,
  sessionId: string,
  direction: 'inbound' | 'outbound',
  msg: InboundMessage,
): Promise<void> {
  await supabase.from('whatsapp_messages').insert({
    session_id: sessionId,
    direction,
    twilio_sid: msg.twilioSid,
    from_number: msg.fromE164,
    to_number: msg.toE164,
    body: msg.body,
    num_media: msg.media ? 1 : 0,
    media_urls: msg.media ? [msg.media.url] : null,
  });
}

// --------------------------------------------------------------------------
// Departure resolution (Cyprus local)
// --------------------------------------------------------------------------
// The parser returns a wall-clock departure (hour + minute + dayOffset). We
// need to turn that into an absolute instant. Interpreting a wall-clock time
// as "Cyprus local" is fiddly when the server is UTC, so we use Intl to read
// the Cyprus offset at that wall time and subtract it.

export function resolveDeparture(dep: DepartureLocal, now: Date): Date {
  // Start from the current Cyprus-local date, advance by dayOffset, slot
  // in the supplied hour/minute. If the resulting instant has already
  // passed for a driver who did not include a day token, bump forward 24h.
  const cyprusNowParts = cyprusDateParts(now);
  const year = cyprusNowParts.year;
  const month = cyprusNowParts.month;
  const day = cyprusNowParts.day + dep.dayOffset;
  const h = dep.hour;
  const m = dep.minute;

  // Build a provisional "Cyprus-local" Date using UTC and then correct for
  // the actual offset at that instant.
  const provisional = new Date(Date.UTC(year, month - 1, day, h, m, 0));
  const offsetMinutes = cyprusOffsetMinutes(provisional);
  const resolved = new Date(provisional.getTime() - offsetMinutes * 60_000);

  if (!dep.hadExplicitDate && resolved.getTime() < now.getTime()) {
    return new Date(resolved.getTime() + 24 * 3_600_000);
  }
  return resolved;
}

function cyprusDateParts(d: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Nicosia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function cyprusOffsetMinutes(d: Date): number {
  // Positive for east of UTC (+02:00 winter, +03:00 summer).
  const utc = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
    ),
  );
  const cyprus = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Nicosia' }));
  return Math.round((cyprus.getTime() - utc.getTime()) / 60_000);
}
