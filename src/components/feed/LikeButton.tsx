'use client';

import { useState, useOptimistic, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';

interface LikeButtonProps {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
}

export default function LikeButton({ postId, initialLiked, initialCount }: LikeButtonProps) {
  const supabase = createClient();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  async function toggleLike() {
    const prev = { liked, count };
    // Optimistic
    setLiked(!liked);
    setCount(liked ? count - 1 : count + 1);

    startTransition(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLiked(prev.liked);
        setCount(prev.count);
        return;
      }

      if (prev.liked) {
        const { error } = await supabase
          .from('feed_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
        if (error) {
          setLiked(prev.liked);
          setCount(prev.count);
        }
      } else {
        const { error } = await supabase
          .from('feed_likes')
          .insert({ post_id: postId, user_id: user.id });
        if (error) {
          setLiked(prev.liked);
          setCount(prev.count);
        }
      }
    });
  }

  return (
    <button
      onClick={toggleLike}
      disabled={isPending}
      className={`flex items-center gap-1.5 text-sm transition-colors ${
        liked ? 'text-red-400' : 'text-surface-500 hover:text-red-400'
      }`}
    >
      <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
      {count > 0 && count}
    </button>
  );
}
