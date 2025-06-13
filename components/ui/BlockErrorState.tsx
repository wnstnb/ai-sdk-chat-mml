/**
 * BlockErrorState Component
 * Displays inline error indicators within blocks when AI operations fail
 * Optimized with React.memo and memoized computations for performance.
 */

import React, { useMemo, useCallback } from 'react';
import { RefreshCw, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBlockStatusDetails } from '@/lib/hooks/editor/useBlockStatusDetails';
import { RetryUtils } from '@/lib/retryMechanism';

interface BlockErrorStateProps {
  blockId: string;
  children: React.ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const BlockErrorStateRaw: React.FC<BlockErrorStateProps> = ({ 
  blockId, 
  children, 
  onRetry, 
  onDismiss,
  className 
}) => {
  const { hasError, message } = useBlockStatusDetails(blockId);
  const retryManager = useMemo(() => RetryUtils.getRetryManager(), []);
  const retryableOperations = useMemo(() => 
    retryManager.getRetryableOperationsForBlock(blockId), 
    [retryManager, blockId]
  );
  
  // Memoized error state check
  const shouldShowError = useMemo(() => 
    hasError || retryableOperations.length > 0, 
    [hasError, retryableOperations.length]
  );
  
  // Don't render error state if there's no error
  if (!shouldShowError) {
    return <>{children}</>;
  }

  const displayErrorMessage = useMemo(() => 
    message || 'Error processing AI request', 
    [message]
  );
  
  const hasRetryableOperations = useMemo(() => 
    retryableOperations.length > 0, 
    [retryableOperations.length]
  );

  const handleRetry = useCallback(async () => {
    if (onRetry) {
      onRetry();
      return;
    }

    // If there are retryable operations, retry the most recent one
    if (hasRetryableOperations) {
      const mostRecentOperation = retryableOperations.sort((a, b) => b.lastAttempt - a.lastAttempt)[0];
      
      try {
        // This would need to be connected to the actual executor functions
        // For now, we'll just show a message that retry is available
        console.log(`[BlockErrorState] Retry requested for operation: ${mostRecentOperation.id}`);
        
        // In a real implementation, this would call the appropriate executor
        // await retryManager.retryOperation(mostRecentOperation.id, appropriateExecutor);
      } catch (error) {
        console.error('[BlockErrorState] Retry failed:', error);
      }
    }
  }, [onRetry, hasRetryableOperations, retryableOperations]);

  const handleDismiss = useCallback(() => {
    if (onDismiss) {
      onDismiss();
      return;
    }

    // Remove retryable operations for this block
    retryableOperations.forEach(op => {
      retryManager.removeRetryableOperation(op.id);
    });
  }, [onDismiss, retryableOperations, retryManager]);

  return (
    <div className={cn("relative", className)}>
      {children}
      
      {/* Error overlay */}
      <div className="absolute right-2 top-2 flex items-center space-x-2 z-10">
        {/* Error message */}
        <div className="flex items-center space-x-1 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md px-2 py-1 shadow-sm">
          <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div className="text-xs text-red-600 dark:text-red-400 max-w-xs truncate">
            {displayErrorMessage}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-1">
          {/* Retry button */}
          {(onRetry || hasRetryableOperations) && (
            <button
              onClick={handleRetry}
              className={cn(
                "p-1 rounded-full transition-colors",
                "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400",
                "hover:bg-red-100 dark:hover:bg-red-900/50",
                "focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
              )}
              aria-label="Retry AI operation"
              title="Retry the failed operation"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className={cn(
              "p-1 rounded-full transition-colors",
              "bg-gray-50 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400",
              "hover:bg-gray-100 dark:hover:bg-gray-900/50",
              "focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
            )}
            aria-label="Dismiss error"
            title="Dismiss this error"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Memoized component to prevent unnecessary re-renders
export const BlockErrorState = React.memo(BlockErrorStateRaw, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  return (
    prevProps.blockId === nextProps.blockId &&
    prevProps.onRetry === nextProps.onRetry &&
    prevProps.onDismiss === nextProps.onDismiss &&
    prevProps.className === nextProps.className &&
    prevProps.children === nextProps.children
  );
});

BlockErrorState.displayName = 'BlockErrorState';

/**
 * Hook to check if a block has error state
 * Optimized with memoization for performance.
 */
export const useBlockErrorState = (blockId: string) => {
  const { hasError, message } = useBlockStatusDetails(blockId);
  const retryManager = useMemo(() => RetryUtils.getRetryManager(), []);
  const retryableOperations = useMemo(() => 
    retryManager.getRetryableOperationsForBlock(blockId), 
    [retryManager, blockId]
  );
  
  return useMemo(() => ({
    hasError: hasError || retryableOperations.length > 0,
    errorMessage: message,
    retryableOperations,
    canRetry: retryableOperations.length > 0,
  }), [hasError, retryableOperations, message]);
};

export default BlockErrorState; 