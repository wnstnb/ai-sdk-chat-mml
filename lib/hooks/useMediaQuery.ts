'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the current viewport width matches a given media query.
 * @param query - The media query string (e.g., '(max-width: 768px)').
 * @returns True if the media query matches, false otherwise.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
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

  return matches;
} 