export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { Users, Car, CreditCard, TrendingUp } from 'lucide-react';

export default async function AdminDashboard() {
  const supabase = await createClient();

  // Fetch stats separately to avoid Promise.all type inference issues
  const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: ridesCount } = await supabase.from('rides').select('*', { count: 'exact', head: true });
  const { count: bookingsCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true });
  const { data: subStats } = await supabase.from('subscriptions').select('tier');

  const paidSubs = subStats?.filter((s: any) => s.tier !== 'free').length || 0;

  const stats = [
    { label: 'Total Users', value: usersCount || 0, icon: Users, color: 'text-blue-400 bg-blue-400/10' },
    { label: 'Total Rides', value: ridesCount || 0, icon: Car, color: 'text-green-400 bg-green-400/10' },
    { label: 'Bookings', value: bookingsCount || 0, icon: TrendingUp, color: 'text-purple-400 bg-purple-400/10' },
    { label: 'Paid Subscribers', value: paidSubs, icon: CreditCard, color: 'text-yellow-400 bg-yellow-400/10' },
  ];

  // Recent rides
  const { data: recentRides } = await supabase
    .from('rides')
    .select('id, origin_address, destination_address, departure_time, status')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
            <p className="text-sm text-surface-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent rides */}
      <div className="bg-surface-900 border border-surface-800 rounded-2xl">
        <div className="p-4 border-b border-surface-800">
          <h2 className="text-lg font-semibold text-white">Recent Rides</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-surface-500 border-b border-surface-800">
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {recentRides?.map((ride) => (
                <tr key={ride.id} className="text-surface-300 hover:bg-surface-800/50">
                  <td className="px-4 py-3">
                    {ride.origin_address} &rarr; {ride.destination_address}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ride.status === 'upcoming' ? 'bg-blue-500/10 text-blue-400' :
                      ride.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                      ride.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {ride.status}
                    </span>
                  </td>
                </tr>
              ))}
              {(!recentRides || recentRides.length === 0) && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-surface-500">No rides yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
