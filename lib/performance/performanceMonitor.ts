/**
 * Performance Monitoring Utility
 * Tracks render times and component performance for AI operations
 */

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

interface ComponentRenderMetric {
  componentName: string;
  renderCount: number;
  totalRenderTime: number;
  averageRenderTime: number;
  lastRenderTime: number;
  props?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private componentMetrics: Map<string, ComponentRenderMetric> = new Map();
  private isEnabled: boolean = process.env.NODE_ENV === 'development';

  /**
   * Start tracking a performance metric
   */
  startMetric(name: string, metadata?: Record<string, any>): void {
    if (!this.isEnabled) return;

    this.metrics.set(name, {
      name,
      startTime: performance.now(),
      metadata
    });
  }

  /**
   * End tracking a performance metric
   */
  endMetric(name: string): number | null {
    if (!this.isEnabled) return null;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`[PerformanceMonitor] Metric "${name}" not found`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;

    // Log slow operations
    if (duration > 100) { // Log operations taking more than 100ms
      console.warn(`[PerformanceMonitor] Slow operation detected: ${name} took ${duration.toFixed(2)}ms`, metric.metadata);
    }

    return duration;
  }

  /**
   * Track component render performance
   */
  trackComponentRender(componentName: string, renderTime: number, props?: Record<string, any>): void {
    if (!this.isEnabled) return;

    const existing = this.componentMetrics.get(componentName);
    
    if (existing) {
      existing.renderCount++;
      existing.totalRenderTime += renderTime;
      existing.averageRenderTime = existing.totalRenderTime / existing.renderCount;
      existing.lastRenderTime = renderTime;
      existing.props = props;
    } else {
      this.componentMetrics.set(componentName, {
        componentName,
        renderCount: 1,
        totalRenderTime: renderTime,
        averageRenderTime: renderTime,
        lastRenderTime: renderTime,
        props
      });
    }

    // Log slow renders
    if (renderTime > 16) { // Log renders taking more than one frame (16ms)
      console.warn(`[PerformanceMonitor] Slow render detected: ${componentName} took ${renderTime.toFixed(2)}ms`);
    }
  }

  /**
   * Get performance report
   */
  getReport(): {
    metrics: PerformanceMetric[];
    componentMetrics: ComponentRenderMetric[];
    summary: {
      totalMetrics: number;
      slowOperations: number;
      slowRenders: number;
      averageRenderTime: number;
    };
  } {
    const metrics = Array.from(this.metrics.values()).filter(m => m.duration !== undefined);
    const componentMetrics = Array.from(this.componentMetrics.values());
    
    const slowOperations = metrics.filter(m => m.duration! > 100).length;
    const slowRenders = componentMetrics.filter(c => c.lastRenderTime > 16).length;
    const averageRenderTime = componentMetrics.length > 0 
      ? componentMetrics.reduce((sum, c) => sum + c.averageRenderTime, 0) / componentMetrics.length 
      : 0;

    return {
      metrics,
      componentMetrics,
      summary: {
        totalMetrics: metrics.length,
        slowOperations,
        slowRenders,
        averageRenderTime
      }
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.componentMetrics.clear();
  }

  /**
   * Enable or disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Check if monitoring is enabled
   */
  get enabled(): boolean {
    return this.isEnabled;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * React hook for tracking component render performance
 */
export function useRenderPerformance(componentName: string, props?: Record<string, any>) {
  React.useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const renderTime = performance.now() - startTime;
      performanceMonitor.trackComponentRender(componentName, renderTime, props);
    };
  });
}

/**
 * Simple wrapper function for performance tracking
 * Use this to wrap components manually for performance monitoring
 */
export function trackComponentPerformance(componentName: string, props?: Record<string, any>) {
  const startTime = performance.now();
  
  return () => {
    const renderTime = performance.now() - startTime;
    performanceMonitor.trackComponentRender(componentName, renderTime, props);
  };
}

/**
 * Simple performance measurement function for timing operations
 */
export function measureOperation<T>(name: string, operation: () => T): T {
  performanceMonitor.startMetric(name);
  
  try {
    const result = operation();
    
    // Handle async operations
    if (result && typeof (result as any).then === 'function') {
      return (result as any).finally(() => {
        performanceMonitor.endMetric(name);
      });
    }
    
    performanceMonitor.endMetric(name);
    return result;
  } catch (error) {
    performanceMonitor.endMetric(name);
    throw error;
  }
}

// Import React for hooks
import React from 'react'; 