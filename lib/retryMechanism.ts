/**
 * Retry Mechanism for AI Operations
 * Provides functionality to retry failed AI operations while preserving user input
 * and providing appropriate feedback to users.
 */

import { toast } from 'sonner';
import { aiToast } from '@/lib/utils/aiToast';

export interface RetryableOperation {
  id: string;
  type: 'addContent' | 'modifyContent' | 'deleteContent' | 'createChecklist' | 'modifyTable' | 'replaceAllContent';
  args: any;
  originalError?: string;
  retryCount: number;
  maxRetries: number;
  lastAttempt: number;
  blockIds?: string[];
}

export interface RetryConfig {
  maxRetries: number;
  cooldownMs: number;
  exponentialBackoff: boolean;
  preserveUserInput: boolean;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  cooldownMs: 1000,
  exponentialBackoff: true,
  preserveUserInput: true,
};

/**
 * Retry manager for AI operations
 */
export class AIOperationRetryManager {
  private static instance: AIOperationRetryManager;
  private retryableOperations: Map<string, RetryableOperation> = new Map();
  private config: RetryConfig;

  private constructor(config: RetryConfig = defaultRetryConfig) {
    this.config = config;
  }

  public static getInstance(config?: RetryConfig): AIOperationRetryManager {
    if (!AIOperationRetryManager.instance) {
      AIOperationRetryManager.instance = new AIOperationRetryManager(config);
    }
    return AIOperationRetryManager.instance;
  }

  /**
   * Register a failed operation for potential retry
   */
  public registerFailedOperation(
    operationId: string,
    type: RetryableOperation['type'],
    args: any,
    error: string,
    blockIds?: string[]
  ): void {
    const operation: RetryableOperation = {
      id: operationId,
      type,
      args,
      originalError: error,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      lastAttempt: Date.now(),
      blockIds,
    };

    this.retryableOperations.set(operationId, operation);
    console.log(`[RetryManager] Registered failed operation: ${operationId}`, operation);
  }

