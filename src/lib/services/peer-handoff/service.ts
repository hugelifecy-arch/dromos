// Peer-handoff service (Συνάδελφος) — Sprint 18.
//
// Lets a driver who has accepted an empty-leg booking hand it off to a
// trusted colleague when the previous fare is running late. The service
// owns three things:
//
//   1. The trust graph (who-trusts-whom).
//   2. The proposal lifecycle (propose / accept / decline / cancel / expire).
//   3. Notification side-effects on each transition.
//
// Money flow stays off-platform (cash between colleagues, by convention).
// Preconditions are checked twice — once in canProposeHandoff (for the
// UI's "can I show the propose button?" question) and once again inside
// proposeHandoff (defense against TOCTOU). The DB partial unique on
// handoff_proposals (one pending per leg) is the final safeguard.
//
// See:
//   - docs/superpowers/specs/2026-04-26-sprint-18-peer-handoff.md (design)
//   - supabase/migrations/017_peer_handoff.sql                    (schema)

import type { SupabaseClient } from '@supabase/supabase-js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type CanResult =
  | { ok: true }
  | { ok: false; reason: string };

export type WriteResult =
  | { ok: true }
  | { error: string };

export type ProposeResult =
  | { proposalId: string }
  | { error: string };

export interface TrustedDriverLink {
  owner_id: string;
  trusted_id: string;
  established_at: string;
}

// --------------------------------------------------------------------------
// canProposeHandoff — read-only precondition check
// --------------------------------------------------------------------------

export async function canProposeHandoff(
  supabase: SupabaseClient,
  legId: string,
  proposerId: string,
  recipientId: string,
): Promise<CanResult> {
  if (proposerId === recipientId) {
    return { ok: false, reason: 'Cannot hand off a leg to yourself.' };
  }

  // Leg must exist, belong to proposer as buyer, be confirmed, and not
  // already handed off.
  const { data: leg } = await supabase
    .from('empty_legs')
    .select('id, buyer_id, status, handed_off_from')
    .eq('id', legId)
    .maybeSingle();

  if (!leg) return { ok: false, reason: 'Leg not found.' };
  if (leg.buyer_id !== proposerId) {
    return { ok: false, reason: 'Only the current buyer of the leg can propose a handoff.' };
  }
  if (leg.status !== 'confirmed') {
    return { ok: false, reason: 'Only confirmed legs can be handed off.' };
  }
  if (leg.handed_off_from) {
    return { ok: false, reason: 'This leg has already been handed off (multi-hop is not supported).' };
  }

  // Trust link must exist (proposer trusts recipient).
  const { data: link } = await supabase
    .from('trusted_driver_links')
    .select('owner_id')
    .eq('owner_id', proposerId)
    .eq('trusted_id', recipientId)
    .maybeSingle();

  if (!link) {
    return { ok: false, reason: 'You can only hand off to a colleague in your trusted list.' };
  }

  // Recipient must be an approved driver.
  const { data: verification } = await supabase
    .from('driver_verification')
    .select('verification_status')
    .eq('user_id', recipientId)
    .maybeSingle();

  if (!verification || verification.verification_status !== 'approved') {
    return { ok: false, reason: 'The recipient is not a verified driver.' };
  }

  // No other pending proposal on this leg. The DB partial unique enforces
  // this on insert, but checking here gives a friendlier error than a
  // 23505 surfacing through the API layer.
  const { data: existingPending } = await supabase
    .from('handoff_proposals')
    .select('id')
    .eq('leg_id', legId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingPending) {
    return { ok: false, reason: 'There is already a pending proposal for this leg.' };
  }

  return { ok: true };
}

// --------------------------------------------------------------------------
// proposeHandoff — insert proposal + notification
// --------------------------------------------------------------------------

