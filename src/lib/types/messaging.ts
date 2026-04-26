// Messaging & Notification Types

export type MessageType = 'text' | 'counter_offer' | 'system' | 'quick_reply';

export type CounterOfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export type NotificationType =
  | 'leg_claimed'
  | 'leg_confirmed'
  | 'leg_rejected'
  | 'leg_cancelled'
  | 'new_message'
  | 'counter_offer'
  | 'counter_offer_response'
  | 'departure_reminder'
  | 'new_leg_in_district'
  | 'system'
  | 'handoff_proposed'
  | 'handoff_accepted'
  | 'handoff_declined'
  | 'handoff_expired';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: MessageType;
  metadata: Record<string, unknown>;
  created_at: string;
  sender?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export interface CounterOffer {
  id: string;
  conversation_id: string;
  empty_leg_id: string;
  proposer_id: string;
  original_price: number;
  proposed_price: number;
  status: CounterOfferStatus;
  message_id: string | null;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
  proposer?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  new_leg_in_district: boolean;
  leg_claimed: boolean;
  leg_confirmed: boolean;
  new_message: boolean;
  counter_offer: boolean;
  departure_reminder: boolean;
  departure_reminder_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export const QUICK_REPLIES = [
  'When can you do the handoff?',
  'Can you confirm the pickup location?',
  'Is the time flexible?',
  'How many passengers?',
  'I\'m on my way',
  'Confirmed, see you there',
  'Can you do a lower price?',
  'Deal! Let\'s confirm.',
] as const;
