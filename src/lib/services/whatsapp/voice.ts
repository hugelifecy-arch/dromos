// WhatsApp voice-note pipeline (Sprint 12).
//
//   Twilio media URL
//     → downloadTwilioMedia (Basic Auth)
//     → sha256 hash
//     → cache lookup on ai_extractions (audio_sha256, model_version)
//     → [miss] transcribeAudio (Whisper)
//     → [miss] extractLegFromTranscript (Claude Haiku)
//     → cache insert
//     → return { transcript, lang, extraction } for the main handler
//
// The main handler (handleInbound) calls us ONLY when Twilio delivered an
// inbound message with audio media. We hand back a result that looks enough
// like the text parser's post_leg intent that the existing handlePostLeg
// flow works unchanged — that was the whole point of Sprint 11 punching the
// voice columns into the schema already.
//
// Gating: WHATSAPP_VOICE_ENABLED=true AND OPENAI_API_KEY AND ANTHROPIC_API_KEY.
// If any are missing we return a 'disabled' result so the handler can send
// a polite "text me instead" reply rather than silently swallowing the
// voice note.

import type { SupabaseClient } from '@supabase/supabase-js';

import { downloadTwilioMedia } from './media';
import { transcribeAudio } from '@/lib/services/ai/transcribe';
import { extractLegFromTranscript, type ExtractionResult } from '@/lib/services/ai/extract';
import { aiModelVersion, loadCachedExtraction, saveExtractionResult } from '@/lib/services/ai/cache';

export type VoiceOutcome =
  | { kind: 'disabled'; reason: 'flag_off' | 'missing_keys' | 'missing_twilio_creds' }
  | { kind: 'transcription_failed'; error: string }
  | { kind: 'extraction_failed'; transcript: string; transcriptLang: 'el' | 'en'; error: string }
  | {
      kind: 'extracted';
      transcript: string;
      transcriptLang: 'el' | 'en';
      audioUrl: string;
      extraction: ExtractionResult;
    };

export interface ProcessVoiceOptions {
  supabase: SupabaseClient;
  mediaUrl: string;
  mediaContentType: string;
  nowIso: string;
  env?: VoiceEnv;
  /** Injection for tests. */
  fetchImpl?: typeof fetch;
}

export interface VoiceEnv {
  voiceEnabled: boolean;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
}

export function readVoiceEnv(): VoiceEnv {
  return {
    voiceEnabled: process.env.WHATSAPP_VOICE_ENABLED === 'true',
    openaiApiKey: process.env.OPENAI_API_KEY || null,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || null,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || null,
  };
}

export async function processVoiceMessage(
  opts: ProcessVoiceOptions,
): Promise<VoiceOutcome> {
  const env = opts.env ?? readVoiceEnv();
  if (!env.voiceEnabled) return { kind: 'disabled', reason: 'flag_off' };
  if (!env.openaiApiKey || !env.anthropicApiKey) {
    return { kind: 'disabled', reason: 'missing_keys' };
  }
  if (!env.twilioAccountSid || !env.twilioAuthToken) {
    return { kind: 'disabled', reason: 'missing_twilio_creds' };
  }

  // 1. Download the audio so we can hash it. Cache is content-addressed.
  let audio;
  try {
    audio = await downloadTwilioMedia({
      url: opts.mediaUrl,
      accountSid: env.twilioAccountSid,
      authToken: env.twilioAuthToken,
      fetchImpl: opts.fetchImpl,
    });
  } catch (err) {
    return { kind: 'transcription_failed', error: errMsg(err) };
  }

  const modelVersion = aiModelVersion();

  // 2. Cache lookup. Both hits and "cached failure" paths short-circuit.
  const cached = await loadCachedExtraction(opts.supabase, audio.sha256, modelVersion);
  if (cached && cached.transcript && cached.extraction) {
    return {
      kind: 'extracted',
      transcript: cached.transcript,
      transcriptLang: cached.transcriptLang ?? 'el',
      audioUrl: opts.mediaUrl,
      extraction: cached.extraction,
    };
  }
  if (cached && cached.transcript && cached.extractionError) {
    return {
      kind: 'extraction_failed',
      transcript: cached.transcript,
      transcriptLang: cached.transcriptLang ?? 'el',
      error: cached.extractionError,
    };
  }

  // 3. Transcribe.
  let transcription;
  try {
    transcription = await transcribeAudio({
      apiKey: env.openaiApiKey,
      audio: audio.bytes,
      contentType: audio.contentType,
      language: 'el',
      fetchImpl: opts.fetchImpl,
    });
  } catch (err) {
    return { kind: 'transcription_failed', error: errMsg(err) };
  }

  // 4. Extract structured leg.
  let extraction: ExtractionResult | null = null;
  let extractionError: string | null = null;
  const extractStarted = Date.now();
  try {
    extraction = await extractLegFromTranscript({
      apiKey: env.anthropicApiKey,
      transcript: transcription.transcript,
      nowIso: opts.nowIso,
      fetchImpl: opts.fetchImpl,
    });
  } catch (err) {
    extractionError = errMsg(err);
  }
  const extractionMs = Date.now() - extractStarted;

  // 5. Cache every outcome — success, "no leg" (null), or error. Caching
  // the null/error cases prevents burn from a driver re-sending the same
  // "hi, how's the weather" audio.
  await saveExtractionResult(opts.supabase, {
    audioSha256: audio.sha256,
    modelVersion,
    transcript: transcription.transcript,
    transcriptLang: transcription.lang,
    extraction,
    extractionError: extraction === null && !extractionError ? 'no_leg' : extractionError,
    transcriptionMs: transcription.durationMs,
    extractionMs,
  });

  if (extractionError) {
    return {
      kind: 'extraction_failed',
      transcript: transcription.transcript,
      transcriptLang: transcription.lang,
      error: extractionError,
    };
  }

  if (!extraction) {
    return {
      kind: 'extraction_failed',
      transcript: transcription.transcript,
      transcriptLang: transcription.lang,
      error: 'no_leg',
    };
  }

  return {
    kind: 'extracted',
    transcript: transcription.transcript,
    transcriptLang: transcription.lang,
    audioUrl: opts.mediaUrl,
    extraction,
  };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
