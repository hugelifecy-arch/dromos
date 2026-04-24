// Self-checking tests for the JCC signature primitives.
// Run with `npx tsx`.
//
// Golden-value approach: we compute an HMAC locally in the test against a
// known canonical string + secret, then feed the same inputs through the
// production helpers and assert byte-equality. That proves the canonical
// form is stable and that signatures survive round-trips.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  REQUEST_SIGNATURE_FIELDS,
  RESPONSE_SIGNATURE_FIELDS,
  canonicalise,
  computeRequestSignature,
  signHmacSha256Base64,
  signaturesEqual,
  verifyResponseSignature,
} from './signature';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try { fn(); results.push({ name, passed: true }); }
  catch (err) { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); }
}

export function runJccSignatureTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  runCase('canonicalise joins values with semicolons in declared order', () => {
    const canon = canonicalise(['a', 'b', 'c'], { b: '2', a: '1', c: '3' });
    assert.equal(canon, '1;2;3');
  }, results);

  runCase('canonicalise coerces undefined + null to empty positions', () => {
    const canon = canonicalise(['a', 'b', 'c'], { a: '1', c: '3' });
    assert.equal(canon, '1;;3'); // b missing -> empty position, delimiter preserved
  }, results);

  runCase('canonicalise stringifies numbers', () => {
    const canon = canonicalise(['amount'], { amount: 1575 });
    assert.equal(canon, '1575');
  }, results);

  runCase('signHmacSha256Base64 matches a locally-computed HMAC', () => {
    const secret = 'test-secret';
    const msg = 'hello;world';
    const expected = createHmac('sha256', secret).update(msg, 'utf8').digest('base64');
    assert.equal(signHmacSha256Base64(msg, secret), expected);
  }, results);

  runCase('signaturesEqual is true for equal strings, false for different', () => {
    assert.equal(signaturesEqual('abc', 'abc'), true);
    assert.equal(signaturesEqual('abc', 'abd'), false);
    assert.equal(signaturesEqual('abc', 'abcd'), false); // different length short-circuits
  }, results);

  runCase('computeRequestSignature produces a deterministic output for canonical input', () => {
    const input = {
      Version: '1.0.0',
      MerID: '123456',
      AcqID: '402971',
      OrderID: 'DROMOS-2026-04-24-ABC',
      PurchaseAmt: '000000002999',   // 12-digit minor units per JCC spec
      PurchaseCurrency: '978',       // EUR
      PurchaseCurrencyExponent: '2',
      SignatureMethod: 'SHA256',
      ReturnURL: 'https://dromos.cy/api/payments/jcc/callback',
    };
    const sig = computeRequestSignature(input, 'shared-secret-xyz');

    // Reproduce the expected signature locally.
    const canon = REQUEST_SIGNATURE_FIELDS.map((f) => input[f]).join(';');
    const expected = createHmac('sha256', 'shared-secret-xyz').update(canon, 'utf8').digest('base64');
    assert.equal(sig, expected);
  }, results);

  runCase('verifyResponseSignature accepts the signature JCC would have generated', () => {
    const input = {
      Version: '1.0.0',
      MerID: '123456',
      AcqID: '402971',
      OrderID: 'DROMOS-2026-04-24-ABC',
      ResponseCode: '1',
      ReasonCode: '1',
      ReferencedOrderID: 'DROMOS-2026-04-24-ABC',
      PaddedCardNo: '400000XXXXXX0002',
      AuthCode: 'AB1234',
      ReasonCodeDesc: 'Approved',
    };
    const canon = RESPONSE_SIGNATURE_FIELDS.map((f) => input[f]).join(';');
    const jccSig = createHmac('sha256', 'shared-secret-xyz').update(canon, 'utf8').digest('base64');

    assert.equal(verifyResponseSignature(input, jccSig, 'shared-secret-xyz'), true);
  }, results);

  runCase('verifyResponseSignature rejects a tampered field', () => {
    const input = {
      Version: '1.0.0',
      MerID: '123456',
      AcqID: '402971',
      OrderID: 'DROMOS-2026-04-24-ABC',
      ResponseCode: '1',  // pretend success
      ReasonCode: '1',
      ReferencedOrderID: 'DROMOS-2026-04-24-ABC',
      PaddedCardNo: '400000XXXXXX0002',
      AuthCode: 'AB1234',
      ReasonCodeDesc: 'Approved',
    };
    const genuineCanon = RESPONSE_SIGNATURE_FIELDS.map((f) => input[f]).join(';');
    const jccSig = createHmac('sha256', 'shared-secret-xyz').update(genuineCanon, 'utf8').digest('base64');

    // Attacker flips ResponseCode to a fraud code.
    const tampered = { ...input, ResponseCode: '5' };
    assert.equal(verifyResponseSignature(tampered, jccSig, 'shared-secret-xyz'), false);
  }, results);

  runCase('verifyResponseSignature rejects a wrong secret', () => {
    const input = {
      Version: '1.0.0',
      MerID: '123456',
      AcqID: '402971',
      OrderID: 'DROMOS-2026-04-24-ABC',
      ResponseCode: '1',
      ReasonCode: '1',
      ReferencedOrderID: 'DROMOS-2026-04-24-ABC',
      PaddedCardNo: '400000XXXXXX0002',
      AuthCode: 'AB1234',
      ReasonCodeDesc: 'Approved',
    };
    const canon = RESPONSE_SIGNATURE_FIELDS.map((f) => input[f]).join(';');
    const sig = createHmac('sha256', 'right-secret').update(canon, 'utf8').digest('base64');
    assert.equal(verifyResponseSignature(input, sig, 'wrong-secret'), false);
  }, results);

  runCase('canonical form preserves empty positions for optional response fields', () => {
    // Declined txn: JCC omits AuthCode. We must preserve the delimiter or
    // the signatures will disagree.
    const input = {
      Version: '1.0.0',
      MerID: '123456',
      AcqID: '402971',
      OrderID: 'DROMOS-2026-04-24-XYZ',
      ResponseCode: '5',
      ReasonCode: '200',
      ReferencedOrderID: 'DROMOS-2026-04-24-XYZ',
      PaddedCardNo: '400000XXXXXX0002',
      AuthCode: '',   // absent
      ReasonCodeDesc: 'Declined by issuer',
    };
    const canon = canonicalise(RESPONSE_SIGNATURE_FIELDS, input);
    // Count of semicolons = fields - 1
    const delimiters = (canon.match(/;/g) ?? []).length;
    assert.equal(delimiters, RESPONSE_SIGNATURE_FIELDS.length - 1);
    // AuthCode position is preserved (the `;;` in the middle).
    assert.match(canon, /;;/);
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
  const { passed, failed, results } = runJccSignatureTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
