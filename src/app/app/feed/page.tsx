export const dynamic = 'force-dynamic';
export const metadata = { title: 'Feed' };

import { createClient } from '@/lib/supabase-server';
import { Bell, Search } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';
import Link from 'next/link';
import FeedClient from '@/components/feed/FeedClient';

export default async function FeedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch posts
  const { data: rawPosts } = await supabase
    .from('feed_posts')
    .select(`
      *,
      author:profiles!author_id(full_name, avatar_url, is_verified),
      ride:rides(origin_address, destination_address)
    `)
    .order('created_at', { ascending: false })
    .limit(15);

  // Check which posts the user has liked
  let likedPostIds: string[] = [];
  if (user && rawPosts) {
    const postIds = rawPosts.map((p) => p.id);
    const { data: likes } = await supabase
      .from('feed_likes')
      .select('post_id')
      .eq('user_id', user.id)
      .in('post_id', postIds);
    likedPostIds = (likes || []).map((l) => l.post_id);
  }

  // Get who the user follows
  let followingIds: string[] = [];
  if (user) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    followingIds = (follows || []).map((f) => f.following_id);
  }

  // Normalize Supabase join arrays
  const posts = (rawPosts || []).map((p: any) => ({
    ...p,
    author: Array.isArray(p.author) ? p.author[0] : p.author,
    ride: Array.isArray(p.ride) ? p.ride[0] : p.ride,
    liked_by_me: likedPostIds.includes(p.id),
  }));

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">{APP_NAME}</h1>
          <div className="flex items-center gap-2">
            <Link href="/app/drivers" className="p-1.5 text-surface-400 hover:text-white transition-colors">
              <Search className="w-5 h-5" />
            </Link>
            <Link href="/app/notifications" className="p-1.5 text-surface-400 hover:text-white transition-colors relative">
              <Bell className="w-5 h-5" />
            </Link>
          </div>
        </div>
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

      {/* Feed with filters, likes, comments, infinite scroll */}
      <FeedClient
        initialPosts={posts}
        currentUserId={user?.id || null}
        followingIds={followingIds}
      />
    </div>
  );
}
