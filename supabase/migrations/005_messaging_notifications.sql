-- ============================================
-- SPRINT 3: Messaging & Communication Upgrade
-- ============================================

-- 1. Add empty_leg_id to conversations (leg-context threading)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS empty_leg_id uuid REFERENCES public.empty_legs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_empty_leg ON public.conversations(empty_leg_id);

-- 2. Add message_type to messages for counter-offers and system messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text'
    CHECK (message_type IN ('text', 'counter_offer', 'system', 'quick_reply'));

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- 3. Counter-offers table
CREATE TABLE IF NOT EXISTS public.counter_offers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  empty_leg_id uuid REFERENCES public.empty_legs(id) ON DELETE CASCADE NOT NULL,
  proposer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  original_price numeric(10,2) NOT NULL,
  proposed_price numeric(10,2) NOT NULL CHECK (proposed_price > 0),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.counter_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view counter offers"
  ON public.counter_offers FOR SELECT
  USING (conversation_id IN (
    SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid()
  ));

CREATE POLICY "Participants can create counter offers"
  ON public.counter_offers FOR INSERT
  WITH CHECK (
    auth.uid() = proposer_id AND
    conversation_id IN (
      SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can update counter offers"
  ON public.counter_offers FOR UPDATE
  USING (conversation_id IN (
    SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_counter_offers_conversation ON public.counter_offers(conversation_id);
CREATE INDEX idx_counter_offers_leg ON public.counter_offers(empty_leg_id);
CREATE INDEX idx_counter_offers_status ON public.counter_offers(status) WHERE status = 'pending';

-- 4. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN (
    'leg_claimed', 'leg_confirmed', 'leg_rejected', 'leg_cancelled',
    'new_message', 'counter_offer', 'counter_offer_response',
    'departure_reminder', 'new_leg_in_district', 'system'
  )),
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- System can insert notifications (service role)
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- 5. Notification preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  push_enabled boolean DEFAULT true,
  email_enabled boolean DEFAULT false,
  new_leg_in_district boolean DEFAULT true,
  leg_claimed boolean DEFAULT true,
  leg_confirmed boolean DEFAULT true,
  new_message boolean DEFAULT true,
  counter_offer boolean DEFAULT true,
  departure_reminder boolean DEFAULT true,
  departure_reminder_minutes integer DEFAULT 60,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. Add conversation insert policy (missing from original schema)
CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Participants can add participants"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Function to auto-create conversation on leg claim
CREATE OR REPLACE FUNCTION public.create_conversation_on_claim()
RETURNS trigger AS $$
DECLARE
  conv_id uuid;
BEGIN
  -- Only fire when buyer_id changes from NULL to a value (claim)
  IF OLD.buyer_id IS NULL AND NEW.buyer_id IS NOT NULL AND NEW.status = 'claimed' THEN
    -- Check if conversation already exists for this leg between these users
    SELECT c.id INTO conv_id
    FROM public.conversations c
    JOIN public.conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = NEW.seller_id
    JOIN public.conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = NEW.buyer_id
    WHERE c.empty_leg_id = NEW.id
    LIMIT 1;

    IF conv_id IS NULL THEN
      -- Create conversation
      INSERT INTO public.conversations (empty_leg_id)
      VALUES (NEW.id)
      RETURNING id INTO conv_id;

      -- Add both participants
      INSERT INTO public.conversation_participants (conversation_id, user_id)
      VALUES (conv_id, NEW.seller_id), (conv_id, NEW.buyer_id);

      -- Insert system message
      INSERT INTO public.messages (conversation_id, sender_id, body, message_type)
      VALUES (
        conv_id,
        NEW.buyer_id,
        'Leg claimed — you can now discuss details.',
        'system'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_leg_claimed
  AFTER UPDATE ON public.empty_legs
  FOR EACH ROW EXECUTE PROCEDURE public.create_conversation_on_claim();

-- 8. Function to create notification on leg events
CREATE OR REPLACE FUNCTION public.notify_leg_event()
RETURNS trigger AS $$
BEGIN
  -- Leg claimed → notify seller
  IF OLD.status = 'open' AND NEW.status = 'claimed' AND NEW.buyer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.seller_id,
      'leg_claimed',
      'Leg Claimed!',
      'A driver has claimed your leg from ' || NEW.origin || ' to ' || NEW.destination,
      jsonb_build_object('leg_id', NEW.id, 'buyer_id', NEW.buyer_id)
    );
  END IF;

  -- Leg confirmed → notify buyer
  IF OLD.status = 'claimed' AND NEW.status = 'confirmed' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.buyer_id,
      'leg_confirmed',
      'Handoff Confirmed!',
      'The seller confirmed your claim on leg from ' || NEW.origin || ' to ' || NEW.destination,
      jsonb_build_object('leg_id', NEW.id, 'seller_id', NEW.seller_id)
    );
  END IF;

  -- Claim rejected → notify buyer
  IF OLD.status = 'claimed' AND NEW.status = 'open' AND OLD.buyer_id IS NOT NULL AND NEW.buyer_id IS NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      OLD.buyer_id,
      'leg_rejected',
      'Claim Rejected',
      'The seller rejected your claim on leg from ' || NEW.origin || ' to ' || NEW.destination,
      jsonb_build_object('leg_id', NEW.id)
    );
  END IF;

  -- Leg cancelled → notify buyer if exists
  IF NEW.status = 'cancelled' AND OLD.buyer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      OLD.buyer_id,
      'leg_cancelled',
      'Leg Cancelled',
      'The leg from ' || NEW.origin || ' to ' || NEW.destination || ' has been cancelled.',
      jsonb_build_object('leg_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_leg_status_change
  AFTER UPDATE ON public.empty_legs
  FOR EACH ROW EXECUTE PROCEDURE public.notify_leg_event();

-- 9. Enable Supabase Realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.empty_legs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.counter_offers;
