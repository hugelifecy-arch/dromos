export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import AnalyticsClient from './AnalyticsClient';

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();

  const { data: analytics30 } = await supabase.rpc('get_platform_analytics', { p_days: 30 });
  const { data: analytics7 } = await supabase.rpc('get_platform_analytics', { p_days: 7 });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>
      <AnalyticsClient analytics30={analytics30} analytics7={analytics7} />
    </div>
  );
}
