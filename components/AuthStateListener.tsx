'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client'; // Your client-side Supabase instance
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { usePreferenceStore } from '@/lib/stores/preferenceStore'; // Import preference store

export function AuthStateListener({ children }: { children: React.ReactNode }) {
  const { setIsAuthenticated, setUser } = useAuthStore();
  const { fetchPreferences } = usePreferenceStore(); // Get fetchPreferences

  useEffect(() => {
    // Initial check for session on component mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        console.log('[AuthStateListener] Initial session found on mount.');
        setIsAuthenticated(true);
        setUser(session.user);
        // fetchPreferences(); // Fetch preferences on initial session load if user exists
      } else {
        console.log('[AuthStateListener] No initial session on mount.');
        setIsAuthenticated(false);
        setUser(null);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthStateListener] Auth event received:', event, 'Session:', session);
      if (event === 'INITIAL_SESSION') { // This event fires once after initial getSession completes
        if (session) {
          setIsAuthenticated(true);
          setUser(session.user);
          // fetchPreferences(); // Already handled by getSession or subsequent SIGNED_IN
        } else {
          setIsAuthenticated(false);
          setUser(null);
        }
      } else if (event === 'SIGNED_IN') {
        setIsAuthenticated(true);
        setUser(session?.user ?? null);
        console.log('[AuthStateListener] User SIGNED_IN, fetching preferences.');
        fetchPreferences(); // Fetch preferences on explicit sign-in
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUser(null);
        // Optionally, reset preference store theme to default when signed out
        // usePreferenceStore.getState().resetToDefaults(); // You'd need to add a reset action to your preference store
        console.log('[AuthStateListener] User SIGNED_OUT.');
      } else if (event === 'USER_UPDATED' && session?.user) {
        setUser(session.user);
        console.log('[AuthStateListener] User data UPDATED.');
      } else if (event === 'PASSWORD_RECOVERY') {
        // Handle password recovery state if needed (e.g., redirect to update password page)
        console.log('[AuthStateListener] Password recovery event.');
      } else if (event === 'TOKEN_REFRESHED') {
        // Session token was refreshed. Session object might be new.
        if (session) {
            setIsAuthenticated(true);
            setUser(session.user);
            console.log('[AuthStateListener] Token refreshed, session updated.');
        } else {
            // This case should ideally not happen if a token is refreshed without a session
            setIsAuthenticated(false);
            setUser(null);
            console.warn('[AuthStateListener] Token refreshed but no session available.');
        }
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
      console.log('[AuthStateListener] Unsubscribed from auth state changes.');
    };
  }, [setIsAuthenticated, setUser, fetchPreferences]);

  return <>{children}</>;
} 