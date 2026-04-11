export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { Users, Car, CreditCard, TrendingUp, ShieldCheck, Flag, Plane, UserCheck } from 'lucide-react';
import Link from 'next/link';

export default async function AdminDashboard() {
  const supabase = await createClient();

  // Fetch platform analytics
  const { data: analytics } = await supabase.rpc('get_platform_analytics', { p_days: 30 });

  // Fetch basic counts
  const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: ridesCount } = await supabase.from('rides').select('*', { count: 'exact', head: true });
  const { count: bookingsCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true });
  const { data: subStats } = await supabase.from('subscriptions').select('tier');
  const paidSubs = subStats?.filter((s: any) => s.tier !== 'free').length || 0;

  // Pending verifications
  const { count: pendingVerifications } = await supabase
    .from('driver_verification')
    .select('*', { count: 'exact', head: true })
    .eq('verification_status', 'pending');

  // Pending reports
  const { count: pendingReports } = await supabase
    .from('reported_content')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Active queue entries
  const { count: queueCount } = await supabase
    .from('airport_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'waiting');

  const stats = [
    { label: 'Total Users', value: usersCount || 0, icon: Users, color: 'text-blue-400 bg-blue-400/10', href: '/admin/users' },
    { label: 'Total Rides', value: ridesCount || 0, icon: Car, color: 'text-green-400 bg-green-400/10', href: '/admin/rides' },
    { label: 'Bookings', value: bookingsCount || 0, icon: TrendingUp, color: 'text-purple-400 bg-purple-400/10', href: null },
    { label: 'Paid Subscribers', value: paidSubs, icon: CreditCard, color: 'text-yellow-400 bg-yellow-400/10', href: '/admin/subscriptions' },
  ];

  const actionItems = [
    { label: 'Pending Verifications', value: pendingVerifications || 0, icon: ShieldCheck, color: 'text-orange-400 bg-orange-400/10', href: '/admin/verifications' },
    { label: 'Pending Reports', value: pendingReports || 0, icon: Flag, color: 'text-red-400 bg-red-400/10', href: '/admin/reports' },
    { label: 'Airport Queue', value: queueCount || 0, icon: Plane, color: 'text-cyan-400 bg-cyan-400/10', href: null },
    { label: 'Active Drivers', value: analytics?.active_drivers || 0, icon: UserCheck, color: 'text-emerald-400 bg-emerald-400/10', href: '/admin/users' },
  ];

  // Recent rides
  const { data: recentRides } = await supabase
    .from('rides')
    .select('id, origin_address, destination_address, departure_time, status, driver_id, profiles:driver_id(full_name)')
    .order('created_at', { ascending: false })
    .limit(8);

  // Recent signups
  const { data: recentUsers } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_driver, is_verified, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* Platform stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, icon: Icon, color, href }) => {
          const Card = (
            <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 hover:border-surface-700 transition-colors">
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
              <p className="text-sm text-surface-400">{label}</p>
            </div>
          );
          return href ? <Link key={label} href={href}>{Card}</Link> : <div key={label}>{Card}</div>;
        })}
      </div>

      {/* Action items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {actionItems.map(({ label, value, icon: Icon, color, href }) => {
          const Card = (
            <div className={`bg-surface-900 border rounded-2xl p-4 flex items-center gap-3 hover:border-surface-700 transition-colors ${
              value > 0 ? 'border-surface-700' : 'border-surface-800'
            }`}>
              <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-surface-400">{label}</p>
              </div>
            </div>
          );
          return href ? <Link key={label} href={href}>{Card}</Link> : <div key={label}>{Card}</div>;
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent rides */}
        <div className="bg-surface-900 border border-surface-800 rounded-2xl">
          <div className="p-4 border-b border-surface-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Recent Rides</h2>
            <Link href="/admin/rides" className="text-xs text-brand-400 hover:text-brand-300">View all</Link>
          </div>
          <div className="divide-y divide-surface-800">
            {recentRides?.map((ride: any) => {
              const driver = Array.isArray(ride.profiles) ? ride.profiles[0] : ride.profiles;
              return (
                <div key={ride.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-300 truncate">
                      {ride.origin_address} &rarr; {ride.destination_address}
                    </p>
                    <p className="text-xs text-surface-500">{driver?.full_name || 'Unknown'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    ride.status === 'upcoming' ? 'bg-blue-500/10 text-blue-400' :
                    ride.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                    ride.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                    'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {ride.status}
                  </span>
                </div>
              );
            })}
            {(!recentRides || recentRides.length === 0) && (
              <div className="px-4 py-8 text-center text-surface-500 text-sm">No rides yet</div>
            )}
          </div>
        </div>

        {/* Recent signups */}
        <div className="bg-surface-900 border border-surface-800 rounded-2xl">
          <div className="p-4 border-b border-surface-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Recent Signups</h2>
            <Link href="/admin/users" className="text-xs text-brand-400 hover:text-brand-300">View all</Link>
          </div>
          <div className="divide-y divide-surface-800">
            {recentUsers?.map((u: any) => (
              <div key={u.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{u.full_name}</p>
                  <p className="text-xs text-surface-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {u.is_driver && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400">
                      Driver
                    </span>
                  )}
                  {u.is_verified && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400">
                      Verified
                    </span>
                  )}
                </div>
              </div>
            ))}
            {(!recentUsers || recentUsers.length === 0) && (
              <div className="px-4 py-8 text-center text-surface-500 text-sm">No users yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
