'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { useModalStore } from '@/stores/useModalStore';
import Sidebar from '@/components/sidebar/Sidebar';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { VoiceSummaryModal } from './modals/VoiceSummaryModal';
import useMediaQuery from '@/lib/hooks/utils/useMediaQuery';

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
    openNewDocumentModal, 
    isVoiceSummaryModalOpen, 
    openVoiceSummaryModal, 
    closeVoiceSummaryModal,
    isMobileSidebarOpen,
    openMobileSidebar,
    closeMobileSidebar
  } = useModalStore();

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
    if (!isMounted) return; // Don't do anything until mounted

    let themeToApply = 'dark';

    if (isAuthenticated && isPrefStoreInitialized) {
      themeToApply = prefTheme || 'dark';
      console.log('[ThemeHandler] Authenticated and prefs initialized. Applying theme:', themeToApply);
    } else if (isAuthenticated && !isPrefStoreInitialized) {
      console.log('[ThemeHandler] Authenticated, but prefs NOT initialized. Keeping current theme (expected dark).');
      themeToApply = document.documentElement.getAttribute('data-theme') || 'dark';
    } else {
      console.log('[ThemeHandler] Not authenticated or not mounted. Ensuring dark theme:', themeToApply);
    }
    document.documentElement.setAttribute('data-theme', themeToApply);

  }, [prefTheme, isAuthenticated, isPrefStoreInitialized, isMounted]);


  const handleToggleTheme = () => {
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

  const handleNewNote = () => {
    openNewDocumentModal();
  };
  
  const NO_SIDEBAR_PATHS = ['/', '/login', '/signup', '/signup/confirm-email', '/signup/success', '/terms', '/privacy', '/auth/callback', '/auth/reset-password'];
  const displaySidebar = isAuthenticated && isMounted && !NO_SIDEBAR_PATHS.includes(pathname);
  const currentThemeForSidebar: 'light' | 'dark' = (isMounted && prefTheme) ? prefTheme : 'dark';

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
          isNewNoteLoading={false}
          isNewNoteDisabled={false}
          onVoiceSummary={openVoiceSummaryModal}
          isVoiceSummaryLoading={false}
          isVoiceSummaryDisabled={false}
          onPdfSummary={() => toast.info('PDF Summary clicked')}
          isPdfSummaryLoading={false}
          isPdfSummaryDisabled={false}
          onWebScrape={() => toast.info('Web Scrape clicked')}
          isWebScrapeLoading={false}
          isWebScrapeDisabled={false}
        />
      )}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {children}
      </main>
      <VoiceSummaryModal 
        isOpen={isVoiceSummaryModalOpen} 
        onClose={closeVoiceSummaryModal} 
      />
    </div>
  );
};

export default ThemeHandler;