# DROMOS — Business Concept Audit (2026-04-26)

A gap-analysis of the DROMOS business concept against its current state of
build, with a prioritised next-90-day plan. Companion to:

- [`../../cyprus-taxi-empty-leg-strategy.md`](../../cyprus-taxi-empty-leg-strategy.md) — the strategy document
- [`../../cyprus-taxi-technical-spec.md`](../../cyprus-taxi-technical-spec.md) — engineering plan + state of build
- [`../../runbook.md`](../../runbook.md) — ops handbook for dark-flag integrations

This doc is deliberately blunt. The strategy is good; the engineering
execution is good; the gap is between those two and the *business* — the
parts that don't compile.

---

## 1. The fundamental tension

Seventeen sprints of production-grade code have shipped on **zero
face-to-face customer validation**. The founder is solo and has not yet
secured the Cypriot collaborator (co-founder, board member, or visible
local advisor) that the strategy document itself identifies as a
necessary mitigation in §5:

> *"Insider/outsider dynamic — non-Cypriot founders will struggle.
> Mitigation: Cypriot co-founder, board member, or visible local advisor."*

That mitigation has not happened. Every additional engineering sprint
compounds technical debt against an unproven thesis. The gap is not in
the spec — the spec is well-reasoned. The gap is that the spec was
treated as a build plan instead of a hypothesis.

**Implication for next steps:** the highest-leverage moves over the next
60–90 days are *non-engineering*. Validation, network access, regulatory
pre-clearance, and finding a Cypriot collaborator. Code can wait.

---

## 2. Gap 1 — Validation (severity: existential)

The 90-day plan in the strategy doc §6 is well-designed. None of it has
been executed. Each unticked item maps to existential risk:

- **20 driver interviews at LCA / PFO** — without these, the WhatsApp-first
  thesis, the "no commission" framing, the €19–29/mo Pro tier price, and
  the 40–60% deadhead rate claim are guesses. They might be right; nobody
  knows.
- **ΠΑΣΙΟΑ (Pancyprian Taxi Owners Association) endorsement** — the
  strategy itself says this is *"worth 10x any digital ad spend."* Solo
  non-Cypriot founders don't get union meetings.
- **Ministry of Transport pre-clearance** — the entire pricing model rests
  on the "driver-set discount voucher" legal framing. Untested. If the
  Ministry rejects it, the regulated-meter floor (`009_pricing_regulation.sql`)
  and DB CHECK constraints become a dressed-up version of an illegal
  undercut market.
- **3 pilot hotels** — the concierge portal (Sprint 15) was built for
  users who have not been spoken to. Hotel concierges already coordinate
  via WhatsApp groups; the assumption that the portal is faster than the
  status quo is unproven.
- **Regulated meter seed data** — the `regulated_meter_rates` rows are
  the legal anchor of the entire pricing engine. Source provenance is
  not documented. If they are extrapolated rather than sourced from a
  named Ministry tariff notice, the legal defence collapses on first
  audit.

---

## 3. Gap 2 — Demand side (severity: high — but see §7)

The strategy is supply-heavy and demand-light. There is a sophisticated
answer for *"how do drivers list legs?"* and a much vaguer answer for
*"where does the demand to fill those legs come from?"*

