'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/header';
import { usePathname } from 'next/navigation';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { SearchModal } from '@/components/search/SearchModal';

interface ThemeHandlerProps {
  children: React.ReactNode;
}

// Define a local default theme for fallback before store is initialized or if store theme is null
const localDefaultTheme = 'dark'; 

const ThemeHandler: React.FC<ThemeHandlerProps> = ({ children }) => {
  const pathname = usePathname();
  // Corrected destructuring: use fetchPreferences, theme, and setTheme from the store.
  const { fetchPreferences, theme: prefTheme, setTheme } = usePreferenceStore();
  const { isAuthenticated } = useAuthStore();

  const [isMounted, setIsMounted] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Initialize preferences on mount by calling fetchPreferences
  useEffect(() => {
    fetchPreferences(); // CORRECTED: Call fetchPreferences directly
  }, [fetchPreferences]); // CORRECTED: Dependency is fetchPreferences

  // Set mounted state after initial render to avoid hydration mismatch with theme
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Apply theme to HTML element when prefTheme or localDefaultTheme changes, and after mount
  useEffect(() => {
    if (isMounted) {
      // Use prefTheme from store if available, otherwise use localDefaultTheme
      const currentThemeToApply = prefTheme || localDefaultTheme;
      document.documentElement.setAttribute('data-theme', currentThemeToApply);
      console.log('[ThemeHandler] Applied theme to HTML:', currentThemeToApply);
    }
  }, [prefTheme, localDefaultTheme, isMounted]); // prefTheme can be null, localDefaultTheme is constant but included for clarity

  // Handlers for SearchModal
  const handleOpenSearchModal = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  const handleCloseSearchModal = useCallback(() => {
    setIsSearchModalOpen(false);
  }, []);

  // Theme toggling function now uses the store action
  const handleToggleTheme = () => {
    // Use prefTheme from store if available, otherwise use localDefaultTheme for current theme calculation
    const currentTheme = prefTheme || localDefaultTheme;
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    console.log('[ThemeHandler] Toggling theme to:', nextTheme);
    setTheme(nextTheme); // CORRECTED: Call setTheme directly
  };

  // Determine if the header should be shown
  const showHeader = isAuthenticated && 
                     pathname !== '/' && 
                     pathname !== '/login' && 
                     pathname !== '/terms' && 
                     pathname !== '/privacy';

  // Determine the theme to pass to the Header
  // Use prefTheme from store if available, otherwise use localDefaultTheme
  const headerTheme = prefTheme || localDefaultTheme;

  // If not mounted yet, render children without theme-dependent UI to prevent hydration errors
  if (!isMounted) {
    return <div className="flex flex-col h-screen"><main className="flex-grow overflow-y-auto h-screen">{children}</main></div>;
  }

  return (
    <div className="flex flex-col h-screen">
      {showHeader && (
        <Header 
          currentTheme={headerTheme} 
          onToggleTheme={handleToggleTheme} 
          onOpenSearch={handleOpenSearchModal}
        />
      )}
      <main className={`flex-grow overflow-y-auto ${!showHeader ? 'h-screen' : ''}`}>
        {children}
      </main>
      {isSearchModalOpen && (
        <SearchModal 
          isOpen={isSearchModalOpen} 
          onClose={handleCloseSearchModal} 
        />
      )}
    </div>
  );
};

export default ThemeHandler;