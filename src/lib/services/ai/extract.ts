// LLM extraction: Whisper transcript -> structured PostLegData.
//
// Spec §7 picks Claude (`claude-haiku-4-5-20251001`) as the primary model and
// OpenAI gpt-4o-mini as fallback. We do the primary; fallback is a future
// concern (separate commit once we see real failure rates).
//
// The prompt is in Greek with English gloss so the model doesn't reach for a
// mid-transcription translation. We ask for strict JSON. Anthropic's tool-use
// JSON mode would be tighter but adds a round-trip for small responses; we
// use plain content with a fence, parse defensively.
//
// What callers get:
//   - ExtractionResult on success (origin/destination districts + wall-clock
//     departure + optional price) — same shape PostLegData uses downstream.
//   - null when the model confidently said "no leg here" (e.g. a driver
//     saying "hi" or asking a question).
//   - throws on API / network / parse errors.

import type { LicenceDistrict } from '@/lib/constants/locations';

export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
export const ANTHROPIC_VERSION = '2023-06-01';

export interface ExtractionResult {
  originRaw: string;
  destinationRaw: string;
  originDistrict: LicenceDistrict;
  destinationDistrict: LicenceDistrict;
  /** Wall-clock Europe/Nicosia time; caller resolves to UTC instant. */
  departureLocal: {
    hour: number;
    minute: number;
    dayOffset: number;       // 0 = today, 1 = tomorrow, ...
    hadExplicitDate: boolean;
  };
  askingPriceEur?: number;
  /** Model's own confidence signal; crude but useful for cache eviction. */
  confidence: number;
}

export interface ExtractOptions {
  apiKey: string;
  transcript: string;
  /** Reference 'now' in Europe/Nicosia so dayOffset is relative to the right day. */
  nowIso: string;
  /** Injection point for tests. */
  fetchImpl?: typeof fetch;
}

export async function extractLegFromTranscript(
  opts: ExtractOptions,
): Promise<ExtractionResult | null> {
  const fetchFn = opts.fetchImpl ?? fetch;

  const system = buildSystemPrompt(opts.nowIso);
  const user = `Μεταγραφή: """${opts.transcript}"""\n\nΕπιστροφή JSON.`;

  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`claude_failed: ${res.status} ${text}`);
  }

  const payload = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (payload.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();

  if (!text) throw new Error('claude_empty_response');

  const json = parseJsonBlock(text);
  if (!json) throw new Error(`claude_unparseable: ${text.slice(0, 200)}`);

  if (json.no_leg === true) return null;

  return coerce(json);
}

// --------------------------------------------------------------------------
// Prompt
// --------------------------------------------------------------------------

function buildSystemPrompt(nowIso: string): string {
  return [
    'Είσαι βοηθός για Κύπριους οδηγούς ταξί που καταγράφουν άδεια σκέλη (empty legs).',
    'Ο οδηγός στέλνει φωνητικό μήνυμα στα ελληνικά ή ελληνογαλλικά (Greeklish).',
    'Η εργασία σου είναι να εξάγεις διαδρομή + ώρα + προαιρετικά τιμή.',
    '',
    `Τρέχουσα ώρα αναφοράς (Europe/Nicosia): ${nowIso}`,
    '',
    'ΕΠΙΤΡΕΠΤΕΣ ΠΕΡΙΦΕΡΕΙΕΣ: "nicosia", "limassol", "larnaca", "paphos", "famagusta".',
    'Μικρότερες πόλεις αντιστοιχούν: Αγία Νάπα/Πρωταράς/Παραλίμνι -> famagusta · ' +
      'Πάφος/LCA-Πάφος -> paphos · Λάρνακα/LCA -> larnaca · Λεμεσός -> limassol · Λευκωσία -> nicosia.',
    '',
    'Επιστροφή ΑΠΟΚΛΕΙΣΤΙΚΑ JSON object χωρίς κώδικα markdown. Ένα από:',
    '',
    '{ "no_leg": true, "reason": "<γιατί>" }',
    '',
    'ή:',
    '',
    '{',
    '  "originRaw": "Λάρνακα",',
    '  "destinationRaw": "Λεμεσός",',
    '  "originDistrict": "larnaca",',
    '  "destinationDistrict": "limassol",',
    '  "departureLocal": {',
    '    "hour": 18, "minute": 30,',
    '    "dayOffset": 0,',
    '    "hadExplicitDate": true',
    '  },',
    '  "askingPriceEur": 25,',
    '  "confidence": 0.9',
    '}',
    '',
    'Κανόνες:',
    '- Αν ο οδηγός δεν αναφέρει ημέρα, βάλε dayOffset=0 και hadExplicitDate=false.',
    '- "σήμερα"=0, "αύριο"=1, "μεθαύριο"=2. Όλα hadExplicitDate=true.',
    '- Αν η ώρα λείπει ολοκληρωτικά, επέστρεψε no_leg.',
    '- Αν η τιμή λείπει, παράλειψε το πεδίο askingPriceEur.',
    '- hour/minute σε 24ωρη μορφή, Europe/Nicosia.',
    '- Μην εφευρίσκεις περιφέρειες που δεν αναφέρονται.',
  ].join('\n');
}

// --------------------------------------------------------------------------
// Parsing
// --------------------------------------------------------------------------

function parseJsonBlock(text: string): Record<string, unknown> | null {
  // Strip fences if the model wrapped with them despite our instruction.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  try {
    const parsed = JSON.parse(candidate);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const ALLOWED_DISTRICTS: ReadonlySet<LicenceDistrict> = new Set<LicenceDistrict>([
  'nicosia', 'limassol', 'larnaca', 'paphos', 'famagusta',
]);

function coerce(raw: Record<string, unknown>): ExtractionResult {
  const originDistrict = raw.originDistrict;
  const destinationDistrict = raw.destinationDistrict;
  if (
    typeof originDistrict !== 'string' ||
    typeof destinationDistrict !== 'string' ||
    !ALLOWED_DISTRICTS.has(originDistrict as LicenceDistrict) ||
    !ALLOWED_DISTRICTS.has(destinationDistrict as LicenceDistrict)
  ) {
    throw new Error(`claude_bad_districts: ${originDistrict} -> ${destinationDistrict}`);
  }

  const dep = raw.departureLocal as Record<string, unknown> | undefined;
  if (!dep || typeof dep.hour !== 'number' || typeof dep.minute !== 'number') {
    throw new Error('claude_bad_departure');
  }
  const hour = Math.trunc(dep.hour);
  const minute = Math.trunc(dep.minute);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`claude_bad_departure_range: ${hour}:${minute}`);
  }

  const dayOffset = typeof dep.dayOffset === 'number' ? Math.trunc(dep.dayOffset) : 0;

  const price = raw.askingPriceEur;
  const askingPriceEur =
    typeof price === 'number' && price > 0 && price < 10_000 ? round2(price) : undefined;

  const confidenceRaw = raw.confidence;
  const confidence =
    typeof confidenceRaw === 'number' && confidenceRaw >= 0 && confidenceRaw <= 1
      ? confidenceRaw
      : 0.7;

  return {
    originRaw: typeof raw.originRaw === 'string' ? raw.originRaw : originDistrict,
    destinationRaw: typeof raw.destinationRaw === 'string' ? raw.destinationRaw : destinationDistrict,
    originDistrict: originDistrict as LicenceDistrict,
    destinationDistrict: destinationDistrict as LicenceDistrict,
    departureLocal: {
      hour,
      minute,
      dayOffset,
      hadExplicitDate: dep.hadExplicitDate === true,
    },
    askingPriceEur,
    confidence,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}
