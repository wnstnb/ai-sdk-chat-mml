import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHighlightColors } from '@/lib/highlightColors';

type BlockAction = 'insert' | 'update' | 'delete' | 'error';

interface AIActionToastProps {
  message: string;
  affectedBlockIds?: string[];
  type: 'success' | 'error' | 'info' | 'warning';
  action?: BlockAction; // New: action type for color matching
  onScrollToChange?: (blockId: string) => void;
}

const getIcon = (type: 'success' | 'error' | 'info' | 'warning') => {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />;
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-yellow-500" />;
    case 'info':
      return <Info className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />;
    default:
      return <Info className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />;
  }
};

const getToastStyles = (
  type: 'success' | 'error' | 'info' | 'warning',
  actionColors?: ReturnType<typeof getHighlightColors> | null
) => {
  // Compact, horizontal layout - 36px height for minimally intrusive toasts
  const baseStyles = "flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border h-9 min-w-[200px] max-w-[320px] relative overflow-hidden";
  
  // Use action colors if available
  if (actionColors) {
    return cn(
      baseStyles,
      "transition-all duration-200 hover:shadow-xl"
    );
  }
  
  // Fallback to type-based styles
  switch (type) {
    case 'success':
      return cn(baseStyles, "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200");
    case 'error':
      return cn(baseStyles, "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200");
    case 'warning':
      return cn(baseStyles, "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200");
    case 'info':
      return cn(baseStyles, "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200");
    default:
      return cn(baseStyles, "bg-gray-50 border-gray-200 text-gray-800 dark:bg-gray-900/20 dark:border-gray-800 dark:text-gray-200");
  }
};

export const AIActionToast: React.FC<AIActionToastProps> = ({ 
  message, 
  affectedBlockIds = [], 
  type, 
  action,
  onScrollToChange 
}) => {
  const hasAffectedBlocks = affectedBlockIds.length > 0;
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');
  
  // Theme detection effect (following pattern from ContentHighlight)
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
  
  // Get action-based colors if action is provided
  const actionColors = useMemo(() => {
    if (!action) return null;
    const isDarkTheme = currentTheme === 'dark';
    return getHighlightColors(action, isDarkTheme);
  }, [action, currentTheme]);
  
  const handleScrollToChange = useCallback(() => {
    if (!hasAffectedBlocks || !onScrollToChange) return;
    
    // Get first affected block
    const blockId = affectedBlockIds[0];
    onScrollToChange(blockId);
  }, [affectedBlockIds, hasAffectedBlocks, onScrollToChange]);

  const handleDefaultScrollToChange = useCallback(() => {
    if (!hasAffectedBlocks) return;
    
    // Get first affected block
    const blockId = affectedBlockIds[0];
    const blockElement = document.querySelector(`[data-id="${blockId}"]`);
    
    if (blockElement) {
      // Scroll into view with smooth behavior
      blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Focus the block for accessibility
      setTimeout(() => {
        (blockElement as HTMLElement).focus();
        // Highlight the block temporarily
        blockElement.classList.add('outline-pulse');
        setTimeout(() => blockElement.classList.remove('outline-pulse'), 2000);
      }, 500);
    }
  }, [affectedBlockIds, hasAffectedBlocks]);
  
  return (
    <div 
      className={cn(
        getToastStyles(type, actionColors),
        "slide-in-from-right"
      )}
      style={actionColors ? {
        backgroundColor: actionColors.background,
        borderColor: actionColors.border,
        color: actionColors.text,
      } : undefined}
    >
      {/* Action-based accent bar for visual consistency with block highlights */}
      {actionColors && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-md"
          style={{ backgroundColor: actionColors.accent }}
        />
      )}
      
      <div className="flex-shrink-0">
        {getIcon(type)}
      </div>
      
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <div className="text-xs font-medium truncate">
          {message}
        </div>
        
        {hasAffectedBlocks && (
          <button 
            onClick={onScrollToChange ? handleScrollToChange : handleDefaultScrollToChange}
            className={cn(
              "text-xs px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0",
              // Use action colors if available
              !actionColors && type === 'success' && "text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300",
              !actionColors && type === 'error' && "text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300",
              !actionColors && type === 'warning' && "text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300",
              !actionColors && type === 'info' && "text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            )}
            style={actionColors ? {
              color: actionColors.accent,
            } : undefined}
            aria-label={`Scroll to affected content (${affectedBlockIds.length} block${affectedBlockIds.length > 1 ? 's' : ''})`}
          >
            View {affectedBlockIds.length > 1 ? `(${affectedBlockIds.length})` : ''}
          </button>
        )}
      </div>
    </div>
  );
};

export default AIActionToast; 