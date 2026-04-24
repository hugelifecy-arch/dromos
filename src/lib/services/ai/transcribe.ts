// Whisper transcription wrapper (spec §7).
//
// OpenAI Whisper `whisper-1` endpoint, called directly via fetch to avoid
// pulling the OpenAI npm package for a single multipart POST. Bias toward
// Greek (`language='el'`) because the target demographic (spec §5) is
// 50+ Greek-Cypriot drivers — Whisper's auto-detect occasionally mis-tags
// short utterances as Turkish or Bulgarian when a driver speaks quickly.
//
// The function is a thin wrapper: no retries, no caching. Caching is the
// caller's job (ai_extractions table).

export const WHISPER_MODEL = 'whisper-1';

export interface TranscriptionResult {
  transcript: string;
  lang: 'el' | 'en';
  durationMs: number;
}

export interface TranscribeOptions {
  apiKey: string;
  audio: Uint8Array;
  /** MIME type of the audio payload, e.g. 'audio/ogg'. */
  contentType: string;
  /** ISO-639-1 hint; Whisper uses it to bias decoding. */
  language?: 'el' | 'en';
  /** File extension for the multipart filename — Whisper requires one it recognises. */
  fileExt?: string;
  /** Injection point for tests. */
  fetchImpl?: typeof fetch;
}

export async function transcribeAudio(opts: TranscribeOptions): Promise<TranscriptionResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const language = opts.language ?? 'el';
  const ext = opts.fileExt ?? extFromContentType(opts.contentType);

  const form = new FormData();
  form.append('model', WHISPER_MODEL);
  form.append('language', language);
  // Copy into a fresh ArrayBuffer-backed view so TS' narrowed Uint8Array
  // signature accepts it as a BlobPart (node 22 types treat shared buffers
  // as incompatible with Blob).
  const audioBuffer = new ArrayBuffer(opts.audio.byteLength);
  new Uint8Array(audioBuffer).set(opts.audio);
  form.append(
    'file',
    new Blob([audioBuffer], { type: opts.contentType }),
    `audio.${ext}`,
  );

  const started = Date.now();
  const res = await fetchFn('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
  });
  const durationMs = Date.now() - started;

  if (!res.ok) {
    const bodyText = await safeText(res);
    throw new Error(`whisper_failed: ${res.status} ${bodyText}`);
  }

  const payload = (await res.json()) as { text?: string };
  const transcript = (payload.text ?? '').trim();
  if (!transcript) throw new Error('whisper_empty_transcript');

  return { transcript, lang: language, durationMs };
}

function extFromContentType(ct: string): string {
  // Twilio delivers WhatsApp voice as audio/ogg (Opus). Cover the realistic
  // set; Whisper accepts at least mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg.
  if (ct.includes('ogg')) return 'ogg';
  if (ct.includes('mpeg')) return 'mp3';
  if (ct.includes('mp4')) return 'm4a';
  if (ct.includes('wav')) return 'wav';
  if (ct.includes('webm')) return 'webm';
  return 'ogg';
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}
