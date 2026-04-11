export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { ArrowLeft, Star, Car, Calendar, MapPin, MessageCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import FollowButton from '@/components/feed/FollowButton';
import LikeButton from '@/components/feed/LikeButton';
import CommentSection from '@/components/feed/CommentSection';
import Link from 'next/link';

export default async function DriverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch driver profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (!profile) notFound();

  // Fetch verification info
  const { data: verification } = await supabase
    .from('driver_verification')
    .select('licence_district, taxi_type, verification_status')
    .eq('user_id', id)
    .single();

  // Check if current user follows this driver
  let isFollowing = false;
  if (user && user.id !== id) {
    const { data: follow } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('following_id', id)
      .single();
    isFollowing = !!follow;
  }

  // Fetch driver's posts
  const { data: rawPosts } = await supabase
    .from('feed_posts')
    .select('id, content, image_url, post_type, likes_count, comments_count, created_at')
    .eq('author_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Check which posts the user has liked
  let likedPostIds: string[] = [];
  if (user && rawPosts) {
    const postIds = rawPosts.map((p) => p.id);
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('feed_likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);
      likedPostIds = (likes || []).map((l) => l.post_id);
    }
  }

  const isVerified = verification?.verification_status === 'approved';
  const isOwnProfile = user?.id === id;

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/feed" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-white">{profile.full_name}</h1>
      </header>

      {/* Profile card */}
      <div className="p-6 text-center border-b border-surface-800">
        <img
          src={profile.avatar_url || `${AVATAR_PLACEHOLDER}${profile.full_name}`}
          alt=""
          className="w-20 h-20 rounded-full object-cover bg-surface-800 mx-auto mb-3"
        />
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <h2 className="text-xl font-bold text-white">{profile.full_name}</h2>
          {isVerified && <VerifiedBadge size="md" />}
        </div>

        {verification && (
          <div className="text-sm text-surface-400 mb-3 space-y-0.5">
            {verification.licence_district && (
              <p className="flex items-center justify-center gap-1">
                <MapPin className="w-3 h-3" />
                {verification.licence_district} District
              </p>
            )}
            {verification.taxi_type && (
              <p className="capitalize">{verification.taxi_type}</p>
            )}
          </div>
        )}

        {profile.bio && <p className="text-surface-400 text-sm mb-4">{profile.bio}</p>}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <p className="text-lg font-bold text-white">{profile.total_rides}</p>
            <p className="text-[10px] text-surface-500">Sold</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{profile.total_drives}</p>
            <p className="text-[10px] text-surface-500">Bought</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{profile.followers_count || 0}</p>
            <p className="text-[10px] text-surface-500">Followers</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{profile.following_count || 0}</p>
            <p className="text-[10px] text-surface-500">Following</p>
          </div>
        </div>

        {/* Action buttons */}
        {!isOwnProfile && user && (
          <div className="flex items-center justify-center gap-3">
            <FollowButton targetUserId={id} initialFollowing={isFollowing} />
            <Link
              href={`/app/messages?new=${id}`}
              className="flex items-center gap-1.5 px-4 py-2 border border-surface-600 text-surface-300 rounded-xl text-sm font-medium hover:border-surface-500 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Message
            </Link>
          </div>
        )}

        {isOwnProfile && (
          <Link href="/app/profile" className="text-sm text-brand-400 hover:underline">
            Edit your profile
          </Link>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-1 border-b border-surface-800">
        {profile.car_make && (
          <div className="flex items-center gap-3 p-2 text-surface-300 text-sm">
            <Car className="w-4 h-4 text-surface-500" />
            {profile.car_make} {profile.car_model}
          </div>
        )}
        {profile.rating_avg > 0 && (
          <div className="flex items-center gap-3 p-2 text-surface-300 text-sm">
            <Star className="w-4 h-4 text-yellow-400" />
            {profile.rating_avg.toFixed(1)} ({profile.rating_count} reviews)
          </div>
        )}
        <div className="flex items-center gap-3 p-2 text-surface-300 text-sm">
          <Calendar className="w-4 h-4 text-surface-500" />
          Member since {format(new Date(profile.created_at), 'MMMM yyyy')}
        </div>
      </div>

      {/* Posts */}
      <div className="divide-y divide-surface-800">
        <div className="px-4 py-3">
          <h3 className="text-sm font-medium text-surface-400">Posts ({rawPosts?.length || 0})</h3>
        </div>
        {rawPosts?.map((post) => (
          <article key={post.id} className="p-4">
            <p className="text-surface-200 text-sm mb-2 whitespace-pre-wrap">{post.content}</p>
            {post.image_url && (
              <img src={post.image_url} alt="" className="w-full rounded-xl mb-2 max-h-60 object-cover" />
            )}
            <time className="text-xs text-surface-500 block mb-2">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </time>
            <div className="flex items-center gap-6">
              <LikeButton
                postId={post.id}
                initialLiked={likedPostIds.includes(post.id)}
                initialCount={post.likes_count}
              />
              <CommentSection postId={post.id} initialCount={post.comments_count} />
            </div>
          </article>
        ))}

        {(!rawPosts || rawPosts.length === 0) && (
          <div className="p-8 text-center text-surface-500 text-sm">No posts yet</div>
        )}
      </div>
    </div>
  );
}
