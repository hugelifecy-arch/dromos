// Self-checking tests for the voice-note pipeline.
//
// Tests the orchestration — cache short-circuit, disabled paths, full miss
// calling Whisper + Claude in order — with a minimal in-memory Supabase
// stand-in and a scripted fetch.

import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import { processVoiceMessage, type VoiceEnv } from './voice';
import type { ExtractionResult } from '@/lib/services/ai/extract';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => Promise<void>, results: TestResult[]): Promise<void> {
  return fn()
    .then(() => { results.push({ name, passed: true }); })
    .catch((err) => { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); });
}

// --------------------------------------------------------------------------
// Fake Supabase — only the two query shapes used by cache.ts.
// --------------------------------------------------------------------------

function fakeSupabase(opts: {
  cached?: {
    transcript: string | null;
    transcript_lang: 'el' | 'en' | null;
    extraction: ExtractionResult | null;
    extraction_error: string | null;
  };
  onUpsert?: (row: Record<string, unknown>) => void;
} = {}): SupabaseClient {
  const select = () => ({
    eq: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: opts.cached ?? null, error: null }),
      }),
    }),
  });
  const upsert = async (row: Record<string, unknown>) => {
    opts.onUpsert?.(row);
    return { data: null, error: null };
  };
  const table = { select, upsert };
  return {
    from: () => table,
  } as unknown as SupabaseClient;
}

// --------------------------------------------------------------------------
// Scripted fetch that responds based on URL
// --------------------------------------------------------------------------

type Handler = (url: string, init: RequestInit) => { body: unknown; status?: number; contentType?: string; raw?: Uint8Array };

function scriptFetch(handlers: Record<string, Handler>): typeof fetch {
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const handler = Object.entries(handlers).find(([pattern]) => url.includes(pattern))?.[1];
    if (!handler) throw new Error(`no fake handler for ${url}`);
    const { body, status = 200, contentType = 'application/json', raw } = handler(url, init ?? {});
    if (raw) {
      return new Response(raw, { status, headers: { 'content-type': contentType } });
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': contentType },
    });
  };
  return impl as unknown as typeof fetch;
}

const VALID_EXTRACTION: ExtractionResult = {
  originRaw: 'Λάρνακα',
  destinationRaw: 'Λεμεσός',
  originDistrict: 'larnaca',
  destinationDistrict: 'limassol',
  departureLocal: { hour: 18, minute: 30, dayOffset: 0, hadExplicitDate: true },
  askingPriceEur: 25,
  confidence: 0.9,
};

function env(overrides: Partial<VoiceEnv> = {}): VoiceEnv {
  return {
    voiceEnabled: true,
    openaiApiKey: 'sk-openai',
    anthropicApiKey: 'sk-ant',
    twilioAccountSid: 'ACtest',
    twilioAuthToken: 'tok',
    ...overrides,
  };
}

