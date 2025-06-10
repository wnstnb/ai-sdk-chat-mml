/**
 * Enhanced Error Handling and Feedback System for BlockNote Tool Operations
 * Provides consistent error reporting, user feedback, and actionable suggestions
 */

import { toast } from 'sonner';

// Error categories for better classification
export type ErrorCategory = 
    | 'validation'
    | 'safety'
    | 'content'
    | 'target'
    | 'operation'
    | 'system';

// Error severity levels
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

// Feedback action types
export type FeedbackAction = 
    | 'retry'
    | 'check_target'
    | 'modify_content'
    | 'contact_support'
    | 'reload_editor';

export interface ErrorContext {
    operation: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    message: string;
    details?: string;
    targetId?: string | string[];
    suggestedAction?: FeedbackAction;
    actionLabel?: string;
    originalArgs?: any;
}

export interface FeedbackResult {
    success: boolean;
    message: string;
    details?: string;
    action?: string;
}

/**
 * Enhanced error reporting with context and suggestions
 */
export class ToolErrorHandler {
    private static instance: ToolErrorHandler;
    
    public static getInstance(): ToolErrorHandler {
        if (!ToolErrorHandler.instance) {
            ToolErrorHandler.instance = new ToolErrorHandler();
        }
        return ToolErrorHandler.instance;
    }

    /**
     * Report an error with enhanced context and user guidance
     */
    public reportError(context: ErrorContext): void {
        const { operation, category, severity, message, details, suggestedAction, actionLabel } = context;
        
        // Log detailed error for debugging
        console.error(`[${operation}] ${category} error:`, {
            message,
            details,
            context
        });

        // Create user-friendly message with context
        const userMessage = this.createUserMessage(context);
        
        // Show appropriate toast based on severity
        switch (severity) {
            case 'info':
                toast.info(userMessage);
                break;
            case 'warning':
                toast.warning(userMessage);
                break;
            case 'error':
                toast.error(userMessage);
                break;
            case 'critical':
                toast.error(userMessage);
                // Could trigger additional critical error handling
                break;
        }

        // Log suggested action if provided
        if (suggestedAction && actionLabel) {
            console.info(`[${operation}] Suggested action: ${actionLabel} (${suggestedAction})`);
        }
    }

    /**
     * Report operation success with details
     */
    public reportSuccess(operation: string, message: string, details?: string): void {
        console.info(`[${operation}] Success: ${message}`, details ? { details } : {});
        toast.success(message);
    }

    /**
     * Report partial success with warnings
     */
    public reportPartialSuccess(operation: string, successCount: number, failureCount: number, details?: string): void {
        const message = `${operation}: ${successCount} succeeded, ${failureCount} failed`;
        console.warn(`[${operation}] Partial success:`, { successCount, failureCount, details });
        toast.warning(message);
    }

    /**
     * Create user-friendly error messages with context
     */
    private createUserMessage(context: ErrorContext): string {
        const { operation, category, message, details, targetId, suggestedAction, actionLabel } = context;
        
        let userMessage = `${this.getOperationDisplayName(operation)} failed: ${message}`;
        
        // Add target context if available
        if (targetId) {
            if (Array.isArray(targetId)) {
                userMessage += ` (targets: ${targetId.join(', ')})`;
            } else {
                userMessage += ` (target: ${targetId})`;
            }
        }

        // Add suggested action if available
        if (actionLabel) {
            userMessage += `. ${actionLabel}`;
        }

        return userMessage;
    }

    /**
     * Get display name for operations
     */
    private getOperationDisplayName(operation: string): string {
        const displayNames: Record<string, string> = {
            'addContent': 'Add Content',
            'modifyContent': 'Modify Content',
            'deleteContent': 'Delete Content',
            'createChecklist': 'Create Checklist',
            'modifyTable': 'Modify Table'
        };
        
        return displayNames[operation] || operation;
    }
}

/**
 * Common error patterns and their handling
 */
export class CommonErrors {
    /**
     * Target block not found error
     */
    public static targetNotFound(operation: string, targetId: string): ErrorContext {
        return {
            operation,
            category: 'target',
            severity: 'error',
            message: `Block with ID '${targetId}' not found`,
            details: 'The target block may have been deleted or moved',
            targetId,
            suggestedAction: 'check_target',
            actionLabel: 'Please refresh and check if the target block still exists'
        };
    }

