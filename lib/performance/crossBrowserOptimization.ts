/**
 * Cross-Browser Performance Optimization System
 * Applies browser-specific optimizations for AI components
 */

import { getBrowserInfo, browserUtils } from '../browser-compatibility/browserDetection';
import { supports } from '../feature-detection/featureDetection';

export interface PerformanceOptimization {
  name: string;
  description: string;
  browsers: string[];
  apply: () => void;
  impact: 'high' | 'medium' | 'low';
  category: 'rendering' | 'animation' | 'memory' | 'network' | 'interaction';
}

export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  animationFrameRate: number;
  interactionDelay: number;
  layoutShifts: number;
}

class CrossBrowserPerformanceOptimizer {
  private static instance: CrossBrowserPerformanceOptimizer;
  private optimizations: Map<string, PerformanceOptimization> = new Map();
  private appliedOptimizations: Set<string> = new Set();
  private performanceObserver: PerformanceObserver | null = null;
  private metrics: PerformanceMetrics = {
    renderTime: 0,
    memoryUsage: 0,
    animationFrameRate: 60,
    interactionDelay: 0,
    layoutShifts: 0
  };

  static getInstance(): CrossBrowserPerformanceOptimizer {
    if (!CrossBrowserPerformanceOptimizer.instance) {
      CrossBrowserPerformanceOptimizer.instance = new CrossBrowserPerformanceOptimizer();
    }
    return CrossBrowserPerformanceOptimizer.instance;
  }

  constructor() {
    this.registerOptimizations();
    this.initializePerformanceMonitoring();
  }

