import { toast as sonnerToast } from 'sonner';
import React from 'react';
import AIActionToast from '@/components/ui/AIActionToast';
import { usePreferenceStore } from '@/lib/stores/preferenceStore';

// Helper function to get toast preferences without using hooks
const getToastPreferences = () => {
  const store = usePreferenceStore.getState();
  const toastNotifications = store.toastNotifications || {
    enabled: true,
    style: 'attached' as const,
    animationSpeed: 'normal' as const,
    position: 'bottom' as const,
    showRetryButton: true,
  };
  
  // Convert animation speed to duration
  const getToastDuration = (speed: 'slow' | 'normal' | 'fast'): number => {
    switch (speed) {
      case 'slow': return 5000;
      case 'normal': return 3000;
      case 'fast': return 1500;
      default: return 3000;
    }
  };
  
  return {
    ...toastNotifications,
    duration: getToastDuration(toastNotifications.animationSpeed),
  };
};

// Global reference to our attached toast context
let globalAttachedToastContext: {
  addToast: (content: React.ReactNode, id?: string) => string;
  removeToast: (id: string) => void;
} | null = null;

// Function to set the global context (called from our context provider)
export const setGlobalAttachedToastContext = (context: typeof globalAttachedToastContext) => {
  globalAttachedToastContext = context;
};

// Toast batching system to consolidate multiple operations
interface BatchedToast {
  type: ToastType;
  action?: 'insert' | 'update' | 'delete' | 'error';
  blockIds: Set<string>;
  operationCount: number;
  timer: NodeJS.Timeout;
  onScrollToChange?: (blockId: string) => void;
}

const toastBatches = new Map<string, BatchedToast>();
const BATCH_WINDOW_MS = 500; // 500ms window to batch operations

interface AIToastOptions {
  affectedBlockIds?: string[];
  onScrollToChange?: (blockId: string) => void;
  duration?: number;
  id?: string | number;
  action?: 'insert' | 'update' | 'delete' | 'error'; // Add action type for color matching
  batchKey?: string; // Optional key for batching similar operations
}

type ToastType = 'success' | 'error' | 'info' | 'warning';

export const aiToast = {
  /**
   * Show a success toast with optional block navigation
   */
  success: (message: string, options?: AIToastOptions) => {
    return showAIToast('success', message, options);
  },

  /**
   * Show an error toast with optional block navigation
   */
  error: (message: string, options?: AIToastOptions) => {
    return showAIToast('error', message, options);
  },

  /**
   * Show an info toast with optional block navigation
   */
  info: (message: string, options?: AIToastOptions) => {
    return showAIToast('info', message, options);
  },

  /**
   * Show a warning toast with optional block navigation
   */
  warning: (message: string, options?: AIToastOptions) => {
    return showAIToast('warning', message, options);
  },

  /**
   * Dismiss a specific toast
   */
  dismiss: (id?: string | number) => {
    return sonnerToast.dismiss(id);
  },

  /**
   * Show a loading toast
   */
  loading: (message: string, options?: { id?: string | number }) => {
    return sonnerToast.loading(message, options);
  },

  /**
   * Show a batched toast that consolidates multiple operations of the same type
   */
  batched: (
    batchKey: string,
    type: ToastType,
    action: 'insert' | 'update' | 'delete' | 'error',
    blockIds: string[],
    onScrollToChange?: (blockId: string) => void
  ) => {
    return showBatchedToast(batchKey, type, action, blockIds, onScrollToChange);
  },

  /**
   * Show a promise-based toast
   */
  promise: <T>(
    promise: Promise<T>,
    options: {
      loading: string;
      success: (data: T) => string | React.ReactNode;
      error: (error: any) => string | React.ReactNode;
      affectedBlockIds?: string[];
      onScrollToChange?: (blockId: string) => void;
    }
  ) => {
    return sonnerToast.promise(promise, {
      loading: options.loading,
      success: (data) => {
        const successMessage = options.success(data);
        if (typeof successMessage === 'string' && (options.affectedBlockIds || options.onScrollToChange)) {
          // If we have block data and it's a string message, use our enhanced toast
          setTimeout(() => {
            aiToast.success(successMessage, {
              affectedBlockIds: options.affectedBlockIds,
              onScrollToChange: options.onScrollToChange,
            });
          }, 100);
          return successMessage;
        }
        return successMessage;
      },
      error: (error) => {
        const errorMessage = options.error(error);
        if (typeof errorMessage === 'string' && (options.affectedBlockIds || options.onScrollToChange)) {
          // If we have block data and it's a string message, use our enhanced toast
          setTimeout(() => {
            aiToast.error(errorMessage, {
              affectedBlockIds: options.affectedBlockIds,
              onScrollToChange: options.onScrollToChange,
            });
          }, 100);
          return errorMessage;
        }
        return errorMessage;
      },
    });
  },
};

/**
 * Show a batched toast that consolidates multiple operations
 */
function showBatchedToast(
  batchKey: string,
  type: ToastType,
  action: 'insert' | 'update' | 'delete' | 'error',
  blockIds: string[],
  onScrollToChange?: (blockId: string) => void
): string {
  const existingBatch = toastBatches.get(batchKey);
  
  if (existingBatch) {
    // Add to existing batch
    blockIds.forEach(id => existingBatch.blockIds.add(id));
    existingBatch.operationCount++;
    
    // Clear the existing timer and set a new one
    clearTimeout(existingBatch.timer);
    existingBatch.timer = setTimeout(() => {
      flushBatch(batchKey);
    }, BATCH_WINDOW_MS);
    
    return batchKey;
  } else {
    // Create new batch
    const batch: BatchedToast = {
      type,
      action,
      blockIds: new Set(blockIds),
      operationCount: 1,
      onScrollToChange,
      timer: setTimeout(() => {
        flushBatch(batchKey);
      }, BATCH_WINDOW_MS)
    };
    
    toastBatches.set(batchKey, batch);
    return batchKey;
  }
}

