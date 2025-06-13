/**
 * Error Handling Strategy
 * Coordinates error messaging between toast notifications and inline error displays
 * to avoid duplication and ensure consistent user experience.
 */

import { toast } from 'sonner';
import { aiToast } from '@/lib/utils/aiToast';
import { ToolErrorHandler, ErrorContext } from '@/lib/errorHandling';
import { IntegratedErrorHandler } from '@/lib/errorHandlingIntegration';
import { RetryableOperation } from '@/lib/retryMechanism';

export interface ErrorDisplayStrategy {
  showToast: boolean;
  showInline: boolean;
  toastType: 'error' | 'warning' | 'info';
  toastDuration?: number;
  priority: 'high' | 'medium' | 'low';
  context: 'immediate' | 'persistent' | 'actionable';
}

export interface ErrorHandlingConfig {
  // Global settings
  enableInlineErrors: boolean;
  enableToastErrors: boolean;
  preventDuplicateMessages: boolean;
  
  // Timing settings
  toastDuration: {
    error: number;
    warning: number;
    info: number;
  };
  
  // Display preferences
  preferInlineForBlockErrors: boolean;
  preferToastForGlobalErrors: boolean;
  showRetryInToast: boolean;
  showRetryInline: boolean;
}

const defaultErrorHandlingConfig: ErrorHandlingConfig = {
  enableInlineErrors: true,
  enableToastErrors: true,
  preventDuplicateMessages: true,
  toastDuration: {
    error: 5000,
    warning: 4000,
    info: 3000,
  },
  preferInlineForBlockErrors: true,
  preferToastForGlobalErrors: true,
  showRetryInToast: false, // Avoid cluttering toast with retry buttons
  showRetryInline: true,   // Show retry buttons in inline displays
};

/**
 * Coordinated error handling manager
 */
export class ErrorHandlingCoordinator {
  private static instance: ErrorHandlingCoordinator;
  private config: ErrorHandlingConfig;
  private recentMessages: Map<string, number> = new Map();
  private integratedHandler: IntegratedErrorHandler;
  private toolErrorHandler: ToolErrorHandler;

  private constructor(config: ErrorHandlingConfig = defaultErrorHandlingConfig) {
    this.config = config;
    this.integratedHandler = IntegratedErrorHandler.getInstance();
    this.toolErrorHandler = ToolErrorHandler.getInstance();
  }

  public static getInstance(config?: ErrorHandlingConfig): ErrorHandlingCoordinator {
    if (!ErrorHandlingCoordinator.instance) {
      ErrorHandlingCoordinator.instance = new ErrorHandlingCoordinator(config);
    }
    return ErrorHandlingCoordinator.instance;
  }

  /**
   * Main error handling method that coordinates between different display methods
   */
  public handleError(
    error: Error | string,
    context: {
      operationType: RetryableOperation['type'];
      blockIds?: string[];
      severity?: 'error' | 'warning' | 'info';
      category?: 'validation' | 'safety' | 'content' | 'target' | 'operation' | 'system';
      operationArgs?: any;
      canRetry?: boolean;
    }
  ): void {
    const {
      operationType,
      blockIds = [],
      severity = 'error',
      category = 'operation',
      operationArgs,
      canRetry = true
    } = context;

    const errorMessage = typeof error === 'string' ? error : error.message;
    const messageKey = this.generateMessageKey(operationType, errorMessage, blockIds);

    // Check for duplicate messages
    if (this.config.preventDuplicateMessages && this.isDuplicateMessage(messageKey)) {
      console.log('[ErrorHandlingCoordinator] Duplicate message prevented:', messageKey);
      return;
    }

    // Determine display strategy
    const strategy = this.determineDisplayStrategy(
      operationType,
      blockIds,
      severity,
      category,
      canRetry
    );

    // Handle block-specific errors with integrated handler
    if (blockIds.length > 0) {
      this.integratedHandler.handleOperationError(
        blockIds,
        operationType,
        error,
        operationArgs
      );
    }

    // Show toast notification if strategy requires it
    if (strategy.showToast && this.config.enableToastErrors) {
      this.showToastError(errorMessage, operationType, blockIds, strategy);
    }

    // Record message to prevent duplicates
    if (this.config.preventDuplicateMessages) {
      this.recordMessage(messageKey);
    }

    console.log('[ErrorHandlingCoordinator] Error handled:', {
      operationType,
      blockIds,
      severity,
      strategy,
      message: errorMessage
    });
  }

