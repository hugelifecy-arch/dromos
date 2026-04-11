'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { UserPlus, UserCheck } from 'lucide-react';

interface FollowButtonProps {
  targetUserId: string;
  initialFollowing: boolean;
  size?: 'sm' | 'md';
}

export default function FollowButton({ targetUserId, initialFollowing, size = 'md' }: FollowButtonProps) {
  const supabase = createClient();
  const [following, setFollowing] = useState(initialFollowing);
  const [isPending, startTransition] = useTransition();

  async function toggleFollow() {
    const prev = following;
    setFollowing(!following);

    startTransition(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFollowing(prev); return; }

      if (prev) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId);
        if (error) setFollowing(prev);
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetUserId });
        if (error) setFollowing(prev);
      }
    });
  }

  const isSmall = size === 'sm';

  if (following) {
    return (
      <button
        onClick={toggleFollow}
        disabled={isPending}
        className={`flex items-center gap-1.5 border border-surface-600 text-surface-300 rounded-xl font-medium transition-colors hover:border-red-500/50 hover:text-red-400 ${
          isSmall ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'
        }`}
      >
        <UserCheck className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
        Following
      </button>
    );
  }

  return (
    <button
      onClick={toggleFollow}
      disabled={isPending}
      className={`flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors ${
        isSmall ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'
      }`}
    >
      <UserPlus className={isSmall ? 'w-3 h-3' : 'w-4 h-4'} />
      Follow
    </button>
  );
}
