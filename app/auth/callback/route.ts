import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  console.log('[AuthCallback] Full request URL:', request.url);

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextPath = requestUrl.searchParams.get('next') ?? '/';

  console.log(`[AuthCallback] Received code: ${code ? 'YES' : 'NO'}, nextPath: ${nextPath}`);

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[AuthCallback] Error exchanging code for session:', error.message);
      const errorRedirectUrl = new URL('/login', requestUrl.origin);
      errorRedirectUrl.searchParams.set('error', 'auth_callback_failed');
      errorRedirectUrl.searchParams.set('error_description', error.message);
      return NextResponse.redirect(errorRedirectUrl);
    }
  }

  console.log(`[AuthCallback] Redirecting to: ${new URL(nextPath, requestUrl.origin).toString()}`);
  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
} 