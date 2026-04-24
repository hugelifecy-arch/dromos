// Twilio media download helper.
//
// WhatsApp voice notes arrive as MediaUrl0 pointing at Twilio's CDN
// (api.twilio.com/.../Media/...). The URL is NOT public — it requires HTTP
// Basic Auth with the Account SID + Auth Token. That's separate from
// the webhook signature validation (which only covers the POST, not media
// fetches).
//
// Kept as a tiny module with no Twilio SDK dependency: Twilio media endpoints
// answer a plain GET. We hash the bytes so the caller can key the cache on
// content, not URL.

import { createHash } from 'node:crypto';

export interface MediaDownloadOptions {
  url: string;
  accountSid: string;
  authToken: string;
  /** Abort hard if the file is bigger than this. WhatsApp voice is typically <1MB. */
  maxBytes?: number;
  /** Injection for tests. */
  fetchImpl?: typeof fetch;
}

export interface MediaPayload {
  bytes: Uint8Array;
  contentType: string;
  sha256: string;
  sizeBytes: number;
}

export async function downloadTwilioMedia(opts: MediaDownloadOptions): Promise<MediaPayload> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024; // 5 MB cap

  const basic = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString('base64');
  const res = await fetchFn(opts.url, {
    // Twilio redirects to S3; `redirect: 'follow'` is fetch default but be
    // explicit since behaviour varies between edge and node runtimes.
    redirect: 'follow',
    headers: { Authorization: `Basic ${basic}` },
  });

  if (!res.ok) {
    throw new Error(`twilio_media_fetch_failed: ${res.status}`);
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new Error(`twilio_media_too_large: ${buf.byteLength} > ${maxBytes}`);
  }

  const sha256 = createHash('sha256').update(buf).digest('hex');
  return {
    bytes: buf,
    contentType,
    sha256,
    sizeBytes: buf.byteLength,
  };
}
