import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, TrendingUp, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { COMMISSION_RATES } from '@/lib/constants';
import type { SubscriptionTier } from '@/types/database';

export default async function EarningsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', user.id)
    .single();

  const tier = (subscription?.tier || 'free') as SubscriptionTier;
  const commission = COMMISSION_RATES[tier];

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const totalEarned = transactions
    ?.filter((t) => t.type === 'ride_payment')
    .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

  const totalCommission = transactions
    ?.filter((t) => t.type === 'commission')
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) || 0;

  const netEarnings = totalEarned - totalCommission;

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <h1 className="text-xl font-bold text-white">Earnings</h1>
      </header>

      {/* Summary cards */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-green-400" />
            <span className="text-xs text-surface-400">Net Earnings</span>
          </div>
          <p className="text-2xl font-bold text-white">&euro;{netEarnings.toFixed(2)}</p>
        </div>
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-brand-400" />
            <span className="text-xs text-surface-400">Commission Rate</span>
          </div>
          <p className="text-2xl font-bold text-white">{(commission * 100).toFixed(0)}%</p>
          <p className="text-xs text-surface-500 capitalize">{tier} plan</p>
        </div>
      </div>

      {/* Transactions */}
      <div className="px-4 pb-2">
        <h2 className="text-sm font-medium text-surface-400 mb-2">Transaction History</h2>
      </div>

      <div className="divide-y divide-surface-800">
        {transactions?.map((tx) => {
          const isIncome = tx.type === 'ride_payment' || tx.type === 'payout' || tx.type === 'bonus';
          return (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isIncome ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {isIncome ? (
                  <ArrowDownLeft className="w-4 h-4 text-green-400" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white capitalize">{tx.type.replace('_', ' ')}</p>
                {tx.description && <p className="text-xs text-surface-500 truncate">{tx.description}</p>}
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${isIncome ? 'text-green-400' : 'text-red-400'}`}>
                  {isIncome ? '+' : '-'}&euro;{Math.abs(Number(tx.amount)).toFixed(2)}
                </p>
                <p className="text-xs text-surface-500">{format(new Date(tx.created_at), 'MMM d')}</p>
              </div>
            </div>
          );
        })}

        {(!transactions || transactions.length === 0) && (
          <div className="p-8 text-center text-surface-500">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">No transactions yet</p>
            <p className="text-sm">Start driving to earn money</p>
          </div>
        )}
      </div>
    </div>
  );
}
