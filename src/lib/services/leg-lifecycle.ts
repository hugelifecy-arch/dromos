import { SupabaseClient } from '@supabase/supabase-js';

export type LegStatus = 'open' | 'claimed' | 'confirmed' | 'in_progress' | 'completed' | 'disputed' | 'cancelled' | 'expired';

// Valid transitions
const VALID_TRANSITIONS: Record<LegStatus, LegStatus[]> = {
  open: ['claimed', 'cancelled', 'expired'],
  claimed: ['confirmed', 'open', 'cancelled'], // open = reject claim
  confirmed: ['in_progress', 'cancelled', 'disputed'],
  in_progress: ['completed', 'disputed'],
  completed: ['disputed'],
  disputed: ['completed', 'cancelled'], // admin resolution
  cancelled: [],
  expired: [],
};

export function canTransition(from: LegStatus, to: LegStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// Claim a leg (buyer claims an open leg)
export async function claimLeg(supabase: SupabaseClient, legId: string, buyerId: string) {
  const { data: leg, error: fetchError } = await supabase
    .from('empty_legs')
    .select('status, seller_id')
    .eq('id', legId)
    .single();

  if (fetchError || !leg) return { error: 'Leg not found' };
  if (leg.status !== 'open') return { error: 'Leg is no longer available' };
  if (leg.seller_id === buyerId) return { error: 'Cannot claim your own leg' };

  const { error } = await supabase
    .from('empty_legs')
    .update({
      buyer_id: buyerId,
      status: 'claimed',
      claimed_at: new Date().toISOString()
    })
    .eq('id', legId)
    .eq('status', 'open'); // optimistic concurrency

  if (error) return { error: 'Failed to claim leg' };
  return { success: true };
}

// Confirm handoff (seller confirms after buyer claims)
export async function confirmLeg(supabase: SupabaseClient, legId: string, sellerId: string) {
  const { data: leg, error: fetchError } = await supabase
    .from('empty_legs')
    .select('status, seller_id')
    .eq('id', legId)
    .single();

  if (fetchError || !leg) return { error: 'Leg not found' };
  if (leg.status !== 'claimed') return { error: 'Leg must be in claimed status' };
  if (leg.seller_id !== sellerId) return { error: 'Only the seller can confirm' };

  const { error } = await supabase
    .from('empty_legs')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString()
    })
    .eq('id', legId);

  if (error) return { error: 'Failed to confirm leg' };
  return { success: true };
}

// Reject claim (seller rejects, leg goes back to open)
export async function rejectClaim(supabase: SupabaseClient, legId: string, sellerId: string) {
  const { data: leg, error: fetchError } = await supabase
    .from('empty_legs')
    .select('status, seller_id')
    .eq('id', legId)
    .single();

  if (fetchError || !leg) return { error: 'Leg not found' };
  if (leg.status !== 'claimed') return { error: 'No claim to reject' };
  if (leg.seller_id !== sellerId) return { error: 'Only the seller can reject' };

  const { error } = await supabase
    .from('empty_legs')
    .update({
      buyer_id: null,
      status: 'open',
      claimed_at: null
    })
    .eq('id', legId);

  if (error) return { error: 'Failed to reject claim' };
  return { success: true };
}

// Cancel a leg (seller cancels before or after claim)
export async function cancelLeg(supabase: SupabaseClient, legId: string, userId: string) {
  const { data: leg, error: fetchError } = await supabase
    .from('empty_legs')
    .select('status, seller_id, buyer_id')
    .eq('id', legId)
    .single();

  if (fetchError || !leg) return { error: 'Leg not found' };
  if (!canTransition(leg.status as LegStatus, 'cancelled')) return { error: 'Cannot cancel in current status' };
  if (leg.seller_id !== userId && leg.buyer_id !== userId) return { error: 'Not authorized' };

  const { error } = await supabase
    .from('empty_legs')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString()
    })
    .eq('id', legId);

  if (error) return { error: 'Failed to cancel leg' };
  return { success: true };
}

// Mark leg as in progress
export async function startLeg(supabase: SupabaseClient, legId: string, userId: string) {
  const { data: leg, error: fetchError } = await supabase
    .from('empty_legs')
    .select('status, seller_id, buyer_id')
    .eq('id', legId)
    .single();

  if (fetchError || !leg) return { error: 'Leg not found' };
  if (leg.status !== 'confirmed') return { error: 'Leg must be confirmed first' };
  if (leg.seller_id !== userId && leg.buyer_id !== userId) return { error: 'Not authorized' };

  const { error } = await supabase
    .from('empty_legs')
    .update({ status: 'in_progress' })
    .eq('id', legId);

  if (error) return { error: 'Failed to start leg' };
  return { success: true };
}

// Complete a leg
export async function completeLeg(supabase: SupabaseClient, legId: string, userId: string) {
  const { data: leg, error: fetchError } = await supabase
    .from('empty_legs')
    .select('status, seller_id, buyer_id')
    .eq('id', legId)
    .single();

  if (fetchError || !leg) return { error: 'Leg not found' };
  if (leg.status !== 'in_progress') return { error: 'Leg must be in progress' };
  if (leg.seller_id !== userId && leg.buyer_id !== userId) return { error: 'Not authorized' };

  const { error } = await supabase
    .from('empty_legs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', legId);

  if (error) return { error: 'Failed to complete leg' };
  return { success: true };
}

// Raise dispute
export async function disputeLeg(supabase: SupabaseClient, legId: string, userId: string) {
  const { data: leg, error: fetchError } = await supabase
    .from('empty_legs')
    .select('status, seller_id, buyer_id')
    .eq('id', legId)
    .single();

  if (fetchError || !leg) return { error: 'Leg not found' };
  if (!canTransition(leg.status as LegStatus, 'disputed')) return { error: 'Cannot dispute in current status' };
  if (leg.seller_id !== userId && leg.buyer_id !== userId) return { error: 'Not authorized' };

  const { error } = await supabase
    .from('empty_legs')
    .update({ status: 'disputed' })
    .eq('id', legId);

  if (error) return { error: 'Failed to raise dispute' };
  return { success: true };
}
