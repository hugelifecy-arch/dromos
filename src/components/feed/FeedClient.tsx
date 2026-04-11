'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { formatDistanceToNow } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import LikeButton from './LikeButton';
import CommentSection from './CommentSection';
import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';

type FeedFilter = 'all' | 'following' | 'general' | 'leg_share' | 'question' | 'tip';

interface Post {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  post_type: string;
  district: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author: { full_name: string; avatar_url: string | null; is_verified: boolean } | null;
  ride: { origin_address: string; destination_address: string } | null;
  liked_by_me: boolean;
}

interface FeedClientProps {
  initialPosts: Post[];
  currentUserId: string | null;
  followingIds: string[];
}

const FILTERS: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'following', label: 'Following' },
  { value: 'general', label: 'General' },
  { value: 'leg_share', label: 'Legs' },
  { value: 'question', label: 'Questions' },
  { value: 'tip', label: 'Tips' },
];

const PAGE_SIZE = 15;

export default function FeedClient({ initialPosts, currentUserId, followingIds }: FeedClientProps) {
  const supabase = createClient();
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialPosts.length >= PAGE_SIZE);
  const observerRef = useRef<HTMLDivElement>(null);

  const filteredPosts = posts.filter((post) => {
    if (filter === 'all') return true;
    if (filter === 'following') return followingIds.includes(post.author_id);
    return post.post_type === filter;
  });

  // Infinite scroll
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    const lastPost = posts[posts.length - 1];
    if (!lastPost) { setLoading(false); return; }

    const { data } = await supabase
      .from('feed_posts')
      .select(`
        *,
        author:profiles!author_id(full_name, avatar_url, is_verified),
        ride:rides(origin_address, destination_address)
      `)
      .order('created_at', { ascending: false })
      .lt('created_at', lastPost.created_at)
      .limit(PAGE_SIZE);

    if (data && data.length > 0) {
      // Check which posts the user has liked
      let likedPostIds: string[] = [];
      if (currentUserId) {
        const postIds = data.map((p: any) => p.id);
        const { data: likes } = await supabase
          .from('feed_likes')
          .select('post_id')
          .eq('user_id', currentUserId)
          .in('post_id', postIds);
        likedPostIds = (likes || []).map((l: any) => l.post_id);
      }

      const normalized = data.map((p: any) => ({
        ...p,
        author: Array.isArray(p.author) ? p.author[0] : p.author,
        ride: Array.isArray(p.ride) ? p.ride[0] : p.ride,
        liked_by_me: likedPostIds.includes(p.id),
      }));

      setPosts((prev) => [...prev, ...normalized]);
      setHasMore(data.length >= PAGE_SIZE);
    } else {
      setHasMore(false);
    }
    setLoading(false);
  }, [posts, loading, hasMore, currentUserId]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Realtime: listen for new posts
  useEffect(() => {
    const channel = supabase
      .channel('feed-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_posts' }, async (payload) => {
        const newPost = payload.new as any;
        // Fetch author info
        const { data: author } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, is_verified')
          .eq('id', newPost.author_id)
          .single();

        setPosts((prev) => [{
          ...newPost,
          author: author || null,
          ride: null,
          liked_by_me: false,
        }, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function deletePost(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    await supabase.from('feed_posts').delete().eq('id', postId);
  }

  return (
    <>
      {/* Filter pills */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar border-b border-surface-800">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.value
                ? 'bg-brand-600 text-white'
                : 'bg-surface-800 text-surface-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Posts */}
      <div className="divide-y divide-surface-800">
        {filteredPosts.map((post) => (
          <article key={post.id} className="p-4">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-3">
              <Link href={`/app/driver/${post.author_id}`}>
                <img
                  src={post.author?.avatar_url || `${AVATAR_PLACEHOLDER}${post.author?.full_name || 'U'}`}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover bg-surface-800"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Link href={`/app/driver/${post.author_id}`} className="text-white font-medium text-sm hover:underline">
                    {post.author?.full_name}
                  </Link>
                  {post.author?.is_verified && <VerifiedBadge size="sm" />}
                  {post.post_type && post.post_type !== 'general' && (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-800 text-surface-400">
                      {post.post_type === 'leg_share' ? 'Leg' : post.post_type === 'question' ? 'Q' : post.post_type === 'tip' ? 'Tip' : post.post_type}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <time className="text-xs text-surface-500">
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                  </time>
                  {post.district && (
                    <span className="text-[10px] text-surface-500">&middot; {post.district}</span>
                  )}
                </div>
              </div>
              {currentUserId === post.author_id && (
                <button
                  onClick={() => deletePost(post.id)}
                  className="p-1.5 text-surface-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
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
            <div className="flex items-center gap-6">
              <LikeButton postId={post.id} initialLiked={post.liked_by_me} initialCount={post.likes_count} />
              <CommentSection postId={post.id} initialCount={post.comments_count} />
            </div>
          </article>
        ))}

        {filteredPosts.length === 0 && (
          <div className="p-8 text-center text-surface-500">
            <p className="text-lg mb-2">
              {filter === 'following' ? 'No posts from people you follow' : 'No posts yet'}
            </p>
            <p className="text-sm">
              {filter === 'following'
                ? 'Follow some drivers to see their posts here!'
                : 'Be the first to share something with the community!'}
            </p>
          </div>
        )}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={observerRef} className="h-10 flex items-center justify-center">
        {loading && <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />}
      </div>
    </>
  );
}