  /**
   * Handle operation success with coordinated messaging
   */
  public handleSuccess(
    operationType: RetryableOperation['type'],
    blockIds: string[],
    action?: 'insert' | 'update' | 'delete',
    customMessage?: string
  ): void {
    // Use integrated handler for block status updates
    this.integratedHandler.handleOperationSuccess(blockIds, operationType, action);

    // Show additional toast if it's a retry success or significant operation
    const isRetrySuccess = this.wasRecentError(operationType, blockIds);
    if (isRetrySuccess || blockIds.length > 3) {
      const message = customMessage || `${this.getOperationDisplayName(operationType)} completed successfully`;
      
      if (blockIds.length > 0) {
        aiToast.success(message, {
          affectedBlockIds: blockIds,
          action: action || this.getDefaultAction(operationType),
          duration: this.config.toastDuration.info,
        });
      } else {
        toast.success(message, { duration: this.config.toastDuration.info });
      }
    }
  }

  /**
   * Handle operation start with coordinated messaging
   */
  public handleOperationStart(
    operationType: RetryableOperation['type'],
    blockIds: string[],
    showToast: boolean = false
  ): void {
    // Use integrated handler for block status updates
    this.integratedHandler.handleOperationStart(blockIds, operationType);

    // Show toast for long-running operations or when explicitly requested
    if (showToast && blockIds.length > 0) {
      aiToast.info(
        `${this.getOperationDisplayName(operationType)} in progress...`,
        {
          affectedBlockIds: blockIds,
          action: this.getDefaultAction(operationType),
          duration: this.config.toastDuration.info,
        }
      );
    }
  }

  /**
   * Clear error state with coordinated cleanup
   */
  public clearErrorState(blockId: string): void {
    this.integratedHandler.clearErrorState(blockId);
    
    // Clear any related message records
    const keysToRemove = Array.from(this.recentMessages.keys())
      .filter(key => key.includes(blockId));
    
    keysToRemove.forEach(key => {
      this.recentMessages.delete(key);
    });
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<ErrorHandlingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): ErrorHandlingConfig {
    return { ...this.config };
  }

  /**
   * Private helper methods
   */
  private determineDisplayStrategy(
    operationType: RetryableOperation['type'],
    blockIds: string[],
    severity: 'error' | 'warning' | 'info',
    category: string,
    canRetry: boolean
  ): ErrorDisplayStrategy {
    const hasBlocks = blockIds.length > 0;
    const isBlockSpecific = hasBlocks && blockIds.length <= 3;
    const isGlobalOperation = !hasBlocks || blockIds.length > 5;

    // Determine if we should show toast
    let showToast = true;
    let showInline = hasBlocks && this.config.enableInlineErrors;

    // Prefer inline for block-specific errors
    if (isBlockSpecific && this.config.preferInlineForBlockErrors) {
      showToast = severity === 'error'; // Only show toast for errors, not warnings
    }

    // Prefer toast for global operations
    if (isGlobalOperation && this.config.preferToastForGlobalErrors) {
      showInline = false;
      showToast = true;
    }

    // System errors always show toast
    if (category === 'system') {
      showToast = true;
    }

    // Determine context and priority
    let context: ErrorDisplayStrategy['context'] = 'immediate';
    let priority: ErrorDisplayStrategy['priority'] = 'medium';

    if (canRetry) {
      context = 'actionable';
      priority = 'high';
    } else if (severity === 'error') {
      context = 'persistent';
      priority = 'high';
    }

    return {
      showToast: showToast && this.config.enableToastErrors,
      showInline: showInline && this.config.enableInlineErrors,
      toastType: severity,
      toastDuration: this.config.toastDuration[severity],
      priority,
      context,
    };
  }

  private showToastError(
    message: string,
    operationType: RetryableOperation['type'],
    blockIds: string[],
    strategy: ErrorDisplayStrategy
  ): void {
    const displayMessage = `${this.getOperationDisplayName(operationType)} failed: ${message}`;

    if (blockIds.length > 0) {
      // Use aiToast for block-aware notifications
      aiToast[strategy.toastType](displayMessage, {
        affectedBlockIds: blockIds,
        action: 'error',
        duration: strategy.toastDuration,
      });
    } else {
      // Use regular toast for global notifications
      toast[strategy.toastType](displayMessage, {
        duration: strategy.toastDuration,
      });
    }
  }

