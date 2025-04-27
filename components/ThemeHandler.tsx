'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/header';
import { usePathname } from 'next/navigation';
import { usePreferenceStore } from '@/lib/stores/preferenceStore'; // Import the store

interface ThemeHandlerProps {
  children: React.ReactNode;
}

// Define a default theme for fallback
const defaultTheme = 'dark'; 

const ThemeHandler: React.FC<ThemeHandlerProps> = ({ children }) => {
  const pathname = usePathname();
  // Get theme state and actions from the preference store
  const {
    theme: prefTheme, 
    setTheme: setThemePref,
    isInitialized,
    fetchPreferences // Fetch might need to be triggered if AppInitializer isn't used/working
  } = usePreferenceStore();

  // Local state to manage the theme *before* the store is initialized
  // Helps prevent FOUC by using localStorage immediately
  const [initialThemeApplied, setInitialThemeApplied] = useState(false);

  // Effect 1: Set initial theme based on localStorage FIRST, then fetch store
  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined' && !initialThemeApplied) {
      const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      const initialLocalTheme = storedTheme || defaultTheme;
      console.log('[ThemeHandler] Applying initial theme from localStorage:', initialLocalTheme);
      document.documentElement.setAttribute('data-theme', initialLocalTheme);
      setInitialThemeApplied(true);
    }
  }, [initialThemeApplied]); // Run once when initialThemeApplied changes

  // Effect 2: Apply theme from the store once it's initialized
  useEffect(() => {
    // Only run on client and once preferences are loaded
    if (typeof window !== 'undefined' && isInitialized && prefTheme) {
       console.log('[ThemeHandler] Applying theme from preference store:', prefTheme);
       document.documentElement.setAttribute('data-theme', prefTheme);
       // Update local storage to keep it in sync (optional but good practice)
       localStorage.setItem('theme', prefTheme);
    } else if (typeof window !== 'undefined' && isInitialized && !prefTheme) {
        // Handle case where store is initialized but theme is null (e.g., fetch error)
        // Apply the default theme from store logic (which falls back to 'light')
        const fallbackTheme = usePreferenceStore.getState().theme || defaultTheme;
        console.log('[ThemeHandler] Store initialized, applying fallback theme:', fallbackTheme);
        document.documentElement.setAttribute('data-theme', fallbackTheme);
        localStorage.setItem('theme', fallbackTheme);
    }
  }, [isInitialized, prefTheme]); // React to store initialization and theme changes

  // Theme toggling function now uses the store action
  const handleToggleTheme = () => {
    // Determine the next theme based on the *current* store value
    const currentTheme = prefTheme || defaultTheme; // Use default if store is null
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    console.log('[ThemeHandler] Toggling theme to:', nextTheme);
    setThemePref(nextTheme); // Call the store action
  };

  // Determine if the header should be shown
  const showHeader = pathname !== '/' && pathname !== '/login';

  // Determine the theme to pass to the Header (use store value or default)
  const headerTheme = prefTheme || defaultTheme;

  return (
    <div className="flex flex-col h-screen">
      {showHeader && (
        <Header currentTheme={headerTheme} onToggleTheme={handleToggleTheme} />
      )}
      <main className={`flex-grow overflow-y-auto ${!showHeader ? 'h-screen' : ''}`}>
        {children}
      </main>
    </div>
  );
};

export default ThemeHandler;