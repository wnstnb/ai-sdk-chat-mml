import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/'; // Default redirect to home if 'next' is not present
  const cookieStore = cookies();

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );
    try {
      await supabase.auth.exchangeCodeForSession(code);
      // URL to redirect to after sign in process completes
      return NextResponse.redirect(new URL(next, requestUrl.origin).toString());
    } catch (error) {
      console.error('Error exchanging code for session:', error);
      // Redirect to an error page or back to login with an error message
      return NextResponse.redirect(new URL('/login?error=auth_callback_failed', requestUrl.origin).toString());
    }
  }

  // Redirect to an error page or back to login if code is not present
  console.warn('OAuth callback called without a code.');
  return NextResponse.redirect(new URL('/login?error=no_code_provided', requestUrl.origin).toString());
} 