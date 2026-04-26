# Unit Economics — DROMOS

Companion to
[`superpowers/specs/2026-04-26-business-concept-audit.md`](./superpowers/specs/2026-04-26-business-concept-audit.md)
§7 recommendation #5.

This document explains the assumptions, formulas, and three named
scenarios that the unit-economics model supports. The model itself
lives in code so it never drifts from the doc:

- Source: [`src/lib/services/unit-econ/model.ts`](../src/lib/services/unit-econ/model.ts)
- Tests: [`src/lib/services/unit-econ/model.test.ts`](../src/lib/services/unit-econ/model.test.ts)
- Scenario runner: `npx tsx scripts/run-econ.ts`

To produce the numbers in §3 below, run the scenario runner. To explore
your own scenario, edit the input values and re-run.

---

## 1. Revenue lines

The platform has three revenue lines in this model:

1. **Driver subscriptions** — Plus (€19/mo) + Pro (€29/mo) tiers from
   the existing `/app/upgrade` flow. Free drivers pay nothing on this
   line.
2. **Per-leg transactional fees** — €0.50–1.00 per matched leg charged
   to *free-tier* drivers only. (Strategy doc §1: "Phase 2 — small
   fixed fee per matched leg".)
3. **Hotel concierge SaaS** — €49–99/mo per hotel tenant. Strategy doc
   §1.2.

The model does not yet include affiliate revenue (insurance, fuel
loyalty), B2B API revenue (travel agencies), or capacity-contract
revenue (tour operators). Those are real lines from the strategy
document, but they're Year-2+ and not load-bearing for the early
business case.

---

## 2. Cost lines

Two categories:

**Fixed monthly costs:**

- Infra (Supabase Pro, Vercel Pro, domains, CDN)
- Twilio (WhatsApp messaging)
- AviationStack (flight data)
- JCC (transaction fees, expressed as a flat bucket here)
- Legal retainer
- Founder salary (€0 in pessimistic; pays once revenue covers it)

**Marketing budget** is treated as a fixed monthly cost in this model.
Variable costs (per-leg processing, per-call AI extraction) are absorbed
into the fixed buckets at the scale of the early scenarios — they
become material only at OPTIMISTIC volumes and beyond.

**Customer acquisition cost (CAC)** is tracked separately for drivers
and hotels and is reported as a payback ratio rather than rolled into
the monthly P&L. CAC for early Cypriot taxi drivers is mostly
*founder-time* (rank visits, coffee, conversations), not ad spend; the
small EUR figure represents the marginal cash cost.

---

## 3. Three scenarios — current model output

These are the literal outputs of `computeUnitEcon` over the
PESSIMISTIC / BASE / OPTIMISTIC inputs in
[`model.ts`](../src/lib/services/unit-econ/model.ts). All EUR.

### Pessimistic — survived first contact

50 active drivers (mostly free), 3 pilot hotels.

| Metric | Value |
|---|---|
| Average month revenue | 374 |
| — Subscriptions | 153 |
| — Transactional | 74 |
| — Hotel SaaS | 147 |
| Average month fixed costs | 460 |
| Average month NET | **−86** |
| Peak month NET | −33 |
| Off-peak month NET | −139 |
| Annual revenue | 4,487 |
| Annual NET | **−1,034** |
| Off-peak valley (6 months total) | −836 |
| Driver ARPU | 4.54 / mo |
| Driver payback | 6.6 months |
| Hotel ARPU | 49.00 / mo |
| Hotel payback | 5.1 months |

**Interpretation.** The platform is a small loss in this state. The
founder is unpaid; infra costs slightly outpace revenue. This is a
*"keep going if you believe in the next leg"* state, not a business.
Fine for months 6–12 if the slope is up.

### Base — modest traction

250 active drivers (60/30/10 free/Plus/Pro mix), 15 hotel tenants.

| Metric | Value |
|---|---|
| Average month revenue | 4,179 |
| — Subscriptions | 2,150 |
| — Transactional | 844 |
| — Hotel SaaS | 1,185 |
| Average month fixed costs | 2,860 |
| Average month NET | **1,319** |
| Peak month NET | 1,825 |
| Off-peak month NET | 813 |
| Annual revenue | 50,145 |
| Annual NET | **15,825** |
| Off-peak valley (6 months total) | 4,875 |
| Driver ARPU | 11.97 / mo |
| Driver payback | 2.1 months |
| Hotel ARPU | 79.00 / mo |
| Hotel payback | 2.5 months |

**Interpretation.** Real revenue, real founder salary (€1.5k/mo built
into fixed costs), but only €16k/year net. This is a Cypriot
solo-founder side-business, not a fundable startup. Payback ratios are
healthy: each driver and hotel pays back its CAC within ~2.5 months,
which is good for retention-driven growth — but absolute volumes are
small.

### Optimistic — scaled within Cyprus

600 active drivers (40/40/20 mix), 40 hotel tenants.

| Metric | Value |
|---|---|
| Average month revenue | 15,000 |
| — Subscriptions | 8,040 |
| — Transactional | 3,000 |
| — Hotel SaaS | 3,960 |
| Average month fixed costs | 6,040 |
| Average month NET | **8,960** |
| Peak month NET | 10,760 |
| Off-peak month NET | 7,160 |
| Annual revenue | 180,000 |
| Annual NET | **107,520** |
| Off-peak valley (6 months total) | 42,960 |
| Driver ARPU | 18.40 / mo |
| Driver payback | 1.1 months |
| Hotel ARPU | 99.00 / mo |
| Hotel payback | 1.5 months |

**Interpretation.** Cyprus-only, the realistic ceiling looks like
~€180k revenue and ~€100k net for a solo or two-person operation
running flat-out. To exceed this materially, the geographic-expansion
plan (Malta, Crete, Balearics) becomes necessary. The strategy doc's
year-2–3 roadmap is consistent with that.

---

## 4. What these numbers tell you

A few observations the founder should sit with:

1. **Cyprus alone is not a venture-scale market.** Even the optimistic
   case is a profitable small business, not a Series-A story. Plan
   accordingly: bootstrap, or early raise only against a clear
   geographic-expansion path.

2. **The hotel SaaS line carries weight disproportionate to its
   volume.** In all three scenarios, hotels contribute 25–40% of
   revenue from a small number of accounts. Hotel CAC is high and
   in-person, but each hotel is worth ~14× a Plus driver. Lose the
   hotel channel and the model gets thin.

3. **The off-season valley is real.** In BASE, six off-peak months
   contribute only €4,875 net — versus €10,950 from six peak months.
   Cash management matters: build a cash buffer in summer, or design
   the off-season commuter product (strategy doc §3) to fill it.

4. **Driver ARPU is small.** €5–18/mo is not enough on its own. Driver
   subscriptions aren't where the platform earns; they are the
   *liquidity-creator* that makes the hotel SaaS line possible. Treat
   driver acquisition as a marketing cost paid in time, not as a
   revenue source.

5. **Payback ratios look good — but they're meaningless before
   churn is measured.** A 2-month payback at 50% annual churn is
   different from a 2-month payback at 10% annual churn. The model
   does not yet include churn, deliberately — adding it before there
   is real retention data would be theatre.

---

## 5. Sensitivities to test

Things worth re-running the scenario with:

- **Lower hotel WTP.** What if the realistic price is €29/mo, not
  €79–99? (Re-run with `hotelMonthlyEur: 29`.)
- **No transactional fee.** If drivers reject the per-leg fee
  outright, what does the model look like with subscription-only
  revenue? (`transactionalFeePerLegEur: 0`.)
- **Higher CAC.** If hotels need 8 hours of founder time to close,
  not 2, hotel CAC may be more like €600. (`hotelCacEur: 600`.)
- **Off-season collapse.** What if winter legs drop to 0 instead of
  3–5? (`legsPerDriverPerMonth.offPeak: 0`.)

The point is not to find the "right" number — there is no right number
yet. The point is to know which inputs the business is most sensitive
to, so the validation plan
([`90-day-validation-plan.md`](./90-day-validation-plan.md)) targets
the right questions.

---

## 6. What to add when validation produces signal

Things this model intentionally omits, to be added once real data
exists:

- **Churn / retention curves** for drivers and hotels.
- **CAC-by-channel** (rank-visit-acquired vs. union-referral vs.
  paid-ad).
- **Conversion funnel** (free → Plus → Pro upgrade rates).
- **Geographic-expansion overlay** (Malta, Crete) once a beachhead
  case is proven.
- **Insurance / liability cost line** once the legal opinion clarifies
  exposure.

Adding any of these without real data is fictional precision. Resist
the temptation.
