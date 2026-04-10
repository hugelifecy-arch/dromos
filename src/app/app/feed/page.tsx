export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { Heart, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AVATAR_PLACEHOLDER, APP_NAME } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import Link from 'next/link';

export default async function FeedPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: posts } = await supabase
    .from('feed_posts')
    .select(`
      *,
      author:profiles!author_id(full_name, avatar_url, is_verified),
      ride:rides(origin_address, destination_address)
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <h1 className="text-xl font-bold text-white">{APP_NAME}</h1>
      </header>

      {/* Create post prompt */}
      <Link href="/app/post" className="block p-4 border-b border-surface-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface-800" />
          <div className="flex-1 bg-surface-800 rounded-full px-4 py-2.5 text-surface-500 text-sm">
            What&apos;s on your mind?
          </div>
        </div>
      </Link>

      {/* Posts */}
      <div className="divide-y divide-surface-800">
        {posts?.map((post) => (
          <article key={post.id} className="p-4">
            {/* Author */}
            <div className="flex items-center gap-3 mb-3">
              <img
                src={post.author?.avatar_url || `${AVATAR_PLACEHOLDER}${post.author?.full_name || 'U'}`}
                alt=""
                className="w-10 h-10 rounded-full object-cover bg-surface-800"
              />
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-white font-medium text-sm">{post.author?.full_name}</span>
                  {post.author?.is_verified && <VerifiedBadge size="sm" />}
                </div>
                <time className="text-xs text-surface-500">
                  {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                </time>
              </div>
            </div>

            {/* Content */}
            <p className="text-surface-200 text-sm mb-3 whitespace-pre-wrap">{post.content}</p>

            {/* Linked ride */}
            {post.ride && (
              <div className="bg-surface-800/50 rounded-xl p-3 mb-3 text-sm">
                <p className="text-surface-400 text-xs mb-1">Shared a ride</p>
                <p className="text-white">{post.ride.origin_address} &rarr; {post.ride.destination_address}</p>
              </div>
            )}

            {/* Image */}
            {post.image_url && (
              <img src={post.image_url} alt="" className="w-full rounded-xl mb-3 max-h-80 object-cover" />
            )}

            {/* Actions */}
            <div className="flex items-center gap-6 text-surface-500">
              <button className="flex items-center gap-1.5 text-sm hover:text-red-400 transition-colors">
                <Heart className="w-4 h-4" />
                {post.likes_count > 0 && post.likes_count}
              </button>
              <button className="flex items-center gap-1.5 text-sm hover:text-brand-400 transition-colors">
                <MessageCircle className="w-4 h-4" />
                {post.comments_count > 0 && post.comments_count}
              </button>
            </div>
          </article>
        ))}

        {(!posts || posts.length === 0) && (
          <div className="p-8 text-center text-surface-500">
            <p className="text-lg mb-2">No posts yet</p>
            <p className="text-sm">Be the first to share something with the community!</p>
          </div>
        )}
      </div>
    </div>
  );
}
