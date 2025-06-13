// Simple logging middleware for Zustand stores
export const loggingMiddleware = <T>(f: any) => (set: any, get: any, api: any) => {
  const wrappedSet = (...args: any[]) => {
    console.log('%cZustand Action', 'background: #4ade80; color: black; padding: 2px 4px; border-radius: 3px;', args[0]);
    const result = set(...args);
    console.log('%cZustand State', 'background: #60a5fa; color: black; padding: 2px 4px; border-radius: 3px;', get());
    return result;
  };
  
  return f(wrappedSet, get, api);
};

// Performance monitoring middleware that tracks action timing
export const performanceMiddleware = <T>(f: any) => (set: any, get: any, api: any) => {
  const wrappedSet = (...args: any[]) => {
    const start = performance.now();
    const result = set(...args);
    const end = performance.now();
    const duration = end - start;
    
    if (duration > 1) { // Only log slow actions (> 1ms)
      console.warn(`Slow Zustand action took ${duration.toFixed(2)}ms:`, args[0]);
    }
    
    return result;
  };
  
  return f(wrappedSet, get, api);
}; 