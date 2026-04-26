# Demand-Channel Decision Brief

Companion to
[`superpowers/specs/2026-04-26-business-concept-audit.md`](./superpowers/specs/2026-04-26-business-concept-audit.md)
§3 and §7 recommendation #6.

This document does *not* recommend an action. It frames a strategic
decision the founder must make consciously: should DROMOS open a
**tourist-direct booking lane**, or stay **B2B-only forever**? Each
path has implications that affect product, regulatory posture, and
funding. The decision should be made deliberately, not drift.

---

## 1. The current design choice

The platform today is **B2B-only by design**. The landing page
(`src/app/page.tsx`) is explicit:

> *"Driver-to-driver. No passengers, no amateurs, no public sign-ups."*

Demand for empty legs is intended to come through two channels:

1. **Other licensed drivers** handing off jobs they cannot complete —
   leg posted, peer driver claims, peer driver delivers the existing
   passenger.
2. **Hotel concierges** booking on behalf of their guests via the
   Sprint-15 portal and embeddable quote widget. Quote-only on the
   unauth iframe; booking happens via the concierge's authenticated
   tenant interface.

Tourists never sign up directly. They never see the platform's brand.
Their relationship is with the driver or with the hotel.

This is a coherent, defensible design choice. It also leaves the
platform structurally dependent on liquid driver supply *and* an
active concierge channel. Neither has been validated.

---

## 2. The case for staying B2B-only

- **Aligned with the strategy's cultural pitch.** Strategy doc §2: the
  product is positioned to drivers as *"Cyprus-owned, Cyprus-made, your
  data stays here."* A direct-to-tourist channel re-frames it as
  another disruptor, which is exactly what Bolt is, and exactly what
  the strategy says drivers will reject.
- **Lower regulatory exposure.** Less direct contact with passengers
  → fewer payment-services obligations, fewer GDPR cross-border
  flows, fewer consumer-protection responsibilities.
- **Smaller surface area to defend.** Trust & safety, complaints
  handling, refunds, multi-language passenger support, accessibility
  — all of these are someone else's problem (the driver's, or the
  hotel's) rather than the platform's.
- **Higher-margin per relationship.** Hotel SaaS at €49–99/mo is more
  profitable per customer than tourist transactions at a few EUR
  margin each.
- **Faster to MVP.** The hotel-concierge portal and the
  driver-to-driver channel are already built. A tourist-direct lane is
  net-new product.
- **Less competition.** Welcome Pickups, GetTransfer, Kiwitaxi own the
  tourist-direct market. Trying to take it would be a frontal assault
  on incumbents who have spent a decade on SEO and brand. The
  hotel-concierge play is a flank.

---

## 3. The case for adding tourist-direct

- **Removes the cold-start dependency.** B2B-only means the platform
  cannot generate a booking from scratch — it relies on either a
  driver having a passenger already (self-fulfilling) or a hotel
  concierge having a guest. A tourist-direct lane breaks that lock.
- **Lower-cost demand validation.** A simple SEO landing page for
  *"Larnaca to Ayia Napa taxi"* generates organic traffic and tells
  you whether tourist demand exists, independent of supply or
  concierge buy-in. Same signal at near-zero marginal cost.
- **Bigger TAM.** Tourist transfers are a much larger market than
  empty-legs alone. Even a 1% slice is meaningful.
- **Brand visibility.** A B2B-only platform never builds public
  recognition. That makes investor conversations, press, and
  international expansion harder later.
- **Hedge against hotel-concierge channel failure.** If hotels turn
  out to prefer their existing WhatsApp-group workflow over the
  portal, the platform loses ~30% of its revenue line in the model
  (see [`unit-economics.md`](./unit-economics.md) §3) and has no
  fallback.

---

## 4. What "adding tourist-direct" would actually mean

Concretely — and the founder should price these honestly:

- **Public landing pages** for high-intent search routes:
  - `/transfer/larnaca-airport-to-ayia-napa`
  - `/transfer/paphos-airport-to-limassol`
  - etc.
- **A real booking flow** for unauthenticated users: pick-up + drop-off,
  date/time, passenger count, optional flight number, contact details,
  card payment.
- **Captcha + rate-limit + email-confirm** to prevent the abuse vector
  the concierge embed deliberately defers to next sprint.
- **Tourist support channels** — at minimum, an EN/EL email that gets
  answered within 6 hours during summer. Probably also EN/RU/HE/DE
  given the tourist demographic mix.
- **Refund / cancellation / no-show policy** with platform exposure
  (today the platform takes no exposure).
- **VAT invoicing for business travelers** (today not designed).
- **Driver-side notification + accept flow** for tourist-originated
  legs (today there is only the driver-list-then-concierge-claim flow).
- **Regulatory re-review.** The "driver-set discount voucher" framing
  was designed to keep the platform a wholesale tool between licensed
  drivers and trusted intermediaries. Putting the platform between
  itself and consumers is a different posture and may need a different
  legal opinion (see
  [`regulatory-legal-brief.md`](./regulatory-legal-brief.md)
  question 6).

This is a substantial slice of work. Probably 3–6 sprints to do well.

---

## 5. A middle path: SEO landing without booking

There is a third option that avoids most of the cost of (3) while
gathering most of the signal of (3):

**Build SEO landing pages that show typical empty-leg routes and
prices, but route the user to the nearest hotel-concierge tenant or to
a "request notification" form.** No card payment. No platform-mediated
booking. The platform is a discovery surface; fulfilment stays in the
existing B2B channels.

This costs ~1 sprint instead of 3–6. It validates whether tourist
demand exists organically, without committing to the full
tourist-direct product. If the answer is *yes*, the founder has the
signal needed to justify the larger build. If the answer is *no*, the
B2B-only thesis is reinforced with evidence.

This middle path is consistent with the audit's "stop shipping
features for 60 days" recommendation only if it is treated as a
*validation experiment*, not a feature. Frame it as a discovery
landing page, not a booking surface.

---

## 6. Decision framework

**Stay B2B-only if:**

- Validation (week 11–12 in
  [`90-day-validation-plan.md`](./90-day-validation-plan.md)) shows
  hotels readily adopt the concierge portal.
- Driver-to-driver hand-off liquidity emerges naturally during the
  WhatsApp-bot pilot (weeks 5–8).
- The Cypriot collaborator advises that direct-to-tourist branding
  would damage driver trust.
- Investor conversations (if any) are happy with a niche B2B
  positioning.

**Add tourist-direct if:**

- Hotel adoption is slow or churn is high.
- Driver-to-driver liquidity is sparse and the marketplace can't
  cold-start without a passenger pull.
- A clear competitive opening shows itself against Welcome Pickups /
  GetTransfer (e.g. they pull out of Cyprus, raise prices, or cap
  driver supply).
- Investor or co-founder conversations require a bigger TAM story.

**Take the middle path (SEO landing without booking) if:**

- The founder is unsure between the two and wants data before
  committing.
- The 60-day feature freeze is up and there is appetite for a single
  validation-only sprint before the next decision.

---

## 7. When to revisit this brief

Re-read this document at:

- **End of week 8** of the 90-day validation plan, when the WhatsApp
  bot pilot data is in.
- **End of week 12**, when hotel-pilot adoption signal is in.
- **Day 90 review**, when the milestone is scored.

At each checkpoint, ask: do we now have evidence that changes the
balance of arguments above? If yes, decide and document. If no,
defer the decision but log the deferral, with a date.

The worst outcome is to drift into tourist-direct because of
incremental feature decisions, without the founder ever consciously
making the call. Decisions like this should be made on paper, on a
known date, with a known reason.
