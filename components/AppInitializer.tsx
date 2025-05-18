'use client';

import React, { useEffect } from 'react';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
import { createClient } from '@/lib/supabase/client';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import ModalManager from '@/components/modals/ModalManager';
import { useAuthStore } from '@/lib/stores/useAuthStore';

interface AppInitializerProps {
  children: React.ReactNode;
}

export default function AppInitializer({ children }: AppInitializerProps) {
  const { fetchPreferences, isInitialized } = usePreferenceStore();
  const { setIsAuthenticated, setUser, isAuthenticated } = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
        if (user) {
            console.log('[AppInitializer] Initial auth check: User is authenticated.');
            setIsAuthenticated(true);
            setUser(user);
        } else {
             console.log('[AppInitializer] Initial auth check: User is not authenticated.');
            setIsAuthenticated(false);
            setUser(null);
        }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
        (event: AuthChangeEvent, session: Session | null) => {
        console.log('[AppInitializer] Auth state changed:', event, session);
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
             if (currentUser) {
                console.log('[AppInitializer] Auth Listener: User signed in or session refreshed.');
                setIsAuthenticated(true);
             } else {
                 console.log('[AppInitializer] Auth Listener: Signed in event but no user in session.');
                 setIsAuthenticated(false);
             }
        } else if (event === 'SIGNED_OUT') {
            console.log('[AppInitializer] Auth Listener: User signed out.');
            setIsAuthenticated(false);
        }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase.auth, setIsAuthenticated, setUser]);

  useEffect(() => {
    if (!isInitialized && isAuthenticated) {
      console.log('[AppInitializer] Fetching preferences (user authenticated)...');
      fetchPreferences();
    } else if (!isInitialized && !isAuthenticated) {
         console.log('[AppInitializer] Waiting for authentication to fetch preferences...');
    }
  }, [isInitialized, isAuthenticated, fetchPreferences]);

  return <ModalManager>{children}</ModalManager>;
}
