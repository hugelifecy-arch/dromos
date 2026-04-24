// WhatsApp bot — text intent parser (Sprint 11).
//
// Pure function. Takes a raw inbound message body and returns a structured
// intent. No DB access, no network — fixtures in parser.test.ts exercise the
// Greek and English phrasings a driver is realistically going to type on a
// 6-year-old Android keyboard (see spec §5 on the target demographic).
//
// Intents:
//   - opt_in      : driver granting consent ("ΝΑΙ", "YES", "ΟΚ")
//   - opt_out     : STOP / ΔΙΑΓΡΑΦΗ — also required for WhatsApp policy
//   - confirm     : ΝΑΙ in the awaiting_confirmation state
//   - reject      : ΟΧΙ / NO
//   - post_leg    : the "Λάρνακα → Λεμεσός 18:30 €25" listing form
//   - help        : "βοήθεια" / "help" / "?"
//   - unknown     : catch-all; bot replies with a usage hint
//
// The parser is deliberately tolerant. Drivers drop accents, skip the "€",
// use different arrow characters, mix Greek and English. We accept all of it
// and only fall back to 'unknown' when we can't find both an origin and a
// destination.

import type { LicenceDistrict } from '@/lib/constants/locations';

// --------------------------------------------------------------------------
// Intent types
// --------------------------------------------------------------------------

// Note: we deliberately do NOT emit a 'confirm' kind. ΝΑΙ is ambiguous —
// it means "opt in" before consent, "publish this draft" after. The handler
// decides from session state. Parser returns 'opt_in' in both cases.
export type ParsedIntent =
  | { kind: 'opt_in' }
  | { kind: 'opt_out' }
  | { kind: 'reject' }
  | { kind: 'help' }
  | { kind: 'post_leg'; data: PostLegData; confidence: number }
  | { kind: 'unknown'; raw: string };

export interface PostLegData {
  originRaw: string;
  destinationRaw: string;
  originDistrict: LicenceDistrict;
  destinationDistrict: LicenceDistrict;
  /**
   * Local (Europe/Nicosia) departure time expressed as ISO without offset
   * when only the clock time was provided; caller resolves to an absolute
   * Date. Present as absolute UTC ISO when a date was explicit.
   */
  departureLocal: DepartureLocal;
  askingPriceEur?: number;
}

export interface DepartureLocal {
  hour: number;        // 0-23
  minute: number;      // 0-59
  dayOffset: number;   // 0 = today, 1 = tomorrow; caller applies in Cyprus TZ
  hadExplicitDate: boolean;
}

// --------------------------------------------------------------------------
// City / district lexicon
// --------------------------------------------------------------------------
// Keys are normalised (lowercase, accents stripped) so the matcher is
// accent-insensitive. Value is the LicenceDistrict the city belongs to —
// which is what the pricing engine needs, so we resolve to districts
// directly rather than free-form city strings.

interface CityEntry {
  /** Canonical display form (Greek) restored into origin_raw / destination_raw. */
  display: string;
  district: LicenceDistrict;
}

// Keys are *normalised* — lowercase, accents stripped, matching the output of
// normaliseText(). That is how we stay accent-insensitive without a separate
// transliteration pass. Both Greek-script and Latin-script forms are included
// because the same driver will type "Λάρνακα" one day and "larnaka" the next.
const CITY_LEXICON: Record<string, CityEntry> = {
  // Larnaca
  'λαρνακα': { display: 'Λάρνακα', district: 'larnaca' },
  'larnaka': { display: 'Λάρνακα', district: 'larnaca' },
  'larnaca': { display: 'Λάρνακα', district: 'larnaca' },
  'lca': { display: 'Λάρνακα (LCA)', district: 'larnaca' },
  // Limassol
  'λεμεσος': { display: 'Λεμεσός', district: 'limassol' },
  'lemesos': { display: 'Λεμεσός', district: 'limassol' },
  'limassol': { display: 'Λεμεσός', district: 'limassol' },
  // Nicosia
  'λευκωσια': { display: 'Λευκωσία', district: 'nicosia' },
  'leukosia': { display: 'Λευκωσία', district: 'nicosia' },
  'lefkosia': { display: 'Λευκωσία', district: 'nicosia' },
  'nicosia': { display: 'Λευκωσία', district: 'nicosia' },
  // Paphos
  'παφος': { display: 'Πάφος', district: 'paphos' },
  'pafos': { display: 'Πάφος', district: 'paphos' },
  'paphos': { display: 'Πάφος', district: 'paphos' },
  'pfo': { display: 'Πάφος (PFO)', district: 'paphos' },
  // Famagusta / Ayia Napa area — licence district is famagusta
  'αμμοχωστος': { display: 'Αμμόχωστος', district: 'famagusta' },
  'ammochostos': { display: 'Αμμόχωστος', district: 'famagusta' },
  'famagusta': { display: 'Αμμόχωστος', district: 'famagusta' },
  'αγια ναπα': { display: 'Αγία Νάπα', district: 'famagusta' },
  'agia napa': { display: 'Αγία Νάπα', district: 'famagusta' },
  'ayia napa': { display: 'Αγία Νάπα', district: 'famagusta' },
  'ναπα': { display: 'Αγία Νάπα', district: 'famagusta' },
  'napa': { display: 'Αγία Νάπα', district: 'famagusta' },
  'παραλιμνι': { display: 'Παραλίμνι', district: 'famagusta' },
  'paralimni': { display: 'Παραλίμνι', district: 'famagusta' },
  'πρωταρας': { display: 'Πρωταράς', district: 'famagusta' },
  'protaras': { display: 'Πρωταράς', district: 'famagusta' },
};

