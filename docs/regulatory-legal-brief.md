# Cyprus Transport-Law Legal-Opinion Brief

Companion to
[`superpowers/specs/2026-04-26-business-concept-audit.md`](./superpowers/specs/2026-04-26-business-concept-audit.md)
§7 recommendation #4.

DROMOS's pricing model rests on a single legal premise: that an empty-leg
discount of 0.40 × (regulated meter) ≤ price ≤ 0.90 × (regulated meter)
can be framed as a *"driver-set discount voucher"* rather than as a
competing meter system, and that this framing survives the 2006 Motor
Transport Law (Περί Ρυθμίσεως Εμπορικών Μεταφορών).

If that premise is wrong, the entire pricing engine
(`src/lib/services/pricing.ts`), the regulated-meter table
(`009_pricing_regulation.sql`), and the marketing copy must change. This
is a binary risk and is best surfaced before the Ministry of Transport
meeting, not after.

This brief is the package to send a Cypriot transport-law lawyer to get a
written opinion. Budget: €500–2 000 depending on engagement scope.

---

## 1. Lawyer search — starting points

Look for a firm that combines transport-law experience and a working
relationship with the Ministry of Transport. The names below are
starting points only — verify currency before contacting.

- **Andreas Neocleous & Co LLC** (Limassol, Nicosia) — established
  general practice with transport / regulatory expertise.
- **Chrysses Demetriades & Co LLC** (Limassol) — known for commercial
  and regulatory work.
- **Patrikios Pavlou & Associates LLC** (Limassol) — strong on
  regulated industries.
- **Harneys (Cyprus)** — commercial / fintech focus; useful if the
  question expands to payments.

A Cypriot collaborator (see
[`cofounder-search.md`](./cofounder-search.md)) will know the right
practitioner faster than any external research can.

---

## 2. Engagement-letter scope

Ask for a **written legal opinion** (not just verbal advice) covering
the questions in §3 below. Useful elements to include in the
engagement letter:

- Deliverable: written memorandum of advice, 5–15 pages.
- Reliance: the founder, future investors, and (with permission) the
  Ministry of Transport during pre-clearance.
- Form: bilingual (English summary + Greek body) ideal but not
  essential.
- Conflict check: confirm the firm does not represent Bolt, Welcome
  Pickups, GetTransfer, Kiwitaxi, or any major Cypriot taxi
  cooperative.
- Confidentiality: standard — but the founder should be able to share
  the memo with the Ministry of Transport and ΠΑΣΙΟΑ. State this
  upfront.

---

## 3. Questions to put to the lawyer

Group the questions into a "must answer" set and a "nice to answer"
set. The must-answer set is the gating risk; the nice-to-answer set
informs design choices that can be revisited later.

### Must answer

1. Under the 2006 Motor Transport Law and any applicable secondary
   legislation, **may a licensed Cyprus taxi driver advertise and
   transact a fare below the regulated meter** for a pre-arranged
   empty-leg journey, where:
   a. the price is voluntarily set by the driver, not by the
      platform;
   b. the price is presented to the customer as a discount against a
      reference meter amount that is shown explicitly;
   c. the actual receipt records both the reference meter amount and
      the discount applied;
   d. the price is capped at no more than 0.90 × the reference meter
      amount?

2. If the answer to (1) is **yes** with conditions, what are those
   conditions, and how should the platform's UI, receipts, and
   contracts reflect them?

