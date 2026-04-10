import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // Protected routes — redirect to login if not authenticated
  if (request.nextUrl.pathname.startsWith('/app') && !session) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Admin routes — check admin status
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    const { data: admin } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', session.user.id)
      .single();

    if (!admin) {
      return NextResponse.redirect(new URL('/app/feed', request.url));
    }
  }

  // Already logged in — redirect away from auth pages
  if (request.nextUrl.pathname.startsWith('/auth/login') && session) {
    return NextResponse.redirect(new URL('/app/feed', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/app/:path*', '/admin/:path*', '/auth/:path*'],
};
