# Cyprus Taxi Empty-Leg Marketplace — Technical Spec

Companion to [`cyprus-taxi-empty-leg-strategy.md`](./cyprus-taxi-empty-leg-strategy.md).
That document defines the *what* and *why*; this one defines the *how* —
grounded in what the `dromos` codebase already has and what it still needs.

Scope: 12–18 month engineering plan that maps strategy pillars onto concrete
data-model, API, integration, and compliance work.

---

## 1. State of the Build (what already exists)

The repository is a Next.js 15 + React 19 + Supabase + Stripe application with
eight migrations shipped through Sprint 8. The parts that already map to the
strategy:

| Strategy requirement | Current implementation |
|---|---|
| Empty-leg listings | `supabase/migrations/003_empty_legs.sql`, `src/lib/types/empty-leg.ts`, `src/app/app/post`, `src/app/app/rides` |
| Driver verification (Cyprus districts, licence types) | `004_driver_verification.sql`, `src/app/admin/verifications` — licence district enum covers nicosia/limassol/larnaca/paphos/famagusta |
| Airport queue (LCA, PFO) | `007_airport_earnings.sql`, `src/app/app/airport/AirportQueueClient.tsx` |
| Subscription monetisation (free/plus/pro) | `002_option_c_monetisation.sql`, `src/app/app/upgrade`, Stripe SDK wired |
| Messaging, counter-offers, notifications | `005_messaging_notifications.sql`, `src/lib/services/counter-offer.ts` |
| Fleet / admin / verification panel | `008_fleet_admin.sql`, `src/app/admin/*` |
| Earnings tracking | `src/app/app/earnings`, `src/app/app/earnings/EarningsClient.tsx` |
| Flight tracker stub | `src/app/app/flights/page.tsx` (`flights.auto_ride` key in i18n) |
| Greek/English UI | `src/lib/i18n.ts` (98 keys, locale defaults to `el`) |
| Leg lifecycle state machine | `src/lib/services/leg-lifecycle.ts`, `leg_status` enum has all nine states |
| Real-time updates | `src/lib/hooks/useRealtimeLegs.ts` (Supabase Realtime) |
| Corporate accounts | `src/app/app/corporate/page.tsx` |
| Community feed | `006_feed_community.sql`, `src/app/app/feed` |
| Beta gating | `src/lib/config/beta.ts` |

The scaffold is further along than the strategy document assumes. The work
ahead is less about building from zero and more about closing specific gaps
between a generic ride-share-style app and a Cyprus-specific empty-leg
marketplace.

---

## 2. Gap Analysis

The strategy document makes claims the codebase does not yet back. Each gap
below is a concrete engineering deliverable.

### 2.1 High-priority gaps (Q1–Q2)

1. **WhatsApp / Viber voice-note listing bot** — strategy §3.3 calls this the
   single highest adoption lever for drivers aged 50+. Not present.
2. **Flight auto-match with dynamic pricing** — a `flights` route exists but
   there is no integration with FlightAware / AviationStack / Hermes Airports
   feeds, and no auto-generated leg suggestions priced against inbound load.
3. **Dynamic pricing engine with regulated-meter floor** — `asking_price` is
   a free-form decimal. Strategy §3 requires a pricing service that enforces
   `0.4–0.6 × regulated_meter` as floor and `0.9 × regulated_meter` as ceiling,
   with time-to-departure, seasonality, and direction multipliers.
4. **Live empty-leg heatmap** — no spatial index, no tile service, no map
   UI. Strategy §3.1 positions this as the daily-engagement hook.
5. **Greek-first regulatory framing in UI copy** — current `i18n.ts` ships
   the marketing line *"Share the road, share the cost"* (carpool framing).
   Strategy §2 mandates *"Γέμισε το άδειο ταξί σου στον δρόμο της επιστροφής"*
   and explicit "no commission, no boss" language.

### 2.2 Medium-priority gaps (Q3)

6. **Hotel concierge SaaS portal** — separate tenant model, per-property
   seats, booking widget embeddable in PMS systems (Protel, RoomRaccoon).
7. **Multilingual passenger booking page** — i18n covers EN/EL only;
   strategy requires EN/EL/RU/HE/DE for the passenger-facing page.
8. **JCC Payments (Cyprus local processor)** — Stripe alone is insufficient
   for Cypriot SME adoption; JCC is the domestic gateway most local
   businesses use.
9. **VAT / social-insurance dashboard** — `earnings` page tracks totals but
   does not produce the quarterly Cypriot social-insurance (GESY + Social
   Insurance) export or a VAT-registered filing once a driver passes €15,600.

