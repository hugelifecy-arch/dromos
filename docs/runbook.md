# Dromos ops runbook

Operator handbook for the parts of Dromos that require external credentials
or explicit enablement. Complements [`cyprus-taxi-technical-spec.md`](./cyprus-taxi-technical-spec.md):
the spec explains the *why* and design; this document is the *do this /
then this / verify that* checklist.

Everything that ships on `main` is safe to deploy — all external-contract
integrations default to dark. This runbook is what you reach for when a
credential lands and you need to flip a switch without regressing anything.

---

## 1. Environment variables at a glance

| Var | Default | Owner | What it controls |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | — (required) | Supabase dashboard | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — (required) | Supabase dashboard | Anon (RLS-scoped) key for client + middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | — (required) | Supabase dashboard | Service-role key used by cron + webhooks; bypasses RLS |
| `STRIPE_SECRET_KEY` | — | Stripe dashboard | Stripe API key (existing flow) |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe dashboard | Stripe webhook signing secret |
| **S11 WhatsApp bot** | | | |
| `WHATSAPP_BOT_ENABLED` | `false` | ops | Master flag for the Twilio webhook at `/api/whatsapp/webhook` |
| `WHATSAPP_DEV_STUB` | `false` | ops | Skip Twilio signature check for local `curl` testing — **never true in prod** |
| `TWILIO_ACCOUNT_SID` | — | Twilio console | Required to fetch voice-note media from Twilio (S12) |
| `TWILIO_AUTH_TOKEN` | — | Twilio console | Used to verify inbound `X-Twilio-Signature` and to auth media fetch |
| `TWILIO_WEBHOOK_URL` | — | ops | Public URL Twilio POSTs to; must match the signature payload exactly |
| **S12 AI extraction** | | | |
| `WHATSAPP_VOICE_ENABLED` | `false` | ops | Master flag for the voice-note branch inside the WhatsApp webhook |
| `OPENAI_API_KEY` | — | OpenAI dashboard | Whisper transcription |
| `ANTHROPIC_API_KEY` | — | Anthropic console | Claude Haiku extraction (prompt cache is on) |
| **S13 flight auto-match** | | | |
| `FLIGHT_MATCH_ENABLED` | `false` | ops | Master flag for `/api/flights/poll` |
| `FLIGHT_MATCH_CRON_SECRET` | — | ops | Bearer token the scheduler sends on the poll endpoint |
| `AVIATIONSTACK_ACCESS_KEY` | — | AviationStack dashboard | Primary arrivals feed |
| **S16 JCC Payments** | | | |
| `JCC_ENABLED` | `false` | ops | Master flag for `/api/payments/jcc/*` |
| `JCC_MER_ID` | — | JCC onboarding | Merchant ID |
| `JCC_ACQ_ID` | — | JCC onboarding | Acquirer ID |
| `JCC_SECRET` | — | JCC onboarding | HMAC-SHA256 signing key |
| `JCC_GATEWAY_URL` | `https://gateway-test.jcc.com.cy/payment/Payment` | JCC | Swap to production URL on go-live |
| `JCC_RETURN_URL` | — | ops | Public URL of `/api/payments/jcc/callback` — must be exact, no trailing slash |
| **S18 Peer-handoff expiry cron** | | | |
| `HANDOFF_EXPIRE_CRON_SECRET` | — | ops | Bearer token the scheduler sends on `/api/handoff/expire-stale`; if unset, the route returns 503 (refuses to run unsecured) |

Vars not listed here (cookie secrets, NextAuth URLs, etc.) are covered by
the standard Vercel deployment guide.

---

## 2. Flipping a sandbox-dark integration on

Every dark integration follows the same pattern. The checklist below is
the common shape; per-integration specifics are in §3–§6.

**Before flipping:**

1. Migrations are already applied on the target Supabase project. `supabase
   db push` covers 001 through 016; confirm by listing migrations on the
   dashboard.
2. All required env vars from §1 are present in the target environment
   (Vercel Preview + Production have separate scopes — set in the one you
   intend to flip).
3. A test payment method / phone number / flight is available for the
   integration's smoke test.

**Flip sequence:**

1. Set the integration's feature flag to `true` in the environment.
2. Redeploy (Vercel will not re-read env vars without a redeploy).
3. Hit the integration's smoke-test endpoint (§3–§6) with the test
   identity. Confirm the expected row lands in the right Supabase table.
4. Watch logs for 60 seconds; look for any 500s or signature-verification
   failures.
5. If anything is off, flip the flag back to `false` and investigate —
   DO NOT leave a partially-working integration on.

**Post-flip monitoring** (first 24h): Supabase Studio's "Logs" tab plus the
Vercel function logs. A silent failure mode on any dark integration is an
ops incident, not a code incident.

---

## 3. S11/S12 — WhatsApp bot + voice transcription

