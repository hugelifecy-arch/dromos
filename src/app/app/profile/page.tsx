import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Star, Car, MapPin, Calendar, Settings, LogOut, CreditCard, Building2, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import VerifiedBadge from '@/components/ui/VerifiedBadge';
import Link from 'next/link';

export default async function ProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', user.id)
    .single();

  if (!profile) redirect('/auth/onboarding');

  const tier = (subscription?.tier || 'free') as 'free' | 'plus' | 'pro';

  const tierColors = {
    free: 'bg-surface-700 text-surface-300',
    plus: 'bg-brand-600/20 text-brand-400',
    pro: 'bg-yellow-500/20 text-yellow-400',
  };

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Profile</h1>
        <button className="p-2 text-surface-400 hover:text-white transition-colors">
          <Settings className="w-5 h-5" />
        </button>
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
          {profile.is_verified && <VerifiedBadge size="md" />}
        </div>
        <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${tierColors[tier]}`}>
          {tier.charAt(0).toUpperCase() + tier.slice(1)}
        </span>
        {profile.bio && <p className="text-surface-400 text-sm mt-2">{profile.bio}</p>}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <p className="text-xl font-bold text-white">{profile.total_rides}</p>
            <p className="text-xs text-surface-500">Rides</p>
          </div>
          <div>
            <p className="text-xl font-bold text-white">{profile.total_drives}</p>
            <p className="text-xs text-surface-500">Drives</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-xl font-bold text-white">
                {profile.rating_avg > 0 ? profile.rating_avg.toFixed(1) : '-'}
              </span>
            </div>
            <p className="text-xs text-surface-500">{profile.rating_count} reviews</p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-1 border-b border-surface-800">
        {profile.is_driver && profile.car_make && (
          <div className="flex items-center gap-3 p-3 text-surface-300 text-sm">
            <Car className="w-4 h-4 text-surface-500" />
            {profile.car_color} {profile.car_make} {profile.car_model} &middot; {profile.car_plate}
          </div>
        )}
        <div className="flex items-center gap-3 p-3 text-surface-300 text-sm">
          <Calendar className="w-4 h-4 text-surface-500" />
          Member since {format(new Date(profile.created_at), 'MMMM yyyy')}
        </div>
      </div>

      {/* Links */}
      <div className="p-4 space-y-1">
        <Link href="/app/earnings" className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-900 transition-colors text-surface-300">
          <TrendingUp className="w-5 h-5 text-surface-500" />
          <span>Earnings</span>
        </Link>
        <Link href="/app/upgrade" className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-900 transition-colors text-surface-300">
          <CreditCard className="w-5 h-5 text-surface-500" />
          <span>Subscription</span>
        </Link>
        <Link href="/app/corporate" className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-900 transition-colors text-surface-300">
          <Building2 className="w-5 h-5 text-surface-500" />
          <span>Corporate Account</span>
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
