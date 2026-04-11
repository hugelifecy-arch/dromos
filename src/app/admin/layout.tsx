import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';
import { LayoutDashboard, Users, Car, CreditCard, BarChart3, ShieldCheck, Flag } from 'lucide-react';

const adminNav = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/users', icon: Users, label: 'Users' },
  { href: '/admin/verifications', icon: ShieldCheck, label: 'Verifications' },
  { href: '/admin/rides', icon: Car, label: 'Rides' },
  { href: '/admin/reports', icon: Flag, label: 'Reports' },
  { href: '/admin/subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { href: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-950 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-surface-800 p-4 hidden md:block">
        <Link href="/admin" className="text-xl font-bold text-white mb-8 block">
          {APP_NAME} <span className="text-xs text-surface-500 font-normal">Admin</span>
        </Link>
        <nav className="space-y-1">
          {adminNav.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-surface-400 hover:text-white hover:bg-surface-900 transition-colors text-sm"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 pt-4 border-t border-surface-800">
          <Link
            href="/app/feed"
            className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
          >
            &larr; Back to App
          </Link>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-950 border-t border-surface-800 z-50">
        <div className="flex overflow-x-auto no-scrollbar">
          {adminNav.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 px-4 py-2 min-w-[72px] text-surface-400 hover:text-white"
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px]">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>
    </div>
  );
}
