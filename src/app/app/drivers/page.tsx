export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { ArrowLeft, Search, MapPin, Star } from 'lucide-react';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import FollowButton from '@/components/feed/FollowButton';
import Link from 'next/link';
import DriverSearch from './DriverSearch';

const DISTRICTS = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta', 'Kyrenia'];

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string; q?: string }>;
}) {
  const { district, q } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Build query
  let query = supabase
    .from('profiles')
    .select(`
      id, full_name, avatar_url, is_verified, bio, rating_avg, rating_count,
      total_rides, total_drives, followers_count,
      verification:driver_verification(licence_district, taxi_type, verification_status)
    `)
    .eq('is_driver', true)
    .order('followers_count', { ascending: false })
    .limit(50);

  if (q) {
    query = query.ilike('full_name', `%${q}%`);
  }

  const { data: rawDrivers } = await query;

  // Normalize and filter by district if needed
  let drivers = (rawDrivers || []).map((d: any) => {
    const v = Array.isArray(d.verification) ? d.verification[0] : d.verification;
    return { ...d, verification: v };
  });

  if (district) {
    drivers = drivers.filter((d: any) => d.verification?.licence_district === district);
  }

  // Check who the current user follows
  let followingIds: string[] = [];
  if (user) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    followingIds = (follows || []).map((f) => f.following_id);
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/feed" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-white">Drivers</h1>
      </header>

      {/* Search */}
      <DriverSearch initialQuery={q || ''} />

      {/* District filter */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar border-b border-surface-800">
        <Link
          href="/app/drivers"
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            !district ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'
          }`}
        >
          All
        </Link>
        {DISTRICTS.map((d) => (
          <Link
            key={d}
            href={`/app/drivers?district=${d}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              district === d ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'
            }`}
          >
            {d}
          </Link>
        ))}
      </div>

      {/* Drivers list */}
      <div className="divide-y divide-surface-800">
        {drivers.map((driver: any) => (
          <div key={driver.id} className="p-4 flex items-center gap-3">
            <Link href={`/app/driver/${driver.id}`}>
              <img
                src={driver.avatar_url || `${AVATAR_PLACEHOLDER}${driver.full_name}`}
                alt=""
                className="w-12 h-12 rounded-full object-cover bg-surface-800"
              />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <Link href={`/app/driver/${driver.id}`} className="text-white font-medium text-sm hover:underline truncate">
                  {driver.full_name}
                </Link>
                {driver.verification?.verification_status === 'approved' && <VerifiedBadge size="sm" />}
              </div>
              <div className="flex items-center gap-2 text-xs text-surface-500">
                {driver.verification?.licence_district && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="w-3 h-3" />
                    {driver.verification.licence_district}
                  </span>
                )}
                {driver.rating_avg > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 text-yellow-400" />
                    {driver.rating_avg.toFixed(1)}
                  </span>
                )}
                <span>{driver.followers_count || 0} followers</span>
              </div>
            </div>
            {user && user.id !== driver.id && (
              <FollowButton
                targetUserId={driver.id}
                initialFollowing={followingIds.includes(driver.id)}
                size="sm"
              />
            )}
          </div>
        ))}

        {drivers.length === 0 && (
          <div className="p-8 text-center text-surface-500">
            <p className="text-lg mb-2">No drivers found</p>
            <p className="text-sm">
              {q ? `No results for "${q}"` : district ? `No verified drivers in ${district} yet` : 'No drivers registered yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
