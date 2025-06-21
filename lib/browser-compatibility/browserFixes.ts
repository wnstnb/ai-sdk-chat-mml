/**
 * Browser-Specific Fixes and Polyfills
 * Handles known browser issues and provides appropriate workarounds
 */

import { browserDetector, getBrowserInfo, supportsFeature } from './browserDetection';

export interface BrowserFix {
  name: string;
  description: string;
  browsers: string[];
  apply: () => void;
  isApplied: boolean;
}

class BrowserFixManager {
  private static instance: BrowserFixManager;
  private appliedFixes: Set<string> = new Set();
  private fixes: Map<string, BrowserFix> = new Map();

  static getInstance(): BrowserFixManager {
    if (!BrowserFixManager.instance) {
      BrowserFixManager.instance = new BrowserFixManager();
    }
    return BrowserFixManager.instance;
  }

  constructor() {
    this.registerFixes();
  }

  private registerFixes(): void {
    // Safari backdrop-filter fix
    this.registerFix({
      name: 'safari-backdrop-filter',
      description: 'Fallback for backdrop-filter in older Safari versions',
      browsers: ['safari'],
      apply: this.applySafariBackdropFilterFix,
      isApplied: false
    });

    // Firefox CSS containment fix
    this.registerFix({
      name: 'firefox-containment',
      description: 'Polyfill for CSS containment in Firefox',
      browsers: ['firefox'],
      apply: this.applyFirefoxContainmentFix,
      isApplied: false
    });

    // Chrome performance optimization
    this.registerFix({
      name: 'chrome-performance',
      description: 'Performance optimizations for Chrome',
      browsers: ['chrome'],
      apply: this.applyChromePerformanceFix,
      isApplied: false
    });

    // Safari animation fix
    this.registerFix({
      name: 'safari-animation',
      description: 'Fix for Safari animation timing issues',
      browsers: ['safari'],
      apply: this.applySafariAnimationFix,
      isApplied: false
    });

    // Firefox focus-visible polyfill
    this.registerFix({
      name: 'firefox-focus-visible',
      description: 'Polyfill for :focus-visible in older Firefox',
      browsers: ['firefox'],
      apply: this.applyFirefoxFocusVisibleFix,
      isApplied: false
    });

    // Edge compatibility fixes
    this.registerFix({
      name: 'edge-compatibility',
      description: 'General compatibility fixes for Edge',
      browsers: ['edge'],
      apply: this.applyEdgeCompatibilityFix,
      isApplied: false
    });

    // Mobile touch fixes
    this.registerFix({
      name: 'mobile-touch',
      description: 'Touch interaction fixes for mobile browsers',
      browsers: ['safari', 'chrome'],
      apply: this.applyMobileTouchFix,
      isApplied: false
    });

    // Intersection Observer polyfill
    this.registerFix({
      name: 'intersection-observer-polyfill',
      description: 'Polyfill for Intersection Observer API',
      browsers: ['safari', 'firefox', 'edge'],
      apply: this.applyIntersectionObserverPolyfill,
      isApplied: false
    });
  }

  registerFix(fix: BrowserFix): void {
    this.fixes.set(fix.name, fix);
  }

  applyFixes(): void {
    const browserInfo = getBrowserInfo();
    
    this.fixes.forEach((fix, name) => {
      if (this.shouldApplyFix(fix, browserInfo.name) && !this.appliedFixes.has(name)) {
        try {
          fix.apply();
          fix.isApplied = true;
          this.appliedFixes.add(name);
          console.log(`[BrowserFix] Applied fix: ${fix.name}`);
        } catch (error) {
          console.error(`[BrowserFix] Failed to apply fix ${fix.name}:`, error);
        }
      }
    });
  }

  private shouldApplyFix(fix: BrowserFix, browserName: string): boolean {
    return fix.browsers.includes(browserName) || fix.browsers.includes('all');
  }

  // Safari backdrop-filter fallback (now unused since glass effects removed)
  private applySafariBackdropFilterFix = (): void => {
    // Glass effects have been removed, so no backdrop-filter fallback needed
    console.log('[BrowserFixes] Backdrop-filter fallback skipped - glass effects removed');
  };

  // Firefox CSS containment polyfill
  private applyFirefoxContainmentFix = (): void => {
    if (!supportsFeature('cssContainment')) {
      const style = document.createElement('style');
      style.textContent = `
        .ai-component {
          /* Fallback for CSS containment */
          overflow: hidden;
          position: relative;
        }
        
        .ai-component * {
          /* Prevent layout thrashing */
          will-change: auto;
        }
      `;
      document.head.appendChild(style);
    }
  };

  // Chrome performance optimizations
  private applyChromePerformanceFix = (): void => {
    // Enable hardware acceleration for animations
    const style = document.createElement('style');
    style.textContent = `
      .content-highlight,
      .block-loading-state,
      .block-error-state {
        transform: translateZ(0);
        will-change: transform, opacity;
      }
      
      /* Optimize for large documents */
      .editor-container {
        contain: layout style paint;
      }
    `;
    document.head.appendChild(style);

    // Optimize scroll performance
    if ('scrollBehavior' in document.documentElement.style) {
      document.documentElement.style.scrollBehavior = 'smooth';
    }
  };

