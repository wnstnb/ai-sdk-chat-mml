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
  const { fetchPreferences, isInitialized, editorFontSize, chatFontSize } = usePreferenceStore();
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

  useEffect(() => {
    const rootStyle = document.documentElement.style;

    if (isInitialized) {
      // Handle Editor Font Size
      if (typeof editorFontSize === 'number' && !isNaN(editorFontSize) && editorFontSize > 0) {
        rootStyle.setProperty('--editor-font-size', `${editorFontSize}rem`, 'important');
      } else {
        rootStyle.removeProperty('--editor-font-size');
      }

      // Handle Chat Font Size
      if (typeof chatFontSize === 'number' && !isNaN(chatFontSize) && chatFontSize > 0) {
        rootStyle.setProperty('--chat-font-size', `${chatFontSize}rem`, 'important');
      } else {
        rootStyle.removeProperty('--chat-font-size');
      }
    } else {
      rootStyle.removeProperty('--editor-font-size');
      rootStyle.removeProperty('--chat-font-size');
    }
  }, [isInitialized, editorFontSize, chatFontSize]);

  return <ModalManager>{children}</ModalManager>;
}
