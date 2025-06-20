import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/stores/useAuthStore';

interface UserProfile {
  id: string;
  email: string;
  username: string;
  avatar_url?: string;
  display_name?: string;
}

interface UseUserProfileReturn {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage current user's profile data including username
 */
export const useUserProfile = (): UseUserProfileReturn => {
  const { user, isAuthenticated } = useAuthStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[useUserProfile] Fetching profile for user ID:', user.id);
      
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, username, avatar_url')
        .eq('id', user.id)
        .single();

      console.log('[useUserProfile] Database response:', { data, error: profileError });

      if (profileError) {
        console.error('[useUserProfile] Database error:', profileError);
        throw new Error(`Failed to fetch profile: ${profileError.message}`);
      }

      if (!data) {
        console.error('[useUserProfile] No profile data returned');
        throw new Error('Profile not found');
      }

      const profileData = {
        id: data.id,
        email: data.email || user.email || 'Unknown',
        username: data.username || 'Anonymous User',
        avatar_url: data.avatar_url,
        display_name: user.user_metadata?.full_name // Use auth metadata for display_name
      };
      
      console.log('[useUserProfile] Setting profile data:', profileData);
      setProfile(profileData);

    } catch (err) {
      console.error('[useUserProfile] Error fetching user profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
      
      // Fallback to auth user data
      const fallbackProfile = {
        id: user.id,
        email: user.email || 'Unknown',
        username: user.user_metadata?.name || user.email?.split('@')[0] || 'Anonymous User',
        avatar_url: user.user_metadata?.avatar_url,
        display_name: user.user_metadata?.full_name
      };
      
      console.log('[useUserProfile] Using fallback profile data:', fallbackProfile);
      setProfile(fallbackProfile);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user, supabase]);

  // Fetch profile when user changes
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const refetch = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    isLoading,
    error,
    refetch
  };
}; 