/**
 * Feature Detection and Fallback System
 * Provides comprehensive feature detection and graceful fallbacks for AI components
 */

export interface FeatureSupport {
  // CSS Features
  cssGrid: boolean;
  cssFlexbox: boolean;
  cssVariables: boolean;
  cssBackdropFilter: boolean;
  cssContainment: boolean;
  cssContainerQueries: boolean;
  cssTransitions: boolean;
  cssAnimations: boolean;
  cssTransforms: boolean;
  
  // JavaScript APIs
  intersectionObserver: boolean;
  resizeObserver: boolean;
  mutationObserver: boolean;
  performanceObserver: boolean;
  requestAnimationFrame: boolean;
  requestIdleCallback: boolean;
  
  // Web APIs
  webAnimations: boolean;
  performanceAPI: boolean;
  memoryAPI: boolean;
  
  // Accessibility
  ariaSupport: boolean;
  focusVisible: boolean;
  
  // Modern JavaScript
  es6Classes: boolean;
  es6Modules: boolean;
  asyncAwait: boolean;
  promises: boolean;
  
  // Touch and Input
  touchEvents: boolean;
  pointerEvents: boolean;
  
  // Storage
  localStorage: boolean;
  sessionStorage: boolean;
}

export interface FallbackStrategy {
  feature: keyof FeatureSupport;
  fallback: () => void;
  description: string;
  performance: 'good' | 'acceptable' | 'poor';
}

class FeatureDetector {
  private static instance: FeatureDetector;
  private featureSupport: FeatureSupport | null = null;
  private fallbackStrategies: Map<keyof FeatureSupport, FallbackStrategy> = new Map();

  static getInstance(): FeatureDetector {
    if (!FeatureDetector.instance) {
      FeatureDetector.instance = new FeatureDetector();
    }
    return FeatureDetector.instance;
  }

  constructor() {
    this.registerFallbackStrategies();
  }

  /**
   * Get comprehensive feature support information
   */
  getFeatureSupport(): FeatureSupport {
    if (!this.featureSupport) {
      this.featureSupport = this.detectFeatures();
    }
    return this.featureSupport;
  }

  /**
   * Check if a specific feature is supported
   */
  supports(feature: keyof FeatureSupport): boolean {
    return this.getFeatureSupport()[feature];
  }

  /**
   * Apply fallbacks for unsupported features
   */
  applyFallbacks(): void {
    const support = this.getFeatureSupport();
    
    Object.entries(support).forEach(([feature, isSupported]) => {
      if (!isSupported) {
        const fallback = this.fallbackStrategies.get(feature as keyof FeatureSupport);
        if (fallback) {
          try {
            fallback.fallback();
            console.log(`[FeatureDetection] Applied fallback for ${feature}: ${fallback.description}`);
          } catch (error) {
            console.error(`[FeatureDetection] Failed to apply fallback for ${feature}:`, error);
          }
        }
      }
    });
  }

  /**
   * Get fallback information for a feature
   */
  getFallbackInfo(feature: keyof FeatureSupport): FallbackStrategy | null {
    return this.fallbackStrategies.get(feature) || null;
  }

