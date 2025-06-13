/**
 * Browser Detection and Compatibility System
 * Handles browser-specific issues and provides appropriate fallbacks
 */

export interface BrowserInfo {
  name: 'chrome' | 'firefox' | 'safari' | 'edge' | 'unknown';
  version: number;
  engine: 'webkit' | 'gecko' | 'blink' | 'unknown';
  platform: 'desktop' | 'mobile' | 'tablet';
  os: 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';
  isSupported: boolean;
  capabilities: BrowserCapabilities;
}

export interface BrowserCapabilities {
  // CSS Features
  cssGrid: boolean;
  cssFlexbox: boolean;
  cssVariables: boolean;
  cssBackdropFilter: boolean;
  cssContainment: boolean;
  cssContainerQueries: boolean;
  
  // JavaScript Features
  intersectionObserver: boolean;
  resizeObserver: boolean;
  performanceObserver: boolean;
  webAnimations: boolean;
  es6Modules: boolean;
  asyncAwait: boolean;
  
  // Performance Features
  requestIdleCallback: boolean;
  performanceAPI: boolean;
  memoryAPI: boolean;
  
  // Accessibility Features
  ariaSupport: boolean;
  focusVisible: boolean;
  
  // Animation Features
  cssTransitions: boolean;
  cssAnimations: boolean;
  webAnimationsAPI: boolean;
}

class BrowserDetector {
  private static instance: BrowserDetector;
  private browserInfo: BrowserInfo | null = null;

  static getInstance(): BrowserDetector {
    if (!BrowserDetector.instance) {
      BrowserDetector.instance = new BrowserDetector();
    }
    return BrowserDetector.instance;
  }

  getBrowserInfo(): BrowserInfo {
    if (!this.browserInfo) {
      this.browserInfo = this.detectBrowser();
    }
    return this.browserInfo;
  }

  private detectBrowser(): BrowserInfo {
    const userAgent = navigator.userAgent;
    const platform = this.detectPlatform();
    const os = this.detectOS();
    
    let name: BrowserInfo['name'] = 'unknown';
    let version = 0;
    let engine: BrowserInfo['engine'] = 'unknown';

    // Chrome detection (must come before Safari due to UA string)
    if (/Chrome\/(\d+)/.test(userAgent) && !/Edg\//.test(userAgent)) {
      name = 'chrome';
      version = parseInt(RegExp.$1, 10);
      engine = 'blink';
    }
    // Edge detection
    else if (/Edg\/(\d+)/.test(userAgent)) {
      name = 'edge';
      version = parseInt(RegExp.$1, 10);
      engine = 'blink';
    }
    // Firefox detection
    else if (/Firefox\/(\d+)/.test(userAgent)) {
      name = 'firefox';
      version = parseInt(RegExp.$1, 10);
      engine = 'gecko';
    }
    // Safari detection
    else if (/Safari\//.test(userAgent) && /Version\/(\d+)/.test(userAgent)) {
      name = 'safari';
      version = parseInt(RegExp.$1, 10);
      engine = 'webkit';
    }

    const capabilities = this.detectCapabilities();
    const isSupported = this.isBrowserSupported(name, version);

    return {
      name,
      version,
      engine,
      platform,
      os,
      isSupported,
      capabilities
    };
  }

  private detectPlatform(): BrowserInfo['platform'] {
    const userAgent = navigator.userAgent;
    
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
      return /iPad/.test(userAgent) ? 'tablet' : 'mobile';
    }
    
