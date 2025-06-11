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
 */
const ContentHighlight: React.FC<ContentHighlightProps> = ({
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
  
  // Theme detection effect (following existing pattern from editor page)
  useEffect(() => {
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
  
  // Get detailed status information
  const statusDetails = useBlockStatusDetails(blockId);
  const isHighlighted = useBlockHighlightState(blockId, highlightDuration);
  const progress = useBlockHighlightProgress(blockId, highlightDuration);
  
  // Determine action type and theme
  const action = statusDetails.hasError ? 'error' : 
                statusDetails.isNewContent ? 'insert' :
                statusDetails.isUpdatedContent ? 'update' : 'update';
  
  const isDarkTheme = currentTheme === 'dark';
  
  // Get appropriate color scheme
  const colors = useMemo((): HighlightColorScheme => {
    return getHighlightColors(action, isDarkTheme);
  }, [action, isDarkTheme]);
  
  // Calculate animation settings based on reduced motion preference
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
  
  // Handle click to dismiss
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
  
  // Get accessibility description
  const statusDescription = getBlockStatusDescription(statusDetails);
  
  // Variants for the highlight animation
  const highlightVariants = {
    hidden: { 
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.98
    },
    visible: { 
      opacity: progress,
      scale: 1
    }
  };
  
  // Base wrapper className
  const wrapperClassName = cn(
    'relative transition-all duration-200',
    enableClickToDismiss && isHighlighted && 'cursor-pointer',
    className
  );
  
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
            style={{
              backgroundColor: colors.background,
              border: `1px solid ${colors.border}`,
            }}
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
                style={{ backgroundColor: colors.accent }}
                aria-hidden="true"
              />
            )}
            
            {/* Optional: Status indicator text overlay for debugging */}
            {process.env.NODE_ENV === 'development' && (
              <div 
                className="absolute top-1 right-1 px-2 py-1 text-xs rounded"
                style={{ 
                  backgroundColor: colors.accent,
                  color: colors.text 
                }}
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

export default ContentHighlight; 