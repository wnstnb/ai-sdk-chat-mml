import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/hooks/usePrefersReducedMotion';
import { 
  useBlockStatusDetails, 
  useBlockHighlightState, 
  useBlockHighlightProgress,
  getBlockStatusDescription
} from '@/lib/hooks/editor/useBlockStatusDetails';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { 
  getHighlightColors, 
  highlightAnimationConfig,
  type HighlightColorScheme 
} from '@/lib/highlightColors';
import { useHighlightingPreferences } from '@/lib/hooks/useAIPreferences';
import { cn } from '@/lib/utils';

export interface ContentHighlightProps {
  /** Block ID to monitor for highlighting */
  blockId: string;
  /** Children to render with optional highlighting */
  children: React.ReactNode;
  /** Custom highlight duration in milliseconds (default: 3000ms) */
  highlightDuration?: number;
  /** Whether to show the side accent bar for prominent actions (default: true) */
  showAccentBar?: boolean;
  /** Custom className for the wrapper */
  className?: string;
  /** Whether to enable click-to-dismiss functionality (default: true) */
  enableClickToDismiss?: boolean;
  /** Callback fired when highlight is dismissed */
  onHighlightDismissed?: (blockId: string) => void;
}

/**
 * ContentHighlight component that wraps blocks with AI operation highlighting.
 * Provides visual feedback for insert, update, delete, and error operations
 * with WCAG AA compliant colors and respect for reduced motion preferences.
 * 
 * Optimized with React.memo and memoized computations for performance.
 */