// Ordered by length desc so "agia napa" is matched before "napa".
const CITY_KEYS_BY_LENGTH = Object.keys(CITY_LEXICON).sort(
  (a, b) => b.length - a.length,
);

// --------------------------------------------------------------------------
// Keyword tables for single-word intents
// --------------------------------------------------------------------------

const OPT_IN_WORDS = new Set([
  'nai', 'ναι', 'nе', 'ne', 'yes', 'y', 'ok', 'οκ', 'συμφωνω', 'symfwnw', 'συμφωνώ',
]);

const OPT_OUT_WORDS = new Set([
  'stop', 'σταματα', 'σταμάτα', 'διαγραφη', 'διαγραφή', 'diagrafi',
  'unsubscribe', 'απεγγραφη', 'απεγγραφή',
]);

const REJECT_WORDS = new Set([
  'oxi', 'οχι', 'όχι', 'no', 'n', 'ακυρο', 'άκυρο', 'akyro',
]);

const HELP_WORDS = new Set([
  'help', '?', 'βοηθεια', 'βοήθεια', 'voithia', 'voitheia', 'menu', 'μενου', 'μενού',
]);

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

export function parseMessage(rawBody: string): ParsedIntent {
  const body = (rawBody ?? '').trim();
  if (!body) return { kind: 'unknown', raw: rawBody ?? '' };

  const normalised = normaliseText(body);

  // Single-word intents take precedence: "ΝΑΙ" on its own is always confirm /
  // opt-in, regardless of how the caller interprets session state. The
  // handler decides which (confirm vs opt_in) from the FSM.
  if (OPT_OUT_WORDS.has(normalised)) return { kind: 'opt_out' };
  if (HELP_WORDS.has(normalised)) return { kind: 'help' };
  if (OPT_IN_WORDS.has(normalised)) return { kind: 'opt_in' };
  if (REJECT_WORDS.has(normalised)) return { kind: 'reject' };

  // Otherwise try to parse as a post-leg listing.
  const leg = tryParseLeg(body, normalised);
  if (leg) return leg;

  return { kind: 'unknown', raw: body };
}

// Confirm vs opt_in disambiguation: the handler calls this when it is in
// awaiting_confirmation state and has already classified a message as
// OPT_IN-like.
export function isConfirmWord(rawBody: string): boolean {
  return OPT_IN_WORDS.has(normaliseText((rawBody ?? '').trim()));
}

// --------------------------------------------------------------------------
// Leg parsing
// --------------------------------------------------------------------------

function tryParseLeg(original: string, normalised: string): ParsedIntent | null {
  // Strategy: find cities, time, and price independently, then require at
  // least an origin + destination. Everything else is optional.

  const cities = findCities(normalised);
  if (cities.length < 2) return null;

  // Use the first two occurrences as origin / destination, in message order.
  const [origin, destination] = cities;
  if (origin.district === destination.district) return null;

  const departure = findDeparture(normalised);
  const price = findPrice(original);

  // Confidence is a crude heuristic: base 0.6 for both cities matched, bumps
  // for time and price. LLM extraction in S12 will replace this.
  let confidence = 0.6;
  if (departure) confidence += 0.2;
  if (price != null) confidence += 0.2;

  if (!departure) {
    return {
      kind: 'post_leg',
      confidence,
      data: {
        originRaw: origin.entry.display,
        destinationRaw: destination.entry.display,
        originDistrict: origin.entry.district,
        destinationDistrict: destination.entry.district,
        // Caller will treat missing departure as a parse error and ask for
        // clarification; we still return post_leg intent so it can prompt
        // contextually instead of a generic "unknown".
        departureLocal: { hour: -1, minute: -1, dayOffset: 0, hadExplicitDate: false },
        askingPriceEur: price,
      },
    };
  }

  return {
    kind: 'post_leg',
    confidence,
    data: {
      originRaw: origin.entry.display,
      destinationRaw: destination.entry.display,
      originDistrict: origin.entry.district,
      destinationDistrict: destination.entry.district,
      departureLocal: departure,
      askingPriceEur: price,
    },
  };
}

interface FoundCity {
  entry: CityEntry;
  district: LicenceDistrict;
  index: number;
}