  private generateMessageKey(
    operationType: RetryableOperation['type'],
    message: string,
    blockIds: string[]
  ): string {
    const blockKey = blockIds.sort().join(',');
    return `${operationType}:${message}:${blockKey}`;
  }

  private isDuplicateMessage(messageKey: string): boolean {
    const lastShown = this.recentMessages.get(messageKey);
    if (!lastShown) return false;
    
    // Consider it a duplicate if shown within the last 5 seconds
    return Date.now() - lastShown < 5000;
  }

  private recordMessage(messageKey: string): void {
    this.recentMessages.set(messageKey, Date.now());
    
    // Clean up old messages (older than 30 seconds)
    const cutoff = Date.now() - 30000;
    for (const [key, timestamp] of this.recentMessages.entries()) {
      if (timestamp < cutoff) {
        this.recentMessages.delete(key);
      }
    }
  }

  private wasRecentError(operationType: RetryableOperation['type'], blockIds: string[]): boolean {
    const blockKey = blockIds.sort().join(',');
    const pattern = `${operationType}:`;
    
    return Array.from(this.recentMessages.keys()).some(key => 
      key.startsWith(pattern) && key.includes(blockKey)
    );
  }

  private getOperationDisplayName(type: RetryableOperation['type']): string {
    const displayNames: Record<RetryableOperation['type'], string> = {
      'addContent': 'Add Content',
      'modifyContent': 'Modify Content',
      'deleteContent': 'Delete Content',
      'createChecklist': 'Create Checklist',
      'modifyTable': 'Modify Table',
      'replaceAllContent': 'Replace All Content',
    };
    
    return displayNames[type] || type;
  }

  private getDefaultAction(type: RetryableOperation['type']): 'insert' | 'update' | 'delete' {
    switch (type) {
      case 'addContent':
      case 'createChecklist':
        return 'insert';
      case 'deleteContent':
        return 'delete';
      default:
        return 'update';
    }
  }
}

/**
 * React hook for coordinated error handling
 */
export const useCoordinatedErrorHandling = () => {
  const coordinator = ErrorHandlingCoordinator.getInstance();

  return {
    handleError: coordinator.handleError.bind(coordinator),
    handleSuccess: coordinator.handleSuccess.bind(coordinator),
    handleOperationStart: coordinator.handleOperationStart.bind(coordinator),
    clearErrorState: coordinator.clearErrorState.bind(coordinator),
    updateConfig: coordinator.updateConfig.bind(coordinator),
    getConfig: coordinator.getConfig.bind(coordinator),
  };
};

/**
 * Error handling strategy documentation
 */
export const ErrorHandlingStrategyDocs = {
  /**
   * When to use toast notifications vs inline error displays
   */
  displayGuidelines: {
    toast: [
      'Global operations affecting many blocks (>5)',
      'System-level errors that affect the entire editor',
      'Network connectivity issues',
      'Authentication/authorization errors',
      'Success messages for significant operations',
      'Warnings that require immediate attention'
    ],
    inline: [
      'Block-specific errors (1-3 blocks)',
      'Validation errors for specific content',
      'Retry-able operations with clear action buttons',
      'Content-specific warnings',
      'Persistent error states that need user action'
    ],
    both: [
      'Critical errors that need both immediate attention and persistent display',
      'Operations that start with toast and transition to inline for retry',
      'Complex operations with multiple failure points'
    ]
  },

  /**
   * Message coordination rules
   */
  coordinationRules: [
    'Prevent duplicate messages within 5 seconds',
    'Prefer inline display for block-specific errors',
    'Use toast for global operations and system errors',
    'Show retry options in inline displays, not toasts',
    'Clear inline errors when operations succeed',
    'Use consistent terminology across both systems',
    'Respect user preferences for reduced motion/notifications'
  ],

  /**
   * Error severity mapping
   */
  severityMapping: {
    error: 'Critical failures that prevent operation completion',
    warning: 'Issues that may affect operation but allow continuation',
    info: 'Informational messages about operation status'
  },

  /**
   * Best practices for developers
   */
  bestPractices: [
    'Always provide actionable error messages',
    'Include context about what the user was trying to do',
    'Offer clear next steps or retry options',
    'Use consistent error categories across operations',
    'Test error handling with various failure scenarios',
    'Consider accessibility in error message design',
    'Log detailed errors for debugging while showing user-friendly messages'
  ]
}; 