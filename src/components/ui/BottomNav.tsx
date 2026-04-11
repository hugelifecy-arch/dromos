'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Car, PlusCircle, MessageCircle, User } from 'lucide-react';
import { ROUTES } from '@/lib/constants';

const navItems = [
  { href: ROUTES.feed, icon: Home, label: 'Feed' },
  { href: ROUTES.rides, icon: Car, label: 'Legs' },
  { href: ROUTES.post, icon: PlusCircle, label: 'Post' },
  { href: ROUTES.messages, icon: MessageCircle, label: 'Chat' },
  { href: ROUTES.profile, icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-surface-900/95 backdrop-blur-xl border-t border-surface-800 pb-safe z-50"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== ROUTES.feed && pathname.startsWith(href));
          const isPost = href === ROUTES.post;

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[48px] rounded-xl transition-colors active:scale-95 ${
                isPost
                  ? 'text-brand-400'
                  : isActive
                  ? 'text-white'
                  : 'text-surface-500 hover:text-surface-300'
              }`}
            >
              {isActive && !isPost && (
                <span className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-5 h-0.5 bg-brand-500 rounded-full" />
              )}
              <Icon className={`${isPost ? 'w-7 h-7' : 'w-5 h-5'} transition-transform`} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
