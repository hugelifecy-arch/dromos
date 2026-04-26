# Sprint 18 — Peer-handoff (Συνάδελφος) — Design

User story (strategy doc §3 #5): driver A has accepted an empty-leg
booking but their previous fare is running late. Rather than cancel,
they hand the booking to a trusted colleague driver B who is closer or
free. Driver B picks up the existing passenger; the platform records
the swap.

This is a peer-network feature, not a payments feature — the original
fare stays with driver A by convention, and B is doing A a favour. Money
flow stays off-platform (cash between colleagues).

## Scope

In:

- One-directional trust links between licensed drivers.
- Propose / accept / decline a handoff for a `confirmed` empty-leg.
- New `buyer_id` recorded on `empty_legs`; original buyer kept in
  `handed_off_from` for audit.
- Notifications to the proposed colleague and to the seller.
- Driver-profile UI: list and add trusted colleagues.
- `/app/handoff/[legId]` page for the actual handoff flow.

Out:

- Money movement on the platform.
- Bidirectional trust enforcement.
- Importing trusted contacts from WhatsApp.
- Handing off `open` or `claimed` legs (only `confirmed` qualifies).
- Multi-hop handoffs (B cannot then hand off to C in v1).

## Data model

```sql
-- 017_peer_handoff.sql

create table public.trusted_driver_links (
  owner_id        uuid not null references auth.users(id) on delete cascade,
  trusted_id      uuid not null references auth.users(id) on delete cascade,
  established_at  timestamptz not null default now(),
  primary key (owner_id, trusted_id),
  check (owner_id <> trusted_id)
);

create index idx_trusted_driver_links_trusted_id
  on public.trusted_driver_links (trusted_id);

alter table public.empty_legs
  add column handed_off_from uuid references auth.users(id),
  add column handed_off_at   timestamptz;

create table public.handoff_proposals (
  id              uuid primary key default gen_random_uuid(),
  leg_id          uuid not null references public.empty_legs(id) on delete cascade,
  proposer_id     uuid not null references auth.users(id) on delete cascade,
  recipient_id    uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending','accepted','declined','expired','cancelled')),
  message         text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  check (proposer_id <> recipient_id)
);

create index idx_handoff_proposals_recipient_pending
  on public.handoff_proposals (recipient_id) where status = 'pending';

create index idx_handoff_proposals_leg
  on public.handoff_proposals (leg_id);
```

Trust links are one-directional. A having B in their trusted list does
not imply B has A in theirs. Mutual trust is achieved by both adding
each other.

The `handoff_proposals` row is the propose / accept / decline record.
On accept, `empty_legs.buyer_id` swaps and `handed_off_from` /
`handed_off_at` are recorded.

## State machine

`empty_legs.status` does **not** change — it stays `confirmed`. Only
`buyer_id` swaps. Lifecycle stays simple (no new states to test on
existing transitions).

`handoff_proposals.status` lifecycle:

```
pending → accepted   (recipient accepts; leg buyer_id swaps)
pending → declined   (recipient declines; leg unchanged)
pending → expired    (30 min lapses; leg unchanged)
pending → cancelled  (proposer cancels; leg unchanged)
```

## Service layer

`src/lib/services/peer-handoff/service.ts` exposes:

```ts
canProposeHandoff(supabase, legId, proposerId, recipientId): Promise<{ ok: true } | { ok: false; reason: string }>
proposeHandoff(supabase, legId, proposerId, recipientId, message?): Promise<{ proposalId: string } | { error: string }>
acceptHandoff(supabase, proposalId, recipientId): Promise<{ ok: true } | { error: string }>
declineHandoff(supabase, proposalId, recipientId): Promise<{ ok: true } | { error: string }>
cancelHandoff(supabase, proposalId, proposerId): Promise<{ ok: true } | { error: string }>
addTrustedDriver(supabase, ownerId, trustedId): Promise<{ ok: true } | { error: string }>
removeTrustedDriver(supabase, ownerId, trustedId): Promise<{ ok: true } | { error: string }>
listTrustedDrivers(supabase, ownerId): Promise<TrustedDriver[]>
```

Pre-conditions enforced inside `canProposeHandoff` (and re-checked in
`proposeHandoff` to avoid TOCTOU):

- Leg exists and belongs to `proposer_id` as the `buyer_id`.
- Leg `status === 'confirmed'`.
- Leg has not already been handed off (`handed_off_from is null`).
- `recipient_id` is in `proposer_id`'s `trusted_driver_links`.
- Recipient is a verified driver (`driver_verification.verification_status = 'approved'`).
- No other pending proposal exists for this `leg_id`.

`acceptHandoff` is the only operation that mutates `empty_legs`. It
runs inside a single Supabase RPC transaction (or two-step update with
optimistic concurrency on `handed_off_from is null`).

## Notifications

Two new notification types:

- `handoff_proposed` → fires to the recipient when proposed.
- `handoff_accepted` → fires to the proposer when recipient accepts.
- `handoff_declined` → fires to the proposer when recipient declines.
- `handoff_expired` (optional, low-priority) → fires to the proposer
  when the 30-minute window lapses with no response.

These extend the `NotificationType` union in
`src/lib/types/messaging.ts`. No new tables for notifications — they
go through the existing `notifications` table with the new `type`
values.

## API routes

- `POST /api/handoff/propose` — body: `{ legId, recipientId, message? }`
- `POST /api/handoff/[proposalId]/accept`
- `POST /api/handoff/[proposalId]/decline`
- `POST /api/handoff/[proposalId]/cancel`
- `GET  /api/trusted-drivers` — list current user's trusted links
- `POST /api/trusted-drivers` — body: `{ trustedId }`
- `DELETE /api/trusted-drivers/[trustedId]`

All routes auth-gated through the existing Supabase server client
pattern (`@/lib/supabase/server`).

## UI

- **`/app/handoff/[legId]`** — pick a trusted colleague, optional
  short message in Greek, send. Mirrors the visual pattern of the
  existing counter-offer flow.
- **`/app/profile/trusted-drivers`** (new) — list current trusted
  colleagues; "add by phone or email" form; remove buttons.
- **Driver-profile page** (`/app/driver/[id]`) — gain a "Trust this
  driver" button if both the viewer and target are verified drivers
  and a trust link doesn't already exist.
- **Notifications inbox** — handoff-proposal notifications get a
  prominent CTA card with Accept / Decline buttons inline; clicking
  through goes to the leg detail page.
- **Leg detail page** (`/app/ride/[id]`) — show "Handed off from
  [name]" badge if `handed_off_from is not null`, visible to all
  parties.

Greek-first per S10. New copy keys (in `src/lib/i18n.ts` namespaces):

```
handoff.title          : "Συνάδελφος"
handoff.propose_button : "Ανέθεσε σε συνάδελφο"
handoff.choose_partner : "Διάλεξε συνάδελφο"
handoff.send_proposal  : "Στείλε πρόταση"
handoff.proposed_to_you: "Σου προτάθηκε ανάθεση από τον συνάδελφο [name]"
handoff.accepted_by    : "Ο [name] αποδέχθηκε την ανάθεση"
handoff.declined_by    : "Ο [name] αρνήθηκε την ανάθεση"
trusted_drivers.title  : "Έμπιστοι συνάδελφοι"
trusted_drivers.add    : "Πρόσθεσε συνάδελφο"
```

(Standard Modern Greek; Cypriot collaborator should QA before
production.)

## Edge cases & invariants

| Case | Behaviour |
|---|---|
| Recipient declines | Leg stays with proposer, status unchanged |
| Recipient ignores for 30 min | Auto-expire by cron (see below) |
| Proposer cancels before accept | Proposal cancelled, leg unchanged |
| Recipient is not in trusted list at accept time | Reject (race condition: trust was revoked) |
| Recipient's verification revoked between propose and accept | Reject |
| Two proposals on same leg | Forbidden by the partial unique index check (`pending` only) |
| Leg cancelled before accept | Pending proposals for that leg cascade-decline |
| Leg already handed off | Cannot propose again (no multi-hop in v1) |

**Expiry job:** a small additional cron endpoint
`/api/handoff/expire-stale` flips proposals older than `expires_at`
from `pending → expired` and emits the optional notification. Reuses
the existing `FLIGHT_MATCH_CRON_SECRET` pattern with a new
`HANDOFF_EXPIRE_CRON_SECRET`. *Default flag:* enabled (no external
contract dependency).

## Testing

Service-level tests (target: 18+ cases):

- `canProposeHandoff` rejects each precondition violation, one test each.
- `proposeHandoff` writes the proposal row and emits the recipient notification.
- `acceptHandoff` swaps `buyer_id`, sets `handed_off_*`, emits proposer notification.
- `acceptHandoff` rejects when trust revoked between propose and accept.
- `acceptHandoff` rejects when leg already handed off (concurrency).
- `declineHandoff` leaves leg untouched.
- `cancelHandoff` only the proposer can cancel.
- Expiry: stale proposals flip to `expired`.
- `listTrustedDrivers` returns only links owned by `ownerId`.

UI / API / DB tests follow the existing pattern: mock the Supabase
client, exercise pure logic in service tests; route handlers stay
thin.

## Migration & rollback

- Migration file: `supabase/migrations/017_peer_handoff.sql`.
- Rollback: drop `handoff_proposals`, `trusted_driver_links`, and the
  two new columns. Migrations are additive; no data loss because the
  feature is launch-only.
- Feature flag: not gated. No external integration; safe to ship.

## Spec → state-of-build

Tracked in `docs/cyprus-taxi-technical-spec.md` §8 row 18. After ship,
update that row from `planned` to `✅ shipped`.

## Out-of-scope follow-ups (future sprints)

- Bidirectional trust enforcement.
- Trust requests / approvals (instead of unilateral add).
- WhatsApp-bot trust import once `WHATSAPP_BOT_ENABLED=true`.
- Multi-hop handoff chain (B → C → D).
- Money settlement on the platform (would require Stripe Connect or
  JCC Payment Agreement API).