### 2.3 Lower-priority gaps (Q4+)

10. **"Συνάδελφος" peer-handoff flow** — pass a confirmed booking to a
    trusted colleague when a previous fare runs late.
11. **Off-season commuter pivot** — Nicosia ↔ Limassol recurring subscription
    commuter product for Nov–Mar.
12. **Union (ΠΑΣΙΟΑ) referral / endorsement rails** — coded referral codes,
    bulk onboarding import.
13. **Partner monetisation rails** — fuel (EKO / Petrolina), insurance
    affiliate, wineries pay-per-lead.
14. **Cruise terminal and ferry integration** (Limassol port).

---

## 3. Architecture Changes

### 3.1 New services (added to Next.js API routes unless noted)

| Service | Location | Responsibility |
|---|---|---|
| `pricing` | `src/lib/services/pricing.ts` | Compute floor/ceiling/suggested for a leg from route, time, flight load, seasonality. Single source of truth. |
| `flight-match` | `src/lib/services/flight-match.ts` + cron | Poll AviationStack for LCA/PFO inbound arrivals; emit `flight_matched_legs` suggestions. |
| `whatsapp-bot` | Cloudflare Worker or `src/app/api/whatsapp/webhook` | Twilio Programmable Messaging webhook. Transcribes voice notes (Whisper API), extracts origin/destination/time via LLM, drafts a leg for driver approval. |
| `heatmap-tiles` | `src/app/api/heatmap/[z]/[x]/[y]` | Aggregated drop-off density tiles. Input: `empty_legs.origin_lat/lng` + recent completed rides. Serve vector tiles or GeoJSON. |
| `tax-export` | `src/lib/services/tax-export.ts` | Quarterly CSV + XML export matching Cyprus Social Insurance and VAT forms. |
| `concierge-portal` | `src/app/concierge/*` | Separate tenant surface for hotels. Auth scoped to `tenant_type = 'hotel'`. |

### 3.2 Data model additions

New tables / columns (squeezed into migrations `009` – `013` roughly):

```sql
-- 009_pricing_regulation.sql
create table public.regulated_meter_rates (
  id uuid primary key default gen_random_uuid(),
  origin_district text not null,
  destination_district text not null,
  base_fare_eur decimal(6,2) not null,
  per_km_rate_eur decimal(6,3) not null,
  night_multiplier decimal(3,2) default 1.30,
  effective_from date not null,
  effective_to date,
  source text not null -- Ministry of Transport tariff notice reference
);

alter table public.empty_legs
  add column regulated_meter_reference_eur decimal(8,2),
  add column pricing_discount_pct decimal(5,2),
  add column pricing_floor_eur decimal(8,2),
  add column pricing_ceiling_eur decimal(8,2);

-- 010_flight_matches.sql
create table public.tracked_flights (
  id uuid primary key default gen_random_uuid(),
  flight_number text not null,
  airport char(3) not null check (airport in ('LCA','PFO')),
  scheduled_arrival timestamptz not null,
  estimated_arrival timestamptz,
  status text,
  load_factor numeric(4,3),
  provider text not null,
  last_polled_at timestamptz,
  unique (flight_number, scheduled_arrival)
);

create table public.flight_leg_matches (
  id uuid primary key default gen_random_uuid(),
  flight_id uuid references public.tracked_flights(id) on delete cascade,
  leg_id uuid references public.empty_legs(id) on delete cascade,
  score numeric(4,3) not null,
  created_at timestamptz default now()
);

-- 011_whatsapp.sql
create table public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  phone_e164 text not null unique,
  last_message_at timestamptz,
  opt_in_at timestamptz not null,
  opt_out_at timestamptz
);

create table public.whatsapp_draft_legs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.whatsapp_sessions(id) on delete cascade,
  raw_voice_url text,
  transcript text,
  transcript_lang text,
  extracted_origin text,
  extracted_destination text,
  extracted_departure timestamptz,
  confidence numeric(3,2),
  confirmed_leg_id uuid references public.empty_legs(id),
  created_at timestamptz default now()
);

-- 012_concierge.sql
create table public.hotel_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  property_count integer default 1,
  subscription_tier text not null default 'pilot',
  created_at timestamptz default now()
);

create table public.hotel_tenant_users (
  tenant_id uuid references public.hotel_tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'concierge',
  primary key (tenant_id, user_id)
);

-- 013_tax_records.sql
create table public.driver_tax_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_revenue_eur decimal(10,2) not null,
  vat_collected_eur decimal(10,2),
  platform_fees_eur decimal(10,2),
  net_revenue_eur decimal(10,2),
  export_generated_at timestamptz,
  unique (user_id, period_start, period_end)
);
```

