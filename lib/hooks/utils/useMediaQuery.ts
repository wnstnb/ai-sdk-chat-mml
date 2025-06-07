import { useState, useEffect } from 'react';

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const documentChangeHandler = () => setMatches(mediaQueryList.matches);

    // Set initial state
    documentChangeHandler();

    // Listen for changes
    try {
      mediaQueryList.addEventListener('change', documentChangeHandler);
    } catch (e) {
      // Safari prior to 14 uses addListener
      mediaQueryList.addListener(documentChangeHandler);
    }

    return () => {
      try {
        mediaQueryList.removeEventListener('change', documentChangeHandler);
      } catch (e) {
        // Safari prior to 14 uses removeListener
        mediaQueryList.removeListener(documentChangeHandler);
      }
    };
  }, [query]);

  return matches;
};

export default useMediaQuery; 