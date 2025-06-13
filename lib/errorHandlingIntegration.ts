/**
 * Error Handling Integration with Block Status System
 * Connects error handling UI with the existing block status system
 * to ensure consistent state management across AI operations.
 */

import { useEditorBlockStatusStore } from '@/app/stores/editorBlockStatusStore';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { BlockStatus } from '@/app/lib/clientChatOperationState';
import { AIOperationRetryManager, RetryableOperation } from '@/lib/retryMechanism';
import { ToolErrorHandler, ErrorContext } from '@/lib/errorHandling';
import { aiToast } from '@/lib/utils/aiToast';

export interface ErrorStateTransition {
  fromStatus: 'idle' | 'loading' | 'modified' | 'error';
  toStatus: 'idle' | 'loading' | 'modified' | 'error';
  trigger: 'operation_start' | 'operation_success' | 'operation_error' | 'retry_attempt' | 'retry_success' | 'manual_clear';
  blockId: string;
  timestamp: number;
}

export interface BlockErrorContext {
  blockId: string;
  operationType: RetryableOperation['type'];
  errorMessage: string;
  canRetry: boolean;
  retryCount: number;
  maxRetries: number;
  lastAttempt: number;
}

/**
 * Enhanced error handling manager that integrates with block status system
 */
export class IntegratedErrorHandler {
  private static instance: IntegratedErrorHandler;
  private retryManager: AIOperationRetryManager;
  private toolErrorHandler: ToolErrorHandler;
  private stateTransitions: ErrorStateTransition[] = [];

  private constructor() {
    this.retryManager = AIOperationRetryManager.getInstance();
    this.toolErrorHandler = ToolErrorHandler.getInstance();
  }

  public static getInstance(): IntegratedErrorHandler {
    if (!IntegratedErrorHandler.instance) {
      IntegratedErrorHandler.instance = new IntegratedErrorHandler();
    }
    return IntegratedErrorHandler.instance;
  }

  /**
   * Handle operation start - set loading state
   */
  public handleOperationStart(
    blockIds: string[],
    operationType: RetryableOperation['type'],
    operationDescription?: string
  ): void {
    blockIds.forEach(blockId => {
      this.updateBlockStatus(blockId, 'loading', operationDescription || `${operationType} in progress`);
      this.recordStateTransition(blockId, 'idle', 'loading', 'operation_start');
    });

    console.log(`[IntegratedErrorHandler] Operation started: ${operationType} on blocks:`, blockIds);
  }

  /**
   * Handle operation success - set modified state and clear any retry operations
   */
  public handleOperationSuccess(
    blockIds: string[],
    operationType: RetryableOperation['type'],
    action?: 'insert' | 'update' | 'delete'
  ): void {
    blockIds.forEach(blockId => {
      this.updateBlockStatus(blockId, 'modified', 'Operation completed successfully', action);
      this.recordStateTransition(blockId, 'loading', 'modified', 'operation_success');
      
      // Clear any retry operations for this block
      const retryableOps = this.retryManager.getRetryableOperationsForBlock(blockId);
      retryableOps.forEach(op => {
        this.retryManager.removeRetryableOperation(op.id);
      });
    });

    // Show success toast with block navigation
    aiToast.success(
      `${this.getOperationDisplayName(operationType)} completed successfully`,
      {
        affectedBlockIds: blockIds,
        action: action || this.getDefaultAction(operationType),
      }
    );

    console.log(`[IntegratedErrorHandler] Operation succeeded: ${operationType} on blocks:`, blockIds);
  }

  /**
   * Handle operation error - set error state and register for retry
   */
  public handleOperationError(
    blockIds: string[],
    operationType: RetryableOperation['type'],
    error: Error | string,
    operationArgs?: any
  ): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const operationId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    blockIds.forEach(blockId => {
      this.updateBlockStatus(blockId, 'error', errorMessage);
      this.recordStateTransition(blockId, 'loading', 'error', 'operation_error');
    });

    // Register for retry if operation args are available
    if (operationArgs) {
      this.retryManager.registerFailedOperation(
        operationId,
        operationType,
        operationArgs,
        errorMessage,
        blockIds
      );
    }

    // Report error using existing error handling system
    const errorContext: ErrorContext = {
      operation: operationType,
      category: 'operation',
      severity: 'error',
      message: `${this.getOperationDisplayName(operationType)} failed`,
      details: errorMessage,
      suggestedAction: 'retry',
      actionLabel: 'Try the operation again'
    };

