// Twilio Programmable Messaging webhook for the Dromos WhatsApp bot.
//
// Routing:
//   POST /api/whatsapp/webhook  — Twilio delivers inbound messages here.
//
// Operational modes, picked by env at deploy time:
//   WHATSAPP_BOT_ENABLED=false  -> always return empty TwiML (safe default).
//   WHATSAPP_DEV_STUB=true      -> skip X-Twilio-Signature validation so the
//                                  route can be exercised with `curl` during
//                                  local development. NEVER set in production.
//
// In production both env vars default off → the bot is disabled. The
// sandbox-blocker (no Twilio creds) called out in the Sprint 11 kickoff is
// absorbed here: the code ships dark, migration runs, and flipping the flag
// once creds land is a one-line change.
//
// We return TwiML responses so we don't need a second network hop back to
// Twilio's REST API to send the reply. TwiML keeps the webhook stateless.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { createAdminClient } from '@/lib/supabase-server';
import { handleInbound, type InboundMessage } from '@/lib/services/whatsapp/handler';
import { emptyTwiml, errorReply, twiml } from '@/lib/services/whatsapp/replies';
import { verifyTwilioSignature } from '@/lib/services/whatsapp/twilio-signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const enabled = process.env.WHATSAPP_BOT_ENABLED === 'true';
  const devStub = process.env.WHATSAPP_DEV_STUB === 'true';

  if (!enabled) {
    // Silent ack — Twilio retries non-2xx for ~24h, which would flood logs.
    return xmlResponse(emptyTwiml());
  }

  // Twilio sends application/x-www-form-urlencoded. formData() is the
  // supported way to read it in Next.js App Router.
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = typeof value === 'string' ? value : '';
  });

  // ---- Signature validation (skipped only in DEV_STUB mode) ----
  if (!devStub) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      console.error('[whatsapp] TWILIO_AUTH_TOKEN missing; refusing webhook');
      return xmlResponse(emptyTwiml(), 401);
    }
    const webhookUrl = process.env.TWILIO_WEBHOOK_URL || resolveUrl(request);
    const hdrs = await headers();
    const sig = hdrs.get('x-twilio-signature') ?? '';
    const ok = verifyTwilioSignature(authToken, webhookUrl, params, sig);
    if (!ok) {
      console.warn('[whatsapp] invalid signature', { url: webhookUrl });
      return xmlResponse(emptyTwiml(), 403);
    }
  }

  const from = stripWhatsappPrefix(params.From ?? '');
  const to = stripWhatsappPrefix(params.To ?? '');
  const body = params.Body ?? '';
  const twilioSid = params.MessageSid ?? params.SmsMessageSid ?? '';

  if (!from || !to) {
    return xmlResponse(emptyTwiml());
  }

  // Sprint 12: pass through the first media attachment so the handler can
  // route voice notes to Whisper + Claude. Twilio numbers params starting
  // from 0; we only care about a single attachment for MVP.
  const numMedia = parseInt(params.NumMedia ?? '0', 10) || 0;
  const mediaUrl = numMedia > 0 ? params.MediaUrl0 ?? '' : '';
  const mediaContentType = numMedia > 0 ? params.MediaContentType0 ?? '' : '';
  const media = mediaUrl && mediaContentType ? { url: mediaUrl, contentType: mediaContentType } : undefined;

  const inbound: InboundMessage = { fromE164: from, toE164: to, body, twilioSid, media };

  try {
    const reply = await handleInbound(inbound, {
      supabase: createAdminClient(),
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://dromos.app',
    });
    return xmlResponse(reply);
  } catch (err) {
    console.error('[whatsapp] handler error', err);
    return xmlResponse(twiml(errorReply('el')));
  }
}

// GET is used by Twilio when you paste the URL in their console to sanity-
// check the endpoint is reachable. Return an empty 200.
export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, service: 'whatsapp-webhook' });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
}

function stripWhatsappPrefix(raw: string): string {
  // Twilio sends "whatsapp:+357..." — our schema keeps pure E.164.
  return raw.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;
}

function resolveUrl(request: Request): string {
  // Next's request.url is reliable behind Vercel; only used as a fallback
  // when TWILIO_WEBHOOK_URL is unset. Must match exactly what Twilio signs.
  return request.url;
}
