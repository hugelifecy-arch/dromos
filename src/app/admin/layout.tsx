import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';
import { LayoutDashboard, Users, Car, CreditCard, BarChart3 } from 'lucide-react';

const adminNav = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/users', icon: Users, label: 'Users' },
  { href: '/admin/rides', icon: Car, label: 'Rides' },
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
