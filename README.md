# Dromos

Empty-leg marketplace for licensed Cyprus taxi drivers.

> *Γέμισε το άδειο ταξί σου στον δρόμο της επιστροφής.*
> — Fill your empty taxi on the way back.

A driver-to-driver platform: licensed Cyprus taxi drivers post the empty
return segments they were about to drive (e.g. driving back empty after an
airport drop-off at Larnaca / Paphos, or intercity returns between Limassol,
Nicosia, Ayia Napa, Paphos), and another verified driver picks them up.

No commission per leg. No public sign-ups. No passengers register directly —
demand is mediated through licensed drivers and through partner hotel
concierges.

## Status

Pre-launch. Engineering build is well ahead of customer validation; see
[`docs/superpowers/specs/2026-04-26-business-concept-audit.md`](docs/superpowers/specs/2026-04-26-business-concept-audit.md)
for the gap analysis and ranked next-90-days plan. The audit doc is the
right place to start if you are joining the project or evaluating it.

## Documentation map

| Doc | Purpose |
|---|---|
| [`docs/cyprus-taxi-empty-leg-strategy.md`](docs/cyprus-taxi-empty-leg-strategy.md) | Business strategy: model, value prop, features, scaling, risks |
| [`docs/cyprus-taxi-technical-spec.md`](docs/cyprus-taxi-technical-spec.md) | Engineering plan + state-of-build mapped to strategy pillars |
| [`docs/runbook.md`](docs/runbook.md) | Ops handbook for dark-flag external integrations |
| [`docs/superpowers/specs/2026-04-26-business-concept-audit.md`](docs/superpowers/specs/2026-04-26-business-concept-audit.md) | Gap analysis + prioritised next-90-days plan |
| [`docs/cofounder-search.md`](docs/cofounder-search.md) | Cypriot collaborator search: channels, criteria, outreach templates |
| [`docs/90-day-validation-plan.md`](docs/90-day-validation-plan.md) | Tracker for the strategy doc's 90-day customer-validation plan |
| [`docs/regulatory-legal-brief.md`](docs/regulatory-legal-brief.md) | Brief for a Cypriot transport-law legal opinion |
| [`docs/unit-economics.md`](docs/unit-economics.md) | Driver-supply, hotel-SaaS, and seasonal cash-flow model |
| [`docs/demand-channel-decision-brief.md`](docs/demand-channel-decision-brief.md) | B2B-only vs tourist-direct strategic decision |

## Tech Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Database:** Supabase (PostgreSQL + PostGIS + Auth + Realtime)
- **Payments:** Stripe (international) + JCC Payments (Cyprus domestic, sandbox-dark)
- **Messaging bot:** Twilio Programmable Messaging (WhatsApp + voice, sandbox-dark)
- **Flight data:** AviationStack (sandbox-dark)
- **AI:** Claude (extraction) + OpenAI Whisper (transcription)
- **Maps:** MapLibre + OpenStreetMap (no Mapbox token required)
- **Styling:** Tailwind CSS
- **Language:** TypeScript
- **i18n:** Greek (default) + English; passenger-facing RU/HE/DE planned

## Sandbox-dark integrations

External-contract integrations ship dark behind feature flags and flip on
when credentials land. See [`docs/runbook.md`](docs/runbook.md) for the
flip checklist per integration.

| Flag | Sprint | Blocker |
|---|---|---|
| `WHATSAPP_BOT_ENABLED` | S11 | Twilio account |
| `WHATSAPP_VOICE_ENABLED` | S12 | OpenAI + Anthropic API keys |
| `FLIGHT_MATCH_ENABLED` | S13 | AviationStack contract |
| `JCC_ENABLED` | S16 | JCC merchant account + secret |

## Getting Started

1. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Supabase, Stripe, and (optionally) AI / WhatsApp / JCC
   credentials in `.env.local`. Anything sandbox-dark stays unset; the
   feature flag stays `false`.

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the Supabase migrations:
   ```bash
   supabase db push
   ```

5. Start the dev server:
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
  app/
    (landing)     - Public landing page & pricing
    auth/         - Login, signup, onboarding, OAuth callback
    app/          - Authenticated driver app (post legs, browse, messages, earnings, tax, etc.)
    concierge/    - Hotel-tenant portal + embeddable quote widget
    admin/        - Admin dashboard + verifications panel
    api/          - API routes (whatsapp webhook, flight poll, jcc callback, concierge quote, …)
  components/ui/  - Shared UI components
  lib/
    services/     - Pricing engine, flight-match, whatsapp, heatmap, concierge, jcc, tax
    types/        - TypeScript types
    constants/    - Districts, locations, plan tiers
    i18n.ts       - Greek / English strings
supabase/
  migrations/     - Database schema (001 – 016)
docs/             - Strategy, spec, runbook, audit, supporting briefs
```

## Security

See [SECURITY.md](SECURITY.md) for security policy and best practices.

## Environment Variables

See `.env.example` for all required variables and
[`docs/runbook.md`](docs/runbook.md) for what each one controls.
