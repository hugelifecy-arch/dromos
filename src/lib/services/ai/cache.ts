// ai_extractions cache read/write (spec §7).
//
// Cache key is (audio_sha256, model_version). A "hit" returns both the
// transcript and the structured extraction; callers use the extraction
// directly and don't need to re-run Whisper or Claude.
//
// We do NOT cache by user or phone — the point of content-addressing is that
// a Larnaca -> Limassol 18:30 voice note is the same bytes regardless of who
// sent it, and recurring drivers benefit immediately.
//
// Model-version string convention: "<transcribe_model>+<extract_model>".
// Bump whenever the Whisper model, the Claude model, or the prompt changes
// — old rows become obsolete naturally without a migration.

import type { SupabaseClient } from '@supabase/supabase-js';

import { WHISPER_MODEL } from './transcribe';
import { CLAUDE_MODEL, type ExtractionResult } from './extract';

export function aiModelVersion(): string {
  return `${WHISPER_MODEL}+${CLAUDE_MODEL}`;
}

export interface AiCacheHit {
  transcript: string | null;
  transcriptLang: 'el' | 'en' | null;
  extraction: ExtractionResult | null;
  extractionError: string | null;
}

export async function loadCachedExtraction(
  supabase: SupabaseClient,
  audioSha256: string,
  modelVersion: string,
): Promise<AiCacheHit | null> {
  const { data, error } = await supabase
    .from('ai_extractions')
    .select('transcript, transcript_lang, extraction, extraction_error')
    .eq('audio_sha256', audioSha256)
    .eq('model_version', modelVersion)
    .maybeSingle();

  if (error || !data) return null;
  return {
    transcript: data.transcript ?? null,
    transcriptLang: (data.transcript_lang as 'el' | 'en' | null) ?? null,
    extraction: (data.extraction as ExtractionResult | null) ?? null,
    extractionError: data.extraction_error ?? null,
  };
}

export async function saveExtractionResult(
  supabase: SupabaseClient,
  row: {
    audioSha256: string;
    modelVersion: string;
    transcript: string | null;
    transcriptLang: 'el' | 'en' | null;
    extraction: ExtractionResult | null;
    extractionError: string | null;
    transcriptionMs: number | null;
    extractionMs: number | null;
  },
): Promise<void> {
  // upsert-with-ignore semantics: a parallel request may have beaten us to
  // the insert; that's fine, the other row is the canonical cached copy.
  await supabase.from('ai_extractions').upsert(
    {
      audio_sha256: row.audioSha256,
      model_version: row.modelVersion,
      transcript: row.transcript,
      transcript_lang: row.transcriptLang,
      extraction: row.extraction,
      extraction_error: row.extractionError,
      transcription_ms: row.transcriptionMs,
      extraction_ms: row.extractionMs,
    },
    { onConflict: 'audio_sha256,model_version', ignoreDuplicates: true },
  );
}