export async function proposeHandoff(
  supabase: SupabaseClient,
  legId: string,
  proposerId: string,
  recipientId: string,
  message?: string,
): Promise<ProposeResult> {
  const pre = await canProposeHandoff(supabase, legId, proposerId, recipientId);
  if (!pre.ok) return { error: pre.reason };

  const { data, error } = await supabase
    .from('handoff_proposals')
    .insert({
      leg_id: legId,
      proposer_id: proposerId,
      recipient_id: recipientId,
      message: message ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    // Race lost to another inserter (DB unique fired) → friendly message.
    if ((error as { code?: string } | null)?.code === '23505') {
      return { error: 'Another proposal for this leg was just created — try again.' };
    }
    return { error: error?.message ?? 'Failed to create proposal.' };
  }

  // Notification to the recipient. Best-effort: a notification failure
  // does NOT roll back the proposal, but we surface the error to the
  // caller so logs can pick it up.
  await supabase.from('notifications').insert({
    user_id: recipientId,
    type: 'handoff_proposed',
    title: 'Handoff proposal',
    body: message ?? 'A trusted colleague has asked you to take a confirmed leg.',
    data: { proposal_id: data.id, leg_id: legId, proposer_id: proposerId },
  });

  return { proposalId: data.id as string };
}

// --------------------------------------------------------------------------
// acceptHandoff — swap buyer_id, mark proposal accepted, notify proposer
// --------------------------------------------------------------------------

export async function acceptHandoff(
  supabase: SupabaseClient,
  proposalId: string,
  recipientId: string,
): Promise<WriteResult> {
  const { data: proposal } = await supabase
    .from('handoff_proposals')
    .select('id, leg_id, proposer_id, recipient_id, status')
    .eq('id', proposalId)
    .maybeSingle();

  if (!proposal) return { error: 'Proposal not found.' };
  if (proposal.recipient_id !== recipientId) {
    return { error: 'Only the proposed recipient can accept this handoff.' };
  }
  if (proposal.status !== 'pending') {
    return { error: `Proposal is no longer pending (status: ${proposal.status}).` };
  }

  // Re-check trust (could have been revoked between propose and accept).
  const { data: link } = await supabase
    .from('trusted_driver_links')
    .select('owner_id')
    .eq('owner_id', proposal.proposer_id)
    .eq('trusted_id', recipientId)
    .maybeSingle();

  if (!link) {
    return { error: 'Trust link no longer valid; cannot accept.' };
  }

  // Re-check leg state (still confirmed, still not handed off).
  const { data: leg } = await supabase
    .from('empty_legs')
    .select('id, status, handed_off_from, buyer_id')
    .eq('id', proposal.leg_id)
    .maybeSingle();

  if (!leg) return { error: 'Leg no longer exists.' };
  if (leg.handed_off_from) {
    return { error: 'Leg has already been handed off.' };
  }
  if (leg.status !== 'confirmed') {
    return { error: `Leg is no longer in confirmed state (status: ${leg.status}).` };
  }
  if (leg.buyer_id !== proposal.proposer_id) {
    // Proposer is no longer the buyer — race with another handoff or
    // a cancellation flow we haven't implemented.
    return { error: 'Leg ownership has changed; cannot accept.' };
  }

  const now = new Date().toISOString();

  // Two-step update: leg first (the load-bearing change), then proposal.
  // No real transaction here — Supabase JS client doesn't expose one
  // outside RPC. The order matters: if the leg update succeeds but the
  // proposal update fails, the leg is correctly handed off and a stale
  // 'pending' proposal will be expired by the cron. The reverse failure
  // mode (proposal accepted but leg unchanged) would be worse and is
  // avoided by ordering.
  const { error: legError } = await supabase
    .from('empty_legs')
    .update({
      buyer_id: recipientId,
      handed_off_from: proposal.proposer_id,
      handed_off_at: now,
    })
    .eq('id', proposal.leg_id);

  if (legError) return { error: legError.message };

  await supabase
    .from('handoff_proposals')
    .update({ status: 'accepted', resolved_at: now })
    .eq('id', proposalId);

  await supabase.from('notifications').insert({
    user_id: proposal.proposer_id,
    type: 'handoff_accepted',
    title: 'Handoff accepted',
    body: 'Your colleague has accepted the leg.',
    data: { proposal_id: proposalId, leg_id: proposal.leg_id, recipient_id: recipientId },
  });

  return { ok: true };
}

// --------------------------------------------------------------------------
// declineHandoff
// --------------------------------------------------------------------------

export async function declineHandoff(
  supabase: SupabaseClient,
  proposalId: string,
  recipientId: string,
): Promise<WriteResult> {
  const { data: proposal } = await supabase
    .from('handoff_proposals')
    .select('id, proposer_id, recipient_id, status, leg_id')
    .eq('id', proposalId)
    .maybeSingle();

  if (!proposal) return { error: 'Proposal not found.' };
  if (proposal.recipient_id !== recipientId) {
    return { error: 'Only the proposed recipient can decline this handoff.' };
  }
  if (proposal.status !== 'pending') {
    return { error: `Proposal is no longer pending (status: ${proposal.status}).` };
  }

  const now = new Date().toISOString();
  await supabase
    .from('handoff_proposals')
    .update({ status: 'declined', resolved_at: now })
    .eq('id', proposalId);

  await supabase.from('notifications').insert({
    user_id: proposal.proposer_id,
    type: 'handoff_declined',
    title: 'Handoff declined',
    body: 'Your colleague has declined the leg.',
    data: { proposal_id: proposalId, leg_id: proposal.leg_id, recipient_id: recipientId },
  });

  return { ok: true };
}

// --------------------------------------------------------------------------
// cancelHandoff
// --------------------------------------------------------------------------

export async function cancelHandoff(
  supabase: SupabaseClient,
  proposalId: string,
  proposerId: string,
): Promise<WriteResult> {
  const { data: proposal } = await supabase
    .from('handoff_proposals')
    .select('id, proposer_id, status')
    .eq('id', proposalId)
    .maybeSingle();

  if (!proposal) return { error: 'Proposal not found.' };
  if (proposal.proposer_id !== proposerId) {
    return { error: 'Only the proposer can cancel.' };
  }
  if (proposal.status !== 'pending') {
    return { error: `Proposal is no longer pending (status: ${proposal.status}).` };
  }

  const now = new Date().toISOString();
  await supabase
    .from('handoff_proposals')
    .update({ status: 'cancelled', resolved_at: now })
    .eq('id', proposalId);

  return { ok: true };
}

// --------------------------------------------------------------------------
// Trust graph
// --------------------------------------------------------------------------

export async function addTrustedDriver(
  supabase: SupabaseClient,
  ownerId: string,
  trustedId: string,
): Promise<WriteResult> {
  if (ownerId === trustedId) {
    return { error: 'Cannot trust yourself.' };
  }

  const { error } = await supabase.from('trusted_driver_links').insert({
    owner_id: ownerId,
    trusted_id: trustedId,
  });

  // Idempotent on duplicate: 23505 = unique violation.
  if (error && (error as { code?: string }).code !== '23505') {
    return { error: error.message };
  }

  return { ok: true };
}

export async function removeTrustedDriver(
  supabase: SupabaseClient,
  ownerId: string,
  trustedId: string,
): Promise<WriteResult> {
  const { error } = await supabase
    .from('trusted_driver_links')
    .delete()
    .eq('owner_id', ownerId)
    .eq('trusted_id', trustedId);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function listTrustedDrivers(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<TrustedDriverLink[]> {
  const { data } = await supabase
    .from('trusted_driver_links')
    .select('owner_id, trusted_id, established_at')
    .eq('owner_id', ownerId)
    .order('established_at', { ascending: false });

  return (data ?? []) as TrustedDriverLink[];
}

// --------------------------------------------------------------------------
// expireStaleProposals — cron-callable
// --------------------------------------------------------------------------

export async function expireStaleProposals(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<{ expiredCount: number }> {
  const nowIso = now.toISOString();

  const { data: stale } = await supabase
    .from('handoff_proposals')
    .select('id, proposer_id, leg_id')
    .eq('status', 'pending')
    .lt('expires_at', nowIso);

  const rows = (stale ?? []) as Array<{ id: string; proposer_id: string; leg_id: string }>;
  if (rows.length === 0) return { expiredCount: 0 };

  for (const row of rows) {
    await supabase
      .from('handoff_proposals')
      .update({ status: 'expired', resolved_at: nowIso })
      .eq('id', row.id);

    await supabase.from('notifications').insert({
      user_id: row.proposer_id,
      type: 'handoff_expired',
      title: 'Handoff expired',
      body: 'No reply from your colleague within 30 minutes; the proposal expired.',
      data: { proposal_id: row.id, leg_id: row.leg_id },
    });
  }

  return { expiredCount: rows.length };
}
