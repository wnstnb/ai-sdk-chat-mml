'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/header';
import { usePathname } from 'next/navigation';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { useModalStore } from '@/stores/useModalStore';

interface ThemeHandlerProps {
  children: React.ReactNode;
}

const ThemeHandler: React.FC<ThemeHandlerProps> = ({ children }) => {
  const pathname = usePathname();
  const { 
    fetchPreferences, 
    theme: prefTheme, 
    setTheme: setPrefTheme, 
    isInitialized: isPrefStoreInitialized,
  } = usePreferenceStore();
  const { isAuthenticated } = useAuthStore();
  const openSearchModal = useModalStore((state) => state.openSearchModal);

  const [isMounted, setIsMounted] = useState(false);

  // Set mounted state after initial render
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch preferences when authenticated and store is not yet initialized
  useEffect(() => {
    if (isMounted && isAuthenticated && !isPrefStoreInitialized) {
      console.log('[ThemeHandler] Authenticated, mounted, and prefs not initialized. Fetching preferences...');
      fetchPreferences();
    }
  }, [isAuthenticated, isPrefStoreInitialized, fetchPreferences, isMounted]);

  // Apply theme from store once it's initialized and mounted
  useEffect(() => {
    if (!isMounted) return; // Don't do anything until mounted

    // The anti-flicker script in layout.tsx handles the very initial theme.
    // This effect refines it once the store is ready or auth state changes.
    let themeToApply = 'dark'; // Default to dark

    if (isAuthenticated && isPrefStoreInitialized) {
      themeToApply = prefTheme || 'dark'; // Use stored preference or fallback to dark
      console.log('[ThemeHandler] Authenticated and prefs initialized. Applying theme:', themeToApply);
    } else if (isAuthenticated && !isPrefStoreInitialized) {
      // Authenticated, but prefs not yet loaded/initialized. Stick to dark (likely set by anti-flicker or previous state).
      console.log('[ThemeHandler] Authenticated, but prefs NOT initialized. Keeping current theme (expected dark).');
      // No explicit set needed here if anti-flicker worked, or if it was already dark.
      // Could re-assert dark if there was a concern: document.documentElement.setAttribute('data-theme', 'dark'); 
      themeToApply = document.documentElement.getAttribute('data-theme') || 'dark'; // read current, should be dark
    } else {
      // Not authenticated (or isMounted is false, though guarded above)
      // Anti-flicker script should have set it to dark. This ensures it if needed.
      console.log('[ThemeHandler] Not authenticated or not mounted. Ensuring dark theme:', themeToApply);
    }
    document.documentElement.setAttribute('data-theme', themeToApply);

  }, [prefTheme, isAuthenticated, isPrefStoreInitialized, isMounted]);


  const handleToggleTheme = () => {
    const currentAppliedTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentAppliedTheme === 'light' ? 'dark' : 'light';
    console.log('[ThemeHandler] Toggling theme to:', nextTheme);
    setPrefTheme(nextTheme); // Update theme in the store (which will also update remote)
  };
  
  const showHeader = isAuthenticated && !['/', '/login', '/signup', '/signup/success', '/terms', '/privacy'].includes(pathname);
  const headerTheme = (isMounted && isAuthenticated && isPrefStoreInitialized && prefTheme) ? prefTheme : 'dark';

  // If not mounted, the anti-flicker script in <head> handles initial theme.
  // We render children directly to avoid hydration issues with theme-dependent rendering before mount.
  // A minimal loading UI could be an alternative here if children heavily depend on theme context not yet available.
  // However, `suppressHydrationWarning` on <html> and direct DOM manipulation by the anti-flicker script
  // should make this safe.
  // The main div wrapper is kept for structure.
  return (
    <div className="flex flex-col h-screen">
      {isMounted && showHeader && (
        <Header 
          currentTheme={headerTheme} 
          onToggleTheme={handleToggleTheme} 
          onOpenSearch={openSearchModal}
        />
      )}
      <main className={`flex-grow overflow-y-auto ${(!isMounted || !showHeader) ? 'h-screen' : ''}`}>
        {children}
      </main>
    </div>
  );
};

export default ThemeHandler;