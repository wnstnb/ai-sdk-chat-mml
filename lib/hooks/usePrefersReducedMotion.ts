import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Custom hook to determine if the user has a preference for reduced motion.
 * It wraps Framer Motion's `useReducedMotion` hook to provide a boolean value
 * consistently, handling the null case during server-side rendering by initially
 * assuming no preference for reduced motion (i.e., animations enabled).
 *
 * @returns {boolean} True if the user prefers reduced motion, false otherwise.
 */
export function usePrefersReducedMotion(): boolean {
  const prefersReducedMotionFramer = useReducedMotion();
  const [shouldReduceMotion, setShouldReduceMotion] = useState(false);

  useEffect(() => {
    // On the client, `prefersReducedMotionFramer` will be true or false.
    // If it's null (server), we default to false (animations enabled).
    // This ensures client-side behavior matches actual user preference once hydrated.
    setShouldReduceMotion(prefersReducedMotionFramer === true);
  }, [prefersReducedMotionFramer]);

  return shouldReduceMotion;
} 