'use client';

import { useState, useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, TrendingUp, Wallet, Calendar, BarChart3 } from 'lucide-react';
import { format, subDays, isAfter } from 'date-fns';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  description: string | null;
  created_at: string;
}

interface EarningDay {
  period: string;
  total_earned: number;
  total_commission: number;
  net_earnings: number;
  transaction_count: number;
}

interface Props {
  transactions: Transaction[];
  earningsSummary: EarningDay[];
  commission: number;
  tier: string;
}

type Period = '7d' | '30d' | '90d' | 'all';

export default function EarningsClient({ transactions, earningsSummary, commission, tier }: Props) {
  const [period, setPeriod] = useState<Period>('30d');

  const filteredTransactions = useMemo(() => {
    if (period === 'all') return transactions;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const cutoff = subDays(new Date(), days);
    return transactions.filter(t => isAfter(new Date(t.created_at), cutoff));
  }, [transactions, period]);

  const filteredSummary = useMemo(() => {
    if (period === 'all') return earningsSummary;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const cutoff = subDays(new Date(), days);
    return earningsSummary.filter(d => isAfter(new Date(d.period), cutoff));
  }, [earningsSummary, period]);

  const totalEarned = filteredTransactions
    .filter(t => t.type === 'ride_payment')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalCommission = filteredTransactions
    .filter(t => t.type === 'commission')
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

  const netEarnings = totalEarned - totalCommission;
  const rideCount = filteredTransactions.filter(t => t.type === 'ride_payment').length;

  // Chart: find max value for scaling
  const maxNet = Math.max(...filteredSummary.map(d => Number(d.net_earnings)), 1);

  const periods: { key: Period; label: string }[] = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: 'all', label: 'All' },
  ];

  return (
    <>
      {/* Period filter */}
      <div className="flex gap-1 px-4 pt-4">
        {periods.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors ${
              period === p.key
                ? 'bg-brand-600 text-white'
                : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

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
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-surface-400">Gross Revenue</span>
          </div>
          <p className="text-2xl font-bold text-white">&euro;{totalEarned.toFixed(2)}</p>
        </div>
        <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-surface-400">Rides</span>
          </div>
          <p className="text-2xl font-bold text-white">{rideCount}</p>
        </div>
      </div>

      {/* Earnings chart */}
      {filteredSummary.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
            <h3 className="text-xs font-medium text-surface-400 mb-3">Daily Earnings</h3>
            <div className="flex items-end gap-[3px] h-28">
              {filteredSummary.slice(-30).map((day, idx) => {
                const height = Math.max((Number(day.net_earnings) / maxNet) * 100, 2);
                const isPositive = Number(day.net_earnings) >= 0;
                return (
                  <div
                    key={idx}
                    className="flex-1 min-w-0 group relative"
                    title={`${day.period}: €${Number(day.net_earnings).toFixed(2)}`}
                  >
                    <div
                      className={`w-full rounded-t transition-colors ${
                        isPositive
                          ? 'bg-brand-500/60 group-hover:bg-brand-400'
                          : 'bg-red-500/60 group-hover:bg-red-400'
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-surface-600">
                {filteredSummary.length > 0 && format(new Date(filteredSummary[filteredSummary.length - 1].period), 'MMM d')}
              </span>
              <span className="text-[10px] text-surface-600">
                {filteredSummary.length > 0 && format(new Date(filteredSummary[0].period), 'MMM d')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Transactions */}
      <div className="px-4 pb-2">
        <h2 className="text-sm font-medium text-surface-400 mb-2">Transaction History</h2>
      </div>

      <div className="divide-y divide-surface-800">
        {filteredTransactions.map((tx) => {
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

        {filteredTransactions.length === 0 && (
          <div className="p-8 text-center text-surface-500">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">No transactions yet</p>
            <p className="text-sm">Start driving to earn money</p>
          </div>
        )}
      </div>
    </>
  );
}
