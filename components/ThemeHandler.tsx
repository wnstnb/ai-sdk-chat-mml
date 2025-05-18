'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/header';
import { usePathname } from 'next/navigation';
import { usePreferenceStore } from '@/lib/stores/preferenceStore'; // Import the store
import { SearchModal } from '@/components/search/SearchModal'; // ADDED: Import SearchModal

interface ThemeHandlerProps {
  children: React.ReactNode;
  isAuthenticated?: boolean; // Added isAuthenticated as an optional prop
}

// Define a default theme for fallback
const defaultTheme = 'dark'; 

const ThemeHandler: React.FC<ThemeHandlerProps> = ({ children, isAuthenticated }) => {
  const pathname = usePathname();
  // Get theme state and actions from the preference store
  const {
    theme: prefTheme, 
    editorFontSize: prefEditorFontSize,
    chatFontSize: prefChatFontSize,
    setTheme: setThemePref,
    isInitialized,
    fetchPreferences // Fetch might need to be triggered if AppInitializer isn't used/working
  } = usePreferenceStore();

  // Local state to manage the theme *before* the store is initialized
  // Helps prevent FOUC by using localStorage immediately
  const [initialThemeApplied, setInitialThemeApplied] = useState(false);

  // --- NEW: State and handlers for Search Modal ---
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const handleOpenSearchModal = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  const handleCloseSearchModal = useCallback(() => {
    setIsSearchModalOpen(false);
    // Optional: You might want to clear search query from useSearchStore here
    // const { clearSearch } = useSearchStore.getState();
    // clearSearch();
  }, []);
  // --- END NEW --- 

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

  // Effect 2: Apply theme and font sizes from the store once it's initialized
  useEffect(() => {
    // Only run on client and once preferences are loaded
    if (typeof window !== 'undefined' && isInitialized) {
      if (prefTheme) {
        console.log('[ThemeHandler] Applying theme from preference store:', prefTheme);
        document.documentElement.setAttribute('data-theme', prefTheme);
        localStorage.setItem('theme', prefTheme);
      } else {
        const fallbackTheme = usePreferenceStore.getState().theme || defaultTheme;
        console.log('[ThemeHandler] Store initialized, applying fallback theme:', fallbackTheme);
        document.documentElement.setAttribute('data-theme', fallbackTheme);
        localStorage.setItem('theme', fallbackTheme);
      }

      // Apply editor font size
      const editorFontSizeToApply = prefEditorFontSize || usePreferenceStore.getState().editorFontSize || 1; // Default to 1rem
      console.log('[ThemeHandler] Applying editor font size:', editorFontSizeToApply + 'rem');
      document.documentElement.style.setProperty('--editor-font-size', editorFontSizeToApply + 'rem');
      localStorage.setItem('editorFontSize', editorFontSizeToApply.toString());

      // Apply chat font size
      const chatFontSizeToApply = prefChatFontSize || usePreferenceStore.getState().chatFontSize || 1; // Default to 1rem
      console.log('[ThemeHandler] Applying chat font size:', chatFontSizeToApply + 'rem');
      document.documentElement.style.setProperty('--chat-font-size', chatFontSizeToApply + 'rem');
      localStorage.setItem('chatFontSize', chatFontSizeToApply.toString());
    }
  }, [isInitialized, prefTheme, prefEditorFontSize, prefChatFontSize]); // React to store initialization and changes

  // Theme toggling function now uses the store action
  const handleToggleTheme = () => {
    // Determine the next theme based on the *current* store value
    const currentTheme = prefTheme || defaultTheme; // Use default if store is null
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    console.log('[ThemeHandler] Toggling theme to:', nextTheme);
    setThemePref(nextTheme); // Call the store action
  };

  // Determine if the header should be shown
  // Header should be shown if authenticated AND not on landing, login, terms, or privacy pages.
  const showHeader = isAuthenticated && 
                     pathname !== '/' && 
                     pathname !== '/login' && 
                     pathname !== '/terms' && 
                     pathname !== '/privacy';

  // Determine the theme to pass to the Header (use store value or default)
  const headerTheme = prefTheme || defaultTheme;

  return (
    <div className="flex flex-col h-screen">
      {showHeader && (
        <Header 
          currentTheme={headerTheme} 
          onToggleTheme={handleToggleTheme} 
          onOpenSearch={handleOpenSearchModal} // ADDED: Pass handler to Header
        />
      )}
      <main className={`flex-grow overflow-y-auto ${!showHeader ? 'h-screen' : ''}`}>
        {children}
      </main>
      {/* ADDED: Render SearchModal */}
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