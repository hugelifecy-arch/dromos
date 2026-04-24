// POST /api/payments/jcc/checkout
//
// Starts a JCC payment for one of two kinds (v1):
//   * driver_subscription — authed driver tops up to Plus / Pro. Looks up
//                           the tier price locally; no client-side amount.
//   * concierge_seat      — tenant owner buys N concierge seats. Looks up
//                           the seat price locally.
//
// Sandbox posture: when JCC_ENABLED=false the route returns 202 with
// {skipped:true} so the UI can detect and show "payments coming soon". No
// DB rows are written in skipped mode.
//
// When enabled:
//   1. Load config (fails 503 if envs are missing).
//   2. Resolve payer (auth user for driver tier; tenant owner for seats).
//   3. Compute amount locally — NEVER trust a client-submitted number.
//   4. Insert a jcc_transactions row in status='pending'.
//   5. Build a signed redirect form via buildCheckoutRequest.
//   6. Return { action, fields } — client auto-submits to JCC's page.

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { createAdminClient, createClient } from '@/lib/supabase-server';
import { buildCheckoutRequest } from '@/lib/services/jcc/gateway';
import { JccConfigError, readJccConfig } from '@/lib/services/jcc/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tier + seat pricing is defined here so one diff tweaks the number without
// a migration. Keep in sync with the marketing pages; these are the
// authoritative numbers.
const SUBSCRIPTION_PRICES_EUR: Record<string, number> = {
  plus: 9.99,
  pro: 29.99,
};
const CONCIERGE_SEAT_PRICE_EUR = 49.00;  // per seat per month

interface CheckoutBody {
  kind: 'driver_subscription' | 'concierge_seat';
  subscriptionTier?: 'plus' | 'pro';
  tenantId?: string;
  seatCount?: number;
}

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
    return NextResponse.json(
      { skipped: true, reason: 'JCC_ENABLED=false' },
      { status: 202 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as CheckoutBody | null;
  if (!body) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });

  // ---- Build a typed transaction row ----
  const orderId = `DROMOS-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;

  let amount: number;
  const row: Record<string, unknown> = {
    order_id: orderId,
    kind: body.kind,
    amount_eur: 0,
    status: 'pending',
    user_id: null,
    tenant_id: null,
  };

  if (body.kind === 'driver_subscription') {
    const tier = body.subscriptionTier;
    if (!tier || !(tier in SUBSCRIPTION_PRICES_EUR)) {
      return NextResponse.json({ error: 'invalid_subscription_tier' }, { status: 400 });
    }
    amount = SUBSCRIPTION_PRICES_EUR[tier];
    row.user_id = user.id;
    row.subscription_tier = tier;
  } else if (body.kind === 'concierge_seat') {
    if (typeof body.tenantId !== 'string' || !Number.isInteger(body.seatCount) || (body.seatCount ?? 0) < 1) {
      return NextResponse.json({ error: 'invalid_seat_input' }, { status: 400 });
    }
    // Verify caller is owner of the tenant — RLS would also catch this.
    const { data: membership } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', body.tenantId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership || (membership as { role: string }).role !== 'owner') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    amount = CONCIERGE_SEAT_PRICE_EUR * (body.seatCount ?? 0);
    row.tenant_id = body.tenantId;
    row.seat_count = body.seatCount;
  } else {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }

  row.amount_eur = amount;

  // ---- Build the signed form (signed before insert so we only persist
  //       signatures we're actually going to send) ----
  const req = buildCheckoutRequest(config, { orderId, amountEur: amount });
  row.request_signature = req.signature;

  // ---- Insert via admin client so RLS doesn't block the service-role
  //       write (the user may not own the tenant row from their vantage) ----
  const admin = createAdminClient();
  const { error: insertError } = await admin.from('jcc_transactions').insert(row);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    orderId,
    amountEur: amount,
    action: req.action,
    fields: req.fields,
  });
}