3. If the answer is **no** as currently framed, is there an alternative
   construction (e.g. a *"private hire"* sub-licence, a *"booked
   ride"* exception, a non-meter "share-ride" framing) that achieves
   the same commercial outcome legally?

4. **Platform liability.** If a driver collects a fare via the
   platform, is the platform a party to the transport contract, an
   intermediary, or neither, under Cypriot law? What insurance and
   indemnification structure should the platform have?

5. **VAT treatment.** If the platform charges drivers a per-leg fee or
   a monthly subscription, is that VAT-able at the standard rate,
   exempt as financial intermediation, or treated under the
   marketplace VAT special regime? Where does the place-of-supply
   land for an EU-resident driver, a non-EU resident driver, an
   EU-resident passenger, a non-EU resident passenger?

6. **Payment processing.** If the platform mediates payment from
   passenger to driver (e.g. via Stripe Connect or JCC Payments), does
   it acquire any obligations under Cyprus payment-services law?
   Specifically:
   a. Is a payment-institution licence required?
   b. If "agency model" is available, what conditions must the
      platform satisfy?

7. **Data protection / GDPR.** Specific to taxi context:
   a. What is the lawful basis for processing tourist passenger
      personal data (name, phone, pick-up address)?
   b. Are there any Cyprus-specific data-residency expectations
      beyond the GDPR (e.g. for transport-licensing audit trails)?
   c. Are there sector-specific record-retention requirements for
      taxi journey data under Cypriot transport law?

### Nice to answer

8. **Driver employment / contractor classification.** If the platform
   matches passengers to drivers, is there any risk drivers are
   re-classified as platform employees under Cypriot labour law?
   (Probably not given the no-commission, driver-sets-price model,
   but worth a paragraph.)

9. **Competition law.** Does coordinating empty-leg pricing across
   multiple drivers — even informally — create any antitrust risk
   under Cypriot or EU competition law?

10. **Licence-transferability.** Cyprus taxi licences are limited and
    transferable within families. Does the platform need to handle
    multi-driver-per-licence cases differently for liability or
    audit?

11. **Foreign-investor angles.** If the founder is non-Cypriot, does
    the platform's structure require a Cyprus-tax-resident director,
    a Cyprus-based subsidiary, or any specific corporate form (Ltd
    vs. partnership)?

12. **Insurance.** What level of public-liability and
    professional-indemnity insurance should the platform carry, and
    is there a Cypriot insurer commonly used for transport
    technology?

---

## 4. Materials to send to the lawyer

Bundle these as the brief:

- **The strategy doc:** `docs/cyprus-taxi-empty-leg-strategy.md`
- **The technical spec:** `docs/cyprus-taxi-technical-spec.md` —
  highlight §4 (pricing engine) and §6 (compliance posture)
- **The pricing service code:** `src/lib/services/pricing.ts` and
  `supabase/migrations/009_pricing_regulation.sql`
- **A sample driver-receipt mock-up** showing reference-meter +
  discount layout (build a single PDF; one page is enough)
- **A sample passenger-quote mock-up** from the concierge embed widget
- **This brief** (the questions in §3)

Do not send the runbook, environment-variable inventories, or anything
operationally sensitive. The lawyer needs the design, not the secrets.

---

## 5. What "good" looks like

A useful written opinion will:

- Answer questions 1–7 with a clear yes / yes-with-conditions / no.
- Cite the specific statute sections and any case law.
- Recommend specific UI / contract / receipt changes if needed.
- Distinguish *legal risk* (likely to be challenged) from *enforcement
  risk* (likely to be acted on by the Ministry).
- Suggest whether and how to structure the Ministry of Transport
  pre-clearance conversation.

A useless opinion will:

- Quote the law and decline to draw a conclusion.
- Recommend "further analysis" without specifying what.
- Treat the platform as a Bolt analogue rather than addressing the
  empty-leg framing on its own terms.

If the first opinion looks like the second list, get a second opinion
before changing the product.

---

## 6. Timing

Run this in parallel with the
[`90-day-validation-plan.md`](./90-day-validation-plan.md). The legal
opinion ideally lands by week 8, ahead of the week 9–10 Ministry of
Transport pre-clearance meeting. If it lands later, the Ministry
meeting is undefended; reschedule the meeting rather than walk in
without it.

---

## 7. After the opinion

- [ ] Memorandum filed in a private folder (not in this repo).
- [ ] Summary recommendations transcribed into
      [`cyprus-taxi-empty-leg-strategy.md`](./cyprus-taxi-empty-leg-strategy.md)
      §5 (regulatory) — keep this repo's strategy doc current.
- [ ] Any required UI / receipt / contract changes filed as a separate
      sprint, not bundled with feature work.
- [ ] Decision logged: are we proceeding under the original framing,
      a modified framing, or stopping the model entirely?
