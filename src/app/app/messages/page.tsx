export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { formatDistanceToNow } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';

export default async function MessagesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Get conversations with last message and other participant
  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', user.id);

  const conversationIds = participants?.map((p) => p.conversation_id) || [];

  let conversations: Array<{
    id: string;
    other_user: { full_name: string; avatar_url: string | null };
    last_message: { body: string; created_at: string } | null;
  }> = [];

  if (conversationIds.length > 0) {
    // For each conversation, get the other participant and last message
    const { data: convData } = await supabase
      .from('conversations')
      .select('id')
      .in('id', conversationIds)
      .order('created_at', { ascending: false });

    if (convData) {
      for (const conv of convData) {
        const { data: otherParticipant } = await supabase
          .from('conversation_participants')
          .select('user_id, profile:profiles!user_id(full_name, avatar_url)')
          .eq('conversation_id', conv.id)
          .neq('user_id', user.id)
          .single();

        const { data: lastMsg } = await supabase
          .from('messages')
          .select('body, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (otherParticipant?.profile) {
          conversations.push({
            id: conv.id,
            other_user: otherParticipant.profile as unknown as { full_name: string; avatar_url: string | null },
            last_message: lastMsg,
          });
        }
      }
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <h1 className="text-xl font-bold text-white">Messages</h1>
      </header>

      <div className="divide-y divide-surface-800">
        {conversations.map((conv) => (
          <div key={conv.id} className="flex items-center gap-3 p-4 hover:bg-surface-900/50 transition-colors cursor-pointer">
            <img
              src={conv.other_user.avatar_url || `${AVATAR_PLACEHOLDER}${conv.other_user.full_name}`}
              alt=""
              className="w-12 h-12 rounded-full object-cover bg-surface-800"
            />
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{conv.other_user.full_name}</p>
              {conv.last_message && (
                <p className="text-sm text-surface-400 truncate">{conv.last_message.body}</p>
              )}
            </div>
            {conv.last_message && (
              <time className="text-xs text-surface-500 flex-shrink-0">
                {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: true })}
              </time>
            )}
          </div>
        ))}

        {conversations.length === 0 && (
          <div className="p-8 text-center text-surface-500">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">No messages yet</p>
            <p className="text-sm">Start a conversation when you book or offer a ride</p>
          </div>
        )}
      </div>
    </div>
  );
}