    return 'desktop';
  }

  private detectOS(): BrowserInfo['os'] {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    
    if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
    if (/Android/.test(userAgent)) return 'android';
    if (/Mac/.test(platform)) return 'macos';
    if (/Win/.test(platform)) return 'windows';
    if (/Linux/.test(platform)) return 'linux';
    
    return 'unknown';
  }

  private detectCapabilities(): BrowserCapabilities {
    return {
      // CSS Features
      cssGrid: CSS.supports('display', 'grid'),
      cssFlexbox: CSS.supports('display', 'flex'),
      cssVariables: CSS.supports('color', 'var(--test)'),
      cssBackdropFilter: CSS.supports('backdrop-filter', 'blur(1px)'),
      cssContainment: CSS.supports('contain', 'layout'),
      cssContainerQueries: CSS.supports('container-type', 'inline-size'),
      
      // JavaScript Features
      intersectionObserver: 'IntersectionObserver' in window,
      resizeObserver: 'ResizeObserver' in window,
      performanceObserver: 'PerformanceObserver' in window,
      webAnimations: 'animate' in document.createElement('div'),
      es6Modules: 'noModule' in document.createElement('script'),
      asyncAwait: this.supportsAsyncAwait(),
      
      // Performance Features
      requestIdleCallback: 'requestIdleCallback' in window,
      performanceAPI: 'performance' in window && 'now' in performance,
      memoryAPI: 'memory' in (performance as any),
      
      // Accessibility Features
      ariaSupport: 'setAttribute' in document.createElement('div'),
      focusVisible: CSS.supports('selector(:focus-visible)'),
      
      // Animation Features
      cssTransitions: CSS.supports('transition', 'opacity 1s'),
      cssAnimations: CSS.supports('animation', 'none'),
      webAnimationsAPI: 'animate' in document.createElement('div')
    };
  }

  private supportsAsyncAwait(): boolean {
    try {
      // eslint-disable-next-line no-new-func
      new Function('async () => {}');
      return true;
    } catch {
      return false;
    }
  }

  private isBrowserSupported(name: BrowserInfo['name'], version: number): boolean {
    const minimumVersions = {
      chrome: 90,
      firefox: 88,
      safari: 14,
      edge: 90,
      unknown: 0
    };

    return version >= minimumVersions[name];
  }

  // Utility methods for specific browser checks
  isChrome(): boolean {
    return this.getBrowserInfo().name === 'chrome';
  }

  isFirefox(): boolean {
    return this.getBrowserInfo().name === 'firefox';
  }

  isSafari(): boolean {
    return this.getBrowserInfo().name === 'safari';
  }

  isEdge(): boolean {
    return this.getBrowserInfo().name === 'edge';
  }

  isMobile(): boolean {
    return this.getBrowserInfo().platform === 'mobile';
  }

  isDesktop(): boolean {
    return this.getBrowserInfo().platform === 'desktop';
  }

  supportsFeature(feature: keyof BrowserCapabilities): boolean {
    return this.getBrowserInfo().capabilities[feature];
  }
}

// Singleton instance
export const browserDetector = BrowserDetector.getInstance();

// Convenience functions
export function getBrowserInfo(): BrowserInfo {
  return browserDetector.getBrowserInfo();
}

export function isSupported(): boolean {
  return browserDetector.getBrowserInfo().isSupported;
}

export function supportsFeature(feature: keyof BrowserCapabilities): boolean {
  return browserDetector.supportsFeature(feature);
}

// Browser-specific utility functions
export const browserUtils = {
  isChrome: () => browserDetector.isChrome(),
  isFirefox: () => browserDetector.isFirefox(),
  isSafari: () => browserDetector.isSafari(),
  isEdge: () => browserDetector.isEdge(),
  isMobile: () => browserDetector.isMobile(),
  isDesktop: () => browserDetector.isDesktop(),
  
  // Version checks
  isMinimumVersion: (minVersion: number) => {
    const info = browserDetector.getBrowserInfo();
    return info.version >= minVersion;
  },
  
  // Engine checks
  isWebKit: () => browserDetector.getBrowserInfo().engine === 'webkit',
  isGecko: () => browserDetector.getBrowserInfo().engine === 'gecko',
  isBlink: () => browserDetector.getBrowserInfo().engine === 'blink'
}; 