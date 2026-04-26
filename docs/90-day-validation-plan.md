# 90-Day Customer-Validation Plan — Tracker

A check-box version of the strategy doc's *Actionable Next Steps (First 90
Days)* — see
[`cyprus-taxi-empty-leg-strategy.md`](./cyprus-taxi-empty-leg-strategy.md)
§6. The plan is unchanged from the original; this tracker exists so the
work is *visible*, *committed*, and *honest about what is and isn't done*.

Audit reference:
[`superpowers/specs/2026-04-26-business-concept-audit.md`](./superpowers/specs/2026-04-26-business-concept-audit.md)
§7 recommendation #3.

**Hard rule:** do not flip any sandbox-dark integration on (Twilio,
AviationStack, JCC) and do not start sprint 18+ feature work until the
day-90 milestone below is met. Validation gates the build; not the
other way around.

---

## Day 90 milestone

The strategy doc's success bar:

- [ ] **50 active drivers**
- [ ] **200 matched legs**
- [ ] **3 hotel partners** (free pilot in exchange for testimonials)
- [ ] **1 union (ΠΑΣΙΟΑ) endorsement letter**
- [ ] **1 regulatory comfort letter** from the Ministry of Transport

Until all five boxes are ticked, additional product surface area is
premature. If three months in, only some are ticked: the plan extends,
the build does not.

---

## Week 1–2 — Driver discovery interviews (target: 20)

Bring paper, pay for their coffee, listen.

Format guidance:
- 30 minutes per driver, in-person, at LCA / PFO ranks.
- Greek-language, ideally with a Cypriot collaborator present.
- Open-ended; do not pitch the product. Listen for pain.
- Record (with consent) — transcripts go into a private folder, not
  Supabase.

Interview log:

| # | Date | Driver (initials) | Rank | Language | Key insights | Quotes worth keeping |
|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |
| 9 |  |  |  |  |  |  |
| 10 |  |  |  |  |  |  |
| 11 |  |  |  |  |  |  |
| 12 |  |  |  |  |  |  |
| 13 |  |  |  |  |  |  |
| 14 |  |  |  |  |  |  |
| 15 |  |  |  |  |  |  |
| 16 |  |  |  |  |  |  |
| 17 |  |  |  |  |  |  |
| 18 |  |  |  |  |  |  |
| 19 |  |  |  |  |  |  |
| 20 |  |  |  |  |  |  |

Question bank (use as prompts, not script):

1. *Πόσες φορές την εβδομάδα γυρίζεις άδειος από αεροδρόμιο;* — How
   many times per week do you drive back empty from the airport?
2. *Πόσο χάνεις σε κάθε άδεια διαδρομή;* — How much do you lose per
   empty leg?
3. *Έχεις κάποιον τρόπο τώρα να γεμίζεις την επιστροφή;* — Do you have
   any way today to fill the return leg?
4. *Τι σκέφτεσαι για τις πλατφόρμες όπως το Bolt;* — What do you think
   about platforms like Bolt?
5. *Θα δοκίμαζες ένα app που θα σε βοηθούσε να γεμίζεις άδειες
   διαδρομές χωρίς προμήθεια;* — Would you try an app that helps you
   fill empty legs without commission?
6. *Πώς θα προτιμούσες να δηλώνεις την άδεια διαδρομή — με WhatsApp
   φωνητικό μήνυμα, με app, ή κάπως αλλιώς;* — How would you prefer to
   list an empty leg — WhatsApp voice note, app, or something else?
7. *Τι θα σε έπειθε να χρησιμοποιείς ένα νέο εργαλείο;* — What would
   convince you to use a new tool?

Validation lights to look for (or not see):

