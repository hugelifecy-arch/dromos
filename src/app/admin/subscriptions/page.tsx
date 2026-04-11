export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';

export default async function AdminSubscriptionsPage() {
  const supabase = await createClient();

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*, profile:user_id(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(100);

  const normalized = (subscriptions || []).map((s: any) => ({
    ...s,
    profile: Array.isArray(s.profile) ? s.profile[0] : s.profile,
  }));

  const tierCounts = {
    free: normalized.filter(s => s.tier === 'free').length,
    plus: normalized.filter(s => s.tier === 'plus').length,
    pro: normalized.filter(s => s.tier === 'pro').length,
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Subscriptions</h1>

      {/* Tier summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {Object.entries(tierCounts).map(([tier, count]) => (
          <div key={tier} className="bg-surface-900 border border-surface-800 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{count}</p>
            <p className="text-sm text-surface-400 capitalize">{tier}</p>
          </div>
        ))}
      </div>

      {/* Subscriptions table */}
      <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-surface-500 border-b border-surface-800">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Period End</th>
                <th className="px-4 py-3 font-medium">Cancel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {normalized.map((sub: any) => (
                <tr key={sub.id} className="text-surface-300 hover:bg-surface-800/50">
                  <td className="px-4 py-3">
                    <p className="text-sm text-white">{sub.profile?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-surface-500">{sub.profile?.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                      sub.tier === 'pro' ? 'bg-purple-500/10 text-purple-400' :
                      sub.tier === 'plus' ? 'bg-brand-500/10 text-brand-400' :
                      'bg-surface-700 text-surface-400'
                    }`}>
                      {sub.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-surface-500">
                    {sub.current_period_end
                      ? new Date(sub.current_period_end).toLocaleDateString()
                      : '\u2014'}
                  </td>
                  <td className="px-4 py-3">
                    {sub.cancel_at_period_end && (
                      <span className="text-xs text-red-400">Cancelling</span>
                    )}
                  </td>
                </tr>
              ))}
              {normalized.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-surface-500">No subscriptions</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
