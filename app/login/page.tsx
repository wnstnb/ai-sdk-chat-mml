'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase/client';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
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

  useEffect(() => {
    const checkSession = async () => {
      if (redirectAttempted.current) return;
      
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log("Login page session check:", !!session, session?.user?.id?.substring(0, 8));
        
        setSession(session);
        
        if (session?.user && !isRedirecting) {
          console.log("Session found in login page, setting redirect flag");
          setIsRedirecting(true);
          redirectAttempted.current = true;
          router.replace('/launch');
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error checking session in login page:", error);
        setIsLoading(false);
      }
    };
    
    checkSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth state changed in login page:", _event);
      setSession(session);
      
      if (session && !redirectAttempted.current && !isRedirecting) {
        console.log("Session detected in login page auth change");
        setIsRedirecting(true);
        redirectAttempted.current = true;
        router.replace('/launch');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, isRedirecting]);

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
          <p className="text-sm text-[color:var(--primary-color)]/70 mt-1">Bring it all into focus.</p>
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