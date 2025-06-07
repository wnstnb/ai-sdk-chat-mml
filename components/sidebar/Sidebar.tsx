import React, { useState, useEffect } from 'react';
import styles from './Sidebar.module.css';
import useMediaQuery from '@/lib/hooks/utils/useMediaQuery'; // Corrected path
import {
  LogOutIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  PlusIcon,
  VoicemailIcon,
  FileTextIcon,
  GlobeIcon,
  HomeIcon,
  MicIcon,
  FileJsonIcon,
  Loader2,
  PanelLeftIcon,
  ChevronLeftIcon
} from 'lucide-react'; // Consolidate icons from lucide-react
import { useSwipeable } from 'react-swipeable'; // Added for swipe gestures

interface SidebarProps {
  // Props that might be passed from a parent to control the sidebar, e.g., for mobile hamburger toggle
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void; // Callback to close from parent if needed
  // Props for migrated header actions
  onLogout: () => void;
  onToggleTheme: () => void;
  currentTheme: 'light' | 'dark';
  onOpenPreferences: () => void;
  // Props for New button and Launch page actions (to be implemented in later tasks)
  onNewNote: () => void;
  isNewNoteLoading?: boolean;
  isNewNoteDisabled?: boolean;
  onVoiceSummary: () => void;
  isVoiceSummaryLoading?: boolean;
  isVoiceSummaryDisabled?: boolean;
  onPdfSummary: () => void;
  isPdfSummaryLoading?: boolean;
  isPdfSummaryDisabled?: boolean;
  onWebScrape: () => void;
  isWebScrapeLoading?: boolean;
  isWebScrapeDisabled?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpenOnMobile,
  onCloseMobile,
  onLogout,
  onToggleTheme,
  currentTheme,
  onOpenPreferences,
  onNewNote,
  isNewNoteLoading,
  isNewNoteDisabled,
  onVoiceSummary,
  isVoiceSummaryLoading,
  isVoiceSummaryDisabled,
  onPdfSummary,
  isPdfSummaryLoading,
  isPdfSummaryDisabled,
  onWebScrape,
  isWebScrapeLoading,
  isWebScrapeDisabled,
}) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const DESKTOP_SIDEBAR_EXPANDED_KEY = 'desktopSidebarExpandedState';

  const [isDesktopSidebarExpanded, setIsDesktopSidebarExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem(DESKTOP_SIDEBAR_EXPANDED_KEY);
      return savedState !== null ? JSON.parse(savedState) : true; // Default to true (expanded)
    }
    return true; // Default to true for SSR or if localStorage is not available
  });

  // Effect to save state to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DESKTOP_SIDEBAR_EXPANDED_KEY, JSON.stringify(isDesktopSidebarExpanded));
    }
  }, [isDesktopSidebarExpanded]);

  // Determine if the sidebar/drawer should be visually open
  const isSidebarEffectivelyOpen = isMobile ? isOpenOnMobile : isDesktopSidebarExpanded;

  const toggleDesktopSidebar = () => {
    setIsDesktopSidebarExpanded(!isDesktopSidebarExpanded);
  };

  // Effect to handle body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobile && isSidebarEffectivelyOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto'; // Cleanup on unmount
    };
  }, [isMobile, isSidebarEffectivelyOpen]);

  // Swipe handlers for mobile drawer
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (isMobile && isOpenOnMobile) {
        onCloseMobile?.();
      }
    },
    trackMouse: true, // Optional: allow mouse to trigger swipe for testing
    preventScrollOnSwipe: true,
  });

  const handleToggle = () => {
    if (isMobile) {
      onCloseMobile?.(); // Parent controls mobile open/close state
    } else {
      toggleDesktopSidebar();
    }
  };

  if (isMobile && !isOpenOnMobile) {
    return null; // Don't render the sidebar at all if it's mobile and closed (parent will have a hamburger)
  }

  const showText = isSidebarEffectivelyOpen || (!isMobile && isDesktopSidebarExpanded);

  return (
    <>
      {isMobile && (
        <div
          className={`${styles.overlay} ${isSidebarEffectivelyOpen ? styles.overlayOpen : ''}`}
          onClick={onCloseMobile}
          aria-hidden={!isSidebarEffectivelyOpen}
        />
      )}
      <aside
        {...(isMobile && swipeHandlers)} // Spread swipe handlers here for mobile
        className={`
          ${styles.sidebar}
          ${isMobile ? styles.mobileDrawer : ''}
          ${isSidebarEffectivelyOpen ? (isMobile ? styles.mobileDrawerOpen : styles.expanded) : (isMobile ? '' : styles.collapsed)}
        `}
      >
        <div className={styles.sidebarHeader}>
          {!isMobile && (
            <button 
              onClick={handleToggle} 
              className={styles.toggleButton} 
              aria-expanded={isDesktopSidebarExpanded}
              aria-label={isDesktopSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              {isDesktopSidebarExpanded ? 
                <ChevronLeftIcon size={20} /> : 
                <PanelLeftIcon size={20} />
              }
            </button>
          )}
          {isMobile && isOpenOnMobile && (
             <button onClick={onCloseMobile} className={styles.mobileCloseButton} aria-label="Close sidebar">
                 <ChevronLeftIcon size={24} />
             </button>
          )}
          {(isSidebarEffectivelyOpen || !isMobile) && (
            isDesktopSidebarExpanded || isMobile ? (
              <p className={styles.logoText}>MyApp</p>
            ) : (
              <p className={styles.logoIcon}>M</p>
            )
          )}
        </div>

        <nav className={styles.sidebarNav}>
          <ul>
            <li><a href="#">{showText ? 'Home' : <span title="Home"><HomeIcon size={20} /></span>}</a></li>
            <li><a href="#">{showText ? 'Documents' : <span title="Documents"><FileTextIcon size={20} /></span>}</a></li>
          </ul>
        </nav>

        <div className={styles.sidebarActionsTop}>
          <button 
            onClick={onNewNote} 
            className={styles.actionButton} 
            disabled={isNewNoteLoading || isNewNoteDisabled}
            aria-label={!showText && !isNewNoteLoading ? "New Note" : undefined}
          >
            {isNewNoteLoading ? (
              <Loader2 size={20} className={styles.loadingIcon} />
            ) : (
              showText ? 'New Note' : <span title="New Note"><PlusIcon size={20} /></span>
            )}
          </button>
          <button 
            onClick={onVoiceSummary} 
            className={styles.actionButton} 
            disabled={isVoiceSummaryLoading || isVoiceSummaryDisabled}
            aria-label={!showText && !isVoiceSummaryLoading ? "Voice Summary" : undefined}
          >
            {isVoiceSummaryLoading ? (
              <Loader2 size={20} className={styles.loadingIcon} />
            ) : (
              showText ? 'Voice Summary' : <span title="Voice Summary"><VoicemailIcon size={20} /></span>
            )}
          </button>
          <button 
            onClick={onPdfSummary} 
            className={styles.actionButton} 
            disabled={isPdfSummaryLoading || isPdfSummaryDisabled}
            aria-label={!showText && !isPdfSummaryLoading ? "PDF Summary" : undefined}
          >
            {isPdfSummaryLoading ? (
              <Loader2 size={20} className={styles.loadingIcon} />
            ) : (
              showText ? 'PDF Summary' : <span title="PDF Summary"><FileTextIcon size={20} /></span>
            )}
          </button>
          <button 
            onClick={onWebScrape} 
            className={styles.actionButton} 
            disabled={isWebScrapeLoading || isWebScrapeDisabled}
            aria-label={!showText && !isWebScrapeLoading ? "Web Scrape" : undefined}
          >
            {isWebScrapeLoading ? (
              <Loader2 size={20} className={styles.loadingIcon} />
            ) : (
              showText ? 'Web Scrape' : <span title="Web Scrape"><GlobeIcon size={20} /></span>
            )}
          </button>
        </div>

        <div className={styles.sidebarActionsLaunch}>
          <p className={styles.sectionTitle}>{showText ? 'Quick Actions' : <span title="Quick Actions">🚀</span>}</p>
          <button onClick={onVoiceSummary} className={styles.actionButtonSecondary} aria-label={!showText ? "Voice Summary" : undefined}>{showText ? 'Voice Summary' : <span title="Voice Summary"><MicIcon size={18} /></span>}</button>
          <button onClick={onPdfSummary} className={styles.actionButtonSecondary} aria-label={!showText ? "PDF Summary" : undefined}>{showText ? 'PDF Summary' : <span title="PDF Summary"><FileJsonIcon size={18} /></span>}</button>
          <button onClick={onWebScrape} className={styles.actionButtonSecondary} aria-label={!showText ? "Web Scrape" : undefined}>{showText ? 'Web Scrape' : <span title="Web Scrape"><GlobeIcon size={18} /></span>}</button>
        </div>

        <div className={styles.sidebarFooter}>
          <button onClick={onToggleTheme} className={styles.actionButtonSecondary} aria-label={!showText ? (currentTheme === 'light' ? "Switch to dark theme" : "Switch to light theme") : "Toggle theme"}>
            {showText ? `Theme: ${currentTheme}` : (currentTheme === 'light' ? <MoonIcon size={20} /> : <SunIcon size={20} />)}
          </button>
          <button onClick={onOpenPreferences} className={styles.actionButtonSecondary} aria-label={!showText ? "Open Preferences" : "Preferences"}>
            {showText ? 'Preferences' : <span title="Preferences"><SettingsIcon size={20} /></span>}
          </button>
          <button onClick={onLogout} className={styles.actionButtonSecondary} aria-label={!showText ? "Logout" : "Logout"}>
            {showText ? 'Logout' : <span title="Logout"><LogOutIcon size={20} /></span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default React.memo(Sidebar); 