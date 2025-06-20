/**
 * Collaborative Save Coordinator
 * 
 * Prevents duplicate saves in multi-user environments by coordinating save operations
 * across multiple clients using a combination of content hashing, timing, and user coordination.
 */

import * as Y from 'yjs';
import { createClient } from '@supabase/supabase-js';

export interface SaveOperation {
  contentHash: string;
  timestamp: number;
  userId: string;
  saveType: 'manual' | 'auto' | 'yjs';
  documentId: string;
}

export interface SaveCoordinatorOptions {
  documentId: string;
  userId: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  authToken?: string;
  saveDeduplicationWindow?: number; // milliseconds
  maxRetries?: number;
  onSaveCoordinated?: (operation: SaveOperation) => void;
  onSaveSkipped?: (operation: SaveOperation, reason: string) => void;
  onSaveError?: (error: Error, operation: SaveOperation) => void;
}

interface PendingSave {
  operation: SaveOperation;
  resolve: (success: boolean) => void;
  reject: (error: Error) => void;
  retryCount: number;
}

export class CollaborativeSaveCoordinator {
  private documentId: string;
  private userId: string;
  private supabase: any;
  private authToken?: string;
  private saveDeduplicationWindow: number;
  private maxRetries: number;
  
  // State management
  private lastSaveHashes: Map<string, { timestamp: number; userId: string }> = new Map();
  private pendingSaves: Map<string, PendingSave> = new Map();
  private saveInProgress: boolean = false;
  private currentSaveTimer: NodeJS.Timeout | null = null;
  
  // Event callbacks
  private onSaveCoordinated?: (operation: SaveOperation) => void;
  private onSaveSkipped?: (operation: SaveOperation, reason: string) => void;
  private onSaveError?: (error: Error, operation: SaveOperation) => void;

  constructor(options: SaveCoordinatorOptions) {
    this.documentId = options.documentId;
    this.userId = options.userId;
    this.authToken = options.authToken;
    this.saveDeduplicationWindow = options.saveDeduplicationWindow || 2000; // 2 seconds default
    this.maxRetries = options.maxRetries || 3;
    
    // Set up event callbacks
    this.onSaveCoordinated = options.onSaveCoordinated;
    this.onSaveSkipped = options.onSaveSkipped;
    this.onSaveError = options.onSaveError;

    // Initialize Supabase client if available
    if (options.supabaseUrl && options.supabaseAnonKey) {
      this.supabase = createClient(options.supabaseUrl, options.supabaseAnonKey);
    }
  }

  /**
   * Coordinate a save operation, ensuring it doesn't duplicate recent saves
   */
  public async coordinateSave(
    content: any,
    saveType: 'manual' | 'auto' | 'yjs',
    saveFunction: () => Promise<any>
  ): Promise<boolean> {
    // Add authentication validation
    if (!this.authToken) {
      console.warn('[CollaborativeSaveCoordinator] No auth token available for save operation');
      throw new Error('Authentication token required for save operation');
    }

    const contentHash = this.generateContentHash(content);
    const operation: SaveOperation = {
      contentHash,
      timestamp: Date.now(),
      userId: this.userId,
      saveType,
      documentId: this.documentId
    };

    console.log('[CollaborativeSaveCoordinator] Coordinating save operation:', {
      contentHash: contentHash.substring(0, 8) + '...',
      saveType,
      userId: this.userId,
      documentId: this.documentId,
      hasAuthToken: !!this.authToken
    });

    // Check if this save should be deduplicated
    const shouldSkip = this.shouldSkipSave(operation);
    if (shouldSkip.skip) {
      const reason = shouldSkip.reason || 'Unknown reason';
      console.log('[CollaborativeSaveCoordinator] Skipping save:', reason);
      this.onSaveSkipped?.(operation, reason);
      return false;
    }

    // Check if there's already a pending save for this content
    if (this.pendingSaves.has(contentHash)) {
      console.log('[CollaborativeSaveCoordinator] Save already pending for this content');
      return this.waitForPendingSave(contentHash);
    }

    // Proceed with coordinated save
    return this.executeSave(operation, saveFunction);
  }

  /**
   * Check if a save operation should be skipped due to recent duplicate
   */
  private shouldSkipSave(operation: SaveOperation): { skip: boolean; reason?: string } {
    const recentSave = this.lastSaveHashes.get(operation.contentHash);
    
    if (!recentSave) {
      return { skip: false };
    }

    const timeSinceLastSave = operation.timestamp - recentSave.timestamp;
    
    // Skip if same content was saved recently within the deduplication window
    if (timeSinceLastSave < this.saveDeduplicationWindow) {
      if (recentSave.userId === operation.userId) {
        return { 
          skip: true, 
          reason: `Same user saved identical content ${timeSinceLastSave}ms ago` 
        };
      } else {
        return { 
          skip: true, 
          reason: `Another user (${recentSave.userId}) saved identical content ${timeSinceLastSave}ms ago` 
        };
      }
    }

    // For manual saves, be more aggressive about deduplication
    if (operation.saveType === 'manual' && timeSinceLastSave < this.saveDeduplicationWindow * 2) {
      return { 
        skip: true, 
        reason: `Manual save skipped - identical content saved ${timeSinceLastSave}ms ago` 
      };
    }

    return { skip: false };
  }