**What lights up:** Greek-speaking drivers can send `Λάρνακα → Λεμεσό 18:30 €25`
as text, or a voice note saying the same thing, and a draft leg appears
for them to confirm with ΝΑΙ.

**Flip checklist:**

1. In Twilio console:
   - Create a WhatsApp Business sender (sandbox is fine for pilot).
   - Point its webhook at `https://<your-host>/api/whatsapp/webhook`.
   - Copy the Account SID into `TWILIO_ACCOUNT_SID` and the Auth Token
     into `TWILIO_AUTH_TOKEN`.
   - Copy the webhook URL you just set into `TWILIO_WEBHOOK_URL` —
     **byte-identical**, no query string, no trailing slash. Twilio signs
     the exact URL it POSTed.
2. Set `WHATSAPP_BOT_ENABLED=true`. Leave `WHATSAPP_DEV_STUB` unset /
   `false`.
3. For voice extraction (S12), set `WHATSAPP_VOICE_ENABLED=true` and
   ensure `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are populated. The
   voice branch also requires the Twilio credentials above to fetch the
   media payload. If the flag is off or any key is missing, text still
   works and voice notes reply with a Greek "voice currently unavailable"
   message (see `voice.ts`).

**Smoke test:**

1. From the pilot driver's phone, send text `Λάρνακα → Λεμεσό 18:30 €25`
   to the bot number.
2. Expect a Greek reply quoting the regulated meter range and asking for
   ΝΑΙ / ΟΧΙ.
3. In Supabase, confirm:
   - `whatsapp_sessions` has a row for the phone number.
   - `whatsapp_draft_legs` has a row with `status='pending_confirmation'`
     and the parsed district pair.
4. Reply ΝΑΙ; expect a row in `empty_legs` (`status='open'`) and the draft
   row flipped to `status='confirmed'`.
5. For voice: send a voice note with the same content; expect the same
   sequence plus an `ai_extractions` cache row.

**Known edge cases:**

- Signature failures after flip usually mean `TWILIO_WEBHOOK_URL` doesn't
  match what Twilio actually POSTed. Common culprits: `http` vs `https`,
  trailing slash, custom port on a local tunnel.
- Voice notes over 25 MB will fail the Whisper upload. The bot replies
  with a Greek "please try a shorter message" per `voice.ts`.

---

## 4. S13 — Flight auto-match

**What lights up:** every 15 minutes a cron hits `/api/flights/poll`,
pulls LCA/PFO arrivals from AviationStack, upserts `tracked_flights`, and
emits suggestions into `flight_leg_matches` for any open empty leg whose
route plausibly feeds an inbound passenger. Drivers see the inbox at
`/app/flights/suggestions`.

**Flip checklist:**

1. In AviationStack dashboard, provision the Starter tier (≥ 10 000
   calls/month). Free tier caps at 100 which is too tight for a 15-min
   cron covering both airports.
2. Copy the access key into `AVIATIONSTACK_ACCESS_KEY`.
3. Mint a long random string and set it as `FLIGHT_MATCH_CRON_SECRET`.
4. Configure the scheduler (Vercel Cron, GitHub Actions, whatever is in
   play) to:
   ```
   POST https://<host>/api/flights/poll
   Authorization: Bearer <FLIGHT_MATCH_CRON_SECRET>
   ```
   every 15 minutes.
5. Set `FLIGHT_MATCH_ENABLED=true` and redeploy.

**Smoke test:**

1. Manually trigger a poll:
   ```
   curl -X POST https://<host>/api/flights/poll \
     -H "Authorization: Bearer <FLIGHT_MATCH_CRON_SECRET>"
   ```
2. Expect a JSON summary with `flightsUpserted >= 1` and no entries in
   `errors`.
3. In Supabase, confirm `tracked_flights` has fresh rows for both LCA and
   PFO.
4. Log in as a driver with an open Larnaca-origin leg departing in the
   next 2 hours. Visit `/app/flights/suggestions`. Expect at least one
   suggestion card.
5. Accept or dismiss; confirm the match row transitions and that a
   subsequent manual poll does NOT resurrect a dismissed suggestion.

**Known edge cases:**

- AviationStack free tier silently truncates `data[]` after 100 rows per
  call. If you accidentally deploy with the free key, the cron will
  succeed but the suggestion inbox will be sparse.
- The first poll after flip may write 30+ rows into `tracked_flights` in
  one go. This is normal — subsequent polls just update status /
  estimated_arrival.

---

## 5. S16 — JCC Payments

**What lights up:** drivers can pay for Plus/Pro subscriptions in EUR
through JCC instead of Stripe. Hotel tenants can buy concierge seats the
same way.

**Flip checklist:**

1. JCC merchant onboarding (allow 2–4 weeks):
   - Complete the KYC pack with JCC.
   - Receive `MerID`, `AcqID`, and the shared secret via a secure channel.
   - Agree on production vs test URL with your JCC account manager.
2. Set `JCC_MER_ID`, `JCC_ACQ_ID`, `JCC_SECRET` in the environment.
3. Set `JCC_RETURN_URL` to `https://<host>/api/payments/jcc/callback` —
   must exactly match whatever JCC registered as your callback URL.
