export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, MapPin, ArrowRight, Clock } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import ChatThread from './ChatThread';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Verify user is a participant
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('conversation_id', id)
    .eq('user_id', user.id)
    .single();

  if (!participant) notFound();

  // Get conversation with leg context
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, empty_leg_id')
    .eq('id', id)
    .single();

  if (!conv) notFound();

  // Get other participant
  const { data: otherParticipant } = await supabase
    .from('conversation_participants')
    .select('user_id, profile:profiles!user_id(full_name, avatar_url)')
    .eq('conversation_id', id)
    .neq('user_id', user.id)
    .single();

  const otherUser = otherParticipant?.profile as unknown as { full_name: string; avatar_url: string | null } | null;

  // Get leg context if exists
  let legContext: {
    id: string;
    origin: string;
    destination: string;
    departure_datetime: string;
    asking_price: number;
    status: string;
    seller_id: string;
    buyer_id: string | null;
  } | null = null;

  if (conv.empty_leg_id) {
    const { data: legData } = await supabase
      .from('empty_legs')
      .select('id, origin, destination, departure_datetime, asking_price, status, seller_id, buyer_id')
      .eq('id', conv.empty_leg_id)
      .single();
    legContext = legData;
  }

  // Get initial messages
  const { data: initialMessages } = await supabase
    .from('messages')
    .select(`
      id, conversation_id, sender_id, body, message_type, metadata, created_at,
      sender:profiles!sender_id(full_name, avatar_url)
    `)
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(50);

  // Get pending counter-offers
  const { data: pendingOffers } = await supabase
    .from('counter_offers')
    .select('*')
    .eq('conversation_id', id)
    .eq('status', 'pending');

  // Update last_read_at
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', id)
    .eq('user_id', user.id);

  // Normalize messages: Supabase joins return sender as array, ChatThread expects object|null
  const normalizedMessages = (initialMessages || []).map((msg) => {
    const raw = msg as Record<string, unknown>;
    const sender = raw.sender;
    return {
      id: msg.id as string,
      conversation_id: msg.conversation_id as string,
      sender_id: msg.sender_id as string,
      body: msg.body as string,
      message_type: (msg.message_type || 'text') as string,
      metadata: (msg.metadata || {}) as Record<string, unknown>,
      created_at: msg.created_at as string,
      sender: Array.isArray(sender) ? sender[0] || null : sender || null,
    };
  });

  const STATUS_BADGE: Record<string, string> = {
    open: 'bg-green-500/10 text-green-400',
    claimed: 'bg-yellow-500/10 text-yellow-400',
    confirmed: 'bg-blue-500/10 text-blue-400',
    in_progress: 'bg-purple-500/10 text-purple-400',
    completed: 'bg-green-500/10 text-green-400',
    cancelled: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col h-screen">
      {/* Header */}
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <div className="flex items-center gap-3">
          <Link href="/app/messages" className="p-1 text-surface-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{otherUser?.full_name || 'Driver'}</p>
          </div>
        </div>
      </header>

      {/* Pinned Leg Context */}
      {legContext && (
        <Link href={`/app/ride/${legContext.id}`}>
          <div className="bg-surface-900 border-b border-surface-800 px-4 py-3 hover:bg-surface-800/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm min-w-0">
                <MapPin className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                <span className="text-white truncate">{legContext.origin}</span>
                <ArrowRight className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                <span className="text-white truncate">{legContext.destination}</span>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[legContext.status] || 'bg-surface-700 text-surface-300'}`}>
                {legContext.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-surface-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(legContext.departure_datetime), 'EEE, MMM d - HH:mm')}
              </span>
              <span className="font-medium text-white">€{Number(legContext.asking_price).toFixed(2)}</span>
            </div>
          </div>
        </Link>
      )}

      {/* Chat Thread (client component with real-time) */}
      <ChatThread
        conversationId={id}
        currentUserId={user.id}
        initialMessages={normalizedMessages}
        legContext={legContext}
        pendingOffers={pendingOffers || []}
      />
    </div>
  );
}
