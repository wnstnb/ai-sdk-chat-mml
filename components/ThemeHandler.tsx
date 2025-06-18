'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { useModalStore } from '@/stores/useModalStore';
import Sidebar from '@/components/sidebar/Sidebar';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

import useMediaQuery from '@/lib/hooks/utils/useMediaQuery';
import { WebScrapingModal } from '@/components/modals/WebScrapingModal';

interface ThemeHandlerProps {
  children: React.ReactNode;
}

const ThemeHandler: React.FC<ThemeHandlerProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const { 
    fetchPreferences, 
    theme: prefTheme, 
    setTheme: setPrefTheme, 
    isInitialized: isPrefStoreInitialized,
  } = usePreferenceStore();
  const { isAuthenticated } = useAuthStore();
  const { 
    openSearchModal, 
    openPreferencesModal, 
    isVoiceSummaryModalOpen, 
    openVoiceSummaryModal, 
    closeVoiceSummaryModal,
    isMobileSidebarOpen,
    openMobileSidebar,
    closeMobileSidebar,
    openPDFModal
  } = useModalStore();

  const [isWebScrapingModalOpen, setIsWebScrapingModalOpen] = useState(false);
  const [isCreatingNewNote, setIsCreatingNewNote] = useState(false);

  const [isMounted, setIsMounted] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

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
    if (!isMounted || typeof document === 'undefined') return; // Don't do anything until mounted and on client

    const currentTheme = document.documentElement.getAttribute('data-theme');
    let themeToApply: string | null = null;

    if (isAuthenticated && isPrefStoreInitialized) {
      // User is authenticated and preferences are loaded - use their preference
      themeToApply = prefTheme || 'dark';
      console.log('[ThemeHandler] Authenticated and prefs initialized. Applying theme:', themeToApply);
    } else if (isAuthenticated && !isPrefStoreInitialized) {
      // User is authenticated but preferences not loaded yet - keep current theme
      console.log('[ThemeHandler] Authenticated, but prefs NOT initialized. Keeping current theme:', currentTheme);
      // Don't change the theme - let the anti-flicker script's choice persist
      return;
    } else {
      // Not authenticated - keep whatever theme is currently set (from anti-flicker script)
      console.log('[ThemeHandler] Not authenticated. Keeping current theme from anti-flicker script:', currentTheme);
      // Don't force dark theme for unauthenticated users
      return;
    }
    
    // Only apply theme if it's different from what's currently set
    if (currentTheme !== themeToApply) {
      document.documentElement.setAttribute('data-theme', themeToApply);
      console.log('[ThemeHandler] Theme changed from', currentTheme, 'to', themeToApply);
    }

  }, [prefTheme, isAuthenticated, isPrefStoreInitialized, isMounted]);


  const handleToggleTheme = () => {
    if (typeof document === 'undefined') return; // Guard against SSR
    const currentAppliedTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentAppliedTheme === 'light' ? 'dark' : 'light';
    console.log('[ThemeHandler] Toggling theme to:', nextTheme);
    setPrefTheme(nextTheme);
  };

  const handleLogout = async () => {
    toast.success('Logging out...');
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleNewNote = async () => {
    if (isCreatingNewNote) return; // Prevent double-clicks
    
    setIsCreatingNewNote(true);
    try {
      toast.info('Creating new document...');
      
      const response = await fetch('/api/documents/create-with-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `New Note - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour12: false })}`,
          content: [], // Empty content for blank document
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to create new document. Please try again.' } }));
        throw new Error(errorData.error?.message || 'Failed to create new document.');
      }

      const result = await response.json();
      const newDocumentId = result.data?.documentId;

      if (!newDocumentId) {
        throw new Error('Failed to get new document ID from response.');
      }

      toast.success('New document created!');
      router.push(`/editor/${newDocumentId}`);
    } catch (error: any) {
      console.error('Error creating new document:', error);
      toast.error(error.message || 'Failed to create new document.');
    } finally {
      setIsCreatingNewNote(false);
    }
  };
  
  const openWebScrapingModal = () => setIsWebScrapingModalOpen(true);
  const closeWebScrapingModal = () => setIsWebScrapingModalOpen(false);

  const NO_SIDEBAR_PATHS = ['/', '/login', '/signup', '/signup/confirm-email', '/signup/success', '/terms', '/privacy', '/auth/callback', '/auth/reset-password'];
  const displaySidebar = isAuthenticated && isMounted && !NO_SIDEBAR_PATHS.includes(pathname);
  
  // Get the actual current theme from document instead of defaulting to dark
  const getCurrentTheme = useMemo((): 'light' | 'dark' => {
    if (isMounted && isPrefStoreInitialized && prefTheme) {
      return prefTheme;
    }
    // Only access document if we're on the client side (mounted)
    if (!isMounted || typeof document === 'undefined') {
      return 'dark'; // SSR fallback
    }
    // Fall back to reading from the document (which includes anti-flicker script setting)
    const currentTheme = document.documentElement.getAttribute('data-theme');
    return (currentTheme === 'light' || currentTheme === 'dark') ? currentTheme : 'dark';
  }, [isMounted, isPrefStoreInitialized, prefTheme]);
  
  const currentThemeForSidebar: 'light' | 'dark' = getCurrentTheme;

  return (
    <div className="flex h-screen bg-[--bg-color] text-[--text-color]">
      {displaySidebar && (
        <Sidebar
          isOpenOnMobile={isMobileSidebarOpen}
          onCloseMobile={closeMobileSidebar}
          onLogout={handleLogout}
          onToggleTheme={handleToggleTheme}
          currentTheme={currentThemeForSidebar}
          onOpenPreferences={openPreferencesModal}
          onNewNote={handleNewNote}
          isNewNoteLoading={isCreatingNewNote}
          isNewNoteDisabled={isCreatingNewNote}
          onVoiceSummary={openVoiceSummaryModal}
          isVoiceSummaryLoading={false}
          isVoiceSummaryDisabled={false}
          onPdfSummary={openPDFModal}
          isPdfSummaryLoading={false}
          isPdfSummaryDisabled={false}
          onWebScrape={openWebScrapingModal}
          isWebScrapeLoading={false}
          isWebScrapeDisabled={false}
        />
      )}
      <main className="flex-1 flex flex-col overflow-y-auto relative">
        {children}
      </main>

      <WebScrapingModal
        isOpen={isWebScrapingModalOpen}
        onClose={closeWebScrapingModal}
      />
    </div>
  );
};

export default ThemeHandler;