- [ ] Are deadhead returns actually 40–60% of airport jobs? (the
      strategy doc's number)
- [ ] Is the "no commission" framing as load-bearing as assumed?
- [ ] Is WhatsApp the right delivery medium, or is it Viber, or
      Facebook Messenger groups?
- [ ] Will drivers pay €19–29/mo? At what tier of usage?
- [ ] Is "driver-set discount voucher" legal framing recognisable to
      drivers, or does it sound like marketing hot air?

Synthesis:

- [ ] Drafted a 1-page "what we heard" summary by end of week 2.
- [ ] Identified 3 things the product should add, change, or kill
      based on what was heard.
- [ ] Identified 0–2 design assumptions that survived contact with
      reality.

---

## Week 3–4 — ΠΑΣΙΟΑ (Pancyprian Taxi Owners Association) outreach

Goal: a soft endorsement, not a contract. Pitch the "no commission"
angle. The strategy doc says this is *worth 10x any digital ad spend*.

- [ ] Identified current ΠΑΣΙΟΑ leadership (board members, secretary).
- [ ] Drafted a Greek-language one-page pitch letter
      (Cypriot collaborator drafts it, not Google Translate).
- [ ] First meeting scheduled.
- [ ] First meeting held — outcomes recorded below.
- [ ] Soft-endorsement language obtained, OR explicit reasons for
      hesitation logged.

Meeting outcomes:

> _(record date, attendees, what they liked, what they pushed back on)_

Follow-on:

- [ ] Follow-up meeting scheduled if needed.
- [ ] Pre-launch endorsement letter or quote secured.

---

## Week 5–8 — WhatsApp-bot-only MVP (manual matching)

The strategy doc says: *"Build a WhatsApp-bot-only MVP before any app.
Match 50 legs manually if needed. Prove demand."*

The codebase already has a working WhatsApp bot (S11–S12) sandboxed
behind `WHATSAPP_BOT_ENABLED`. This step is about flipping it on for a
small pilot group, not building it from scratch.

Pre-flight:
- [ ] Twilio sandbox account provisioned.
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_URL`
      configured per [`runbook.md`](./runbook.md) §3.
- [ ] 5–10 pilot drivers (from the week 1–2 interview cohort) opted in.
- [ ] Greek voice-note support QA'd with a native Cypriot speaker.

Run:
- [ ] Bot live for a 2-week pilot.
- [ ] Manually matched at least 50 legs end-to-end (driver list →
      passenger / concierge accept → leg complete).
- [ ] Match success rate logged, broken down by:
  - voice vs text listing
  - district pair
  - time-of-day
  - driver age band
- [ ] Failure modes documented: what went wrong, why, and whether the
      product needs to change or the workflow does.

Decisions to make at end of week 8:
- [ ] Is WhatsApp the right primary surface, or is text-app + Viber
      better?
- [ ] Does the parser handle Cypriot-Greek dialect well enough?
- [ ] Should the next step be more drivers, more passengers, or
      better matching?

---

## Week 9–10 — Ministry of Transport pre-clearance

Goal: written comfort letter (or at minimum: meeting minutes) confirming
the "driver-set discount voucher" pricing framing is legally tolerable
under the 2006 Motor Transport Law.

- [ ] Cypriot transport-law legal opinion in hand
      (see [`regulatory-legal-brief.md`](./regulatory-legal-brief.md)) —
      this should happen before the Ministry meeting, not after.
- [ ] Letter to the Ministry of Transport drafted and sent (Greek).
- [ ] Pre-meeting briefing pack assembled:
  - 1-page product overview (Greek + English)
  - data-model snapshot showing the regulated-meter floor and ceiling
    enforcement
  - sample receipt showing the reference-meter amount + discount
  - copy of the legal opinion
- [ ] Meeting held.
- [ ] Outcome documented: comfort letter, conditional comfort, or
      explicit objection.
- [ ] If conditional or rejected: spec'd what would need to change.

---

## Week 11–12 — Hotel concierge pilot (target: 3)

Goal: 3 hotels in Ayia Napa or Paphos signed up for the free concierge
portal pilot in exchange for testimonials and feedback.

- [ ] Hotel target list built (10–15 candidates) — aim for mid-size
      independent hotels, not large chains. Chains have procurement
      lag; independents decide same-day.
- [ ] Pitch deck (Greek, 5 slides max) drafted.
- [ ] Outreach started.
- [ ] First demo booked.
- [ ] First pilot signed.
- [ ] Second pilot signed.
- [ ] Third pilot signed.
- [ ] Two-week pilot run; metrics captured (quote requests, booking
      conversion, time-saved-vs-WhatsApp baseline, concierge NPS).
- [ ] Testimonials secured (written, in Greek, with permission to
      republish).

---

## Day 90 — review

Convene with the Cypriot collaborator. Score against the milestone
above. Then make one of three calls:

1. **Plan met → flip to growth.** Subscription pricing pre-clearance,
   first paid drivers, second-cohort hotel signups.
2. **Plan partly met → extend the runway.** Diagnose which step
   under-delivered, fix the gap, run another 60 days. Do not start
   building new sprints.
3. **Plan failed → re-think.** If after 90 days there are still no
   active drivers and no hotel signups, the thesis is wrong. Reread the
   audit, talk to the collaborator, decide whether to pivot or stop.

The honest version of "validation" includes the option that the answer
is *no*. Build that into the plan.