### 3.3 Spatial indexing

Heatmap and "nearby legs" queries will outgrow b-tree indexes on
`origin_lat/lng` quickly. Enable PostGIS in Supabase and add:

```sql
alter table public.empty_legs
  add column origin_point geography(Point, 4326)
    generated always as (ST_MakePoint(origin_lng, origin_lat)::geography) stored;

create index idx_empty_legs_origin_point on public.empty_legs using gist (origin_point);
```

Repeat for `destination_point`. Spatial queries (KNN, radius, polygon) then
come for free.

---

## 4. Dynamic Pricing Engine

Single function, single entry point, used by every surface that quotes a
price (post form, WhatsApp bot, flight-match suggestion, concierge portal):

```ts
// src/lib/services/pricing.ts
export interface PricingInput {
  originDistrict: District;
  destinationDistrict: District;
  departure: Date;
  flightLoadFactor?: number; // 0..1
  driverAcceptanceScore?: number; // 0..1
  hasPassenger: boolean;
}

export interface PricingOutput {
  regulatedMeterEur: number;
  floorEur: number;     // 0.40 × meter
  ceilingEur: number;   // 0.90 × meter (hard legal cap)
  suggestedEur: number; // recommended slider start
  rationale: string[];  // human-readable, shown to driver
}
```

Pure function. Deterministic. Unit-tested against a fixture set of 30
Ministry of Transport tariff examples. No pricing decision elsewhere in the
codebase; every caller goes through here.

The **surge cap is enforced in two places** — application code *and* a CHECK
constraint on `empty_legs` (`asking_price <= pricing_ceiling_eur`). Defense in
depth because a regulatory breach is existential, not a UX bug.

---

## 5. WhatsApp Bot — Minimum Useful Flow

1. Driver sends a voice note in Greek to the platform WhatsApp number.
2. Twilio webhook → our `/api/whatsapp/webhook`.
3. We download the media, send to Whisper with `language='el'`.
4. LLM extraction (structured output) → `{origin, destination, departure, price_hint}`.
5. Bot replies with a formatted draft in Greek:
   *"Κατάλαβα: Λάρνακα → Λεμεσός, σήμερα 18:30, €25. Επιβεβαιώνεις; (ΝΑΙ/ΟΧΙ)"*
6. Driver replies `ΝΑΙ` → leg posted, lands in the public feed and nearby
   hotel portals simultaneously.

This flow must work on a 6-year-old Android handset over 3G. No app install,
no account creation beyond a one-time phone-number verification. The bot is
the onboarding funnel for the 50+ demographic.

---

## 6. Compliance & Regulatory Posture

The strategy identifies empty-leg pricing below the regulated meter as the
single largest regulatory risk. Engineering must make it defensible:

- Every leg stores its `regulated_meter_reference_eur` at time of posting,
  sourced from `regulated_meter_rates` with the Ministry tariff reference.
- No price can ever be posted above `0.9 × meter` (DB constraint).
- Legal framing in UI, API responses, and receipts: **"driver-set discount
  voucher"**, never "fare" or "meter override".
- Receipts generated per trip record both the reference meter amount and the
  discount applied — auditable trail for any Road Transport Department
  inspection.
- `docs/regulatory-comfort-letter-template.docx` (to be added) for the
  Ministry pre-clearance meeting referenced in strategy §5.

**GDPR:**
- All tourist passenger data (`passenger_name`, `passenger_phone`) encrypted
  at rest with a Supabase Vault key rotated quarterly.
- Data-residency claim ("Cyprus-hosted") requires moving from
  Supabase default region to a CYTA or Primetel-hosted Postgres. This is a
  **marketing-driven infra decision**, not a technical one — budget for it
  before the Y2 sales push, and keep a migration runbook in
  `docs/infra-migration-cy.md`.

---

## 7. Integrations Required

| Integration | Purpose | Provider of choice | Fallback |
|---|---|---|---|
| Flight data | Auto-match inbound arrivals | AviationStack | FlightAware, Hermes Airports public feed |
| Voice transcription | WhatsApp bot | OpenAI Whisper (`el` tuned) | Google Speech-to-Text |
| LLM extraction | Parse transcript into leg fields | Claude (`claude-haiku-4-5-20251001`) | OpenAI `gpt-4o-mini` |
| WhatsApp | Bot messaging | Twilio Programmable Messaging | 360dialog (EU-based, GDPR-friendly) |
| Payments — international | Tourist passengers | Stripe (already wired) | — |
| Payments — domestic SME | Hotel portal, Pro tier | JCC Payments | Stripe Cyprus |
| Maps / heatmap tiles | Driver engagement | Mapbox | MapLibre + OpenStreetMap (cheaper at scale) |
| SMS backup | WhatsApp bot fallback | Twilio SMS | Viber Business |

