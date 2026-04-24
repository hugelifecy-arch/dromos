// Twilio Programmable Messaging webhook signature validation.
//
// Implements the X-Twilio-Signature scheme:
//   HMAC-SHA1(auth_token, full_webhook_url + sorted_form_params_concatenated)
//   base64-encoded
//
// Documented at https://www.twilio.com/docs/usage/security. No SDK required —
// Twilio's npm package ships this as ~20 lines, we inline it so the webhook
// stays deployable on Vercel Edge if we need to later.
//
// The function is synchronous and dependency-free so it is trivial to test.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function computeTwilioSignature(
  authToken: string,
  webhookUrl: string,
  params: Record<string, string>,
): string {
  // Twilio sorts params by key and concatenates "<key><value>" pairs to the URL.
  const sortedKeys = Object.keys(params).sort();
  let payload = webhookUrl;
  for (const key of sortedKeys) {
    payload += key + params[key];
  }
  return createHmac('sha1', authToken).update(payload).digest('base64');
}

export function verifyTwilioSignature(
  authToken: string,
  webhookUrl: string,
  params: Record<string, string>,
  receivedSignature: string,
): boolean {
  if (!receivedSignature) return false;
  const expected = computeTwilioSignature(authToken, webhookUrl, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(receivedSignature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
