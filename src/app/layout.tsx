import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'greek'] });

export const metadata: Metadata = {
  title: { default: 'Dromos — Cyprus Taxi Driver Empty-Leg Marketplace', template: '%s | Dromos' },
  description: 'The free B2B marketplace for licensed Cyprus taxi drivers to buy and sell empty legs between fares. Larnaca, Limassol, Nicosia, Paphos.',
  keywords: ['taxi', 'cyprus', 'empty leg', 'driver', 'marketplace', 'larnaca', 'limassol', 'nicosia', 'paphos', 'airport transfer'],
  authors: [{ name: 'Dromos' }],
  creator: 'Dromos',
  metadataBase: new URL('https://dromos-ten.vercel.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://dromos-ten.vercel.app',
    siteName: 'Dromos',
    title: 'Dromos — Cyprus Taxi Driver Empty-Leg Marketplace',
    description: 'The free B2B marketplace for licensed Cyprus taxi drivers to buy and sell empty legs between fares.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Dromos — Cyprus Taxi Marketplace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dromos — Cyprus Taxi Driver Empty-Leg Marketplace',
    description: 'Buy and sell empty taxi legs in Cyprus.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#020617',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
