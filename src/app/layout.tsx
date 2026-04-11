import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'greek'] });

export const metadata: Metadata = {
  title: { default: 'Dromos — Cyprus Taxi Driver Empty-Leg Marketplace', template: '%s | Dromos' },
  description: 'The free B2B marketplace for licensed Cyprus taxi drivers to buy and sell empty legs between fares.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#020617',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
