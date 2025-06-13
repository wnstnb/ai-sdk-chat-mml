/**
 * Browser Compatibility System - Main Entry Point
 * Initializes browser detection, applies fixes, and provides unified API
 */

import { browserDetector, getBrowserInfo, supportsFeature, browserUtils } from './browserDetection';
import { browserFixManager, initializeBrowserFixes, getBrowserFixInfo } from './browserFixes';

export interface CompatibilityReport {
  browser: ReturnType<typeof getBrowserInfo>;
  isSupported: boolean;
  appliedFixes: string[];
  missingFeatures: string[];
  recommendations: string[];
}

class BrowserCompatibilityManager {
  private static instance: BrowserCompatibilityManager;
  private initialized = false;

  static getInstance(): BrowserCompatibilityManager {
    if (!BrowserCompatibilityManager.instance) {
      BrowserCompatibilityManager.instance = new BrowserCompatibilityManager();
    }
    return BrowserCompatibilityManager.instance;
  }

  /**
   * Initialize the browser compatibility system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[BrowserCompatibility] Initializing browser compatibility system...');
    
    // Get browser information
    const browserInfo = getBrowserInfo();
    console.log('[BrowserCompatibility] Detected browser:', {
      name: browserInfo.name,
      version: browserInfo.version,
      engine: browserInfo.engine,
      platform: browserInfo.platform,
      isSupported: browserInfo.isSupported
    });

    // Apply browser-specific fixes
    initializeBrowserFixes();

    // Show unsupported browser warning if needed
    if (!browserInfo.isSupported) {
      this.showUnsupportedBrowserWarning(browserInfo);
    }

    // Log missing features
    this.logMissingFeatures(browserInfo);

    this.initialized = true;
    console.log('[BrowserCompatibility] Browser compatibility system initialized');
  }

  /**
   * Get comprehensive compatibility report
   */
  getCompatibilityReport(): CompatibilityReport {
    const browserInfo = getBrowserInfo();
    const fixInfo = getBrowserFixInfo();
    const missingFeatures = this.getMissingFeatures(browserInfo);
    const recommendations = this.getRecommendations(browserInfo, missingFeatures);

    return {
      browser: browserInfo,
      isSupported: browserInfo.isSupported,
      appliedFixes: fixInfo.appliedFixes,
      missingFeatures,
      recommendations
    };
  }

  /**
   * Check if a specific feature is supported with fallback information
   */
  checkFeatureSupport(feature: string): {
    supported: boolean;
    fallbackAvailable: boolean;
    recommendation?: string;
  } {
    const browserInfo = getBrowserInfo();
    const capabilities = browserInfo.capabilities;
    
    // Type-safe feature checking
    const featureKey = feature as keyof typeof capabilities;
    const supported = capabilities[featureKey] ?? false;
    
    const fallbacks: Record<string, { available: boolean; recommendation?: string }> = {
      cssBackdropFilter: {
        available: true,
        recommendation: 'Using solid background color fallback'
      },
      intersectionObserver: {
        available: true,
        recommendation: 'Using fallback implementation with basic visibility detection'
      },
      cssContainment: {
        available: true,
        recommendation: 'Using overflow:hidden and position:relative fallback'
      },
      focusVisible: {
        available: true,
        recommendation: 'Using keyboard event detection polyfill'
      }
    };

    const fallback = fallbacks[feature] || { available: false };

    return {
      supported,
      fallbackAvailable: fallback.available,
      recommendation: fallback.recommendation
    };
  }

