'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Check, Zap, Crown } from 'lucide-react';
import { SUBSCRIPTION_PRICES, STRIPE_PRICE_IDS, COMMISSION_RATES } from '@/lib/constants';
import type { SubscriptionTier } from '@/types/database';

const plans = [
  {
    tier: 'free' as const,
    name: 'Free',
    price: 0,
    icon: null,
    features: [
      'Post & book rides',
      'Community feed access',
      'Basic messaging',
      `${(COMMISSION_RATES.free * 100).toFixed(0)}% commission on earnings`,
    ],
  },
  {
    tier: 'plus' as const,
    name: 'Plus',
    price: SUBSCRIPTION_PRICES.plus.monthly,
    yearlyPrice: SUBSCRIPTION_PRICES.plus.yearly,
    icon: Zap,
    features: [
      'Everything in Free',
      `Only ${(COMMISSION_RATES.plus * 100).toFixed(0)}% commission`,
      'Priority in search results',
      'Flight tracking',
      'Ride analytics',
    ],
  },
  {
    tier: 'pro' as const,
    name: 'Pro',
    price: SUBSCRIPTION_PRICES.pro.monthly,
    yearlyPrice: SUBSCRIPTION_PRICES.pro.yearly,
    icon: Crown,
    features: [
      'Everything in Plus',
      `Only ${(COMMISSION_RATES.pro * 100).toFixed(0)}% commission`,
      'Verified badge',
      'Corporate account access',
      'Priority support',
      'Advanced analytics',
    ],
  },
];

export default function UpgradePage() {
  const supabase = createClient();
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('free');
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('subscriptions')
          .select('tier')
          .eq('user_id', user.id)
          .single();
        if (data) setCurrentTier(data.tier);
      }
    }
    load();
  }, []);

  async function handleSubscribe(tier: 'plus' | 'pro') {
    setLoading(tier);
    const priceId = billing === 'monthly'
      ? STRIPE_PRICE_IDS[`${tier}_monthly`]
      : STRIPE_PRICE_IDS[`${tier}_yearly`];

    const res = await fetch('/api/subscription/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });

    const { url } = await res.json();
    if (url) window.location.href = url;
    setLoading(null);
  }

  async function handleCancel() {
    if (!confirm('Are you sure you want to cancel your subscription?')) return;
    setLoading('cancel');
    await fetch('/api/subscription/cancel', { method: 'POST' });
    setCurrentTier('free');
    setLoading(null);
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40">
        <h1 className="text-xl font-bold text-white">Upgrade</h1>
      </header>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 p-4">
        <button
          onClick={() => setBilling('monthly')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${billing === 'monthly' ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400'}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBilling('yearly')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${billing === 'yearly' ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400'}`}
        >
          Yearly <span className="text-green-400 text-xs">Save 33%</span>
        </button>
      </div>

      {/* Plans */}
      <div className="p-4 space-y-4">
        {plans.map((plan) => {
          const isCurrent = currentTier === plan.tier;
          const price = plan.tier === 'free' ? 0 : billing === 'monthly' ? plan.price : (plan.yearlyPrice! / 12);

          return (
            <div
              key={plan.tier}
              className={`rounded-2xl border p-5 ${
                isCurrent ? 'border-brand-500 bg-brand-600/5' : 'border-surface-800 bg-surface-900'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {plan.icon && <plan.icon className="w-5 h-5 text-brand-400" />}
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                </div>
                {isCurrent && (
                  <span className="text-xs bg-brand-600/20 text-brand-400 px-2 py-0.5 rounded-full">Current</span>
                )}
              </div>

              <div className="mb-4">
                <span className="text-3xl font-bold text-white">
                  {price === 0 ? 'Free' : `\u20AC${price.toFixed(2)}`}
                </span>
                {price > 0 && <span className="text-surface-400 text-sm">/month</span>}
              </div>

              <ul className="space-y-2 mb-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-surface-300">
                    <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.tier !== 'free' && !isCurrent && (
                <button
                  onClick={() => handleSubscribe(plan.tier as 'plus' | 'pro')}
                  disabled={loading !== null}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading === plan.tier ? 'Loading...' : `Upgrade to ${plan.name}`}
                </button>
              )}

              {isCurrent && plan.tier !== 'free' && (
                <button
                  onClick={handleCancel}
                  disabled={loading !== null}
                  className="w-full bg-surface-800 hover:bg-surface-700 text-surface-300 font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading === 'cancel' ? 'Cancelling...' : 'Cancel Subscription'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