function findCities(normalised: string): FoundCity[] {
  const found: FoundCity[] = [];
  const consumedRanges: Array<[number, number]> = [];

  for (const key of CITY_KEYS_BY_LENGTH) {
    let from = 0;
    while (from < normalised.length) {
      const idx = normalised.indexOf(key, from);
      if (idx === -1) break;
      const end = idx + key.length;
      // Require word boundaries so "larnaka" inside "larnakas" still matches
      // (Greek genitive), but "nap" inside "napa" does not double-count.
      const prevChar = idx === 0 ? ' ' : normalised[idx - 1];
      const nextChar = end >= normalised.length ? ' ' : normalised[end];
      const isLeftBoundary = !isWordChar(prevChar);
      const isRightBoundary = !isWordChar(nextChar) || isGreekSuffix(normalised.slice(end, end + 2));
      if (isLeftBoundary && isRightBoundary) {
        if (!overlaps(consumedRanges, idx, end)) {
          consumedRanges.push([idx, end]);
          found.push({ entry: CITY_LEXICON[key], district: CITY_LEXICON[key].district, index: idx });
        }
      }
      from = idx + 1;
    }
  }

  found.sort((a, b) => a.index - b.index);
  return found;
}

function overlaps(ranges: Array<[number, number]>, a: number, b: number): boolean {
  return ranges.some(([x, y]) => a < y && b > x);
}

function isWordChar(c: string): boolean {
  return /[a-zα-ω0-9]/i.test(c);
}

// Greek common suffixes we want to strip at a word boundary: "λάρνακας",
// "λάρνακα". Returning true here means treat the following chars as suffix
// and still consider it a word-boundary match.
function isGreekSuffix(next: string): boolean {
  return /^(ς|σ|ν)/.test(next);
}

// --------------------------------------------------------------------------
// Time parsing
// --------------------------------------------------------------------------

const DAY_TOKENS: Record<string, number> = {
  'simera': 0, 'σημερα': 0, 'σήμερα': 0, 'today': 0,
  'avrio': 1, 'αυριο': 1, 'αύριο': 1, 'tomorrow': 1,
};

function findDeparture(normalised: string): DepartureLocal | null {
  let dayOffset = 0;
  let hadExplicitDate = false;
  for (const [token, offset] of Object.entries(DAY_TOKENS)) {
    if (normalised.includes(token)) {
      dayOffset = offset;
      hadExplicitDate = true;
      break;
    }
  }

  // 12-hour form first: 6pm, 6:30pm, 10am. If present it wins, so
  // "6:30pm" is not mis-parsed as 06:30 by the 24h regex below.
  const ampm = /(^|[^\d])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|μμ|πμ)/.exec(normalised);
  if (ampm) {
    let h = parseInt(ampm[2], 10);
    const m = ampm[3] ? parseInt(ampm[3], 10) : 0;
    const isPm = ampm[4] === 'pm' || ampm[4] === 'μμ';
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { hour: h, minute: m, dayOffset, hadExplicitDate };
    }
  }

  // 24-hour form: 18:30, 6:05
  const hhmm = /(^|[^\d])(\d{1,2})[:.](\d{2})(?!\d)/.exec(normalised);
  if (hhmm) {
    const h = parseInt(hhmm[2], 10);
    const m = parseInt(hhmm[3], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { hour: h, minute: m, dayOffset, hadExplicitDate };
    }
  }

  // Bare hour: "στις 6" / "at 6" — only accepted when a day token was given,
  // otherwise too ambiguous.
  if (hadExplicitDate) {
    const bare = /(?:stis|at|στις)\s+(\d{1,2})(?!\d)/.exec(normalised);
    if (bare) {
      const h = parseInt(bare[1], 10);
      if (h >= 0 && h <= 23) {
        return { hour: h, minute: 0, dayOffset, hadExplicitDate };
      }
    }
  }

  return null;
}

// --------------------------------------------------------------------------
// Price parsing
// --------------------------------------------------------------------------

function findPrice(original: string): number | undefined {
  // "€25", "€25.50", "25€", "25 euro", "25 ευρώ", "25eur"
  const patterns: RegExp[] = [
    /€\s*(\d{1,4}(?:[.,]\d{1,2})?)/,
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*€/,
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:eur|euro|euros|ευρω|ευρώ)/i,
  ];
  for (const p of patterns) {
    const m = p.exec(original);
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'));
      if (!Number.isNaN(n) && n > 0 && n < 10_000) return round2(n);
    }
  }
  return undefined;
}

// --------------------------------------------------------------------------
// Text normalisation
// --------------------------------------------------------------------------

// Lowercase, strip accents, unify arrows, collapse whitespace. Keeps digits,
// ASCII letters, Greek letters, and "€".
export function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining accents
    .replace(/→|⇒|=>|->|>>|—|–/g, ' ') // arrow variants become a space
    .replace(/\s+/g, ' ')
    .trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
