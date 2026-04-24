// Concierge-portal layout.
//
// Separate from the driver-side /app/* layout: no bottom-nav, no driver
// chrome. Keeps the concierge surface visually distinct so a staff member
// never confuses the two.
//
// The embed widget (/concierge/embed/[slug]) is a sibling route and uses its
// own full-width layout — it lives outside this layout because it renders
// inside a hotel's iframe and wants zero Dromos chrome.

import Link from 'next/link';
import { Building2 } from 'lucide-react';

export const metadata = {
  title: 'Dromos Concierge',
};

export default function ConciergeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-950 text-white">
      <header className="border-b border-surface-800 bg-surface-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/concierge" className="flex items-center gap-2 font-bold">
            <Building2 className="w-5 h-5 text-brand-400" />
            Dromos Concierge
          </Link>
          <nav className="flex gap-3 text-sm text-surface-400 ml-auto">
            <Link href="/concierge" className="hover:text-white transition-colors">Bookings</Link>
            <Link href="/concierge/new" className="hover:text-white transition-colors">New booking</Link>
            <Link href="/concierge/settings" className="hover:text-white transition-colors">Settings</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
