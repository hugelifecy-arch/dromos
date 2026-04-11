export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Star, Car, Calendar, Settings, LogOut, TrendingUp, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import Link from 'next/link';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: verification } = await supabase
    .from('driver_verification')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!profile) redirect('/auth/onboarding');

  const isVerified = verification?.verification_status === 'approved';
  const isPendingVerification = verification?.verification_status === 'pending';

  const getPlateLastThree = (plate: string | null) => {
    if (!plate) return '';
    return plate.slice(-3);
  };

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Profile</h1>
        <Link href="/app/settings" className="p-2 text-surface-400 hover:text-white transition-colors">
          <Settings className="w-5 h-5" />
        </Link>
      </header>

      {/* Profile card */}
      <div className="p-6 text-center border-b border-surface-800">
        <img
          src={profile.avatar_url || `${AVATAR_PLACEHOLDER}${profile.full_name}`}
          alt=""
          className="w-20 h-20 rounded-full object-cover bg-surface-800 mx-auto mb-3"
        />
        <div className="flex items-center justify-center gap-1.5 mb-2">
          <h2 className="text-xl font-bold text-white">{profile.full_name}</h2>
          {isVerified && <VerifiedBadge size="md" />}
        </div>
        {isPendingVerification && (
          <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 mb-2">
            Pending Verification
          </span>
        )}
        {profile.bio && <p className="text-surface-400 text-sm mt-2">{profile.bio}</p>}

        {/* Verification info */}
        {verification && (
          <div className="text-sm text-surface-400 mt-2 space-y-0.5">
            {verification.licence_district && (
              <p>{verification.licence_district} District</p>
            )}
            {verification.taxi_type && (
              <p className="capitalize">{verification.taxi_type}</p>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-6">
          <div>
            <p className="text-xl font-bold text-white">{profile.total_rides}</p>
            <p className="text-xs text-surface-500">Sold</p>
          </div>
          <div>
            <p className="text-xl font-bold text-white">{profile.total_drives}</p>
            <p className="text-xs text-surface-500">Bought</p>
          </div>
          <Link href={`/app/driver/${user.id}`} className="hover:bg-surface-800/50 rounded-lg p-1 transition-colors">
            <p className="text-xl font-bold text-white">{profile.followers_count || 0}</p>
            <p className="text-xs text-surface-500">Followers</p>
          </Link>
          <Link href={`/app/driver/${user.id}`} className="hover:bg-surface-800/50 rounded-lg p-1 transition-colors">
            <p className="text-xl font-bold text-white">{profile.following_count || 0}</p>
            <p className="text-xs text-surface-500">Following</p>
          </Link>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-1 border-b border-surface-800">
        {profile.car_make && (
          <div className="flex items-center gap-3 p-3 text-surface-300 text-sm">
            <Car className="w-4 h-4 text-surface-500" />
            {profile.car_make} {profile.car_model} &middot; ···{getPlateLastThree(profile.car_plate)}
          </div>
        )}
        <div className="flex items-center gap-3 p-3 text-surface-300 text-sm">
          <Calendar className="w-4 h-4 text-surface-500" />
          Member since {format(new Date(profile.created_at), 'MMMM yyyy')}
        </div>
      </div>

      {/* Pro features placeholder */}
      <div className="p-4 border-b border-surface-800">
        <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-surface-900 transition-colors">
          <span className="text-surface-300 text-sm">Pro features</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-surface-500">coming soon</span>
            <ChevronDown className="w-4 h-4 text-surface-500" />
          </div>
        </button>
      </div>

      {/* Links */}
      <div className="p-4 space-y-1">
        <Link href="/app/earnings" className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-900 transition-colors text-surface-300">
          <TrendingUp className="w-5 h-5 text-surface-500" />
          <span>Earnings</span>
        </Link>
        <Link href="/app/settings" className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-900 transition-colors text-surface-300">
          <Settings className="w-5 h-5 text-surface-500" />
          <span>Settings</span>
        </Link>
        <form action="/auth/logout" method="post">
          <button type="submit" className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-900 transition-colors text-red-400 w-full text-left">
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </form>
      </div>
    </div>
  );
}