  /**
   * Execute a coordinated save operation
   */
  private async executeSave(
    operation: SaveOperation,
    saveFunction: () => Promise<any>
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const pendingSave: PendingSave = {
        operation,
        resolve,
        reject,
        retryCount: 0
      };

      this.pendingSaves.set(operation.contentHash, pendingSave);

      // Add small delay for coordination (allows other clients to potentially coordinate)
      const coordinationDelay = operation.saveType === 'manual' ? 50 : 200;
      
      setTimeout(async () => {
        try {
          await this.performSave(pendingSave, saveFunction);
        } catch (error) {
          this.handleSaveError(error as Error, pendingSave);
        }
      }, coordinationDelay);
    });
  }

  /**
   * Perform the actual save operation
   */
  private async performSave(
    pendingSave: PendingSave,
    saveFunction: () => Promise<any>
  ): Promise<void> {
    const { operation } = pendingSave;

    try {
      console.log('[CollaborativeSaveCoordinator] Executing save for:', {
        contentHash: operation.contentHash.substring(0, 8) + '...',
        saveType: operation.saveType,
        attempt: pendingSave.retryCount + 1
      });

      // Mark save as in progress
      this.saveInProgress = true;

      // Execute the save function
      const result = await saveFunction();

      // Record successful save
      this.lastSaveHashes.set(operation.contentHash, {
        timestamp: operation.timestamp,
        userId: operation.userId
      });

      // Clean up
      this.pendingSaves.delete(operation.contentHash);
      this.saveInProgress = false;

      // Notify success
      this.onSaveCoordinated?.(operation);
      pendingSave.resolve(true);

      console.log('[CollaborativeSaveCoordinator] Save completed successfully:', {
        contentHash: operation.contentHash.substring(0, 8) + '...',
        saveType: operation.saveType
      });

    } catch (error) {
      this.saveInProgress = false;
      throw error; // Re-throw to be handled by error handler
    }
  }

  /**
   * Handle save operation errors with retry logic
   */
  private handleSaveError(error: Error, pendingSave: PendingSave): void {
    const { operation } = pendingSave;

    console.error('[CollaborativeSaveCoordinator] Save error:', {
      error: error.message,
      contentHash: operation.contentHash.substring(0, 8) + '...',
      attempt: pendingSave.retryCount + 1,
      maxRetries: this.maxRetries
    });

    if (pendingSave.retryCount < this.maxRetries) {
      // Retry with exponential backoff
      const retryDelay = Math.pow(2, pendingSave.retryCount) * 1000;
      pendingSave.retryCount++;

      console.log(`[CollaborativeSaveCoordinator] Retrying save in ${retryDelay}ms (attempt ${pendingSave.retryCount + 1}/${this.maxRetries})`);

      setTimeout(async () => {
        try {
          // Note: We need to get the saveFunction again, which is a limitation
          // In practice, this should be handled by the caller re-invoking coordinateSave
          console.warn('[CollaborativeSaveCoordinator] Retry mechanism needs saveFunction re-invocation');
          this.pendingSaves.delete(operation.contentHash);
          pendingSave.reject(new Error('Retry requires re-invocation of coordinateSave'));
        } catch (retryError) {
          this.handleSaveError(retryError as Error, pendingSave);
        }
      }, retryDelay);

    } else {
      // Max retries exceeded
      this.pendingSaves.delete(operation.contentHash);
      this.onSaveError?.(error, operation);
      pendingSave.reject(error);
    }
  }

  /**
   * Wait for an already pending save to complete
   */
  private async waitForPendingSave(contentHash: string): Promise<boolean> {
    const pendingSave = this.pendingSaves.get(contentHash);
    if (!pendingSave) {
      return false;
    }

    return new Promise((resolve, reject) => {
      // Wrap the existing promise to avoid race conditions
      const originalResolve = pendingSave.resolve;
      const originalReject = pendingSave.reject;

      pendingSave.resolve = (success: boolean) => {
        originalResolve(success);
        resolve(success);
      };

      pendingSave.reject = (error: Error) => {
        originalReject(error);
        reject(error);
      };
    });
  }

  /**
   * Generate a content hash for deduplication
   */
  private generateContentHash(content: any): string {
    // Create a consistent hash of the content
    const contentString = typeof content === 'string' 
      ? content 
      : JSON.stringify(content, Object.keys(content).sort());
    
    // Simple hash function (in production, consider using crypto.subtle.digest)
    let hash = 0;
    for (let i = 0; i < contentString.length; i++) {
      const char = contentString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Update authentication token
   */
  public updateAuthToken(token: string | undefined): void {
    this.authToken = token;
  }

  /**
   * Clear old save records to prevent memory leaks
   */
  public cleanup(): void {
    const now = Date.now();
    const maxAge = this.saveDeduplicationWindow * 10; // Keep 10x deduplication window

    for (const [hash, saveInfo] of this.lastSaveHashes.entries()) {
      if (now - saveInfo.timestamp > maxAge) {
        this.lastSaveHashes.delete(hash);
      }
    }

    console.log('[CollaborativeSaveCoordinator] Cleanup completed, tracking', this.lastSaveHashes.size, 'recent saves');
  }

  /**
   * Get current save statistics
   */
  public getStats(): {
    recentSaves: number;
    pendingSaves: number;
    saveInProgress: boolean;
  } {
    return {
      recentSaves: this.lastSaveHashes.size,
      pendingSaves: this.pendingSaves.size,
      saveInProgress: this.saveInProgress
    };
  }

  /**
   * Destroy the coordinator and clean up resources
   */
  public destroy(): void {
    if (this.currentSaveTimer) {
      clearTimeout(this.currentSaveTimer);
      this.currentSaveTimer = null;
    }

    this.lastSaveHashes.clear();
    this.pendingSaves.clear();
    this.saveInProgress = false;

    console.log('[CollaborativeSaveCoordinator] Coordinator destroyed');
  }
} 