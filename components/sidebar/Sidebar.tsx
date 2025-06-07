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
  ChevronLeftIcon,
  FilePlus,
  AudioWaveform,
  Shovel,
  BookOpenText
} from 'lucide-react'; // Consolidate icons from lucide-react
import { useSwipeable } from 'react-swipeable'; // Added for swipe gestures
import TuonLogoIcon from '@/components/ui/TuonLogoIcon'; // Import the new TuonLogoIcon component
import { QuickAccessDropdown } from '@/components/editor/QuickAccessDropdown'; // ADDED: Import QuickAccessDropdown

// Define a smaller icon size for action buttons
const ACTION_ICON_SIZE = 16;

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
              <TuonLogoIcon 
                className={styles.toggleButtonLogo} 
                aria-label={isDesktopSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              />
            </button>
          )}
          {isMobile && isOpenOnMobile && (
             <button 
               onClick={onCloseMobile} 
               className={styles.toggleButton}
               aria-label="Close sidebar"
             >
               <TuonLogoIcon 
                 className={styles.toggleButtonLogo} 
               />
             </button>
          )}
        </div>

        <nav className={styles.sidebarNav}>
          <ul>
            <li><a href="/launch" className={styles.homeButton}><HomeIcon size={ACTION_ICON_SIZE} />{showText && <span className={styles.navText}>Home</span>}</a></li>
          </ul>
        </nav>

        <div className={styles.sidebarActionsTop}>
          <button 
            onClick={onNewNote} 
            className={styles.actionButton} 
            disabled={isNewNoteLoading || isNewNoteDisabled}
            aria-label={!showText && !isNewNoteLoading ? "New Note" : (isNewNoteLoading ? "Creating new note..." : undefined)}
          >
            {isNewNoteLoading ? (
              <Loader2 size={ACTION_ICON_SIZE} className={styles.loadingIcon} />
            ) : (
              <FilePlus size={ACTION_ICON_SIZE} />
            )}
            {showText && !isNewNoteLoading && 'New Note'}
          </button>
          <button 
            onClick={onVoiceSummary} 
            className={styles.actionButton} 
            disabled={isVoiceSummaryLoading || isVoiceSummaryDisabled}
            aria-label={!showText && !isVoiceSummaryLoading ? "Voice Summary" : (isVoiceSummaryLoading ? "Processing voice summary..." : undefined)}
          >
            {isVoiceSummaryLoading ? (
              <Loader2 size={ACTION_ICON_SIZE} className={styles.loadingIcon} />
            ) : (
              <AudioWaveform size={ACTION_ICON_SIZE} />
            )}
            {showText && !isVoiceSummaryLoading && 'Voice Summary'}
          </button>
          <button 
            onClick={onWebScrape} 
            className={styles.actionButton} 
            disabled={isWebScrapeLoading || isWebScrapeDisabled}
            aria-label={!showText && !isWebScrapeLoading ? "Web Scrape" : (isWebScrapeLoading ? "Processing web scrape..." : undefined)}
          >
            {isWebScrapeLoading ? (
              <Loader2 size={ACTION_ICON_SIZE} className={styles.loadingIcon} />
            ) : (
              <Shovel size={ACTION_ICON_SIZE} />
            )}
            {showText && !isWebScrapeLoading && 'Web Scrape'}
          </button>
          <button 
            onClick={onPdfSummary} 
            className={styles.actionButton} 
            disabled={isPdfSummaryLoading || isPdfSummaryDisabled}
            aria-label={!showText && !isPdfSummaryLoading ? "PDF Summary" : (isPdfSummaryLoading ? "Processing PDF summary..." : undefined)}
          >
            {isPdfSummaryLoading ? (
              <Loader2 size={ACTION_ICON_SIZE} className={styles.loadingIcon} />
            ) : (
              <BookOpenText size={ACTION_ICON_SIZE} />
            )}
            {showText && !isPdfSummaryLoading && 'PDF Summary'}
          </button>
        </div>

        {showText && (
          <div className={styles.quickAccessSection}>
            <QuickAccessDropdown />
          </div>
        )}

        <div className={styles.sidebarFooter}>
          <button onClick={onToggleTheme} className={styles.actionButtonSecondary} aria-label={!showText ? (currentTheme === 'light' ? "Switch to dark theme" : "Switch to light theme") : undefined}>
            {currentTheme === 'light' ? <MoonIcon size={ACTION_ICON_SIZE} /> : <SunIcon size={ACTION_ICON_SIZE} />}
            {showText && `Theme: ${currentTheme}`}
          </button>
          <button onClick={onOpenPreferences} className={styles.actionButtonSecondary} aria-label={!showText ? "Open Preferences" : undefined}>
            <SettingsIcon size={ACTION_ICON_SIZE} />
            {showText && 'Preferences'}
          </button>
          <button onClick={onLogout} className={styles.actionButtonSecondary} aria-label={!showText ? "Logout" : undefined}>
            <LogOutIcon size={ACTION_ICON_SIZE} />
            {showText && 'Logout'}
          </button>
        </div>
      </aside>
    </>
  );
};

export default React.memo(Sidebar); 