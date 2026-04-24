// Self-checking tests for the gateway request builder + callback interpreter.
// Run with `npx tsx`.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  EUR_CURRENCY_CODE,
  EUR_CURRENCY_EXPONENT,
  JCC_SIGNATURE_METHOD,
  JCC_VERSION,
  buildCheckoutRequest,
  formatPurchaseAmount,
  interpretCallback,
} from './gateway';
import {
  REQUEST_SIGNATURE_FIELDS,
  RESPONSE_SIGNATURE_FIELDS,
} from './signature';
import type { JccConfig } from './config';

interface TestResult { name: string; passed: boolean; error?: string }

function runCase(name: string, fn: () => void, results: TestResult[]): void {
  try { fn(); results.push({ name, passed: true }); }
  catch (err) { results.push({ name, passed: false, error: err instanceof Error ? err.message : String(err) }); }
}

const config: JccConfig = {
  enabled: true,
  merchantId: 'M123',
  acquirerId: 'A456',
  secret: 'super-secret',
  gatewayUrl: 'https://gateway-test.jcc.com.cy/payment/Payment',
  returnUrl: 'https://dromos.cy/api/payments/jcc/callback',
};

export function runGatewayTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];

  runCase('formatPurchaseAmount zero-pads to 12 digits in minor units', () => {
    assert.equal(formatPurchaseAmount(29.99), '000000002999');
    assert.equal(formatPurchaseAmount(1), '000000000100');
    assert.equal(formatPurchaseAmount(1234.5), '000000123450');
  }, results);

  runCase('formatPurchaseAmount rejects zero / negative / NaN', () => {
    assert.throws(() => formatPurchaseAmount(0));
    assert.throws(() => formatPurchaseAmount(-1));
    assert.throws(() => formatPurchaseAmount(NaN));
  }, results);

  runCase('buildCheckoutRequest emits the declared fields and a valid signature', () => {
    const req = buildCheckoutRequest(config, { orderId: 'DROMOS-1', amountEur: 29.99 });
    assert.equal(req.action, config.gatewayUrl);
    assert.equal(req.fields.Version, JCC_VERSION);
    assert.equal(req.fields.MerID, 'M123');
    assert.equal(req.fields.AcqID, 'A456');
    assert.equal(req.fields.OrderID, 'DROMOS-1');
    assert.equal(req.fields.PurchaseAmt, '000000002999');
    assert.equal(req.fields.PurchaseCurrency, EUR_CURRENCY_CODE);
    assert.equal(req.fields.PurchaseCurrencyExponent, EUR_CURRENCY_EXPONENT);
    assert.equal(req.fields.SignatureMethod, JCC_SIGNATURE_METHOD);
    assert.equal(req.fields.ReturnURL, config.returnUrl);
    assert.ok(typeof req.fields.Signature === 'string' && req.fields.Signature.length > 0);

    // Reproduce the signature locally and confirm byte-equality.
    const canon = REQUEST_SIGNATURE_FIELDS.map((f) => req.fields[f]).join(';');
    const expected = createHmac('sha256', config.secret).update(canon, 'utf8').digest('base64');
    assert.equal(req.fields.Signature, expected);
  }, results);

  runCase('interpretCallback returns succeeded=true on valid approval', () => {
    const fields = {
      Version: JCC_VERSION,
      MerID: config.merchantId,
      AcqID: config.acquirerId,
      OrderID: 'DROMOS-1',
      ResponseCode: '1',
      ReasonCode: '1',
      ReferencedOrderID: 'DROMOS-1',
      PaddedCardNo: '400000XXXXXX0002',
      AuthCode: 'AB1234',
      ReasonCodeDesc: 'Approved',
    };
    const canon = RESPONSE_SIGNATURE_FIELDS.map((f) => fields[f]).join(';');
    const jccSig = createHmac('sha256', config.secret).update(canon, 'utf8').digest('base64');

    const verdict = interpretCallback({ ...fields, Signature: jccSig }, config);
    assert.equal(verdict.verified, true);
    assert.equal(verdict.succeeded, true);
    assert.equal(verdict.fields.OrderID, 'DROMOS-1');
    assert.equal(verdict.reason, 'Approved');
  }, results);

  runCase('interpretCallback catches a tampered ResponseCode', () => {
    const genuineFields = {
      Version: JCC_VERSION,
      MerID: config.merchantId,
      AcqID: config.acquirerId,
      OrderID: 'DROMOS-1',
      ResponseCode: '5',    // genuine decline
      ReasonCode: '200',
      ReferencedOrderID: 'DROMOS-1',
      PaddedCardNo: '400000XXXXXX0002',
      AuthCode: '',
      ReasonCodeDesc: 'Declined',
    };
    const canon = RESPONSE_SIGNATURE_FIELDS.map((f) => genuineFields[f]).join(';');
    const jccSig = createHmac('sha256', config.secret).update(canon, 'utf8').digest('base64');

    // Attacker flips ResponseCode to 1 before calling us.
    const tampered = { ...genuineFields, ResponseCode: '1', Signature: jccSig };
    const verdict = interpretCallback(tampered, config);
    assert.equal(verdict.verified, false);
    assert.equal(verdict.succeeded, false);
    assert.match(verdict.reason, /signature verification failed|Declined/);
  }, results);

  runCase('interpretCallback treats verified non-approval as succeeded=false', () => {
    const fields = {
      Version: JCC_VERSION,
      MerID: config.merchantId,
      AcqID: config.acquirerId,
      OrderID: 'DROMOS-2',
      ResponseCode: '5',    // declined
      ReasonCode: '200',
      ReferencedOrderID: 'DROMOS-2',
      PaddedCardNo: '400000XXXXXX0002',
      AuthCode: '',
      ReasonCodeDesc: 'Insufficient funds',
    };
    const canon = RESPONSE_SIGNATURE_FIELDS.map((f) => fields[f]).join(';');
    const jccSig = createHmac('sha256', config.secret).update(canon, 'utf8').digest('base64');

    const verdict = interpretCallback({ ...fields, Signature: jccSig }, config);
    assert.equal(verdict.verified, true);
    assert.equal(verdict.succeeded, false);
    assert.equal(verdict.reason, 'Insufficient funds');
  }, results);

  runCase('interpretCallback with missing fields fails verification cleanly', () => {
    const verdict = interpretCallback({}, config);
    assert.equal(verdict.verified, false);
    assert.equal(verdict.succeeded, false);
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
  const { passed, failed, results } = runGatewayTests();
  for (const r of results) {
    const mark = r.passed ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${mark}  ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