    /**
     * Invalid content error
     */
    public static invalidContent(operation: string, contentType: string): ErrorContext {
        return {
            operation,
            category: 'content',
            severity: 'error',
            message: `Invalid ${contentType} provided`,
            details: `The ${contentType} must be properly formatted`,
            suggestedAction: 'modify_content',
            actionLabel: 'Please check the content format and try again'
        };
    }

    /**
     * Validation failure error
     */
    public static validationFailed(operation: string, reason: string): ErrorContext {
        return {
            operation,
            category: 'validation',
            severity: 'error',
            message: 'Operation validation failed',
            details: reason,
            suggestedAction: 'retry',
            actionLabel: 'Please review the operation and try again'
        };
    }

    /**
     * Safety check failure error
     */
    public static safetyCheckFailed(operation: string, reason: string): ErrorContext {
        return {
            operation,
            category: 'safety',
            severity: 'warning',
            message: 'Operation blocked for safety',
            details: reason,
            suggestedAction: 'modify_content',
            actionLabel: 'Please adjust the operation parameters'
        };
    }

    /**
     * Empty document error
     */
    public static emptyDocument(operation: string): ErrorContext {
        return {
            operation,
            category: 'target',
            severity: 'warning',
            message: 'Cannot perform operation on empty document',
            details: 'The document has no content to operate on',
            suggestedAction: 'retry',
            actionLabel: 'Add some content first, then try the operation'
        };
    }

    /**
     * Array length mismatch error
     */
    public static arrayLengthMismatch(operation: string, arrayName1: string, arrayName2: string): ErrorContext {
        return {
            operation,
            category: 'validation',
            severity: 'error',
            message: `Array length mismatch between ${arrayName1} and ${arrayName2}`,
            details: 'When using arrays, both arrays must have the same length',
            suggestedAction: 'modify_content',
            actionLabel: 'Ensure both arrays have matching lengths'
        };
    }

    /**
     * System error (unexpected failures)
     */
    public static systemError(operation: string, error: Error): ErrorContext {
        return {
            operation,
            category: 'system',
            severity: 'critical',
            message: 'Unexpected system error occurred',
            details: error.message,
            suggestedAction: 'contact_support',
            actionLabel: 'If this persists, please contact support'
        };
    }
}

/**
 * Success feedback patterns
 */
export class SuccessFeedback {
    private static errorHandler = ToolErrorHandler.getInstance();

    /**
     * Single operation success
     */
    public static single(operation: string, description: string): void {
        SuccessFeedback.errorHandler.reportSuccess(operation, description);
    }

    /**
     * Multi-target operation success
     */
    public static multiTarget(operation: string, targetCount: number, itemCount?: number): void {
        let message = `${operation} completed at ${targetCount} location(s)`;
        if (itemCount) {
            message += `. Total items: ${itemCount}`;
        }
        SuccessFeedback.errorHandler.reportSuccess(operation, message);
    }

    /**
     * Partial success with details
     */
    public static partial(operation: string, successCount: number, failureCount: number): void {
        SuccessFeedback.errorHandler.reportPartialSuccess(operation, successCount, failureCount);
    }

    /**
     * Batch operation success
     */
    public static batch(operation: string, processedCount: number, totalCount: number): void {
        const message = totalCount === processedCount 
            ? `${operation} completed for all ${totalCount} items`
            : `${operation} completed for ${processedCount} of ${totalCount} items`;
        
        if (totalCount === processedCount) {
            SuccessFeedback.errorHandler.reportSuccess(operation, message);
        } else {
            SuccessFeedback.errorHandler.reportPartialSuccess(operation, processedCount, totalCount - processedCount);
        }
    }
}

/**
 * Utility functions for error handling
 */
export const ErrorUtils = {
    /**
     * Safely extract error message from various error types
     */
    extractErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        return 'Unknown error occurred';
    },

    /**
     * Create error context from operation result
     */
    createContextFromResult(operation: string, result: any): ErrorContext | null {
        if (result?.isValid === false) {
            return {
                operation,
                category: 'validation',
                severity: 'error',
                message: result.errorMessage || 'Operation validation failed',
                details: result.details,
                suggestedAction: 'retry'
            };
        }
        return null;
    },

    /**
     * Check if error is recoverable
     */
    isRecoverableError(category: ErrorCategory): boolean {
        return ['validation', 'content', 'target'].includes(category);
    }
}; 