**LLM cost control:** all WhatsApp extraction traffic caches by `(audio sha256,
model version)` in a new `ai_extractions` table. A driver sending the same
recurring route daily pays for one transcription, not thirty.

**Claude prompt caching:** every Claude API caller (extraction today;
concierge agent + dispute triage when those land) MUST send the system
prompt as a content-block array with `cache_control: {type: 'ephemeral'}`.
The system block must be byte-stable across requests — per-call state
(reference time, request id, session metadata) goes in the user turn.
Anthropic's prompt cache holds the system block for ~5 minutes; measured
savings on S12's extraction path are ~60% input tokens / ~90% latency on a
warm call. See `src/lib/services/ai/extract.ts` for the canonical shape.

**Sandbox-blocker pattern:** external contracts (Twilio, AviationStack,
AI providers) gate each sprint with an environment flag that defaults to
false. The migration + service code ships immediately; flipping the flag
once credentials land is a one-line change. Canonical flags so far:
`WHATSAPP_BOT_ENABLED` (S11), `WHATSAPP_DEV_STUB` (S11),
`FLIGHT_MATCH_ENABLED` (S13), plus the heatmap's `HEATMAP_WINDOW_DAYS`
tunable (S14). New integrations should add a matching flag rather than
block on credential availability.

---

## 8. Rollout Sequence (mapped to strategy §4 roadmap)

| Sprint | Deliverable | Status | Dependency |
|---|---|---|---|
| 9  | Pricing service + regulated meter seed data + DB constraint | ✅ shipped | — |
| 10 | Greek-first copy rewrite (i18n.ts), remove carpool framing | ✅ shipped | — |
| 11 | WhatsApp bot MVP (text only, manual transcription fallback) | ✅ shipped dark (`WHATSAPP_BOT_ENABLED=false` until Twilio contract lands) | Twilio account, pricing service |
| 12 | Voice-note transcription + LLM extraction | ✅ shipped dark (flips on same flag as S11; Claude prompt caching on) | Sprint 11 |
| 13 | Flight auto-match cron + suggestions UI | ✅ shipped dark (`FLIGHT_MATCH_ENABLED=false` until AviationStack contract lands) | AviationStack contract, pricing service |
| 14 | PostGIS migration + heatmap MVP | ✅ shipped (MapLibre + OSM path, no Mapbox token needed) | — |
| 15 | Hotel concierge portal skeleton + embed widget | next | Tenant model, pricing service |
| 16 | JCC Payments integration | — |
| 17 | Tax / VAT export dashboard v1 | Earnings data, 6 months of real listings |
| 18 | Peer-handoff flow | Trusted-driver graph (new) |
| 19 | RU/HE/DE localisation of passenger booking page | — |
| 20 | Off-season commuter subscription product | — |

Sprints 9–12 are the minimum defensible launch. Skipping any of them means
either regulatory exposure (no pricing floor), adoption failure (no WhatsApp),
or both.

---

## 9. Testing & Observability

- **Pricing engine:** 100% branch coverage, property-based tests
  (fast-check) proving floor ≤ suggested ≤ ceiling for all inputs.
- **WhatsApp bot:** recorded-fixture tests with 50 real Greek voice notes
  across age/accent/handset-quality bands. Re-run on every LLM prompt change.
- **Regulatory invariant:** nightly job asserts zero rows in `empty_legs`
  violate `asking_price <= pricing_ceiling_eur`. Pages on violation.
- **Flight-match precision:** weekly human review of 20 random
  `flight_leg_matches` pairs; target > 85% useful suggestions.

Observability: Supabase logs + Vercel logs + a single Grafana Cloud dashboard
with four panels — WhatsApp success rate, pricing cap violations (must be 0),
flight-match acceptance rate, and daily active drivers.

---

## 10. Non-Goals (explicitly out of scope)

These appear in the strategy but are deliberately deferred past month 18:

- Native mobile apps (Q2 roadmap). PWA + WhatsApp bot is sufficient for
  proof-of-model; a native app before Malta / Crete expansion is premature.
- AI demand forecasting (Y2 Q5). Needs 12 months of data first.
- Cruise terminal / ferry integration. Separate sales motion, separate team.
- White-labelling the pricing engine to larger markets. Valuable, but only
  after Cyprus and Tier-1 island markets prove the model.

Saying no on paper now saves an engineer-quarter of half-built features
later.
