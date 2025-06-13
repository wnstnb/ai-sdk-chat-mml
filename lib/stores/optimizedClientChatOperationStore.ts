/**
 * Optimized Client Chat Operation Store
 * Uses immer for immutable updates and debouncing for performance
 */

import { create } from 'zustand';
import { produce } from 'immer';
import {
  ClientChatOperationState,
  initialClientChatOperationState,
  AIToolState,
  AudioState,
  FileUploadState,
  BlockStatus,
  BlockStatusEntry,
  BlockStatusMap
} from '@/app/lib/clientChatOperationState';
import { useDebounce, useBatchedUpdates } from '@/lib/hooks/useDebounce';

interface OptimizedClientChatOperationStore extends ClientChatOperationState {
  setAIToolState: (aiToolState: AIToolState) => void;
  setAudioState: (audioState: AudioState) => void;
  setFileUploadState: (fileUploadState: FileUploadState) => void;
  setCurrentToolCallId: (toolCallId?: string) => void;
  setCurrentOperationDescription: (description?: string) => void;
  resetChatOperationState: () => void;
  setOperationStates: (states: Partial<ClientChatOperationState>) => void;

  // Optimized block status actions
  setBlockStatus: (
    blockId: string,
    status: BlockStatus,
    action?: 'insert' | 'update' | 'delete',
    message?: string
  ) => void;
  setBlockStatusBatch: (updates: Array<{
    blockId: string;
    status: BlockStatus;
    action?: 'insert' | 'update' | 'delete';
    message?: string;
  }>) => void;
  clearBlockStatus: (blockId: string) => void;
  clearAllBlockStatuses: () => void;
  
  // Performance monitoring
  _performanceMetrics: {
    updateCount: number;
    lastUpdateTime: number;
    batchedUpdates: number;
  };
}

// Debounced update function to batch rapid status changes
let pendingUpdates: Map<string, {
  status: BlockStatus;
  action?: 'insert' | 'update' | 'delete';
  message?: string;
  timestamp: number;
}> = new Map();

let updateTimeout: NodeJS.Timeout | null = null;

export const useOptimizedClientChatOperationStore = create<OptimizedClientChatOperationStore>((set, get) => {
  // Debounced batch update function
  const flushPendingUpdates = () => {
    if (pendingUpdates.size === 0) return;
    
    const updates = Array.from(pendingUpdates.entries()).map(([blockId, update]) => ({
      blockId,
      ...update
    }));
    
    set(produce((state: OptimizedClientChatOperationStore) => {
      updates.forEach(({ blockId, status, action, message, timestamp }) => {
        state.editorBlockStatuses[blockId] = {
          status,
          action,
          message,
          timestamp,
        } as BlockStatusEntry;
      });
      
      // Update performance metrics
      state._performanceMetrics.updateCount += updates.length;
      state._performanceMetrics.lastUpdateTime = Date.now();
      state._performanceMetrics.batchedUpdates++;
    }));
    
    pendingUpdates.clear();
    updateTimeout = null;
  };

  const debouncedSetBlockStatus = (
    blockId: string,
    status: BlockStatus,
    action?: 'insert' | 'update' | 'delete',
    message?: string
  ) => {
    // Add to pending updates
    pendingUpdates.set(blockId, {
      status,
      action,
      message,
      timestamp: Date.now()
    });
    
    // Clear existing timeout and set new one
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
    
    updateTimeout = setTimeout(flushPendingUpdates, 16); // Batch updates every frame (16ms)
  };

  return {
    ...initialClientChatOperationState,
    _performanceMetrics: {
      updateCount: 0,
      lastUpdateTime: 0,
      batchedUpdates: 0
    },

    // Standard actions using immer for immutable updates
    setAIToolState: (aiToolState) => set(produce((state) => {
      state.aiToolState = aiToolState;
    })),
    
    setAudioState: (audioState) => set(produce((state) => {
      state.audioState = audioState;
    })),
    
    setFileUploadState: (fileUploadState) => set(produce((state) => {
      state.fileUploadState = fileUploadState;
    })),
    
    setCurrentToolCallId: (currentToolCallId) => set(produce((state) => {
      state.currentToolCallId = currentToolCallId;
    })),
    
    setCurrentOperationDescription: (currentOperationDescription) => set(produce((state) => {
      state.currentOperationDescription = currentOperationDescription;
    })),
    
    resetChatOperationState: () => set(produce((state) => {
      Object.assign(state, initialClientChatOperationState);
      state._performanceMetrics = {
        updateCount: 0,
        lastUpdateTime: 0,
        batchedUpdates: 0
      };
    })),
    
    setOperationStates: (states) => set(produce((state) => {
      Object.assign(state, states);
    })),

    // Optimized block status actions
    setBlockStatus: debouncedSetBlockStatus,
    
    setBlockStatusBatch: (updates) => set(produce((state) => {
      updates.forEach(({ blockId, status, action, message }) => {
        state.editorBlockStatuses[blockId] = {
          status,
          action,
          message,
          timestamp: Date.now(),
        } as BlockStatusEntry;
      });
      
      // Update performance metrics
      state._performanceMetrics.updateCount += updates.length;
      state._performanceMetrics.lastUpdateTime = Date.now();
      state._performanceMetrics.batchedUpdates++;
    })),
    
    clearBlockStatus: (blockId) => set(produce((state) => {
      delete state.editorBlockStatuses[blockId];
      
      // Also remove from pending updates if present
      pendingUpdates.delete(blockId);
    })),
    
    clearAllBlockStatuses: () => set(produce((state) => {
      state.editorBlockStatuses = {};
      
      // Clear pending updates
      pendingUpdates.clear();
      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }
    })),
  };
});

// Selector functions for optimized subscriptions
export const selectBlockStatus = (blockId: string) => (state: OptimizedClientChatOperationStore) => 
  state.editorBlockStatuses[blockId];

export const selectBlockStatuses = (blockIds: string[]) => (state: OptimizedClientChatOperationStore) => 
  blockIds.reduce((acc, blockId) => {
    const status = state.editorBlockStatuses[blockId];
    if (status) acc[blockId] = status;
    return acc;
  }, {} as BlockStatusMap);

export const selectAllBlockStatuses = (state: OptimizedClientChatOperationStore) => 
  state.editorBlockStatuses;

export const selectPerformanceMetrics = (state: OptimizedClientChatOperationStore) => 
  state._performanceMetrics;

// Hook for using optimized block status with memoization
export function useOptimizedBlockStatus(blockId: string) {
  return useOptimizedClientChatOperationStore(selectBlockStatus(blockId));
}

// Hook for using multiple block statuses efficiently
export function useOptimizedBlockStatuses(blockIds: string[]) {
  return useOptimizedClientChatOperationStore(selectBlockStatuses(blockIds));
}

// Performance monitoring hook
export function useStorePerformanceMetrics() {
  return useOptimizedClientChatOperationStore(selectPerformanceMetrics);
} 