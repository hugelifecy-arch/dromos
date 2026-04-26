export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import MarkReadButton from './MarkReadButton';
import HandoffActions from './HandoffActions';

const NOTIFICATION_ICONS: Record<string, string> = {
  leg_claimed: '🤝',
  leg_confirmed: '✅',
  leg_rejected: '❌',
  leg_cancelled: '🚫',
  new_message: '💬',
  counter_offer: '💰',
  counter_offer_response: '💰',
  departure_reminder: '⏰',
  new_leg_in_district: '📍',
  system: '📋',
  handoff_proposed: '🤲',
  handoff_accepted: '✅',
  handoff_declined: '🙅',
  handoff_expired: '⌛',
};

function getNotificationLink(data: Record<string, unknown>): string {
  if (data.leg_id) return `/app/ride/${data.leg_id}`;
  if (data.conversation_id) return `/app/messages/${data.conversation_id}`;
  return '/app/notifications';
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const unreadCount = notifications?.filter((n) => !n.is_read).length || 0;

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-brand-400 mt-0.5">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && <MarkReadButton />}
        </div>
      </header>

      <div className="divide-y divide-surface-800">
        {notifications?.map((notif) => {
          const icon = NOTIFICATION_ICONS[notif.type] || '🔔';
          const link = getNotificationLink(notif.data || {});
          const data = (notif.data ?? {}) as Record<string, unknown>;
          const isHandoffProposal = notif.type === 'handoff_proposed' && typeof data.proposal_id === 'string';

          return (
            <Link key={notif.id} href={link}>
              <div className={`flex items-start gap-3 p-4 hover:bg-surface-900/50 transition-colors ${!notif.is_read ? 'bg-brand-500/5' : ''}`}>
                <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${!notif.is_read ? 'text-white font-medium' : 'text-surface-300'}`}>
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="text-xs text-surface-500 mt-0.5 truncate">{notif.body}</p>
                  )}
                  <time className="text-[10px] text-surface-600 mt-1 block">
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                  </time>
                </div>
                {isHandoffProposal && (
                  <HandoffActions proposalId={data.proposal_id as string} />
                )}
                {!notif.is_read && !isHandoffProposal && (
                  <div className="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0 mt-2" />
                )}
              </div>
            </Link>
          );
        })}

        {(!notifications || notifications.length === 0) && (
          <div className="p-8 text-center text-surface-500">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">No notifications yet</p>
            <p className="text-sm">You'll get notified when someone claims your legs or sends a message</p>
          </div>
        )}
      </div>
    </div>
  );
}