  /**
   * Attempt to retry a failed operation
   */
  public async retryOperation(
    operationId: string,
    executor: (args: any) => Promise<any>
  ): Promise<{ success: boolean; error?: string; shouldRemove?: boolean }> {
    const operation = this.retryableOperations.get(operationId);
    
    if (!operation) {
      return { success: false, error: 'Operation not found for retry' };
    }

    // Check if we've exceeded max retries
    if (operation.retryCount >= operation.maxRetries) {
      this.retryableOperations.delete(operationId);
      return { 
        success: false, 
        error: `Maximum retry attempts (${operation.maxRetries}) exceeded`,
        shouldRemove: true
      };
    }

    // Check cooldown period
    const timeSinceLastAttempt = Date.now() - operation.lastAttempt;
    const requiredCooldown = this.calculateCooldown(operation.retryCount);
    
    if (timeSinceLastAttempt < requiredCooldown) {
      const remainingCooldown = Math.ceil((requiredCooldown - timeSinceLastAttempt) / 1000);
      return { 
        success: false, 
        error: `Please wait ${remainingCooldown} seconds before retrying` 
      };
    }

    // Update retry count and timestamp
    operation.retryCount++;
    operation.lastAttempt = Date.now();

    // Show retry progress
    const retryToastId = toast.loading(
      `Retrying ${this.getOperationDisplayName(operation.type)}... (Attempt ${operation.retryCount}/${operation.maxRetries})`
    );

    try {
      // Preserve user input if configured
      if (this.config.preserveUserInput && operation.args) {
        console.log(`[RetryManager] Preserving user input for retry:`, operation.args);
      }

      // Execute the retry
      const result = await executor(operation.args);
      
      // Success - remove from retry queue
      this.retryableOperations.delete(operationId);
      toast.dismiss(retryToastId);
      
      // Show success message with block navigation if available
      if (operation.blockIds && operation.blockIds.length > 0) {
        aiToast.success(
          `${this.getOperationDisplayName(operation.type)} succeeded on retry`,
          {
            affectedBlockIds: operation.blockIds,
            action: this.getActionType(operation.type),
          }
        );
      } else {
        toast.success(`${this.getOperationDisplayName(operation.type)} succeeded on retry`);
      }

      console.log(`[RetryManager] Retry successful for operation: ${operationId}`);
      return { success: true, shouldRemove: true };

    } catch (error: any) {
      toast.dismiss(retryToastId);
      
      const errorMessage = error.message || 'Unknown error during retry';
      console.error(`[RetryManager] Retry failed for operation: ${operationId}`, error);

      // Check if we should continue retrying
      if (operation.retryCount >= operation.maxRetries) {
        this.retryableOperations.delete(operationId);
        
        // Show final failure message
        if (operation.blockIds && operation.blockIds.length > 0) {
          aiToast.error(
            `${this.getOperationDisplayName(operation.type)} failed after ${operation.maxRetries} attempts`,
            {
              affectedBlockIds: operation.blockIds,
              action: 'error',
            }
          );
        } else {
          toast.error(`${this.getOperationDisplayName(operation.type)} failed after ${operation.maxRetries} attempts`);
        }

        return { 
          success: false, 
          error: `Failed after ${operation.maxRetries} attempts: ${errorMessage}`,
          shouldRemove: true
        };
      }

      // Show retry available message
      const nextRetryIn = Math.ceil(this.calculateCooldown(operation.retryCount) / 1000);
      toast.error(`Retry ${operation.retryCount} failed. Next retry available in ${nextRetryIn}s`);

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get all retryable operations for a specific block
   */
  public getRetryableOperationsForBlock(blockId: string): RetryableOperation[] {
    return Array.from(this.retryableOperations.values()).filter(
      op => op.blockIds?.includes(blockId)
    );
  }

  /**
   * Get all retryable operations
   */
  public getAllRetryableOperations(): RetryableOperation[] {
    return Array.from(this.retryableOperations.values());
  }

  /**
   * Remove a retryable operation (e.g., when user dismisses)
   */
  public removeRetryableOperation(operationId: string): boolean {
    return this.retryableOperations.delete(operationId);
  }

  /**
   * Clear all retryable operations
   */
  public clearAllRetryableOperations(): void {
    this.retryableOperations.clear();
  }

  /**
   * Calculate cooldown period with optional exponential backoff
   */
  private calculateCooldown(retryCount: number): number {
    if (!this.config.exponentialBackoff) {
      return this.config.cooldownMs;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    return this.config.cooldownMs * Math.pow(2, retryCount - 1);
  }

  /**
   * Get display name for operation types
   */
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

  /**
   * Get action type for toast notifications
   */
  private getActionType(type: RetryableOperation['type']): 'insert' | 'update' | 'delete' | 'error' {
    switch (type) {
      case 'addContent':
      case 'createChecklist':
        return 'insert';
      case 'modifyContent':
      case 'modifyTable':
      case 'replaceAllContent':
        return 'update';
      case 'deleteContent':
        return 'delete';
      default:
        return 'update';
    }
  }
}

/**
 * Utility functions for retry mechanism
 */
export const RetryUtils = {
  /**
   * Create a retry handler for AI operations
   */
  createRetryHandler: (
    operationType: RetryableOperation['type'],
    executor: (args: any) => Promise<any>
  ) => {
    const retryManager = AIOperationRetryManager.getInstance();
    
    return async (args: any, blockIds?: string[]) => {
      const operationId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        return await executor(args);
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred';
        
        // Register for retry
        retryManager.registerFailedOperation(
          operationId,
          operationType,
          args,
          errorMessage,
          blockIds
        );
        
        // Show error with retry option
        if (blockIds && blockIds.length > 0) {
          aiToast.error(
            `${retryManager['getOperationDisplayName'](operationType)} failed: ${errorMessage}`,
            {
              affectedBlockIds: blockIds,
              action: 'error',
            }
          );
        } else {
          toast.error(`${retryManager['getOperationDisplayName'](operationType)} failed: ${errorMessage}`);
        }
        
        // Re-throw to maintain existing error handling
        throw error;
      }
    };
  },

  /**
   * Get retry manager instance
   */
  getRetryManager: () => AIOperationRetryManager.getInstance(),

  /**
   * Check if an operation can be retried
   */
  canRetry: (operationId: string): boolean => {
    const retryManager = AIOperationRetryManager.getInstance();
    const operation = retryManager['retryableOperations'].get(operationId);
    return operation ? operation.retryCount < operation.maxRetries : false;
  },
}; 