    this.toolErrorHandler.reportError(errorContext);

    console.error(`[IntegratedErrorHandler] Operation failed: ${operationType} on blocks:`, blockIds, error);
  }

  /**
   * Handle retry attempt - update status and attempt retry
   */
  public async handleRetryAttempt(
    blockId: string,
    executor: (args: any) => Promise<any>
  ): Promise<{ success: boolean; error?: string }> {
    const retryableOps = this.retryManager.getRetryableOperationsForBlock(blockId);
    
    if (retryableOps.length === 0) {
      return { success: false, error: 'No retryable operations found for this block' };
    }

    // Get the most recent operation
    const operation = retryableOps.sort((a, b) => b.lastAttempt - a.lastAttempt)[0];
    
    // Update block status to loading for retry
    this.updateBlockStatus(blockId, 'loading', `Retrying ${operation.type}... (Attempt ${operation.retryCount + 1})`);
    this.recordStateTransition(blockId, 'error', 'loading', 'retry_attempt');

    try {
      const result = await this.retryManager.retryOperation(operation.id, executor);
      
      if (result.success) {
        // Handle successful retry
        this.updateBlockStatus(blockId, 'modified', 'Retry successful');
        this.recordStateTransition(blockId, 'loading', 'modified', 'retry_success');
        
        console.log(`[IntegratedErrorHandler] Retry successful for block: ${blockId}`);
        return { success: true };
      } else {
        // Handle failed retry
        this.updateBlockStatus(blockId, 'error', result.error || 'Retry failed');
        this.recordStateTransition(blockId, 'loading', 'error', 'operation_error');
        
        console.log(`[IntegratedErrorHandler] Retry failed for block: ${blockId}`, result.error);
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      // Handle retry exception
      const errorMessage = error.message || 'Unknown error during retry';
      this.updateBlockStatus(blockId, 'error', errorMessage);
      this.recordStateTransition(blockId, 'loading', 'error', 'operation_error');
      
      console.error(`[IntegratedErrorHandler] Retry exception for block: ${blockId}`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Clear error state for a block
   */
  public clearErrorState(blockId: string): void {
    this.updateBlockStatus(blockId, 'idle');
    this.recordStateTransition(blockId, 'error', 'idle', 'manual_clear');
    
    // Remove any retry operations for this block
    const retryableOps = this.retryManager.getRetryableOperationsForBlock(blockId);
    retryableOps.forEach(op => {
      this.retryManager.removeRetryableOperation(op.id);
    });

    console.log(`[IntegratedErrorHandler] Error state cleared for block: ${blockId}`);
  }

  /**
   * Get error context for a block
   */
  public getBlockErrorContext(blockId: string): BlockErrorContext | null {
    const retryableOps = this.retryManager.getRetryableOperationsForBlock(blockId);
    
    if (retryableOps.length === 0) {
      return null;
    }

    const operation = retryableOps[0]; // Get the first (or most relevant) operation
    
    return {
      blockId,
      operationType: operation.type,
      errorMessage: operation.originalError || 'Unknown error',
      canRetry: operation.retryCount < operation.maxRetries,
      retryCount: operation.retryCount,
      maxRetries: operation.maxRetries,
      lastAttempt: operation.lastAttempt,
    };
  }

  /**
   * Get all blocks with error states
   */
  public getBlocksWithErrors(): string[] {
    return this.retryManager.getAllRetryableOperations()
      .flatMap(op => op.blockIds || [])
      .filter((blockId, index, array) => array.indexOf(blockId) === index); // Remove duplicates
  }

  /**
   * Validate that error states don't cascade across dependent blocks
   */
  public validateErrorCascading(blockIds: string[]): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    // Check if too many blocks are in error state
    const errorBlocks = this.getBlocksWithErrors();
    const errorRatio = errorBlocks.length / Math.max(blockIds.length, 1);
    
    if (errorRatio > 0.5) {
      warnings.push(`High error rate detected: ${errorBlocks.length} blocks have errors out of ${blockIds.length} total`);
    }

    // Check for potential cascading errors (multiple consecutive blocks)
    let consecutiveErrors = 0;
    let maxConsecutive = 0;
    
    blockIds.forEach(blockId => {
      if (errorBlocks.includes(blockId)) {
        consecutiveErrors++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveErrors);
      } else {
        consecutiveErrors = 0;
      }
    });

    if (maxConsecutive > 3) {
      warnings.push(`Potential cascading error detected: ${maxConsecutive} consecutive blocks have errors`);
    }

    return {
      isValid: warnings.length === 0,
      warnings
    };
  }

  /**
   * Get state transition history for debugging
   */
  public getStateTransitionHistory(blockId?: string): ErrorStateTransition[] {
    if (blockId) {
      return this.stateTransitions.filter(t => t.blockId === blockId);
    }
    return [...this.stateTransitions];
  }

  /**
   * Private helper methods
   */
  private updateBlockStatus(
    blockId: string,
    status: 'idle' | 'loading' | 'modified' | 'error',
    message?: string,
    action?: 'insert' | 'update' | 'delete'
  ): void {
    // Update both store systems for consistency
    
    // Update the new block status store
    const editorStore = useEditorBlockStatusStore.getState();
    editorStore.setBlockStatus(blockId, status, message, action);
    
    // Update the client chat operation store
    const clientStore = useClientChatOperationStore.getState();
    clientStore.setBlockStatus(blockId, this.mapToBlockStatus(status), action, message);
  }

  private mapToBlockStatus(status: 'idle' | 'loading' | 'modified' | 'error'): BlockStatus {
    switch (status) {
      case 'idle': return BlockStatus.IDLE;
      case 'loading': return BlockStatus.LOADING;
      case 'modified': return BlockStatus.MODIFIED;
      case 'error': return BlockStatus.ERROR;
      default: return BlockStatus.IDLE;
    }
  }

  private recordStateTransition(
    blockId: string,
    fromStatus: 'idle' | 'loading' | 'modified' | 'error',
    toStatus: 'idle' | 'loading' | 'modified' | 'error',
    trigger: ErrorStateTransition['trigger']
  ): void {
    const transition: ErrorStateTransition = {
      fromStatus,
      toStatus,
      trigger,
      blockId,
      timestamp: Date.now()
    };

    this.stateTransitions.push(transition);
    
    // Keep only the last 100 transitions to prevent memory leaks
    if (this.stateTransitions.length > 100) {
      this.stateTransitions = this.stateTransitions.slice(-100);
    }
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
 * React hook for using integrated error handling
 */
export const useIntegratedErrorHandling = () => {
  const errorHandler = IntegratedErrorHandler.getInstance();

  return {
    handleOperationStart: errorHandler.handleOperationStart.bind(errorHandler),
    handleOperationSuccess: errorHandler.handleOperationSuccess.bind(errorHandler),
    handleOperationError: errorHandler.handleOperationError.bind(errorHandler),
    handleRetryAttempt: errorHandler.handleRetryAttempt.bind(errorHandler),
    clearErrorState: errorHandler.clearErrorState.bind(errorHandler),
    getBlockErrorContext: errorHandler.getBlockErrorContext.bind(errorHandler),
    getBlocksWithErrors: errorHandler.getBlocksWithErrors.bind(errorHandler),
    validateErrorCascading: errorHandler.validateErrorCascading.bind(errorHandler),
  };
};

/**
 * Utility functions for error state management
 */
export const ErrorStateUtils = {
  /**
   * Check if a block is in error state
   */
  isBlockInError: (blockId: string): boolean => {
    const errorHandler = IntegratedErrorHandler.getInstance();
    return errorHandler.getBlockErrorContext(blockId) !== null;
  },

  /**
   * Get error message for a block
   */
  getBlockErrorMessage: (blockId: string): string | null => {
    const errorHandler = IntegratedErrorHandler.getInstance();
    const context = errorHandler.getBlockErrorContext(blockId);
    return context?.errorMessage || null;
  },

  /**
   * Check if a block can be retried
   */
  canRetryBlock: (blockId: string): boolean => {
    const errorHandler = IntegratedErrorHandler.getInstance();
    const context = errorHandler.getBlockErrorContext(blockId);
    return context?.canRetry || false;
  },

  /**
   * Clear all error states
   */
  clearAllErrorStates: (): void => {
    const errorHandler = IntegratedErrorHandler.getInstance();
    const errorBlocks = errorHandler.getBlocksWithErrors();
    errorBlocks.forEach(blockId => {
      errorHandler.clearErrorState(blockId);
    });
  },
}; 