  /**
   * Apply all relevant performance optimizations for the current browser
   */
  applyOptimizations(): void {
    const browserInfo = getBrowserInfo();
    console.log('[CrossBrowserPerf] Applying performance optimizations for:', browserInfo.name);

    this.optimizations.forEach((optimization, name) => {
      if (this.shouldApplyOptimization(optimization, browserInfo.name) && 
          !this.appliedOptimizations.has(name)) {
        try {
          optimization.apply();
          this.appliedOptimizations.add(name);
          console.log(`[CrossBrowserPerf] Applied ${optimization.name}: ${optimization.description}`);
        } catch (error) {
          console.error(`[CrossBrowserPerf] Failed to apply ${optimization.name}:`, error);
        }
      }
    });
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get performance recommendations for the current browser
   */
  getRecommendations(): string[] {
    const browserInfo = getBrowserInfo();
    const recommendations: string[] = [];

    switch (browserInfo.name) {
      case 'chrome':
        recommendations.push(
          'Use CSS containment for large documents',
          'Enable hardware acceleration with transform3d',
          'Optimize scroll performance with passive listeners',
          'Use Intersection Observer for lazy loading'
        );
        break;

      case 'firefox':
        recommendations.push(
          'Minimize DOM manipulation during animations',
          'Use will-change sparingly to avoid memory issues',
          'Prefer transform over changing layout properties',
          'Optimize for Gecko rendering engine specifics'
        );
        break;

      case 'safari':
        recommendations.push(
          'Test backdrop-filter performance on older versions',
          'Use transform for animations instead of opacity changes',
          'Optimize for WebKit rendering quirks',
          'Consider iOS Safari memory limitations'
        );
        break;

      case 'edge':
        recommendations.push(
          'Provide fallbacks for newer CSS features',
          'Test flexbox and grid layouts thoroughly',
          'Optimize for Chromium-based Edge performance'
        );
        break;
    }

    if (browserInfo.platform === 'mobile') {
      recommendations.push(
        'Optimize touch interactions with touch-action',
        'Minimize layout shifts on mobile',
        'Use efficient scroll handling for mobile devices'
      );
    }

    return recommendations;
  }

  private registerOptimizations(): void {
    // Chrome-specific optimizations
    this.registerOptimization({
      name: 'chrome-hardware-acceleration',
      description: 'Enable hardware acceleration for AI components',
      browsers: ['chrome'],
      apply: this.applyChromeHardwareAcceleration,
      impact: 'high',
      category: 'rendering'
    });

    this.registerOptimization({
      name: 'chrome-containment',
      description: 'Use CSS containment for performance isolation',
      browsers: ['chrome'],
      apply: this.applyChromeContainment,
      impact: 'medium',
      category: 'rendering'
    });

    // Firefox-specific optimizations
    this.registerOptimization({
      name: 'firefox-animation-optimization',
      description: 'Optimize animations for Gecko engine',
      browsers: ['firefox'],
      apply: this.applyFirefoxAnimationOptimization,
      impact: 'medium',
      category: 'animation'
    });

    this.registerOptimization({
      name: 'firefox-memory-optimization',
      description: 'Optimize memory usage for Firefox',
      browsers: ['firefox'],
      apply: this.applyFirefoxMemoryOptimization,
      impact: 'medium',
      category: 'memory'
    });

    // Safari-specific optimizations
    this.registerOptimization({
      name: 'safari-webkit-optimization',
      description: 'Optimize for WebKit rendering engine',
      browsers: ['safari'],
      apply: this.applySafariWebKitOptimization,
      impact: 'medium',
      category: 'rendering'
    });

    this.registerOptimization({
      name: 'safari-mobile-optimization',
      description: 'Optimize for iOS Safari performance',
      browsers: ['safari'],
      apply: this.applySafariMobileOptimization,
      impact: 'high',
      category: 'interaction'
    });

    // Universal optimizations
    this.registerOptimization({
      name: 'universal-scroll-optimization',
      description: 'Optimize scroll performance across browsers',
      browsers: ['chrome', 'firefox', 'safari', 'edge'],
      apply: this.applyUniversalScrollOptimization,
      impact: 'medium',
      category: 'interaction'
    });

    this.registerOptimization({
      name: 'universal-animation-optimization',
      description: 'Optimize animations for all browsers',
      browsers: ['chrome', 'firefox', 'safari', 'edge'],
      apply: this.applyUniversalAnimationOptimization,
      impact: 'high',
      category: 'animation'
    });

    // Mobile-specific optimizations
    this.registerOptimization({
      name: 'mobile-touch-optimization',
      description: 'Optimize touch interactions for mobile browsers',
      browsers: ['chrome', 'safari'],
      apply: this.applyMobileTouchOptimization,
      impact: 'high',
      category: 'interaction'
    });
  }

  private registerOptimization(optimization: PerformanceOptimization): void {
    this.optimizations.set(optimization.name, optimization);
  }

  private shouldApplyOptimization(optimization: PerformanceOptimization, browserName: string): boolean {
    return optimization.browsers.includes(browserName) || optimization.browsers.includes('all');
  }

  // Chrome-specific optimizations
  private applyChromeHardwareAcceleration = (): void => {
    const style = document.createElement('style');
    style.textContent = `
      /* Hardware acceleration for AI components */
      .content-highlight,
      .block-loading-state,
      .block-error-state {
        transform: translateZ(0);
        will-change: transform, opacity;
        backface-visibility: hidden;
        perspective: 1000px;
      }
      
      /* Optimize for Chrome's compositor */
      .ai-component {
        contain: layout style paint;
        transform: translateZ(0);
      }
      
      /* Optimize animations for Chrome */
      .highlight-animation {
        animation-fill-mode: both;
        animation-play-state: running;
      }
    `;
    document.head.appendChild(style);
  };

  private applyChromeContainment = (): void => {
    if (supports('cssContainment')) {
      const style = document.createElement('style');
      style.textContent = `
        .editor-container {
          contain: layout style paint;
        }
        
        .ai-component {
          contain: layout style;
        }
        
        .highlight-overlay {
          contain: paint;
        }
      `;
      document.head.appendChild(style);
    }
  };

  // Firefox-specific optimizations
  private applyFirefoxAnimationOptimization = (): void => {
    const style = document.createElement('style');
    style.textContent = `
      /* Optimize animations for Gecko */
      .content-highlight {
        /* Use transform instead of opacity for better performance */
        transform: scale(1);
        transition: transform 0.3s ease-out;
      }
      
      .content-highlight.active {
        transform: scale(1.01);
      }
      
      /* Minimize reflows in Firefox */
      .ai-component {
        position: relative;
        z-index: 0;
      }
      
      /* Optimize will-change usage */
      .animating {
        will-change: transform;
      }
      
      .animating.finished {
        will-change: auto;
      }
    `;
    document.head.appendChild(style);
  };

  private applyFirefoxMemoryOptimization = (): void => {
    // Implement memory cleanup for Firefox
    const cleanupInterval = setInterval(() => {
      // Remove finished animations
      document.querySelectorAll('.animating.finished').forEach(element => {
        element.classList.remove('animating', 'finished');
        (element as HTMLElement).style.willChange = 'auto';
      });
      
      // Clean up unused performance entries
      if ('performance' in window && 'clearMarks' in performance) {
        performance.clearMarks();
        performance.clearMeasures();
      }
    }, 30000); // Clean up every 30 seconds

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(cleanupInterval);
    });
  };

  // Safari-specific optimizations
  private applySafariWebKitOptimization = (): void => {
    const style = document.createElement('style');
    style.textContent = `
      /* WebKit-specific optimizations */
      .content-highlight {
        -webkit-transform: translateZ(0);
        -webkit-backface-visibility: hidden;
        -webkit-perspective: 1000px;
      }
      
      /* Optimize for Safari's rendering */
      .ai-component {
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
      }
      
      /* Safari optimization for highlight overlays */
      .highlight-overlay {
        /* Glass effects removed for better performance */
      }
      
      /* Optimize scrolling for Safari */
      .editor-container {
        -webkit-overflow-scrolling: touch;
        overflow-scrolling: touch;
      }
    `;
    document.head.appendChild(style);
  };

  private applySafariMobileOptimization = (): void => {
    if (browserUtils.isMobile()) {
      const style = document.createElement('style');
      style.textContent = `
        /* iOS Safari specific optimizations */
        .ai-component {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
        
        /* Optimize touch targets */
        .retry-button,
        .dismiss-button {
          min-height: 44px;
          min-width: 44px;
          touch-action: manipulation;
        }
        
        /* Prevent zoom on input focus */
        input, textarea, select {
          font-size: 16px;
        }
        
        /* Optimize for iOS Safari memory */
        .highlight-overlay {
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
        }
      `;
      document.head.appendChild(style);

      // Optimize viewport for iOS Safari
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
        );
      }
    }
  };

  // Universal optimizations
  private applyUniversalScrollOptimization = (): void => {
    // Use passive listeners for better scroll performance
    const passiveSupported = this.checkPassiveSupport();
    const options = passiveSupported ? { passive: true } : false;

    // Optimize scroll handling
    let scrollTimeout: NodeJS.Timeout;
    const optimizedScrollHandler = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        // Cleanup after scroll ends
        document.querySelectorAll('.scrolling').forEach(element => {
          element.classList.remove('scrolling');
        });
      }, 150);
    };

    window.addEventListener('scroll', optimizedScrollHandler, options);

    // Add CSS for scroll optimization
    const style = document.createElement('style');
    style.textContent = `
      /* Universal scroll optimizations */
      .editor-container {
        scroll-behavior: smooth;
        overscroll-behavior: contain;
      }
      
      .scrolling .ai-component {
        pointer-events: none;
      }
      
      /* Optimize for smooth scrolling */
      html {
        scroll-behavior: smooth;
      }
    `;
    document.head.appendChild(style);
  };

  private applyUniversalAnimationOptimization = (): void => {
    const style = document.createElement('style');
    style.textContent = `
      /* Universal animation optimizations */
      .content-highlight,
      .block-loading-state,
      .block-error-state {
        /* Use transform and opacity for best performance */
        transition-property: transform, opacity;
        transition-timing-function: ease-out;
        transition-duration: 0.3s;
      }
      
      /* Reduce motion for users who prefer it */
      @media (prefers-reduced-motion: reduce) {
        .content-highlight,
        .block-loading-state,
        .block-error-state {
          transition: none;
          animation: none;
        }
      }
      
      /* Optimize animation performance */
      .animating {
        will-change: transform, opacity;
      }
      
      .animation-finished {
        will-change: auto;
      }
    `;
    document.head.appendChild(style);

    // Add animation event listeners for cleanup
    document.addEventListener('animationend', (e) => {
      const target = e.target as Element;
      target.classList.add('animation-finished');
      target.classList.remove('animating');
    });

    document.addEventListener('transitionend', (e) => {
      const target = e.target as Element;
      target.classList.add('animation-finished');
      target.classList.remove('animating');
    });
  };

  private applyMobileTouchOptimization = (): void => {
    if (browserUtils.isMobile()) {
      const style = document.createElement('style');
      style.textContent = `
        /* Mobile touch optimizations */
        .ai-component {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        
        .retry-button,
        .dismiss-button {
          touch-action: manipulation;
          -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
        }
        
        /* Optimize for touch interactions */
        .touchable {
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
        }
      `;
      document.head.appendChild(style);

      // Add touch feedback
      document.addEventListener('touchstart', (e) => {
        const target = e.target as Element;
        if (target.matches('.touchable, button, [role="button"]')) {
          target.classList.add('touch-active');
        }
      }, { passive: true });

      document.addEventListener('touchend', (e) => {
        const target = e.target as Element;
        if (target.matches('.touchable, button, [role="button"]')) {
          setTimeout(() => {
            target.classList.remove('touch-active');
          }, 150);
        }
      }, { passive: true });
    }
  };

  private checkPassiveSupport(): boolean {
    let passiveSupported = false;
    try {
      const options = {
        get passive() {
          passiveSupported = true;
          return false;
        }
      };
      window.addEventListener('test', () => {}, options as any);
      window.removeEventListener('test', () => {}, options as any);
    } catch {
      passiveSupported = false;
    }
    return passiveSupported;
  }

  private initializePerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            switch (entry.entryType) {
              case 'measure':
                if (entry.name.includes('ai-component')) {
                  this.metrics.renderTime = entry.duration;
                }
                break;
              case 'layout-shift':
                this.metrics.layoutShifts += (entry as any).value;
                break;
            }
          });
        });

        this.performanceObserver.observe({ 
          entryTypes: ['measure', 'layout-shift', 'first-input'] 
        });
      } catch (error) {
        console.warn('[CrossBrowserPerf] Performance monitoring not available:', error);
      }
    }
  }

  private updateMetrics(): void {
    // Update memory usage if available
    if ('memory' in (performance as any)) {
      this.metrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }

    // Estimate frame rate
    let frameCount = 0;
    const startTime = performance.now();
    
    const countFrames = () => {
      frameCount++;
      if (performance.now() - startTime < 1000) {
        requestAnimationFrame(countFrames);
      } else {
        this.metrics.animationFrameRate = frameCount;
      }
    };
    
    requestAnimationFrame(countFrames);
  }

  /**
   * Get applied optimizations for debugging
   */
  getAppliedOptimizations(): string[] {
    return Array.from(this.appliedOptimizations);
  }

  /**
   * Get all available optimizations
   */
  getAllOptimizations(): PerformanceOptimization[] {
    return Array.from(this.optimizations.values());
  }
}

// Singleton instance
export const crossBrowserPerformanceOptimizer = CrossBrowserPerformanceOptimizer.getInstance();

// Main initialization function
export function initializeCrossBrowserOptimizations(): void {
  crossBrowserPerformanceOptimizer.applyOptimizations();
}

// Export convenience functions
export function getPerformanceMetrics(): PerformanceMetrics {
  return crossBrowserPerformanceOptimizer.getMetrics();
}

export function getPerformanceRecommendations(): string[] {
  return crossBrowserPerformanceOptimizer.getRecommendations();
}

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCrossBrowserOptimizations);
  } else {
    initializeCrossBrowserOptimizations();
  }
} 