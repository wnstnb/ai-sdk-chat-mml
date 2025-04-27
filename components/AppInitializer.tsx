'use client';

import { useEffect } from 'react';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
// Optional: Import auth hook if needed to check auth status before fetching
// import { useAuth } from '@/hooks/useAuth'; // Example hook name

interface AppInitializerProps {
  children: React.ReactNode;
}

export default function AppInitializer({ children }: AppInitializerProps) {
  // Optional: Check auth status if preferences are strictly for logged-in users
  // const { isAuthenticated } = useAuth(); // Example usage
  const { fetchPreferences, isInitialized } = usePreferenceStore();

  useEffect(() => {
    // Fetch preferences only if not already initialized 
    // and optionally if the user is authenticated
    if (!isInitialized /* && isAuthenticated */) {
      console.log('[AppInitializer] Fetching preferences...');
      fetchPreferences();
    }
  }, [isInitialized, fetchPreferences /*, isAuthenticated */]); // Add auth state if used

  // This component just initializes things and renders its children
  return <>{children}</>;
} 