  private detectFeatures(): FeatureSupport {
    return {
      // CSS Features
      cssGrid: this.detectCSSGrid(),
      cssFlexbox: this.detectCSSFlexbox(),
      cssVariables: this.detectCSSVariables(),
      cssBackdropFilter: this.detectCSSBackdropFilter(),
      cssContainment: this.detectCSSContainment(),
      cssContainerQueries: this.detectCSSContainerQueries(),
      cssTransitions: this.detectCSSTransitions(),
      cssAnimations: this.detectCSSAnimations(),
      cssTransforms: this.detectCSSTransforms(),
      
      // JavaScript APIs
      intersectionObserver: this.detectIntersectionObserver(),
      resizeObserver: this.detectResizeObserver(),
      mutationObserver: this.detectMutationObserver(),
      performanceObserver: this.detectPerformanceObserver(),
      requestAnimationFrame: this.detectRequestAnimationFrame(),
      requestIdleCallback: this.detectRequestIdleCallback(),
      
      // Web APIs
      webAnimations: this.detectWebAnimations(),
      performanceAPI: this.detectPerformanceAPI(),
      memoryAPI: this.detectMemoryAPI(),
      
      // Accessibility
      ariaSupport: this.detectAriaSupport(),
      focusVisible: this.detectFocusVisible(),
      
      // Modern JavaScript
      es6Classes: this.detectES6Classes(),
      es6Modules: this.detectES6Modules(),
      asyncAwait: this.detectAsyncAwait(),
      promises: this.detectPromises(),
      
      // Touch and Input
      touchEvents: this.detectTouchEvents(),
      pointerEvents: this.detectPointerEvents(),
      
      // Storage
      localStorage: this.detectLocalStorage(),
      sessionStorage: this.detectSessionStorage()
    };
  }

  // CSS Feature Detection
  private detectCSSGrid(): boolean {
    return CSS.supports('display', 'grid');
  }

  private detectCSSFlexbox(): boolean {
    return CSS.supports('display', 'flex');
  }

  private detectCSSVariables(): boolean {
    return CSS.supports('color', 'var(--test)');
  }

  private detectCSSBackdropFilter(): boolean {
    return CSS.supports('backdrop-filter', 'blur(1px)');
  }

  private detectCSSContainment(): boolean {
    return CSS.supports('contain', 'layout');
  }

  private detectCSSContainerQueries(): boolean {
    return CSS.supports('container-type', 'inline-size');
  }

  private detectCSSTransitions(): boolean {
    return CSS.supports('transition', 'opacity 1s');
  }

  private detectCSSAnimations(): boolean {
    return CSS.supports('animation', 'none');
  }

  private detectCSSTransforms(): boolean {
    return CSS.supports('transform', 'translateX(0)');
  }

  // JavaScript API Detection
  private detectIntersectionObserver(): boolean {
    return 'IntersectionObserver' in window;
  }

  private detectResizeObserver(): boolean {
    return 'ResizeObserver' in window;
  }

  private detectMutationObserver(): boolean {
    return 'MutationObserver' in window;
  }

  private detectPerformanceObserver(): boolean {
    return 'PerformanceObserver' in window;
  }

  private detectRequestAnimationFrame(): boolean {
    return 'requestAnimationFrame' in window;
  }

  private detectRequestIdleCallback(): boolean {
    return 'requestIdleCallback' in window;
  }

  // Web API Detection
  private detectWebAnimations(): boolean {
    return 'animate' in document.createElement('div');
  }

  private detectPerformanceAPI(): boolean {
    return 'performance' in window && 'now' in performance;
  }

  private detectMemoryAPI(): boolean {
    return 'memory' in (performance as any);
  }

  // Accessibility Detection
  private detectAriaSupport(): boolean {
    const element = document.createElement('div');
    return 'setAttribute' in element && 'getAttribute' in element;
  }

  private detectFocusVisible(): boolean {
    return CSS.supports('selector(:focus-visible)');
  }

  // Modern JavaScript Detection
  private detectES6Classes(): boolean {
    try {
      // eslint-disable-next-line no-new-func
      new Function('class Test {}');
      return true;
    } catch {
      return false;
    }
  }

  private detectES6Modules(): boolean {
    return 'noModule' in document.createElement('script');
  }

  private detectAsyncAwait(): boolean {
    try {
      // eslint-disable-next-line no-new-func
      new Function('async () => {}');
      return true;
    } catch {
      return false;
    }
  }

  private detectPromises(): boolean {
    return 'Promise' in window;
  }

