// JCC callback endpoint.
//
//   POST /api/payments/jcc/callback
//
// JCC posts here after the user completes (or abandons) the hosted payment
// page. Body is application/x-www-form-urlencoded.
//
// Safety rules this route enforces:
//   1. Signature MUST verify against our shared secret; otherwise we 401
//      without persisting anything.
//   2. order_id MUST match a jcc_transactions row in status='pending'.
//      Double-delivery is fine — idempotency is enforced by the
//      callback_received_at check; the second write is a no-op.
//   3. status is derived ONLY from the verified ResponseCode; we never
//      trust an app-supplied status flip.
//   4. On success, we apply any side-effects (e.g. bumping the driver's
//      subscription_tier). Failures leave the user's account untouched.
//
// Sandbox posture: if JCC_ENABLED=false we accept the call but do nothing.
// This keeps the endpoint URL stable for ops testing.

import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase-server';
import { interpretCallback } from '@/lib/services/jcc/gateway';
import { JccConfigError, readJccConfig } from '@/lib/services/jcc/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let config;
  try {
    config = readJccConfig();
  } catch (err) {
    if (err instanceof JccConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  if (!config.enabled) {
    // Accept silently so ops can exercise the URL without creds.
    return NextResponse.json({ skipped: true });
  }

  const form = await request.formData();
  const raw: Record<string, string> = {};
  form.forEach((v, k) => { raw[k] = typeof v === 'string' ? v : ''; });

  const verdict = interpretCallback(raw, config);
  if (!verdict.verified) {
    // Do NOT persist anything; this is a potentially hostile request.
    return NextResponse.json({ error: 'signature_invalid' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ---- Idempotency + load existing tx ----
  const { data: existing, error: loadError } = await supabase
    .from('jcc_transactions')
    .select('id, status, kind, user_id, tenant_id, subscription_tier, seat_count')
    .eq('order_id', verdict.fields.OrderID)
    .maybeSingle();

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'unknown_order' }, { status: 404 });

  const tx = existing as {
    id: string;
    status: string;
    kind: string;
    user_id: string | null;
    tenant_id: string | null;
    subscription_tier: string | null;
    seat_count: number | null;
  };

  // If we already resolved this order, respect the prior outcome. JCC can
  // redeliver on network retry; a second write would either be a no-op or,
  // worse, clobber a subsequent refund/void we haven't built yet.
  if (tx.status !== 'pending') {
    return NextResponse.json({ ok: true, already_resolved: true });
  }

  // ---- Update the tx row ----
  const newStatus = verdict.succeeded ? 'succeeded' : 'failed';

  const { error: updateError } = await supabase
    .from('jcc_transactions')
    .update({
      status: newStatus,
      status_code: verdict.fields.ResponseCode,
      status_reason: verdict.reason,
      jcc_reference: verdict.fields.AuthCode || null,
      response_signature: verdict.presentedSignature,
      callback_received_at: new Date().toISOString(),
    })
    .eq('id', tx.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // ---- Side-effects, success path only ----
  if (newStatus === 'succeeded') {
    try {
      await applyPostPaymentEffects(supabase, tx);
    } catch (err) {
      // Log in prod; don't 500 the callback or JCC will retry forever.
      // A subsequent ops script can reconcile by scanning succeeded
      // rows whose side-effect didn't stick.
      console.error('[jcc] post-payment side-effect failed', err);
    }
  }

  return NextResponse.json({ ok: true, status: newStatus });
}

/**
 * Minimal side-effects for v1. Each kind has exactly one thing to do; we
 * keep the branches tiny and explicit so it's easy to audit.
 */
async function applyPostPaymentEffects(
  supabase: ReturnType<typeof createAdminClient>,
  tx: { kind: string; user_id: string | null; tenant_id: string | null; subscription_tier: string | null; seat_count: number | null },
): Promise<void> {
  if (tx.kind === 'driver_subscription' && tx.user_id && tx.subscription_tier) {
    await supabase
      .from('profiles')
      .update({ subscription_tier: tx.subscription_tier })
      .eq('id', tx.user_id);
    return;
  }
  if (tx.kind === 'concierge_seat' && tx.tenant_id && tx.seat_count) {
    await supabase
      .from('tenants')
      .update({ seat_count: tx.seat_count })
      .eq('id', tx.tenant_id);
    return;
  }
}
