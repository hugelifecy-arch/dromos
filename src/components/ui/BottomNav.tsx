'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Car, PlusCircle, MessageCircle, User } from 'lucide-react';
import { ROUTES } from '@/lib/constants';

const navItems = [
  { href: ROUTES.feed, icon: Home, label: 'Feed' },
  { href: ROUTES.rides, icon: Car, label: 'Legs' },
  { href: ROUTES.post, icon: PlusCircle, label: 'Post' },
  { href: ROUTES.messages, icon: MessageCircle, label: 'Messages' },
  { href: ROUTES.profile, icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface-900 border-t border-surface-800 pb-safe z-50">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== ROUTES.feed && pathname.startsWith(href));
          const isPost = href === ROUTES.post;

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${
                isPost
                  ? 'text-brand-400'
                  : isActive
                  ? 'text-white'
                  : 'text-surface-500 hover:text-surface-300'
              }`}
            >
              <Icon className={`w-6 h-6 ${isPost ? 'w-7 h-7' : ''}`} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