4. Set `JCC_GATEWAY_URL`:
   - Sandbox: `https://gateway-test.jcc.com.cy/payment/Payment` (default)
   - Production: the URL JCC gave you (typically `gateway.jcc.com.cy`)
5. Set `JCC_ENABLED=true` and redeploy.

**Smoke test:**

1. Log in as a test driver. Go to `/app/upgrade`.
2. Select **Monthly** + **JCC · Κύπρος** + **Upgrade to Plus**.
3. Expect a redirect to the JCC hosted page. Use JCC's sandbox test card
   numbers (their documentation lists them per 3DS outcome).
4. Complete the flow; JCC should POST back to
   `/api/payments/jcc/callback`.
5. In Supabase, confirm:
   - `jcc_transactions` row starts as `status='pending'` then flips to
     `succeeded`.
   - `profiles.subscription_tier` updates to `plus`.
6. Try a second time with a declined test card. Expect `status='failed'`
   and the profile tier unchanged.

**Known edge cases:**

- If the JCC callback fires but verification fails, we 401 and persist
  nothing. That's the desired behaviour — JCC will retry, and any
  genuine callback will eventually land. Check that your gateway URL +
  secret match exactly; signature mismatches are almost always a
  mis-configured secret.
- Callbacks are idempotent: a second delivery for the same `OrderID` is
  a no-op. You'll see `already_resolved: true` in the response JSON.
- Yearly billing is Stripe-only in v1 — the JCC path is disabled for
  yearly until we implement the JCC Payment Agreement API for recurring.

---

## 6. S17 — Tax / VAT export

**What lights up:** drivers get a quarterly CSV / XML summary at
`/app/earnings/tax`. No external dependency.

**Flip checklist:**

None. The feature is live the moment the migration lands. No env flag.

**Smoke test:**

1. As a driver with ≥ 1 `ride_payment` in Q1 2026, visit
   `/app/earnings/tax`.
2. Select Year = 2026, Quarter = Q1. Expect totals to populate.
3. Click CSV; expect a download `dromos-tax-2026-q1.csv`. Open it —
   header is two columns, field labels include `Social Insurance (16.6%)
   EUR` and `GESY (4.0%) EUR`.
4. Click XML; expect `dromos-tax-2026-q1.xml`. Root element is
   `<DromosTaxExport schema="placeholder-v1">`. The comment at the top
   explains why.
5. In Supabase, confirm one row per download in `tax_exports`.

**Known edge cases:**

- XML `schema="placeholder-v1"` is deliberate. Do not advertise the XML
  as TAXISnet-ready until ops has reconciled the field map through a
  real filing. Until then, drivers should use the CSV as a reference
  summary to hand to their accountant.
- Rates (`SOCIAL_INSURANCE_RATE`, `GESY_RATE`, `VAT_STANDARD_RATE`,
  `VAT_REGISTRATION_THRESHOLD_EUR`) live in
  `src/lib/services/tax/compute.ts`. Ministry-driven changes are a
  one-file PR, no migration.

---

## 7. Regulatory invariants — check continuously

Two invariants must hold in production at all times. Both have DB-level
CHECKs so any violation is caught at write time, but a nightly audit is
cheap and useful.

| Invariant | Enforcement | Nightly check |
|---|---|---|
| `empty_legs.asking_price <= pricing_ceiling_eur` | CHECK (migration 009) | `select count(*) from empty_legs where pricing_ceiling_eur is not null and asking_price > pricing_ceiling_eur` — must be 0 |
| `concierge_bookings.quoted_price_eur <= pricing_ceiling_eur` | CHECK (migration 014) | `select count(*) from concierge_bookings where pricing_ceiling_eur is not null and quoted_price_eur > pricing_ceiling_eur` — must be 0 |

A non-zero result on either is a **paging incident**, not a warning. The
ceiling is the 2006 Motor Transport Law's legal cap; a violation is
regulatory exposure.

---

## 8. Rollback

Every sprint is a one-line rollback. Flip the relevant flag to `false`
and redeploy; the migration stays applied (migrations are additive and
never drop columns in-sprint).

Exceptions:

- **S10 (Greek copy rewrite)** — not feature-flagged. Revert the
  `i18n.ts` commit if the copy change causes a regression.
- **S14 (heatmap)** — no flag; disable by removing the `/app/heatmap`
  link in the navigation and letting the page exist as a dead URL.

If a migration itself needs reverting, that's a proper incident: Supabase
doesn't auto-generate down-migrations, so write the revert SQL by hand
and apply it through the dashboard. Do not `drop` the migration file —
that will desync the tracked history.
