import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';
import { ArrowRight, Shield, Users, Zap, Car, Plane, Building2 } from 'lucide-react';

const features = [
  { icon: Car, title: 'Sell Your Empty Leg', desc: 'Post the segment you were about to drive empty. Set your own price. Another licensed driver picks it up — you earn instead of burning fuel for nothing.' },
  { icon: Users, title: 'Licensed Drivers Only', desc: 'Every member is a licensed Cyprus taxi driver, verified before activation. Driver-to-driver. No passengers, no amateurs, no public sign-ups.' },
  { icon: Plane, title: 'Airport Queue (LCA / PFO)', desc: 'Coordinate Larnaca and Paphos queue positions. Post your empty inbound or outbound airport leg before you leave the rank.' },
  { icon: Shield, title: 'No Commission, No Boss', desc: "We don't take a cut per leg. You set the price, you keep it. Flat subscription once beta ends — that's it." },
  { icon: Building2, title: 'Fleet Board', desc: 'Fleet operators post and manage empty legs for all their drivers from one dashboard. Pro-tier (future — inactive during beta).' },
  { icon: Zap, title: 'Free During Beta', desc: 'Zero commission. Zero subscription. Full access. Early drivers shape the product before pricing is introduced.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-950">
      {/* Nav */}
      <nav className="flex items-center justify-between max-w-5xl mx-auto px-4 py-4">
        <span className="text-xl font-bold text-white">{APP_NAME}</span>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="text-sm text-surface-400 hover:text-white transition-colors px-3 py-2">
            Pricing
          </Link>
          <Link href="/auth/login" className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl transition-colors">
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero — Greek-first per Sprint 10 brand framing. */}
      <section className="max-w-5xl mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl sm:text-6xl font-bold text-white mb-4 leading-tight">
          Γέμισε το άδειο ταξί σου<br />στον δρόμο της επιστροφής.
        </h1>
        <p className="text-lg sm:text-2xl text-surface-300 mb-2">Going back empty? Sell the leg.</p>
        <p className="text-base sm:text-lg text-surface-400 max-w-2xl mx-auto mb-8">
          The driver-to-driver empty-leg marketplace for licensed Cyprus taxi drivers. No commission. No boss. Cyprus-owned.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Get Started <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 bg-surface-800 hover:bg-surface-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-surface-900 border border-surface-800 rounded-2xl p-6 hover:border-surface-700 transition-colors">
              <Icon className="w-8 h-8 text-brand-400 mb-3" />
              <h3 className="text-white font-semibold mb-1">{title}</h3>
              <p className="text-surface-400 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-surface-800 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Φτιαγμένο για Κύπριους οδηγούς ταξί</h2>
        <p className="text-surface-300 mb-4">Built for Cyprus taxi drivers — by people who understand the rank.</p>
        <p className="text-surface-400 mb-6">Free during beta. Every verified licensed driver gets full access.</p>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-8 py-3 rounded-xl transition-colors"
        >
          Create Free Account <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-800 py-8 text-center text-surface-500 text-sm">
        &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
      </footer>
    </div>
  );
}
