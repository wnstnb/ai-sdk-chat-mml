import { toast as sonnerToast } from 'sonner';
import React from 'react';
import AIActionToast from '@/components/ui/AIActionToast';

// Global reference to our attached toast context
let globalAttachedToastContext: {
  addToast: (content: React.ReactNode, id?: string) => string;
  removeToast: (id: string) => void;
} | null = null;

// Function to set the global context (called from our context provider)
export const setGlobalAttachedToastContext = (context: typeof globalAttachedToastContext) => {
  globalAttachedToastContext = context;
};

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface AIToastOptions {
  affectedBlockIds?: string[];
  onScrollToChange?: (blockId: string) => void;
  duration?: number;
  id?: string | number;
  action?: 'insert' | 'update' | 'delete' | 'error'; // Add action type for color matching
}

/**
 * Enhanced toast utility that integrates with our block status system
 * and provides scroll-to functionality for affected blocks.
 */
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
 * Internal function to show enhanced AI toast
 */
function showAIToast(type: ToastType, message: string, options?: AIToastOptions) {
  const {
    affectedBlockIds = [],
    onScrollToChange,
    duration = 3000, // Default 3 seconds - shorter for compact toasts
    id,
    action,
  } = options || {};

  // Try to use our attached toast context first
  if (globalAttachedToastContext && (affectedBlockIds.length > 0 || onScrollToChange)) {
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
  onScrollToChange?: (blockId: string) => void
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
  });
};

export default aiToast; 