export async function runVoiceTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  await runCase('disabled when WHATSAPP_VOICE_ENABLED=false', async () => {
    const outcome = await processVoiceMessage({
      supabase: fakeSupabase(),
      mediaUrl: 'https://api.twilio.com/foo',
      mediaContentType: 'audio/ogg',
      nowIso: '2026-04-24T10:00:00+03:00',
      env: env({ voiceEnabled: false }),
    });
    assert.equal(outcome.kind, 'disabled');
    if (outcome.kind === 'disabled') assert.equal(outcome.reason, 'flag_off');
  }, results);

  await runCase('disabled when AI keys are missing', async () => {
    const outcome = await processVoiceMessage({
      supabase: fakeSupabase(),
      mediaUrl: 'https://api.twilio.com/foo',
      mediaContentType: 'audio/ogg',
      nowIso: '2026-04-24T10:00:00+03:00',
      env: env({ openaiApiKey: null }),
    });
    assert.equal(outcome.kind, 'disabled');
    if (outcome.kind === 'disabled') assert.equal(outcome.reason, 'missing_keys');
  }, results);

  await runCase('disabled when Twilio creds are missing', async () => {
    const outcome = await processVoiceMessage({
      supabase: fakeSupabase(),
      mediaUrl: 'https://api.twilio.com/foo',
      mediaContentType: 'audio/ogg',
      nowIso: '2026-04-24T10:00:00+03:00',
      env: env({ twilioAuthToken: null }),
    });
    assert.equal(outcome.kind, 'disabled');
    if (outcome.kind === 'disabled') assert.equal(outcome.reason, 'missing_twilio_creds');
  }, results);

  await runCase('cache hit short-circuits Whisper + Claude', async () => {
    // Scripted fetch that ONLY answers the Twilio download. If Whisper or
    // Claude get called, they will throw.
    const fetchImpl = scriptFetch({
      'api.twilio.com': () => ({ raw: new Uint8Array([1, 2, 3, 4]), contentType: 'audio/ogg' }),
    });
    const outcome = await processVoiceMessage({
      supabase: fakeSupabase({
        cached: {
          transcript: 'Λάρνακα Λεμεσό στις έξι και μισή',
          transcript_lang: 'el',
          extraction: VALID_EXTRACTION,
          extraction_error: null,
        },
      }),
      mediaUrl: 'https://api.twilio.com/audio',
      mediaContentType: 'audio/ogg',
      nowIso: '2026-04-24T10:00:00+03:00',
      env: env(),
      fetchImpl,
    });
    assert.equal(outcome.kind, 'extracted');
    if (outcome.kind === 'extracted') {
      assert.equal(outcome.extraction.originDistrict, 'larnaca');
      assert.equal(outcome.extraction.destinationDistrict, 'limassol');
    }
  }, results);

  await runCase('full miss: downloads -> Whisper -> Claude -> caches', async () => {
    let upserted: Record<string, unknown> | null = null;
    const extractionJson = JSON.stringify({
      originRaw: 'Λάρνακα',
      destinationRaw: 'Λεμεσός',
      originDistrict: 'larnaca',
      destinationDistrict: 'limassol',
      departureLocal: { hour: 18, minute: 30, dayOffset: 0, hadExplicitDate: true },
      askingPriceEur: 25,
      confidence: 0.9,
    });
    const fetchImpl = scriptFetch({
      'api.twilio.com': () => ({ raw: new Uint8Array([9, 9, 9]), contentType: 'audio/ogg' }),
      'api.openai.com': () => ({ body: { text: 'Λάρνακα Λεμεσό στις έξι και μισή είκοσι πέντε' } }),
      'api.anthropic.com': () => ({
        body: { content: [{ type: 'text', text: extractionJson }] },
      }),
    });
    const outcome = await processVoiceMessage({
      supabase: fakeSupabase({
        onUpsert: (row) => { upserted = row; },
      }),
      mediaUrl: 'https://api.twilio.com/audio',
      mediaContentType: 'audio/ogg',
      nowIso: '2026-04-24T10:00:00+03:00',
      env: env(),
      fetchImpl,
    });
    assert.equal(outcome.kind, 'extracted');
    if (outcome.kind === 'extracted') {
      assert.equal(outcome.transcript, 'Λάρνακα Λεμεσό στις έξι και μισή είκοσι πέντε');
      assert.equal(outcome.extraction.askingPriceEur, 25);
    }
    assert.ok(upserted, 'upsert should have been called');
    if (upserted) {
      const row = upserted as Record<string, unknown>;
      assert.ok(typeof row.audio_sha256 === 'string' && (row.audio_sha256 as string).length === 64);
      assert.ok(row.extraction != null);
    }
  }, results);

  await runCase('transcription failure surfaces as transcription_failed', async () => {
    const fetchImpl = scriptFetch({
      'api.twilio.com': () => ({ raw: new Uint8Array([1]), contentType: 'audio/ogg' }),
      'api.openai.com': () => ({ body: { error: 'boom' }, status: 500 }),
    });
    const outcome = await processVoiceMessage({
      supabase: fakeSupabase(),
      mediaUrl: 'https://api.twilio.com/audio',
      mediaContentType: 'audio/ogg',
      nowIso: '2026-04-24T10:00:00+03:00',
      env: env(),
      fetchImpl,
    });
    assert.equal(outcome.kind, 'transcription_failed');
  }, results);

  await runCase('extraction "no_leg" surfaces as extraction_failed with transcript', async () => {
    const fetchImpl = scriptFetch({
      'api.twilio.com': () => ({ raw: new Uint8Array([2]), contentType: 'audio/ogg' }),
      'api.openai.com': () => ({ body: { text: 'γεια σας καλημέρα' } }),
      'api.anthropic.com': () => ({
        body: { content: [{ type: 'text', text: JSON.stringify({ no_leg: true, reason: 'greeting' }) }] },
      }),
    });
    const outcome = await processVoiceMessage({
      supabase: fakeSupabase(),
      mediaUrl: 'https://api.twilio.com/audio',
      mediaContentType: 'audio/ogg',
      nowIso: '2026-04-24T10:00:00+03:00',
      env: env(),
      fetchImpl,
    });
    assert.equal(outcome.kind, 'extraction_failed');
    if (outcome.kind === 'extraction_failed') {
      assert.equal(outcome.transcript, 'γεια σας καλημέρα');
      assert.equal(outcome.error, 'no_leg');
    }
  }, results);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}

const isDirectRun =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  // @ts-ignore
  require.main === module;

if (isDirectRun) {
  runVoiceTests().then(({ passed, failed, results }) => {
    for (const r of results) {
      const mark = r.passed ? 'OK  ' : 'FAIL';
      // eslint-disable-next-line no-console
      console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
    }
    // eslint-disable-next-line no-console
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  });
}
