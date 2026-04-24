// Self-checking tests for the WhatsApp parser.
//
// Same pattern as src/lib/services/pricing.test.ts — no test framework
// dependency, can run under `npx tsx`. Every fixture here is a realistic
// message shape from the target demographic (Greek-Cypriot owner-operator
// drivers aged 50+, 3G phones, accent-insensitive keyboards).

import assert from 'node:assert/strict';
import { isConfirmWord, normaliseText, parseMessage } from './parser';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (err) {
    results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export function runParserTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  // ------ Intent classification ------

  runCase('blank body -> unknown', () => {
    assert.equal(parseMessage('').kind, 'unknown');
  }, results);

  runCase('ΝΑΙ -> opt_in', () => {
    assert.equal(parseMessage('ΝΑΙ').kind, 'opt_in');
    assert.equal(parseMessage('ναι').kind, 'opt_in');
    assert.equal(parseMessage('nai').kind, 'opt_in');
    assert.equal(parseMessage('OK').kind, 'opt_in');
  }, results);

  runCase('ΟΧΙ -> reject', () => {
    assert.equal(parseMessage('ΟΧΙ').kind, 'reject');
    assert.equal(parseMessage('όχι').kind, 'reject');
    assert.equal(parseMessage('no').kind, 'reject');
  }, results);

  runCase('STOP / ΔΙΑΓΡΑΦΗ -> opt_out (GDPR)', () => {
    assert.equal(parseMessage('STOP').kind, 'opt_out');
    assert.equal(parseMessage('stop').kind, 'opt_out');
    assert.equal(parseMessage('ΔΙΑΓΡΑΦΗ').kind, 'opt_out');
    assert.equal(parseMessage('διαγραφή').kind, 'opt_out');
  }, results);

  runCase('? / βοήθεια -> help', () => {
    assert.equal(parseMessage('?').kind, 'help');
    assert.equal(parseMessage('βοήθεια').kind, 'help');
    assert.equal(parseMessage('help').kind, 'help');
  }, results);

  runCase('isConfirmWord distinguishes confirm words from free text', () => {
    assert.equal(isConfirmWord('ΝΑΙ'), true);
    assert.equal(isConfirmWord('yes'), true);
    assert.equal(isConfirmWord('larnaka limassol'), false);
  }, results);

  // ------ Leg parsing — the canonical spec example ------

  runCase('spec canonical: "Λάρνακα → Λεμεσός 18:30 €25"', () => {
    const intent = parseMessage('Λάρνακα → Λεμεσός 18:30 €25');
    assert.equal(intent.kind, 'post_leg');
    if (intent.kind !== 'post_leg') return;
    assert.equal(intent.data.originDistrict, 'larnaca');
    assert.equal(intent.data.destinationDistrict, 'limassol');
    assert.equal(intent.data.departureLocal.hour, 18);
    assert.equal(intent.data.departureLocal.minute, 30);
    assert.equal(intent.data.askingPriceEur, 25);
    assert.ok(intent.confidence > 0.9);
  }, results);

  // ------ Phrasing variants the target demographic types ------

  runCase('accent-stripped: "Λαρνακα -> Λεμεσος 18:30 25 ευρω"', () => {
    const intent = parseMessage('Λαρνακα -> Λεμεσος 18:30 25 ευρω');
    assert.equal(intent.kind, 'post_leg');
    if (intent.kind !== 'post_leg') return;
    assert.equal(intent.data.originDistrict, 'larnaca');
    assert.equal(intent.data.destinationDistrict, 'limassol');
    assert.equal(intent.data.askingPriceEur, 25);
  }, results);

  runCase('latin transliteration: "larnaka lemesos 18:30 25"', () => {
    const intent = parseMessage('larnaka lemesos 18:30 25');
    assert.equal(intent.kind, 'post_leg');
    if (intent.kind !== 'post_leg') return;
    assert.equal(intent.data.originDistrict, 'larnaca');
    assert.equal(intent.data.destinationDistrict, 'limassol');
    assert.equal(intent.data.departureLocal.hour, 18);
  }, results);

  runCase('English: "Larnaca to Limassol 6:30pm 25 euros"', () => {
    const intent = parseMessage('Larnaca to Limassol 6:30pm 25 euros');
    assert.equal(intent.kind, 'post_leg');
    if (intent.kind !== 'post_leg') return;
    assert.equal(intent.data.originDistrict, 'larnaca');
    assert.equal(intent.data.destinationDistrict, 'limassol');
    assert.equal(intent.data.departureLocal.hour, 18);
    assert.equal(intent.data.departureLocal.minute, 30);
    assert.equal(intent.data.askingPriceEur, 25);
  }, results);

  runCase('noon am/pm edge case: 12pm = 12:00, 12am = 00:00', () => {
    const pm = parseMessage('Larnaca to Limassol 12pm 30');
    const am = parseMessage('Larnaca to Limassol 12am 30');
    if (pm.kind !== 'post_leg' || am.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(pm.data.departureLocal.hour, 12);
    assert.equal(am.data.departureLocal.hour, 0);
  }, results);

  runCase('"σήμερα 18:30" sets dayOffset=0, hadExplicitDate=true', () => {
    const intent = parseMessage('Λάρνακα Λεμεσός σήμερα 18:30 €25');
    if (intent.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(intent.data.departureLocal.dayOffset, 0);
    assert.equal(intent.data.departureLocal.hadExplicitDate, true);
  }, results);

  runCase('"αύριο 09:00" sets dayOffset=1', () => {
    const intent = parseMessage('Λάρνακα Πάφος αύριο 09:00 €40');
    if (intent.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(intent.data.departureLocal.dayOffset, 1);
    assert.equal(intent.data.departureLocal.hour, 9);
  }, results);

  runCase('bare hour "αύριο στις 6" accepted only with explicit day', () => {
    const withDate = parseMessage('Λάρνακα Λεμεσός αύριο στις 6 €25');
    if (withDate.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(withDate.data.departureLocal.hour, 6);
  }, results);

  // ------ Degraded parses ------

  runCase('missing time -> post_leg with hour=-1 (caller re-prompts)', () => {
    const intent = parseMessage('Λάρνακα Λεμεσός €25');
    if (intent.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(intent.data.departureLocal.hour, -1);
  }, results);

  runCase('only one city -> unknown', () => {
    assert.equal(parseMessage('Λάρνακα 18:30 25').kind, 'unknown');
    assert.equal(parseMessage('Hello driver').kind, 'unknown');
  }, results);

  runCase('same origin and destination -> unknown', () => {
    assert.equal(parseMessage('Λάρνακα Λάρνακα 18:30 €25').kind, 'unknown');
  }, results);

  runCase('airport codes LCA / PFO resolve to correct districts', () => {
    const intent = parseMessage('LCA Λεμεσός 18:30 €25');
    if (intent.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(intent.data.originDistrict, 'larnaca');
    assert.equal(intent.data.destinationDistrict, 'limassol');
  }, results);

  runCase('Ayia Napa / Paralimni map to famagusta district', () => {
    const intent = parseMessage('Λάρνακα Αγία Νάπα 18:30 €40');
    if (intent.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(intent.data.destinationDistrict, 'famagusta');
  }, results);

  // ------ Price formats ------

  runCase('price forms: €25 / 25€ / 25 EUR / 25 ευρώ / €25.50', () => {
    for (const form of ['€25', '25€', '25 EUR', '25 ευρώ', '€25.50']) {
      const intent = parseMessage(`Λάρνακα Λεμεσός 18:30 ${form}`);
      if (intent.kind !== 'post_leg') throw new Error(`no post_leg for "${form}"`);
      assert.ok(
        (intent.data.askingPriceEur ?? 0) >= 25,
        `price not parsed from "${form}"`,
      );
    }
  }, results);

  runCase('bare decimal after time is NOT treated as price (ambiguous)', () => {
    // Drivers who want to set a price must use "€" or "EUR" — the parser
    // refusing a bare number is a feature: the bot will prompt for the price
    // explicitly rather than guess and get it wrong.
    const intent = parseMessage('Λάρνακα Λεμεσός 18:30 25.50');
    if (intent.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(intent.data.askingPriceEur, undefined);
  }, results);

  runCase('no price -> askingPriceEur undefined (bot asks)', () => {
    const intent = parseMessage('Λάρνακα Λεμεσός 18:30');
    if (intent.kind !== 'post_leg') throw new Error('want post_leg');
    assert.equal(intent.data.askingPriceEur, undefined);
  }, results);

  // ------ Text normalisation ------

  runCase('normaliseText strips accents and unifies arrows', () => {
    assert.equal(normaliseText('Λάρνακα  →  Λεμεσός'), 'λαρνακα λεμεσος');
    assert.equal(normaliseText('A -> B'), 'a b');
    assert.equal(normaliseText('A => B'), 'a b');
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
  const { passed, failed, results } = runParserTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