  // Touch and Input Detection
  private detectTouchEvents(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  private detectPointerEvents(): boolean {
    return 'onpointerdown' in window;
  }

  // Storage Detection
  private detectLocalStorage(): boolean {
    try {
      const test = 'test';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  private detectSessionStorage(): boolean {
    try {
      const test = 'test';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  private registerFallbackStrategies(): void {
    // CSS Grid fallback
    this.fallbackStrategies.set('cssGrid', {
      feature: 'cssGrid',
      fallback: this.cssGridFallback,
      description: 'Using flexbox layout as fallback for CSS Grid',
      performance: 'good'
    });

    // CSS Variables fallback
    this.fallbackStrategies.set('cssVariables', {
      feature: 'cssVariables',
      fallback: this.cssVariablesFallback,
      description: 'Using static CSS values instead of CSS variables',
      performance: 'good'
    });

    // Backdrop Filter fallback
    this.fallbackStrategies.set('cssBackdropFilter', {
      feature: 'cssBackdropFilter',
      fallback: this.backdropFilterFallback,
      description: 'Using solid background colors instead of backdrop filter',
      performance: 'good'
    });

    // Intersection Observer fallback
    this.fallbackStrategies.set('intersectionObserver', {
      feature: 'intersectionObserver',
      fallback: this.intersectionObserverFallback,
      description: 'Using scroll event listeners for visibility detection',
      performance: 'acceptable'
    });

    // Web Animations fallback
    this.fallbackStrategies.set('webAnimations', {
      feature: 'webAnimations',
      fallback: this.webAnimationsFallback,
      description: 'Using CSS transitions and animations instead of Web Animations API',
      performance: 'good'
    });

    // Request Animation Frame fallback
    this.fallbackStrategies.set('requestAnimationFrame', {
      feature: 'requestAnimationFrame',
      fallback: this.requestAnimationFrameFallback,
      description: 'Using setTimeout for animation timing',
      performance: 'poor'
    });

    // Focus Visible fallback
    this.fallbackStrategies.set('focusVisible', {
      feature: 'focusVisible',
      fallback: this.focusVisibleFallback,
      description: 'Using keyboard event detection for focus-visible behavior',
      performance: 'good'
    });

    // Performance API fallback
    this.fallbackStrategies.set('performanceAPI', {
      feature: 'performanceAPI',
      fallback: this.performanceAPIFallback,
      description: 'Using Date.now() for timing measurements',
      performance: 'acceptable'
    });
  }

  // Fallback implementations
  private cssGridFallback = (): void => {
    const style = document.createElement('style');
    style.textContent = `
      .grid-fallback {
        display: flex;
        flex-wrap: wrap;
      }
      
      .grid-fallback > * {
        flex: 1 1 auto;
        min-width: 0;
      }
      
      /* Common grid patterns */
      .grid-2-col .grid-fallback > * {
        flex-basis: 50%;
      }
      
      .grid-3-col .grid-fallback > * {
        flex-basis: 33.333%;
      }
    `;
    document.head.appendChild(style);
  };

  private cssVariablesFallback = (): void => {
    const style = document.createElement('style');
    style.textContent = `
      /* Fallback values for common CSS variables */
      .highlight-overlay {
        background-color: rgba(59, 130, 246, 0.1);
      }
      
      .error-state {
        background-color: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
      }
      
      .loading-state {
        background-color: rgba(156, 163, 175, 0.1);
      }
    `;
    document.head.appendChild(style);
  };

  private backdropFilterFallback = (): void => {
    const style = document.createElement('style');
    style.textContent = `
      .backdrop-filter-fallback {
        background-color: rgba(255, 255, 255, 0.9);
      }
      
      .backdrop-filter-fallback.dark {
        background-color: rgba(0, 0, 0, 0.9);
      }
    `;
    document.head.appendChild(style);
  };

  private intersectionObserverFallback = (): void => {
    // Simple fallback using scroll events
    (window as any).IntersectionObserver = class FallbackIntersectionObserver {
      private callback: IntersectionObserverCallback;
      private elements: Set<Element> = new Set();
      
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        this.setupScrollListener();
      }
      
      observe(element: Element): void {
        this.elements.add(element);
        this.checkVisibility();
      }
      
      unobserve(element: Element): void {
        this.elements.delete(element);
      }
      
      disconnect(): void {
        this.elements.clear();
      }
      
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      
      private setupScrollListener(): void {
        const checkVisibility = () => this.checkVisibility();
        window.addEventListener('scroll', checkVisibility, { passive: true });
        window.addEventListener('resize', checkVisibility, { passive: true });
      }
      
      private checkVisibility(): void {
        const entries: IntersectionObserverEntry[] = [];
        
        this.elements.forEach(element => {
          const rect = element.getBoundingClientRect();
          const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
          
          entries.push({
            target: element,
            isIntersecting: isVisible,
            intersectionRatio: isVisible ? 1 : 0,
            boundingClientRect: rect,
            intersectionRect: isVisible ? rect : new DOMRect(),
            rootBounds: new DOMRect(0, 0, window.innerWidth, window.innerHeight),
            time: Date.now()
          } as IntersectionObserverEntry);
        });
        
        if (entries.length > 0) {
          this.callback(entries, this as any);
        }
      }
    };
  };

  private webAnimationsFallback = (): void => {
    // Polyfill for basic animate() method
    if (!('animate' in Element.prototype)) {
      (Element.prototype as any).animate = function(keyframes: any, options: any) {
        // Simple fallback using CSS transitions
        const element = this as HTMLElement;
        const duration = typeof options === 'number' ? options : options?.duration || 1000;
        
        // Apply transition
        element.style.transition = `all ${duration}ms ease`;
        
        // Apply final keyframe
        if (Array.isArray(keyframes) && keyframes.length > 0) {
          const finalFrame = keyframes[keyframes.length - 1];
          Object.assign(element.style, finalFrame);
        }
        
        // Return a mock Animation object
        return {
          finished: Promise.resolve(),
          cancel: () => {},
          pause: () => {},
          play: () => {},
          reverse: () => {}
        } as any;
      };
    }
  };

  private requestAnimationFrameFallback = (): void => {
    if (!('requestAnimationFrame' in window)) {
      (window as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
        return setTimeout(() => callback(Date.now()), 16);
      };
      
      (window as any).cancelAnimationFrame = (id: number) => {
        clearTimeout(id);
      };
    }
  };

  private focusVisibleFallback = (): void => {
    // Simple focus-visible polyfill
    let hadKeyboardEvent = false;
    
    const keyboardEventListener = () => {
      hadKeyboardEvent = true;
    };
    
    const pointerEventListener = () => {
      hadKeyboardEvent = false;
    };
    
    const focusEventListener = (e: FocusEvent) => {
      const target = e.target as Element;
      if (hadKeyboardEvent) {
        target.classList.add('focus-visible');
      }
    };
    
    const blurEventListener = (e: FocusEvent) => {
      const target = e.target as Element;
      target.classList.remove('focus-visible');
    };
    
    document.addEventListener('keydown', keyboardEventListener, true);
    document.addEventListener('mousedown', pointerEventListener, true);
    document.addEventListener('focus', focusEventListener, true);
    document.addEventListener('blur', blurEventListener, true);
  };

  private performanceAPIFallback = (): void => {
    if (!('performance' in window) || !('now' in performance)) {
      (window as any).performance = {
        now: () => Date.now(),
        mark: () => {},
        measure: () => {},
        getEntriesByType: () => [],
        getEntriesByName: () => []
      };
    }
  };
}

// Singleton instance
export const featureDetector = FeatureDetector.getInstance();

// Convenience functions
export function getFeatureSupport(): FeatureSupport {
  return featureDetector.getFeatureSupport();
}

export function supports(feature: keyof FeatureSupport): boolean {
  return featureDetector.supports(feature);
}

export function applyFallbacks(): void {
  featureDetector.applyFallbacks();
}

export function getFallbackInfo(feature: keyof FeatureSupport): FallbackStrategy | null {
  return featureDetector.getFallbackInfo(feature);
}

// Auto-apply fallbacks when module loads
if (typeof window !== 'undefined') {
  // Apply fallbacks after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyFallbacks);
  } else {
    applyFallbacks();
  }
} 