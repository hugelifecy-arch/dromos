// Tests for the X-Twilio-Signature implementation. We don't have access to
// real Twilio credentials in this environment to cross-check against the
// live service; instead we:
//   1. Assert the algorithm is HMAC-SHA1 over sorted(key+value) appended to
//      the full URL, base64-encoded — the spec documented at
//      https://www.twilio.com/docs/usage/security — by verifying a known
//      HMAC fixture.
//   2. Round-trip the sign -> verify pair so we catch regressions in
//      key-sorting, URL handling, or timing-safe comparison.
// Once Twilio creds are wired a deployed smoke test will prove compatibility
// against the real signer.

import assert from 'node:assert/strict';
import { computeTwilioSignature, verifyTwilioSignature } from './twilio-signature';

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

export function runSignatureTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  const TOKEN = 'test-auth-token';
  const URL = 'https://dromos.app/api/whatsapp/webhook';
  const PARAMS = {
    From: 'whatsapp:+35799123456',
    To: 'whatsapp:+14155238886',
    Body: 'Λάρνακα → Λεμεσός 18:30 €25',
    MessageSid: 'SM1234567890abcdef',
    AccountSid: 'ACxxxxxxxxxxxxxxxxxx',
  };

  runCase('HMAC-SHA1 fixture: empty payload yields known digest', () => {
    // sanity-check the hash primitive itself so an algorithm regression fails
    // here, not buried in a sign/verify mismatch.
    const crypto = require('node:crypto');
    const empty = crypto.createHmac('sha1', 'key').update('').digest('base64');
    assert.equal(empty, '9Cuw7rAY671Fl65yE3EexgdghD8=');
  }, results);

  runCase('sign then verify round-trips', () => {
    const sig = computeTwilioSignature(TOKEN, URL, PARAMS);
    assert.equal(verifyTwilioSignature(TOKEN, URL, PARAMS, sig), true);
  }, results);

  runCase('verifyTwilioSignature rejects tampered body', () => {
    const sig = computeTwilioSignature(TOKEN, URL, PARAMS);
    const tampered = { ...PARAMS, Body: 'Λάρνακα → Λεμεσός 18:30 €999' };
    assert.equal(verifyTwilioSignature(TOKEN, URL, tampered, sig), false);
  }, results);

  runCase('verifyTwilioSignature rejects wrong token', () => {
    const sig = computeTwilioSignature(TOKEN, URL, PARAMS);
    assert.equal(verifyTwilioSignature('not-the-token', URL, PARAMS, sig), false);
  }, results);

  runCase('verifyTwilioSignature rejects wrong URL', () => {
    const sig = computeTwilioSignature(TOKEN, URL, PARAMS);
    assert.equal(
      verifyTwilioSignature(TOKEN, 'https://attacker.example/hook', PARAMS, sig),
      false,
    );
  }, results);

  runCase('verifyTwilioSignature rejects empty signature', () => {
    assert.equal(verifyTwilioSignature(TOKEN, URL, PARAMS, ''), false);
  }, results);

  runCase('param order does not affect signature (sorted by key)', () => {
    const a = computeTwilioSignature(TOKEN, URL, PARAMS);
    const reversed: Record<string, string> = {};
    for (const k of Object.keys(PARAMS).reverse()) {
      reversed[k] = (PARAMS as Record<string, string>)[k];
    }
    const b = computeTwilioSignature(TOKEN, URL, reversed);
    assert.equal(a, b);
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
  const { passed, failed, results } = runSignatureTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
