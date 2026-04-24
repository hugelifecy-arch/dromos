import { createBrowserClient } from '@supabase/ssr';

type BrowserClient = ReturnType<typeof createBrowserClient>;

export function createClient(): BrowserClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During static prerendering without env vars, return a lazy proxy that
  // defers the failure until something actually tries to use the client.
  // Holding the reference in a client component body is then safe.
  if (!url || !key) {
    return new Proxy({} as BrowserClient, {
      get() {
        throw new Error(
          'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        );
      },
    });
  }

  return createBrowserClient(url, key);
}