  /**
   * Get browser-specific performance recommendations
   */
  getPerformanceRecommendations(): string[] {
    const browserInfo = getBrowserInfo();
    const recommendations: string[] = [];

    switch (browserInfo.name) {
      case 'chrome':
        recommendations.push(
          'Enable hardware acceleration for animations',
          'Use CSS containment for large documents',
          'Optimize scroll performance with passive listeners'
        );
        break;
      
      case 'firefox':
        recommendations.push(
          'Use transform instead of changing layout properties',
          'Minimize DOM manipulation during animations',
          'Use will-change sparingly'
        );
        break;
      
      case 'safari':
        recommendations.push(
          'Avoid backdrop-filter on older versions',
          'Use transform for animations instead of opacity',
          'Test on both desktop and mobile Safari'
        );
        break;
      
      case 'edge':
        recommendations.push(
          'Test flexbox and grid layouts thoroughly',
          'Provide CSS variable fallbacks',
          'Use vendor prefixes for newer features'
        );
        break;
    }

    if (browserInfo.platform === 'mobile') {
      recommendations.push(
        'Optimize touch targets (minimum 44px)',
        'Use touch-action CSS property',
        'Minimize layout shifts on mobile'
      );
    }

    return recommendations;
  }

  private showUnsupportedBrowserWarning(browserInfo: ReturnType<typeof getBrowserInfo>): void {
    const message = `Your browser (${browserInfo.name} ${browserInfo.version}) is not fully supported. Some features may not work correctly. Please consider updating to a newer version.`;
    
    // Create warning banner
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #f59e0b;
      color: white;
      padding: 12px;
      text-align: center;
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
    `;
    banner.textContent = message;

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      margin-left: 12px;
      cursor: pointer;
    `;
    closeButton.onclick = () => banner.remove();
    banner.appendChild(closeButton);

    document.body.insertBefore(banner, document.body.firstChild);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (banner.parentNode) {
        banner.remove();
      }
    }, 10000);
  }

  private logMissingFeatures(browserInfo: ReturnType<typeof getBrowserInfo>): void {
    const missingFeatures = this.getMissingFeatures(browserInfo);
    
    if (missingFeatures.length > 0) {
      console.warn('[BrowserCompatibility] Missing features detected:', missingFeatures);
    }
  }

  private getMissingFeatures(browserInfo: ReturnType<typeof getBrowserInfo>): string[] {
    const capabilities = browserInfo.capabilities;
    const missing: string[] = [];

    Object.entries(capabilities).forEach(([feature, supported]) => {
      if (!supported) {
        missing.push(feature);
      }
    });

    return missing;
  }

  private getRecommendations(
    browserInfo: ReturnType<typeof getBrowserInfo>,
    missingFeatures: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (!browserInfo.isSupported) {
      recommendations.push(`Update ${browserInfo.name} to a newer version for better compatibility`);
    }

    if (missingFeatures.includes('cssBackdropFilter')) {
      recommendations.push('Backdrop filter effects will use solid background fallback');
    }

    if (missingFeatures.includes('intersectionObserver')) {
      recommendations.push('Scroll-based animations may have reduced performance');
    }

    if (missingFeatures.includes('cssContainment')) {
      recommendations.push('Large documents may experience layout performance issues');
    }

    if (browserInfo.platform === 'mobile' && missingFeatures.includes('performanceAPI')) {
      recommendations.push('Performance monitoring will be limited on this device');
    }

    return recommendations;
  }
}

// Singleton instance
export const browserCompatibilityManager = BrowserCompatibilityManager.getInstance();

// Main initialization function
export async function initializeBrowserCompatibility(): Promise<void> {
  await browserCompatibilityManager.initialize();
}

// Export all utilities for convenience
export {
  browserDetector,
  getBrowserInfo,
  supportsFeature,
  browserUtils,
  browserFixManager,
  getBrowserFixInfo
};

// Export types
export type { BrowserInfo, BrowserCapabilities } from './browserDetection';
export type { BrowserFix } from './browserFixes';

// Auto-initialize when module is imported (can be disabled by setting env var)
if (typeof window !== 'undefined' && !process.env.DISABLE_AUTO_BROWSER_INIT) {
  // Initialize after a short delay to allow other modules to load
  setTimeout(() => {
    initializeBrowserCompatibility().catch(console.error);
  }, 100);
} 