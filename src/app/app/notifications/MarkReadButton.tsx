'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { CheckCheck } from 'lucide-react';

export default function MarkReadButton() {
  const router = useRouter();
  const supabase = createClient();

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    router.refresh();
  }

  return (
    <button
      onClick={markAllRead}
      className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
    >
      <CheckCheck className="w-4 h-4" />
      Mark all read
    </button>
  );
}
