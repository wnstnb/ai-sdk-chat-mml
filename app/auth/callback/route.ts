import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/'; // Default redirect to home if 'next' is not present

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
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