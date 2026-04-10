# Dromos

Ride-sharing platform for Greece. Share rides, save money, meet people.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL + Auth + Realtime)
- **Payments:** Stripe (subscriptions + checkout)
- **Styling:** Tailwind CSS
- **Language:** TypeScript
- **i18n:** Greek (default) & English

## Features

- Ride posting & booking with real-time seat tracking
- Social feed with posts, likes, and comments
- In-app messaging between riders and drivers
- Flight tracking with auto-ride creation
- Freemium subscription tiers (Free / Plus / Pro)
- Commission-based monetisation (15% / 8% / 3%)
- Corporate accounts with team billing
- Verified profiles and ratings
- Admin dashboard

## Getting Started

1. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Supabase and Stripe credentials in `.env.local`

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the Supabase migrations:
   ```bash
   supabase db push
   ```

5. Start the dev server:
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
  app/
    (landing)     - Public landing page & pricing
    auth/         - Login, signup, onboarding, OAuth callback
    app/          - Authenticated app (feed, rides, messages, profile, etc.)
    admin/        - Admin dashboard
    api/          - API routes (flights, subscriptions)
  components/ui/  - Shared UI components
  lib/            - Supabase clients, constants, i18n
  types/          - TypeScript types
supabase/
  migrations/     - Database schema
```

## Security

See [SECURITY.md](SECURITY.md) for security policy and best practices.

## Environment Variables

See `.env.example` for all required variables.
