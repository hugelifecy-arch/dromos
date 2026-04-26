export const dynamic = 'force-dynamic';
export const metadata = { title: 'Earnings' };

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { COMMISSION_RATES } from '@/lib/constants';
import type { SubscriptionTier } from '@/types/database';
import EarningsClient from './EarningsClient';

export default async function EarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', user.id)
    .single();

  const tier = (subscription?.tier || 'free') as SubscriptionTier;
  const commission = COMMISSION_RATES[tier];

  // Fetch all transactions (up to 200) for client-side period filtering
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  // Fetch daily earnings summary (90 days) from the DB function
  const { data: earningsSummary } = await supabase
    .rpc('get_earnings_summary', { p_user_id: user.id, p_days: 90 });

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Earnings</h1>
        <Link
          href="/app/earnings/tax"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 text-xs font-medium transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Tax / VAT
        </Link>
      </header>

      <EarningsClient
        transactions={transactions || []}
        earningsSummary={earningsSummary || []}
        commission={commission}
        tier={tier}
      />
    </div>
  );
}
