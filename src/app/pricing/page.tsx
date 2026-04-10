import Link from 'next/link';
import { ArrowLeft, Check, Zap, Crown } from 'lucide-react';
import { APP_NAME, SUBSCRIPTION_PRICES, COMMISSION_RATES } from '@/lib/constants';

const plans = [
  {
    name: 'Free',
    price: 0,
    description: 'Perfect for occasional riders',
    features: [
      'Post & book unlimited rides',
      'Community feed',
      'Basic messaging',
      `${(COMMISSION_RATES.free * 100).toFixed(0)}% commission on driver earnings`,
    ],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Plus',
    price: SUBSCRIPTION_PRICES.plus.monthly,
    yearlyPrice: SUBSCRIPTION_PRICES.plus.yearly,
    icon: Zap,
    description: 'For regular commuters',
    features: [
      'Everything in Free',
      `Only ${(COMMISSION_RATES.plus * 100).toFixed(0)}% commission`,
      'Priority in search results',
      'Flight tracking & auto-rides',
      'Ride analytics dashboard',
    ],
    cta: 'Start Plus',
    highlight: true,
  },
  {
    name: 'Pro',
    price: SUBSCRIPTION_PRICES.pro.monthly,
    yearlyPrice: SUBSCRIPTION_PRICES.pro.yearly,
    icon: Crown,
    description: 'For power drivers & corporates',
    features: [
      'Everything in Plus',
      `Only ${(COMMISSION_RATES.pro * 100).toFixed(0)}% commission`,
      'Verified profile badge',
      'Corporate account access',
      'Priority customer support',
      'Advanced analytics & reports',
    ],
    cta: 'Start Pro',
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface-950">
      <nav className="flex items-center justify-between max-w-5xl mx-auto px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-surface-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xl font-bold text-white">{APP_NAME}</span>
        </Link>
        <Link href="/auth/login" className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl transition-colors">
          Sign In
        </Link>
      </nav>

      <section className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Simple, transparent pricing</h1>
        <p className="text-surface-400 text-lg mb-12">Choose the plan that fits your ride-sharing needs.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-6 text-left ${
                plan.highlight
                  ? 'border-brand-500 bg-brand-600/5 ring-1 ring-brand-500/20'
                  : 'border-surface-800 bg-surface-900'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {plan.icon && <plan.icon className="w-5 h-5 text-brand-400" />}
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
              </div>
              <p className="text-sm text-surface-400 mb-4">{plan.description}</p>
              <div className="mb-6">
                <span className="text-3xl font-bold text-white">
                  {plan.price === 0 ? 'Free' : `\u20AC${plan.price.toFixed(2)}`}
                </span>
                {plan.price > 0 && <span className="text-surface-400 text-sm">/month</span>}
                {plan.yearlyPrice && (
                  <p className="text-xs text-surface-500 mt-1">
                    or &euro;{plan.yearlyPrice.toFixed(2)}/year (save 33%)
                  </p>
                )}
              </div>
              <ul className="space-y-2.5 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-surface-300">
                    <Check className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/login"
                className={`block text-center font-medium py-2.5 rounded-xl transition-colors ${
                  plan.highlight
                    ? 'bg-brand-600 hover:bg-brand-700 text-white'
                    : 'bg-surface-800 hover:bg-surface-700 text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
