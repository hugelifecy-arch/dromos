'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Send, DollarSign, X, Check, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import { QUICK_REPLIES } from '@/lib/types/messaging';

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  sender?: { full_name: string; avatar_url: string | null } | null;
}

interface CounterOfferRow {
  id: string;
  conversation_id: string;
  empty_leg_id: string;
  proposer_id: string;
  original_price: number;
  proposed_price: number;
  status: string;
  message_id: string | null;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
}

interface LegContext {
  id: string;
  origin: string;
  destination: string;
  departure_datetime: string;
  asking_price: number;
  status: string;
  seller_id: string;
  buyer_id: string | null;
}

interface ChatThreadProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: MessageRow[];
  legContext: LegContext | null;
  pendingOffers: CounterOfferRow[];
}

export default function ChatThread({
  conversationId,
  currentUserId,
  initialMessages,
  legContext,
  pendingOffers: initialOffers,
}: ChatThreadProps) {
  const supabase = createClient();
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [pendingOffers, setPendingOffers] = useState<CounterOfferRow[]>(initialOffers);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showCounterOffer, setShowCounterOffer] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Real-time message subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload: { new: MessageRow }) => {
          const newMsg = payload.new as MessageRow;
          // Don't add if already exists (optimistic)
          if (messages.find((m) => m.id === newMsg.id)) return;

          // Fetch sender info
          if (newMsg.sender_id !== currentUserId) {
            const { data: sender } = await supabase
              .from('profiles')
              .select('full_name, avatar_url')
              .eq('id', newMsg.sender_id)
              .single();
            newMsg.sender = sender;
          }

          setMessages((prev) => [...prev, newMsg]);

          // Update last_read_at
          await supabase
            .from('conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', currentUserId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'counter_offers',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { eventType: string; new: CounterOfferRow }) => {
          if (payload.eventType === 'INSERT') {
            setPendingOffers((prev) => [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setPendingOffers((prev) =>
              prev.map((o) => (o.id === payload.new.id ? payload.new : o))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, supabase, messages]);

  // Send text message
  async function sendMessage(text: string) {
    if (!text.trim()) return;
    setSending(true);

    const optimistic: MessageRow = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: text.trim(),
      message_type: 'text',
      metadata: {},
      created_at: new Date().toISOString(),
      sender: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: text.trim(),
      message_type: 'text',
    });

    setSending(false);
    inputRef.current?.focus();
  }

  // Send quick reply
  async function sendQuickReply(text: string) {
    setShowQuickReplies(false);
    await sendMessage(text);
  }

  // Submit counter-offer
  async function submitCounterOffer() {
    if (!legContext || !counterPrice) return;
    const price = parseFloat(counterPrice);
    if (isNaN(price) || price <= 0) return;

    setSending(true);

    // Insert counter-offer
    const { data: offer } = await supabase
      .from('counter_offers')
      .insert({
        conversation_id: conversationId,
        empty_leg_id: legContext.id,
        proposer_id: currentUserId,
        original_price: legContext.asking_price,
        proposed_price: price,
      })
      .select()
      .single();

    // Insert message referencing the counter-offer
    if (offer) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        body: `Counter-offer: €${price.toFixed(2)} (original: €${Number(legContext.asking_price).toFixed(2)})`,
        message_type: 'counter_offer',
        metadata: { counter_offer_id: offer.id, proposed_price: price },
      });
    }

    setShowCounterOffer(false);
    setCounterPrice('');
    setSending(false);
  }

  // Accept counter-offer
  async function acceptOffer(offer: CounterOfferRow) {
    await supabase
      .from('counter_offers')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', offer.id);

    // Update leg asking price
    if (legContext) {
      await supabase
        .from('empty_legs')
        .update({ asking_price: offer.proposed_price })
        .eq('id', legContext.id);
    }

    // Send system message
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: `Counter-offer of €${Number(offer.proposed_price).toFixed(2)} accepted! Price updated.`,
      message_type: 'system',
    });

    setPendingOffers((prev) => prev.filter((o) => o.id !== offer.id));
  }

  // Reject counter-offer
  async function rejectOffer(offer: CounterOfferRow) {
    await supabase
      .from('counter_offers')
      .update({ status: 'rejected', responded_at: new Date().toISOString() })
      .eq('id', offer.id);

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: `Counter-offer of €${Number(offer.proposed_price).toFixed(2)} was declined.`,
      message_type: 'system',
    });

    setPendingOffers((prev) => prev.filter((o) => o.id !== offer.id));
  }

  const activePendingOffers = pendingOffers.filter(
    (o) => o.status === 'pending' && o.proposer_id !== currentUserId
  );

  return (
    <>
      {/* Pending counter-offer banner */}
      {activePendingOffers.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 space-y-2">
          {activePendingOffers.map((offer) => (
            <div key={offer.id} className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <span className="text-amber-300 font-medium">Counter-offer:</span>
                <span className="text-white ml-1">€{Number(offer.proposed_price).toFixed(2)}</span>
                <span className="text-surface-400 ml-1">(was €{Number(offer.original_price).toFixed(2)})</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => acceptOffer(offer)}
                  className="p-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                  title="Accept"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => rejectOffer(offer)}
                  className="p-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                  title="Reject"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === currentUserId;
          const isSystem = msg.message_type === 'system';
          const isCounterOffer = msg.message_type === 'counter_offer';

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-surface-500 bg-surface-800/50 px-3 py-1 rounded-full">
                  {msg.body}
                </span>
              </div>
            );
          }

          if (isCounterOffer) {
            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isOwn ? 'bg-brand-600/20 border border-brand-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
                  <p className="text-xs text-surface-400 mb-1">
                    {isOwn ? 'You proposed' : 'Counter-offer received'}
                  </p>
                  <p className="text-white font-medium">{msg.body}</p>
                  <time className="text-[10px] text-surface-500 mt-1 block">
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </time>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isOwn && (
                <img
                  src={msg.sender?.avatar_url || `${AVATAR_PLACEHOLDER}${msg.sender?.full_name || '?'}`}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover bg-surface-800 flex-shrink-0 mt-1"
                />
              )}
              <div className={`max-w-[75%] ${isOwn ? 'bg-brand-600 text-white' : 'bg-surface-800 text-white'} rounded-2xl px-4 py-2.5`}>
                <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                <time className={`text-[10px] mt-1 block ${isOwn ? 'text-brand-200' : 'text-surface-500'}`}>
                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                </time>
              </div>
            </div>
          );
        })}

        {messages.length === 0 && (
          <div className="text-center text-surface-500 py-8">
            <p className="text-sm">Start the conversation</p>
          </div>
        )}
      </div>

      {/* Quick replies */}
      {showQuickReplies && (
        <div className="bg-surface-900 border-t border-surface-800 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-surface-400 font-medium">Quick replies</span>
            <button onClick={() => setShowQuickReplies(false)} className="text-surface-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                onClick={() => sendQuickReply(reply)}
                className="text-xs bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white px-3 py-1.5 rounded-full transition-colors"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Counter-offer form */}
      {showCounterOffer && legContext && (
        <div className="bg-surface-900 border-t border-surface-800 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-surface-400 font-medium">
              Counter-offer (current: €{Number(legContext.asking_price).toFixed(2)})
            </span>
            <button onClick={() => setShowCounterOffer(false)} className="text-surface-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              step="0.50"
              value={counterPrice}
              onChange={(e) => setCounterPrice(e.target.value)}
              placeholder="Your price €"
              className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={submitCounterOffer}
              disabled={!counterPrice || sending}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="bg-surface-950 border-t border-surface-800 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Quick reply toggle */}
          <button
            onClick={() => {
              setShowQuickReplies(!showQuickReplies);
              setShowCounterOffer(false);
            }}
            className="p-2 text-surface-500 hover:text-brand-400 transition-colors flex-shrink-0"
            title="Quick replies"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M8 10h8" />
              <path d="M8 14h4" />
            </svg>
          </button>

          {/* Counter-offer toggle (only if leg context exists) */}
          {legContext && legContext.status !== 'completed' && legContext.status !== 'cancelled' && (
            <button
              onClick={() => {
                setShowCounterOffer(!showCounterOffer);
                setShowQuickReplies(false);
              }}
              className="p-2 text-surface-500 hover:text-amber-400 transition-colors flex-shrink-0"
              title="Make counter-offer"
            >
              <DollarSign className="w-5 h-5" />
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Type a message..."
            className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {/* Send */}
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || sending}
            className="p-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