The platform's **intentional answer**: demand comes through (a) other
licensed drivers handing off jobs and (b) hotel concierges booking on
behalf of tourists. Tourist-direct booking is deliberately excluded
(see landing page copy: *"No passengers, no amateurs, no public
sign-ups"*).

That's a coherent design choice. But it leaves several gaps unfilled:

- **Driver-to-driver demand depends on existing driver liquidity.** The
  cold-start case — when there are zero drivers active — has no
  demand at all from this channel.
- **Concierge demand depends on concierge buy-in.** With three pilot
  hotels and no validation, concierge volume is hypothetical.
- **No fallback channel.** If driver liquidity is slow and concierge
  signup is slow, there is nothing else pulling on the supply side.
- **Repeat-rider / loyalty mechanics** are absent — relevant if the
  off-season Nicosia↔Limassol commuter pivot ever ships.
- **Competitive pressure on tourist demand** (Welcome Pickups,
  GetTransfer, Kiwitaxi) is named in the strategy but not addressed.

Whether to **add a tourist-direct lane** is a strategic decision, not a
feature gap. A separate decision brief —
[`../../demand-channel-decision-brief.md`](../../demand-channel-decision-brief.md)
— lays out the trade-offs.

---

## 4. Gap 3 — Go-to-market (severity: high)

Strategy claims vs. reality:

| Item | Strategy claim | Reality |
|---|---|---|
| Cypriot co-founder / advisor | "Mitigation" in §5 | Not in place |
| Greek-first marketing materials | Implied | i18n covers app strings; no brand, logo design, marketing site beyond the landing page |
| Founding-team page with Cypriot face | "Local pride is a real selling point" | Doesn't exist |
| Customer-acquisition channels | LCA/PFO airport ranks + union | No Cyprus-specific channel research; Facebook groups dominate Cypriot SMB life and are not mentioned |
| Marketing budget | Implicit | Not budgeted; CAC/LTV undefined |
| Legal entity in Cyprus | Implicit | No Cyprus Ltd; no VAT registration; JCC merchant agreement still pending |
| Platform liability insurance | Not mentioned | Critical — passengers will sue the platform, not the driver |
| Cypriot Greek QA | "Pitch in Greek" | Standard modern Greek ≠ Cypriot Greek; no native review on file |

Without a Cypriot collaborator, items 1–4 are not solvable at any price.
Items 5–8 are solvable in a few days each with a few thousand euros, but
only after item 1 is in place.

---

## 5. Gap 4 — Product / business model (severity: medium)

Specified-but-unvalidated, or unspecified entirely:

- **Transactional fee mechanics.** "€0.50–1.00 per matched leg" is a
  number with no implementation. How is it collected? Pre-paid wallet?
  Post-leg invoice? Stripe Connect? Are subscription drivers exempt? Not
  defined anywhere in the codebase or the spec.
- **Hotel concierge unit economics.** €49–99/mo × small hotel base × high
  CAC (in-person Cypriot sales) × likely-high churn. The math may not
  work. There is no model.
- **Dispute / no-show / cancellation policy.** Tourist no-shows are
  common in summer. Driver responsibility? Platform refund? Cancellation
  fee distribution? Unspecified.
- **VAT invoicing for passengers.** Business travelers demand VAT
  invoices. Driver issues them or platform issues them? Tax exposure
  differs significantly; the architecture has not picked a side.
- **Driver vetting beyond licence verification.** Background checks,
  insurance verification, vehicle inspection, complaints history —
  ratings exist but no vetting pipeline.
- **Trust & safety incident response.** Driver behaving badly with a
  tourist passenger → who responds, when, in what language, at 02:00 on
  a Saturday in August?
- **Off-season commuter product.** Mentioned as the Nov–Mar pivot.
  Currently a stub. If summer revenue is real and winter revenue is
  zero, the business is a 7-month-a-year operation. That changes
  funding, hiring, and runway maths.
- **Multi-driver licence profiles.** Family-inheritance dynamic noted as
  a constraint but not in the data model.
- **Meter-rate update cadence.** When the Ministry updates regulated
  tariffs (every few years), what is the operational process? Manual
  SQL update? PR? Compliance dashboard?

None of these is existential individually, but each is a place where the
first real customer interaction will surface a problem the platform has
not designed for.

---

## 6. The README problem

`README.md` describes DROMOS as *"Ride-sharing platform for Greece. Share
rides, save money, meet people."* That is not the project's reality.

This isn't a cosmetic issue. The README is the first thing any
prospective collaborator, lawyer, hotel partner, journalist, or investor
sees. The mismatch between the README and the actual product is a
trust-eroding signal — if this isn't accurate, what else isn't?

Fix the README in this audit's commit set.

---

## 7. Recommended next-90-days

Ranked by leverage. Items 1–4 are non-engineering and dwarf items 5–7
in importance.

1. **Stop shipping driver-facing features for 60 days.** Sprints 18–20
   (peer-handoff, RU/HE/DE localisation, off-season commuter) are
   premature. Zero drivers are using the platform yet. Do not add new
   product surface area until validation has produced signal.
2. **Find a Cypriot collaborator within 60 days.** This is the single
   biggest unlock. See
   [`../../cofounder-search.md`](../../cofounder-search.md) for channels,
   criteria, and outreach templates. If no collaborator is found within
   60 days, the project is fundamentally a different shape (license-and-
   sell, or an open-source artefact) and the founder must decide which.
3. **Run the strategy doc's 90-day plan literally as written.** It is
   well-designed. The issue is that it has been skipped, not that it
   is wrong. See
   [`../../90-day-validation-plan.md`](../../90-day-validation-plan.md)
   for a tracker version with check-boxes.
4. **Get a Cypriot transport-law legal opinion in writing.** €500–2 000.
   The single point of regulatory failure is whether the
   "driver-set discount voucher" framing survives the 2006 Motor
   Transport Law. See
   [`../../regulatory-legal-brief.md`](../../regulatory-legal-brief.md)
   for the questions to ask and the lawyer-search starting points.
5. **Build a unit-economics model.** Driver match volume × fee, hotel
   SaaS revenue, CAC by channel, summer vs winter cash flow. Without
   this, the founder cannot size the opportunity, decide pricing, or
   know when to stop. See
   [`../../unit-economics.md`](../../unit-economics.md).
6. **Make the demand-channel call.** Tourist-direct or B2B-only forever?
   See
   [`../../demand-channel-decision-brief.md`](../../demand-channel-decision-brief.md).
   This is a decision, not an action — but it must be made consciously.
7. **Update the README.** Match the actual product. (Done in this
   commit set.)

---

## 8. What this audit does NOT recommend

A few things were considered and rejected:

- **Pivoting away from Cyprus.** The strategy's choice of Cyprus as a
  proof-of-model lab is sound. Small, English-friendly, EU-regulated,
  fragmented taxi base. Don't pivot.
- **Open-sourcing the codebase as a "give up" move.** The codebase has
  real value as a turnkey Cyprus taxi marketplace. If the founder
  decides not to make it a business, the better exit is a license-and-
  sell to a Cypriot operator — see Cypriot collaborator search.
- **Adding a native mobile app.** The strategy correctly defers this. A
  PWA + WhatsApp bot is enough for proof-of-model.
- **Hiring engineers.** The build is already ahead of validation. Hiring
  before product-market fit accelerates the wrong direction.

---

## 9. How to use this audit

Read `cyprus-taxi-empty-leg-strategy.md` first if you have not in a
while. Then read this. Then work through the seven companion documents
in this order:

1. [`../../cofounder-search.md`](../../cofounder-search.md)
2. [`../../90-day-validation-plan.md`](../../90-day-validation-plan.md)
3. [`../../regulatory-legal-brief.md`](../../regulatory-legal-brief.md)
4. [`../../unit-economics.md`](../../unit-economics.md)
5. [`../../demand-channel-decision-brief.md`](../../demand-channel-decision-brief.md)

The first three are time-sensitive. The fourth informs the fifth. None
require additional engineering work to act on.