const ContentHighlightRaw: React.FC<ContentHighlightProps> = ({
  blockId,
  children,
  highlightDuration = highlightAnimationConfig.defaultDuration,
  showAccentBar = true,
  className,
  enableClickToDismiss = true,
  onHighlightDismissed
}) => {
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');
  const shouldReduceMotion = usePrefersReducedMotion();
  const clearBlockStatus = useClientChatOperationStore((state) => state.clearBlockStatus);
  const highlightingPrefs = useHighlightingPreferences();
  
  // Memoized theme detection effect to prevent unnecessary re-runs
  const themeDetectionEffect = useCallback(() => {
    const getTheme = (): 'light' | 'dark' => {
      const dataTheme = document.documentElement.getAttribute('data-theme');
      if (dataTheme === 'dark' || dataTheme === 'light') {
        return dataTheme;
      }
      if (document.documentElement.classList.contains('dark')) {
        return 'dark';
      }
      return 'light';
    };

    setCurrentTheme(getTheme());

    const observer = new MutationObserver(() => {
      setCurrentTheme(getTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(themeDetectionEffect, [themeDetectionEffect]);
  
  // Get detailed status information
  const statusDetails = useBlockStatusDetails(blockId);
  
  // Use preference-aware highlighting settings
  const effectiveHighlightDuration = highlightingPrefs.enabled ? 
    (highlightingPrefs.duration || highlightDuration) : 0;
  const isHighlighted = useBlockHighlightState(blockId, effectiveHighlightDuration) && highlightingPrefs.enabled;
  const progress = useBlockHighlightProgress(blockId, effectiveHighlightDuration);
  
  // Memoized action determination
  const action = useMemo(() => {
    return statusDetails.hasError ? 'error' : 
           statusDetails.isNewContent ? 'insert' :
           statusDetails.isUpdatedContent ? 'update' : 'update';
  }, [statusDetails.hasError, statusDetails.isNewContent, statusDetails.isUpdatedContent]);
  
  const isDarkTheme = currentTheme === 'dark';
  
  // Memoized color scheme calculation
  const colors = useMemo((): HighlightColorScheme => {
    const baseColors = getHighlightColors(action, isDarkTheme);
    
    // Apply custom colors if defined in preferences
    if (highlightingPrefs.customColors) {
      return {
        ...baseColors,
        background: highlightingPrefs.customColors.addition || baseColors.background,
        border: highlightingPrefs.customColors.modification || baseColors.border,
        accent: highlightingPrefs.customColors.addition || baseColors.accent,
      };
    }
    
    return baseColors;
  }, [action, isDarkTheme, highlightingPrefs.customColors]);
  
  // Memoized animation settings
  const animationSettings = useMemo(() => {
    if (shouldReduceMotion) {
      return {
        duration: highlightAnimationConfig.reducedMotionDuration,
        ease: 'linear' as const
      };
    }
    return {
      duration: highlightAnimationConfig.fadeAnimationDuration / 1000, // Convert to seconds
      ease: highlightAnimationConfig.easing
    };
  }, [shouldReduceMotion]);
  
  // Memoized click handler
  const handleClick = useCallback((event: React.MouseEvent) => {
    if (enableClickToDismiss && isHighlighted) {
      event.preventDefault();
      event.stopPropagation();
      
      // Fire callback if provided
      onHighlightDismissed?.(blockId);
      
      // Clear the block status to dismiss the highlight
      clearBlockStatus(blockId);
    }
  }, [enableClickToDismiss, isHighlighted, blockId, onHighlightDismissed, clearBlockStatus]);
  
  // Memoized accessibility description
  const statusDescription = useMemo(() => {
    return getBlockStatusDescription(statusDetails);
  }, [statusDetails]);
  
  // Memoized animation variants
  const highlightVariants = useMemo(() => ({
    hidden: { 
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.98
    },
    visible: { 
      opacity: progress,
      scale: 1
    }
  }), [shouldReduceMotion, progress]);
  
  // Memoized wrapper className
  const wrapperClassName = useMemo(() => cn(
    'relative transition-all duration-200',
    enableClickToDismiss && isHighlighted && 'cursor-pointer',
    className
  ), [enableClickToDismiss, isHighlighted, className]);
  
  // Memoized overlay styles
  const overlayStyles = useMemo(() => ({
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
  }), [colors.background, colors.border]);
  
  // Memoized accent bar styles
  const accentBarStyles = useMemo(() => ({
    backgroundColor: colors.accent
  }), [colors.accent]);
  
  // Memoized debug indicator styles
  const debugIndicatorStyles = useMemo(() => ({
    backgroundColor: colors.accent,
    color: colors.text 
  }), [colors.accent, colors.text]);
  
  return (
    <div 
      className={wrapperClassName}
      onClick={handleClick}
      role={isHighlighted ? 'status' : undefined}
      aria-label={isHighlighted ? statusDescription : undefined}
    >
      {children}
      
      <AnimatePresence>
        {isHighlighted && (
          <motion.div
            key={`highlight-${blockId}`}
            className="absolute inset-0 pointer-events-none rounded-md"
            style={overlayStyles}
            variants={highlightVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={animationSettings}
            aria-hidden="true" // Decorative overlay
          >
            {/* Side accent bar for prominent highlighting */}
            {showAccentBar && (
              <div
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
                style={accentBarStyles}
                aria-hidden="true"
              />
            )}
            
            {/* Optional: Status indicator text overlay for debugging */}
            {process.env.NODE_ENV === 'development' && (
              <div 
                className="absolute top-1 right-1 px-2 py-1 text-xs rounded"
                style={debugIndicatorStyles}
              >
                {action} ({Math.round(progress * 100)}%)
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Memoized component to prevent unnecessary re-renders
const ContentHighlight = React.memo(ContentHighlightRaw, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  return (
    prevProps.blockId === nextProps.blockId &&
    prevProps.highlightDuration === nextProps.highlightDuration &&
    prevProps.showAccentBar === nextProps.showAccentBar &&
    prevProps.className === nextProps.className &&
    prevProps.enableClickToDismiss === nextProps.enableClickToDismiss &&
    prevProps.onHighlightDismissed === nextProps.onHighlightDismissed &&
    prevProps.children === nextProps.children
  );
});

ContentHighlight.displayName = 'ContentHighlight';

export default ContentHighlight; 