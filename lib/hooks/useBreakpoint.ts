import { useState, useEffect } from 'react';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const breakpoints: Record<Breakpoint, string> = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
};

/**
 * Custom hook to determine the current responsive breakpoint.
 * It listens to window resize events and returns the largest matching breakpoint name.
 * Breakpoints are aligned with common Tailwind CSS conventions.
 *
 * @returns {Breakpoint | undefined} The current active breakpoint (e.g., 'sm', 'md', 'lg'),
 * or undefined if the screen is smaller than the smallest defined breakpoint.
 * Returns an ordered list from smallest to largest active. E.g. on a large screen, it might return ['sm', 'md', 'lg'].
 * Consumers can then check for the presence of a breakpoint, e.g. activeBreakpoints.includes('md').
 */
export function useBreakpoint(): Breakpoint[] {
  const [activeBreakpoints, setActiveBreakpoints] = useState<Breakpoint[]>([]);

  useEffect(() => {
    const getActiveBreakpoints = () => {
      const newActiveBreakpoints: Breakpoint[] = [];
      if (typeof window !== 'undefined') {
        (Object.keys(breakpoints) as Breakpoint[]).forEach((key) => {
          if (window.matchMedia(breakpoints[key]).matches) {
            newActiveBreakpoints.push(key);
          }
        });
      }
      // Ensure a consistent order, e.g., smallest to largest, if necessary, although typical usage might be `includes`
      // For simplicity, this example doesn't enforce a strict order beyond iteration order of Object.keys
      // which is usually insertion order for non-numeric string keys, but can be customized if needed.
      return newActiveBreakpoints;
    };

    const handleResize = () => {
      setActiveBreakpoints(getActiveBreakpoints());
    };

    // Set initial breakpoints
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return activeBreakpoints;
}

// Example usage:
// const activePoints = useBreakpoint();
// const isMobile = !activePoints.includes('md');
// const isLargeScreen = activePoints.includes('lg'); 