import type { SupabaseClient } from '@supabase/supabase-js';

interface CounterOfferResult {
  success: boolean;
  error?: string;
}

/**
 * Create a counter-offer on a leg within a conversation.
 */
export async function createCounterOffer(
  supabase: SupabaseClient,
  params: {
    conversationId: string;
    emptyLegId: string;
    proposerId: string;
    originalPrice: number;
    proposedPrice: number;
  }
): Promise<CounterOfferResult> {
  const { conversationId, emptyLegId, proposerId, originalPrice, proposedPrice } = params;

  if (proposedPrice <= 0) {
    return { success: false, error: 'Proposed price must be greater than 0' };
  }

  if (proposedPrice === originalPrice) {
    return { success: false, error: 'Proposed price must differ from the original' };
  }

  // Check for existing pending counter-offer in this conversation
  const { data: existing } = await supabase
    .from('counter_offers')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'pending')
    .limit(1)
    .single();

  if (existing) {
    return { success: false, error: 'There is already a pending counter-offer in this conversation' };
  }

  // Check the leg is still claimable/negotiable
  const { data: leg } = await supabase
    .from('empty_legs')
    .select('status')
    .eq('id', emptyLegId)
    .single();

  if (!leg || !['open', 'claimed'].includes(leg.status)) {
    return { success: false, error: 'This leg is no longer available for negotiation' };
  }

  // Insert counter-offer
  const { error } = await supabase.from('counter_offers').insert({
    conversation_id: conversationId,
    empty_leg_id: emptyLegId,
    proposer_id: proposerId,
    original_price: originalPrice,
    proposed_price: proposedPrice,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Accept a counter-offer: update offer status, update leg price.
 */
export async function acceptCounterOffer(
  supabase: SupabaseClient,
  offerId: string,
  userId: string
): Promise<CounterOfferResult> {
  const { data: offer } = await supabase
    .from('counter_offers')
    .select('*')
    .eq('id', offerId)
    .single();

  if (!offer) {
    return { success: false, error: 'Counter-offer not found' };
  }

  if (offer.status !== 'pending') {
    return { success: false, error: 'Counter-offer is no longer pending' };
  }

  if (offer.proposer_id === userId) {
    return { success: false, error: 'You cannot accept your own counter-offer' };
  }

  // Update offer
  const { error: updateError } = await supabase
    .from('counter_offers')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', offerId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Update leg price
  await supabase
    .from('empty_legs')
    .update({ asking_price: offer.proposed_price })
    .eq('id', offer.empty_leg_id);

  return { success: true };
}

/**
 * Reject a counter-offer.
 */
export async function rejectCounterOffer(
  supabase: SupabaseClient,
  offerId: string,
  userId: string
): Promise<CounterOfferResult> {
  const { data: offer } = await supabase
    .from('counter_offers')
    .select('*')
    .eq('id', offerId)
    .single();

  if (!offer) {
    return { success: false, error: 'Counter-offer not found' };
  }

  if (offer.status !== 'pending') {
    return { success: false, error: 'Counter-offer is no longer pending' };
  }

  if (offer.proposer_id === userId) {
    return { success: false, error: 'You cannot reject your own counter-offer' };
  }

  const { error } = await supabase
    .from('counter_offers')
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', offerId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
