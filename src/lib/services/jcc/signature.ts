// JCC Gateway signature.
//
// JCC's hosted-redirect model authenticates the POST from Dromos -> JCC
// (the "request" direction) and the callback from JCC -> Dromos (the
// "response" direction) with HMAC-SHA256 over a deterministic, ordered
// concatenation of selected field values.
//
// The canonicalisation shape is a semicolon-delimited string of the
// field VALUES in the declared order. Field names are NOT included —
// they're implied by position. This matches the shape of the JCC v4
// Integrator Guide; sample fixtures in signature.test.ts codify it.
//
// Why a separate module: the signature algorithm is the only part of the
// JCC integration that has to be byte-exact. Everything else (HTTP form,
// callback handling) is a thin wrapper. Keeping the primitive here lets us
// unit-test it with golden fixtures without dragging in Next.js route
// handlers.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Field order for the request (Dromos -> JCC). v4 Integrator Guide §5.2. */
export const REQUEST_SIGNATURE_FIELDS = [
  'Version',
  'MerID',
  'AcqID',
  'OrderID',
  'PurchaseAmt',
  'PurchaseCurrency',
  'PurchaseCurrencyExponent',
  'SignatureMethod',
  'ReturnURL',
] as const;

/** Field order for the response (JCC -> Dromos callback). */
export const RESPONSE_SIGNATURE_FIELDS = [
  'Version',
  'MerID',
  'AcqID',
  'OrderID',
  'ResponseCode',
  'ReasonCode',
  'ReferencedOrderID',
  'PaddedCardNo',
  'AuthCode',
  'ReasonCodeDesc',
] as const;

export type RequestSignatureInput = Record<typeof REQUEST_SIGNATURE_FIELDS[number], string>;
export type ResponseSignatureInput = Record<typeof RESPONSE_SIGNATURE_FIELDS[number], string>;

/**
 * Canonicalise an ordered map into the string JCC signs.
 *
 * The canonical form is `v1;v2;v3;…` — values joined by `;` in the
 * declared order. Missing values are coerced to empty strings. Real JCC
 * responses sometimes omit optional fields (e.g. `AuthCode` on a
 * declined transaction); those appear as empty positions, preserving the
 * delimiter count.
 */
export function canonicalise(
  fields: readonly string[],
  values: Record<string, string | number | undefined>,
): string {
  return fields
    .map((f) => {
      const v = values[f];
      if (v === undefined || v === null) return '';
      return String(v);
    })
    .join(';');
}

/**
 * Compute the HMAC-SHA256 of the canonical form, base64-encoded. This is
 * what JCC expects in the `Signature` form field of the request, and what
 * they echo back in the response.
 */
export function signHmacSha256Base64(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('base64');
}

/**
 * Timing-safe equality for signatures. Callers should compare the JCC-sent
 * signature against their locally-computed one via this function, never `===`.
 */
export function signaturesEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// --------------------------------------------------------------------------
// High-level helpers the route handlers call.
// --------------------------------------------------------------------------

export function computeRequestSignature(input: RequestSignatureInput, secret: string): string {
  return signHmacSha256Base64(canonicalise(REQUEST_SIGNATURE_FIELDS, input), secret);
}

export function verifyResponseSignature(
  input: ResponseSignatureInput,
  presentedSignature: string,
  secret: string,
): boolean {
  const expected = signHmacSha256Base64(canonicalise(RESPONSE_SIGNATURE_FIELDS, input), secret);
  return signaturesEqual(expected, presentedSignature);
}
