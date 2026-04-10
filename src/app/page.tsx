import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';
import { ArrowRight, Shield, Users, Zap, Car, Plane, Building2 } from 'lucide-react';

const features = [
  { icon: Car, title: 'Share Rides', desc: 'Post or find rides to split costs and reduce traffic.' },
  { icon: Users, title: 'Community', desc: 'Connect with trusted drivers and passengers near you.' },
  { icon: Plane, title: 'Flight Sync', desc: 'Track flights and auto-coordinate airport pickups.' },
  { icon: Shield, title: 'Verified Users', desc: 'Ratings, reviews, and verified profiles for safety.' },
  { icon: Building2, title: 'Corporate', desc: 'Manage team rides with centralized billing.' },
  { icon: Zap, title: 'Low Fees', desc: 'Starting at 3% commission with Pro. Keep more earnings.' },
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

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl sm:text-6xl font-bold text-white mb-6 leading-tight">
          Share the road,<br />share the cost
        </h1>
        <p className="text-lg sm:text-xl text-surface-400 max-w-2xl mx-auto mb-8">
          Connect with drivers and passengers heading your way. Save money, reduce traffic, meet great people.
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
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to ride?</h2>
        <p className="text-surface-400 mb-6">Join thousands sharing their commute across Greece.</p>
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
