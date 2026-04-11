export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { Heart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AVATAR_PLACEHOLDER, APP_NAME } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import RideCard from '@/components/ui/RideCard';
import CommentSection from '@/components/ui/CommentSection';
import Link from 'next/link';
import type { Ride } from '@/types/database';

type FeedPost = {
  _type: 'post';
  id: string;
  content: string;
  image_url: string | null;
  ride_id: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author?: { full_name: string; avatar_url: string | null; is_verified: boolean };
  ride?: { origin_address: string; destination_address: string } | null;
};

type FeedRide = {
  _type: 'ride';
  id: string;
  created_at: string;
} & Ride & {
  driver?: { full_name: string; avatar_url: string | null; rating_avg: number; is_verified: boolean };
};

type FeedItem = FeedPost | FeedRide;

export default async function FeedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [postsResult, ridesResult] = await Promise.all([
    supabase
      .from('feed_posts')
      .select(`
        *,
        author:profiles!author_id(full_name, avatar_url, is_verified),
        ride:rides(origin_address, destination_address)
      `)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('rides')
      .select(`
        *,
        driver:profiles!driver_id(full_name, avatar_url, rating_avg, is_verified)
      `)
      .eq('status', 'upcoming')
      .gt('seats_available', 0)
      .gt('departure_time', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const posts: FeedItem[] = (postsResult.data || []).map((p) => ({ ...p, _type: 'post' as const }));
  const rides: FeedItem[] = (ridesResult.data || []).map((r) => ({ ...r, _type: 'ride' as const }));

  // Merge and sort by created_at descending
  const feedItems = [...posts, ...rides].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

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

      {/* Feed items */}
      <div className="divide-y divide-surface-800">
        {feedItems.map((item) =>
          item._type === 'ride' ? (
            <div key={`ride-${item.id}`} className="p-4">
              <p className="text-xs text-surface-500 mb-2 font-medium uppercase tracking-wide">New ride available</p>
              <RideCard ride={item as FeedRide} />
            </div>
          ) : (
            <article key={`post-${item.id}`} className="p-4">
              {/* Author */}
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={(item as FeedPost).author?.avatar_url || `${AVATAR_PLACEHOLDER}${(item as FeedPost).author?.full_name || 'U'}`}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover bg-surface-800"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-medium text-sm">{(item as FeedPost).author?.full_name}</span>
                    {(item as FeedPost).author?.is_verified && <VerifiedBadge size="sm" />}
                  </div>
                  <time className="text-xs text-surface-500">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </time>
                </div>
              </div>

              {/* Content */}
              <p className="text-surface-200 text-sm mb-3 whitespace-pre-wrap">{(item as FeedPost).content}</p>

              {/* Linked ride */}
              {(item as FeedPost).ride && (
                <div className="bg-surface-800/50 rounded-xl p-3 mb-3 text-sm">
                  <p className="text-surface-400 text-xs mb-1">Shared a ride</p>
                  <p className="text-white">{(item as FeedPost).ride!.origin_address} &rarr; {(item as FeedPost).ride!.destination_address}</p>
                </div>
              )}

              {/* Image */}
              {(item as FeedPost).image_url && (
                <img src={(item as FeedPost).image_url!} alt="" className="w-full rounded-xl mb-3 max-h-80 object-cover" />
              )}

              {/* Actions */}
              <div className="flex items-center gap-6 text-surface-500">
                <button className="flex items-center gap-1.5 text-sm hover:text-red-400 transition-colors">
                  <Heart className="w-4 h-4" />
                  {(item as FeedPost).likes_count > 0 && (item as FeedPost).likes_count}
                </button>
                <CommentSection postId={item.id} commentsCount={(item as FeedPost).comments_count} />
              </div>
            </article>
          )
        )}

        {feedItems.length === 0 && (
          <div className="p-8 text-center text-surface-500">
            <p className="text-lg mb-2">No posts yet</p>
            <p className="text-sm">Be the first to share something with the community!</p>
          </div>
        )}
      </div>
    </div>
  );
}