/**
 * Flush a batch and show the consolidated toast
 */
function flushBatch(batchKey: string): void {
  const batch = toastBatches.get(batchKey);
  if (!batch) return;
  
  // Remove from batches
  toastBatches.delete(batchKey);
  clearTimeout(batch.timer);
  
  const blockIds = Array.from(batch.blockIds);
  const blockCount = blockIds.length;
  const operationCount = batch.operationCount;
  
  // Generate consolidated message
  let message: string;
  if (batch.action === 'error') {
    message = operationCount === 1 
      ? `Error processing ${blockCount} block${blockCount > 1 ? 's' : ''}`
      : `${operationCount} operations failed (${blockCount} block${blockCount > 1 ? 's' : ''} affected)`;
  } else {
    const actionText = batch.action === 'insert' ? 'added' : 
                     batch.action === 'update' ? 'modified' : 
                     batch.action === 'delete' ? 'deleted' : 'processed';
    
    if (operationCount === blockCount) {
      // Simple case: one operation per block
      message = `${blockCount} block${blockCount > 1 ? 's' : ''} ${actionText}`;
    } else {
      // Complex case: multiple operations, some affecting same blocks
      message = `${operationCount} operations completed (${blockCount} block${blockCount > 1 ? 's' : ''} ${actionText})`;
    }
  }
  
  // Show the consolidated toast
  showAIToast(batch.type, message, {
    affectedBlockIds: blockIds,
    onScrollToChange: batch.onScrollToChange,
    action: batch.action,
    id: batchKey,
    duration: Math.min(5000, 2000 + (blockCount * 100)), // Dynamic duration based on complexity
  });
}

/**
 * Internal function to show enhanced AI toast
 */
function showAIToast(type: ToastType, message: string, options?: AIToastOptions) {
  const toastPrefs = getToastPreferences();
  
  // Early return if toasts are disabled
  if (!toastPrefs.enabled) {
    return null;
  }
  
  const {
    affectedBlockIds = [],
    onScrollToChange,
    duration = toastPrefs.duration, // Use preference-based duration
    id,
    action,
    batchKey,
  } = options || {};

  // If batching is requested, use the batched system
  if (batchKey && action && action !== 'error') {
    return showBatchedToast(batchKey, type, action, affectedBlockIds, onScrollToChange);
  }

  // Try to use our attached toast context first if style is 'attached'
  if (globalAttachedToastContext && toastPrefs.style === 'attached' && (affectedBlockIds.length > 0 || onScrollToChange)) {
    const toastContent = React.createElement(AIActionToast, {
      message,
      type,
      action,
      affectedBlockIds,
      onScrollToChange,
    });
    
    return globalAttachedToastContext.addToast(toastContent, id?.toString());
  }

  // Fallback to regular Sonner toast for non-enhanced toasts or when context unavailable
  if (!affectedBlockIds.length && !onScrollToChange) {
    return sonnerToast[type](message, { duration, id });
  }

  // Use Sonner with our enhanced toast component as fallback
  return sonnerToast.custom(
    (toastId) => React.createElement(AIActionToast, {
      message,
      type,
      action,
      affectedBlockIds,
      onScrollToChange,
    }),
    {
      duration,
      id,
      unstyled: true, // We handle styling in our component
    }
  );
}

/**
 * Helper function to integrate with the block status store
 * Creates a toast based on block status changes
 */
export const createBlockStatusToast = (
  blockIds: string[],
  status: 'idle' | 'loading' | 'modified' | 'error',
  action?: 'insert' | 'update' | 'delete',
  message?: string,
  onScrollToChange?: (blockId: string) => void,
  batchKey?: string // New parameter for batching
) => {
  if (!blockIds.length) return;

  const actionText = action ? ` ${action}${action.endsWith('e') ? 'd' : 'ed'}` : '';
  const blockText = blockIds.length === 1 ? 'block' : 'blocks';
  
  const defaultMessages = {
    idle: `${blockIds.length} ${blockText} ready`,
    loading: `Processing ${blockIds.length} ${blockText}...`,
    modified: `${blockIds.length} ${blockText}${actionText} successfully`,
    error: `Error processing ${blockIds.length} ${blockText}`,
  };

  const toastMessage = message || defaultMessages[status];
  const toastType: ToastType = status === 'error' ? 'error' : 
                              status === 'modified' ? 'success' : 
                              status === 'loading' ? 'info' : 'info';

  return aiToast[toastType](toastMessage, {
    affectedBlockIds: blockIds,
    onScrollToChange,
    action: status === 'error' ? 'error' : action, // Use 'error' action for error status, otherwise use provided action
    duration: status === 'loading' ? 4000 : 3000, // Shorter durations for compact toasts
    batchKey, // Pass through batch key
  });
};

/**
 * Create a batched toast for tool operations
 * This is the main function to use for consolidating multiple tool calls
 */
export const createBatchedToolToast = (
  toolName: string,
  type: ToastType,
  action: 'insert' | 'update' | 'delete' | 'error',
  blockIds: string[],
  onScrollToChange?: (blockId: string) => void
) => {
  const batchKey = `tool-${toolName}-${action}`;
  return aiToast.batched(batchKey, type, action, blockIds, onScrollToChange);
};

export default aiToast; 