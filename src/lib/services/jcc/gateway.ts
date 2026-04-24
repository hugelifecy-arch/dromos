// Request builder + callback interpreter for the JCC Gateway hosted redirect.
//
// What flows through this module:
//
//   buildCheckoutRequest
//      Input:  { orderId, amountEur, returnUrl }
//      Output: { action, fields } where `action` is the JCC URL to POST the
//              form to and `fields` is the signed map of form inputs.
//              The API route hands this back to the client, which
//              auto-submits a <form> to `action`. JCC handles the card
//              collection + 3DS flow.
//
//   interpretCallback
//      Input:  raw form fields JCC POSTed to us + the shared secret.
//      Output: a structured verdict: verified? succeeded? reason?
//              Callers then update jcc_transactions.
//
// Amount handling: JCC expects PurchaseAmt as a 12-character zero-padded
// integer in currency minor units. €29.99 = "000000002999". We centralise
// that conversion here so no caller ever sends a raw decimal.

import {
  computeRequestSignature,
  verifyResponseSignature,
  type RequestSignatureInput,
  type ResponseSignatureInput,
} from './signature';
import type { JccConfig } from './config';

export const JCC_VERSION = '1.0.0';
export const JCC_SIGNATURE_METHOD = 'SHA256';
export const EUR_CURRENCY_CODE = '978';           // ISO 4217 numeric for EUR
export const EUR_CURRENCY_EXPONENT = '2';

export interface BuildCheckoutInput {
  orderId: string;
  amountEur: number;
}

export interface CheckoutRequest {
  /** URL to POST the form to. */
  action: string;
  /** Map of form fields (includes Signature). */
  fields: Record<string, string>;
  /** Canonical request signature — persisted for audit. */
  signature: string;
}

/**
 * Format a decimal amount as the 12-character zero-padded minor-unit string
 * JCC requires. €29.99 -> "000000002999".
 */
export function formatPurchaseAmount(amountEur: number): string {
  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    throw new Error(`invalid amount: ${amountEur}`);
  }
  const minorUnits = Math.round(amountEur * 100);
  return String(minorUnits).padStart(12, '0');
}

export function buildCheckoutRequest(
  config: JccConfig,
  input: BuildCheckoutInput,
): CheckoutRequest {
  const signedInput: RequestSignatureInput = {
    Version: JCC_VERSION,
    MerID: config.merchantId,
    AcqID: config.acquirerId,
    OrderID: input.orderId,
    PurchaseAmt: formatPurchaseAmount(input.amountEur),
    PurchaseCurrency: EUR_CURRENCY_CODE,
    PurchaseCurrencyExponent: EUR_CURRENCY_EXPONENT,
    SignatureMethod: JCC_SIGNATURE_METHOD,
    ReturnURL: config.returnUrl,
  };

  const signature = computeRequestSignature(signedInput, config.secret);

  return {
    action: config.gatewayUrl,
    fields: { ...signedInput, Signature: signature },
    signature,
  };
}

// --------------------------------------------------------------------------
// Callback interpretation
// --------------------------------------------------------------------------

/** JCC uses ResponseCode=1 for "authorised"; any other value is a failure. */
const SUCCESS_RESPONSE_CODE = '1';

export interface CallbackVerdict {
  /** True when the presented signature matches what JCC would have produced. */
  verified: boolean;
  /** True when verified AND the transaction was authorised. */
  succeeded: boolean;
  /** Raw fields JCC echoed back; safe to persist (no card PAN, PaddedCardNo is already masked). */
  fields: ResponseSignatureInput;
  /** Signature JCC sent, for audit. */
  presentedSignature: string;
  /** Human-readable reason surface from ReasonCodeDesc. */
  reason: string;
}

export interface RawCallback {
  /** Form-decoded body JCC POSTed to us. */
  [key: string]: string | undefined;
}

export function interpretCallback(raw: RawCallback, config: JccConfig): CallbackVerdict {
  const fields: ResponseSignatureInput = {
    Version: str(raw.Version),
    MerID: str(raw.MerID),
    AcqID: str(raw.AcqID),
    OrderID: str(raw.OrderID),
    ResponseCode: str(raw.ResponseCode),
    ReasonCode: str(raw.ReasonCode),
    ReferencedOrderID: str(raw.ReferencedOrderID),
    PaddedCardNo: str(raw.PaddedCardNo),
    AuthCode: str(raw.AuthCode),
    ReasonCodeDesc: str(raw.ReasonCodeDesc),
  };
  const presentedSignature = str(raw.Signature);

  const verified = verifyResponseSignature(fields, presentedSignature, config.secret);
  const succeeded = verified && fields.ResponseCode === SUCCESS_RESPONSE_CODE;

  return {
    verified,
    succeeded,
    fields,
    presentedSignature,
    reason: fields.ReasonCodeDesc || (verified
      ? `code ${fields.ResponseCode}`
      : 'signature verification failed'),
  };
}

function str(v: string | undefined): string {
  return typeof v === 'string' ? v : '';
}
