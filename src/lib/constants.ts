export const APP_NAME = 'Dromos';
export const APP_DESCRIPTION = 'Share rides, save money, meet people.';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const COMMISSION_RATES = {
  free: 0.15,
  plus: 0.08,
  pro: 0.03,
} as const;

export const SUBSCRIPTION_PRICES = {
  plus: { monthly: 4.99, yearly: 39.99 },
  pro: { monthly: 14.99, yearly: 119.99 },
} as const;

export const STRIPE_PRICE_IDS = {
  plus_monthly: process.env.NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID || '',
  plus_yearly: process.env.NEXT_PUBLIC_STRIPE_PLUS_YEARLY_PRICE_ID || '',
  pro_monthly: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || '',
  pro_yearly: process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID || '',
} as const;

export const MAX_SEATS = 7;
export const MIN_RIDE_PRICE = 2.0;
export const DEFAULT_CURRENCY = 'EUR';

export const LUGGAGE_OPTIONS = [
  { value: 'small', label: { en: 'Small bag', el: 'Μικρή τσάντα' } },
  { value: 'medium', label: { en: 'Medium luggage', el: 'Μεσαία αποσκευή' } },
  { value: 'large', label: { en: 'Large suitcase', el: 'Μεγάλη βαλίτσα' } },
] as const;

export const ROUTES = {
  home: '/',
  login: '/auth/login',
  onboarding: '/auth/onboarding',
  pricing: '/pricing',
  feed: '/app/feed',
  rides: '/app/flights',
  post: '/app/post',
  messages: '/app/messages',
  profile: '/app/profile',
  earnings: '/app/earnings',
  upgrade: '/app/upgrade',
  corporate: '/app/corporate',
  admin: '/admin',
} as const;

export const AVATAR_PLACEHOLDER = 'https://api.dicebear.com/7.x/initials/svg?seed=';