  // Safari animation timing fix
  private applySafariAnimationFix = (): void => {
    const browserInfo = getBrowserInfo();
    
    // Fix for Safari animation timing issues
    if (browserInfo.name === 'safari' && browserInfo.version < 15) {
      const style = document.createElement('style');
      style.textContent = `
        .highlight-animation {
          /* Use transform instead of opacity for better performance */
          transform: scale(1);
          transition: transform 0.3s ease-out;
        }
        
        .highlight-animation.active {
          transform: scale(1.02);
        }
        
        /* Reduce motion for Safari < 15 */
        @media (prefers-reduced-motion: reduce) {
          .highlight-animation {
            transition: none;
          }
        }
      `;
      document.head.appendChild(style);
    }
  };

  // Firefox focus-visible polyfill
  private applyFirefoxFocusVisibleFix = (): void => {
    if (!supportsFeature('focusVisible')) {
      // Simple focus-visible polyfill
      let hadKeyboardEvent = false;
      
      const keyboardThrottledEventListener = (e: KeyboardEvent) => {
        if (e.metaKey || e.altKey || e.ctrlKey) return;
        hadKeyboardEvent = true;
      };
      
      const pointerEventListener = () => {
        hadKeyboardEvent = false;
      };
      
      const focusEventListener = (e: FocusEvent) => {
        const target = e.target as Element;
        if (hadKeyboardEvent || target.matches(':focus-visible')) {
          target.classList.add('focus-visible');
        }
      };
      
      const blurEventListener = (e: FocusEvent) => {
        const target = e.target as Element;
        target.classList.remove('focus-visible');
      };
      
      document.addEventListener('keydown', keyboardThrottledEventListener, true);
      document.addEventListener('mousedown', pointerEventListener, true);
      document.addEventListener('pointerdown', pointerEventListener, true);
      document.addEventListener('touchstart', pointerEventListener, true);
      document.addEventListener('focus', focusEventListener, true);
      document.addEventListener('blur', blurEventListener, true);
      
      // Add CSS for focus-visible
      const style = document.createElement('style');
      style.textContent = `
        .focus-visible {
          outline: 2px solid #4A90E2;
          outline-offset: 2px;
        }
        
        button:focus:not(.focus-visible),
        [role="button"]:focus:not(.focus-visible) {
          outline: none;
        }
      `;
      document.head.appendChild(style);
    }
  };

  // Edge compatibility fixes
  private applyEdgeCompatibilityFix = (): void => {
    const style = document.createElement('style');
    style.textContent = `
      /* Fix for Edge flexbox issues */
      .ai-component {
        display: -ms-flexbox;
        display: flex;
      }
      
      /* Fix for Edge grid issues */
      .grid-layout {
        display: -ms-grid;
        display: grid;
      }
      
      /* Fix for Edge CSS variables */
      .highlight-overlay {
        background-color: rgba(59, 130, 246, 0.1); /* Fallback */
        background-color: var(--highlight-color, rgba(59, 130, 246, 0.1));
      }
    `;
    document.head.appendChild(style);
  };

  // Mobile touch interaction fixes
  private applyMobileTouchFix = (): void => {
    if (browserDetector.isMobile()) {
      const style = document.createElement('style');
      style.textContent = `
        /* Improve touch targets */
        .retry-button,
        .dismiss-button {
          min-height: 44px;
          min-width: 44px;
          padding: 12px;
        }
        
        /* Prevent zoom on input focus */
        input, textarea, select {
          font-size: 16px;
        }
        
        /* Improve scrolling */
        .editor-container {
          -webkit-overflow-scrolling: touch;
          overflow-scrolling: touch;
        }
        
        /* Prevent text selection on buttons */
        button, [role="button"] {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
      `;
      document.head.appendChild(style);

      // Add touch event handling
      document.addEventListener('touchstart', (e) => {
        const target = e.target as Element;
        if (target.matches('button, [role="button"]')) {
          target.classList.add('touch-active');
        }
      });

      document.addEventListener('touchend', (e) => {
        const target = e.target as Element;
        if (target.matches('button, [role="button"]')) {
          setTimeout(() => {
            target.classList.remove('touch-active');
          }, 150);
        }
      });
    }
  };

  // Intersection Observer polyfill
  private applyIntersectionObserverPolyfill = (): void => {
    if (!supportsFeature('intersectionObserver')) {
      console.warn('[BrowserFix] Intersection Observer not supported, using fallback implementation');
      
      // Fallback implementation
      (window as any).IntersectionObserver = class FallbackIntersectionObserver {
        root = null;
        rootMargin = '0px';
        thresholds = [0];
        
        constructor(callback: IntersectionObserverCallback) {
          // Simple fallback that assumes all elements are visible
          setTimeout(() => {
            callback([], this as any);
          }, 0);
        }
        
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      };
    }
  };

  // Get applied fixes for debugging
  getAppliedFixes(): string[] {
    return Array.from(this.appliedFixes);
  }

  // Get all available fixes
  getAllFixes(): BrowserFix[] {
    return Array.from(this.fixes.values());
  }
}

// Singleton instance
export const browserFixManager = BrowserFixManager.getInstance();

// Auto-apply fixes when module loads
export function initializeBrowserFixes(): void {
  // Apply fixes after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      browserFixManager.applyFixes();
    });
  } else {
    browserFixManager.applyFixes();
  }
}

// Manual fix application
export function applyBrowserFixes(): void {
  browserFixManager.applyFixes();
}

// Get debugging information
export function getBrowserFixInfo(): {
  browserInfo: ReturnType<typeof getBrowserInfo>;
  appliedFixes: string[];
  availableFixes: BrowserFix[];
} {
  return {
    browserInfo: getBrowserInfo(),
    appliedFixes: browserFixManager.getAppliedFixes(),
    availableFixes: browserFixManager.getAllFixes()
  };
} 