export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { formatDistanceToNow } from 'date-fns';
import { MessageCircle, ArrowRight, MapPin } from 'lucide-react';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import Link from 'next/link';

interface ConversationRow {
  id: string;
  empty_leg_id: string | null;
  other_user: { full_name: string; avatar_url: string | null };
  last_message: { body: string; created_at: string; message_type: string } | null;
  unread_count: number;
  leg_summary: { origin: string; destination: string; status: string; asking_price: number } | null;
}

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Get conversations the user participates in
  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_id', user.id);

  const conversationIds = participants?.map((p) => p.conversation_id) || [];
  const lastReadMap = new Map(participants?.map((p) => [p.conversation_id, p.last_read_at]) || []);

  const conversations: ConversationRow[] = [];

  if (conversationIds.length > 0) {
    // Fetch conversations with empty_leg_id
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, empty_leg_id')
      .in('id', conversationIds)
      .order('created_at', { ascending: false });

    if (convData) {
      for (const conv of convData) {
        // Other participant
        const { data: otherParticipant } = await supabase
          .from('conversation_participants')
          .select('user_id, profile:profiles!user_id(full_name, avatar_url)')
          .eq('conversation_id', conv.id)
          .neq('user_id', user.id)
          .single();

        // Last message
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('body, created_at, message_type')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Unread count
        const lastRead = lastReadMap.get(conv.id) || '1970-01-01T00:00:00Z';
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', user.id)
          .gt('created_at', lastRead);

        // Leg summary if linked
        let legSummary: ConversationRow['leg_summary'] = null;
        if (conv.empty_leg_id) {
          const { data: legData } = await supabase
            .from('empty_legs')
            .select('origin, destination, status, asking_price')
            .eq('id', conv.empty_leg_id)
            .single();
          if (legData) {
            legSummary = legData;
          }
        }

        if (otherParticipant?.profile) {
          conversations.push({
            id: conv.id,
            empty_leg_id: conv.empty_leg_id,
            other_user: otherParticipant.profile as unknown as { full_name: string; avatar_url: string | null },
            last_message: lastMsg,
            unread_count: unreadCount || 0,
            leg_summary: legSummary,
          });
        }
      }
    }
  }

  const STATUS_BADGE: Record<string, string> = {
    open: 'bg-green-500/10 text-green-400',
    claimed: 'bg-yellow-500/10 text-yellow-400',
    confirmed: 'bg-blue-500/10 text-blue-400',
    in_progress: 'bg-purple-500/10 text-purple-400',
    completed: 'bg-green-500/10 text-green-400',
    cancelled: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <h1 className="text-xl font-bold text-white">Messages</h1>
        {conversations.length > 0 && (
          <p className="text-xs text-surface-500 mt-1">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        )}
      </header>

      <div className="divide-y divide-surface-800">
        {conversations.map((conv) => (
          <Link key={conv.id} href={`/app/messages/${conv.id}`}>
            <div className="flex items-start gap-3 p-4 hover:bg-surface-900/50 transition-colors cursor-pointer">
              {/* Avatar with unread dot */}
              <div className="relative flex-shrink-0">
                <img
                  src={conv.other_user.avatar_url || `${AVATAR_PLACEHOLDER}${conv.other_user.full_name}`}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover bg-surface-800"
                />
                {conv.unread_count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {conv.unread_count > 9 ? '9+' : conv.unread_count}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                {/* Name row */}
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className={`font-medium truncate ${conv.unread_count > 0 ? 'text-white' : 'text-surface-300'}`}>
                    {conv.other_user.full_name}
                  </p>
                  {conv.last_message && (
                    <time className="text-xs text-surface-500 flex-shrink-0">
                      {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: true })}
                    </time>
                  )}
                </div>

                {/* Last message */}
                {conv.last_message && (
                  <p className={`text-sm truncate mb-1.5 ${conv.unread_count > 0 ? 'text-surface-300 font-medium' : 'text-surface-500'}`}>
                    {conv.last_message.message_type === 'system'
                      ? `📋 ${conv.last_message.body}`
                      : conv.last_message.message_type === 'counter_offer'
                        ? `💰 Counter-offer sent`
                        : conv.last_message.body}
                  </p>
                )}

                {/* Leg context badge */}
                {conv.leg_summary && (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 text-xs text-surface-400 bg-surface-800/80 rounded-lg px-2 py-1 max-w-full">
                      <MapPin className="w-3 h-3 flex-shrink-0 text-brand-400" />
                      <span className="truncate">{conv.leg_summary.origin}</span>
                      <ArrowRight className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{conv.leg_summary.destination}</span>
                      <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${STATUS_BADGE[conv.leg_summary.status] || 'bg-surface-700 text-surface-300'}`}>
                        {conv.leg_summary.status}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}

        {conversations.length === 0 && (
          <div className="p-8 text-center text-surface-500">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">No messages yet</p>
            <p className="text-sm">Conversations start automatically when a leg is claimed</p>
          </div>
        )}
      </div>
    </div>
  );
}
