'use client';

import { useState } from 'react';
import { Users, Car, CreditCard, TrendingUp, UserCheck, ShieldCheck } from 'lucide-react';

interface Analytics {
  new_users: number;
  new_rides: number;
  completed_rides: number;
  new_bookings: number;
  revenue: number;
  pending_verifications: number;
  active_drivers: number;
  daily_signups: { day: string; count: number }[] | null;
  daily_rides: { day: string; count: number }[] | null;
}

interface Props {
  analytics30: Analytics | null;
  analytics7: Analytics | null;
}

export default function AnalyticsClient({ analytics30, analytics7 }: Props) {
  const [period, setPeriod] = useState<'7d' | '30d'>('30d');
  const analytics = period === '7d' ? analytics7 : analytics30;

  if (!analytics) {
    return <p className="text-surface-500">No analytics data available.</p>;
  }

  const metrics = [
    { label: 'New Users', value: analytics.new_users, icon: Users, color: 'text-blue-400 bg-blue-400/10' },
    { label: 'New Rides', value: analytics.new_rides, icon: Car, color: 'text-green-400 bg-green-400/10' },
    { label: 'Completed Rides', value: analytics.completed_rides, icon: TrendingUp, color: 'text-emerald-400 bg-emerald-400/10' },
    { label: 'Bookings', value: analytics.new_bookings, icon: CreditCard, color: 'text-purple-400 bg-purple-400/10' },
    { label: 'Platform Revenue', value: `\u20AC${Number(analytics.revenue).toFixed(2)}`, icon: CreditCard, color: 'text-yellow-400 bg-yellow-400/10' },
    { label: 'Active Drivers', value: analytics.active_drivers, icon: UserCheck, color: 'text-cyan-400 bg-cyan-400/10' },
    { label: 'Pending Verifications', value: analytics.pending_verifications, icon: ShieldCheck, color: 'text-orange-400 bg-orange-400/10' },
  ];

  const maxSignups = Math.max(...(analytics.daily_signups || []).map(d => d.count), 1);
  const maxRides = Math.max(...(analytics.daily_rides || []).map(d => d.count), 1);

  return (
    <>
      {/* Period toggle */}
      <div className="flex gap-1 mb-6">
        <button
          onClick={() => setPeriod('7d')}
          className={`px-4 py-2 text-xs rounded-xl transition-colors ${
            period === '7d' ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
          }`}
        >
          Last 7 Days
        </button>
        <button
          onClick={() => setPeriod('30d')}
          className={`px-4 py-2 text-xs rounded-xl transition-colors ${
            period === '30d' ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
          }`}
        >
          Last 30 Days
        </button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
            <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-2`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            <p className="text-xs text-surface-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily signups chart */}
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
          <h3 className="text-sm font-medium text-surface-400 mb-4">Daily Signups</h3>
          {analytics.daily_signups && analytics.daily_signups.length > 0 ? (
            <div className="flex items-end gap-[3px] h-32">
              {analytics.daily_signups.map((day, idx) => {
                const height = Math.max((day.count / maxSignups) * 100, 4);
                return (
                  <div
                    key={idx}
                    className="flex-1 min-w-0 group relative"
                    title={`${day.day}: ${day.count} signups`}
                  >
                    <div
                      className="w-full rounded-t bg-blue-500/60 group-hover:bg-blue-400 transition-colors"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-surface-500 py-8 text-sm">No signup data</p>
          )}
        </div>

        {/* Daily rides chart */}
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
          <h3 className="text-sm font-medium text-surface-400 mb-4">Daily Rides</h3>
          {analytics.daily_rides && analytics.daily_rides.length > 0 ? (
            <div className="flex items-end gap-[3px] h-32">
              {analytics.daily_rides.map((day, idx) => {
                const height = Math.max((day.count / maxRides) * 100, 4);
                return (
                  <div
                    key={idx}
                    className="flex-1 min-w-0 group relative"
                    title={`${day.day}: ${day.count} rides`}
                  >
                    <div
                      className="w-full rounded-t bg-green-500/60 group-hover:bg-green-400 transition-colors"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-surface-500 py-8 text-sm">No ride data</p>
          )}
        </div>
      </div>
    </>
  );
}
