'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase/client';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';
import { Session, User } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

// Dynamically import the Auth component with SSR disabled
const AuthUI = dynamic(
  () => import('../../components/AuthUI'),
  { ssr: false }
);

export default function Login() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirectAttempted = useRef(false);
  const router = useRouter();

  const checkProfileAndRedirect = useCallback(async (user: User) => {
    if (redirectAttempted.current) return;
    redirectAttempted.current = true;
    setIsRedirecting(true);

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('billing_cycle, stripe_subscription_status')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile for redirect check:', profileError);
        router.replace('/launch');
        return;
      }

      if (profile && profile.stripe_subscription_status === 'legacy') {
        console.log(`User ${user.id.substring(0,8)} is legacy, redirecting to /launch`);
        router.replace('/launch');
      } else if (profile && profile.billing_cycle) {
        console.log(`User ${user.id.substring(0,8)} has billing_cycle (and not legacy), redirecting to /launch`);
        router.replace('/launch');
      } else {
        console.log(`User ${user.id.substring(0,8)} missing billing_cycle (and not legacy), redirecting to /signup?step=complete_plan_selection`);
        router.replace('/signup?step=complete_plan_selection');
      }
    } catch (e) {
      console.error('Exception in checkProfileAndRedirect:', e);
      router.replace('/launch');
    }
  }, [router]);

  useEffect(() => {
    const handleAuthSession = async (currentSession: Session | null) => {
      if (currentSession?.user) {
        await checkProfileAndRedirect(currentSession.user);
      } else {
        setIsLoading(false);
        setIsRedirecting(false);
        redirectAttempted.current = false;
      }
    };

    const initialSessionCheck = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      console.log("Login page initial session check:", !!session, session?.user?.id?.substring(0, 8));
      await handleAuthSession(session);
    };

    initialSessionCheck();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      console.log("Auth state changed in login page:", _event, newSession?.user?.id?.substring(0,8));
      if (!redirectAttempted.current) {
         await handleAuthSession(newSession);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkProfileAndRedirect]);

  if (isLoading || isRedirecting) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center text-white">
        {isRedirecting ? "Redirecting to editor..." : "Checking authentication status..."}
      </div>
    );
  }
  
  return (
    // Centering container with background image
    <div className="flex items-center justify-center min-h-screen bg-[url('/tuon-bg.png')] bg-cover bg-center p-4">
      {/* Card container - increased shadow */}
      <div className="login-card w-full max-w-md bg-[color:var(--card-bg)]/70 backdrop-blur-lg rounded-xl shadow-2xl border border-[color:var(--border-color)]/25 p-6 md:p-8">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center">
            <img src="/tuon-logo-svg-type.svg" alt="Tuon Logo" className="h-10 w-10 mr-2" style={{ filter: 'var(--logo-filter)' }} />
            <span className="text-3xl font-bold text-[color:var(--accent-color)] font-newsreader">tuon.io</span>
          </Link>
          <p className="text-sm text-[color:var(--primary-color)]/70 mt-1">Bring it all into focus</p>
        </div>
        <AuthUI />
        <div className="text-center text-sm mt-6">
          <p className="text-[color:var(--muted-text-color)]">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-[color:var(--anchor-text-color)] hover:text-[color:var(--anchor-text-hover-color)] hover:underline">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
} 