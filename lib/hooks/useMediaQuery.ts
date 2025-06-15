'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the current viewport width matches a given media query.
 * @param query - The media query string (e.g., '(max-width: 768px)').
 * @returns True if the media query matches, false otherwise.
 */
export function useMediaQuery(query: string): boolean {
  // Start with null to indicate we haven't determined the value yet
  const [matches, setMatches] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Ensure window is defined (for client-side execution)
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQueryList = window.matchMedia(query);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Set initial state
    setMatches(mediaQueryList.matches);

    // Add listener for changes
    // Use newer addEventListener if available, fallback to addListener
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', listener);
    } else {
      // Deprecated but needed for some older browsers
      mediaQueryList.addListener(listener); 
    }

    // Cleanup listener on component unmount
    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', listener);
      } else {
        mediaQueryList.removeListener(listener);
      }
    };
  }, [query]); // Re-run effect if query changes

  // Return false during SSR and before mount to prevent hydration mismatches
  // This ensures consistent behavior between server and client
  if (!mounted || matches === null) {
    return false;
  }

  return matches;
} 