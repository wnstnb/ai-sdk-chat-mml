import { BlockStatusMap, BlockStatusDetail } from '@/app/types/ai-editor.types';

// Utility functions for state normalization and optimization

/**
 * Normalizes a list of block status updates into a map for efficient lookups
 */
export const normalizeBlockStatusUpdates = (
  updates: Array<{ blockId: string; statusDetail: BlockStatusDetail }>
): BlockStatusMap => {
  return updates.reduce((acc, { blockId, statusDetail }) => {
    acc[blockId] = statusDetail;
    return acc;
  }, {} as BlockStatusMap);
};

/**
 * Denormalizes the block status map back to an array for iteration
 */
export const denormalizeBlockStatusMap = (blockStatusMap: BlockStatusMap) => {
  return Object.entries(blockStatusMap).map(([blockId, statusDetail]) => ({
    blockId,
    statusDetail,
  }));
};

/**
 * Batch update function that efficiently merges multiple status updates
 */
export const batchUpdateBlockStatuses = (
  currentMap: BlockStatusMap,
  updates: BlockStatusMap
): BlockStatusMap => {
  // Use object spread for shallow merge, which is efficient for most use cases
  return { ...currentMap, ...updates };
};

/**
 * Clean up old/stale entries from the block status map
 * Removes entries older than the specified threshold
 */
export const cleanupStaleEntries = (
  blockStatusMap: BlockStatusMap,
  maxAgeMs: number = 5 * 60 * 1000 // 5 minutes default
): BlockStatusMap => {
  const now = Date.now();
  const cleaned: BlockStatusMap = {};

  Object.entries(blockStatusMap).forEach(([blockId, statusDetail]) => {
    if (now - statusDetail.timestamp <= maxAgeMs) {
      cleaned[blockId] = statusDetail;
    }
  });

  return cleaned;
};

/**
 * Group block statuses by their status type for efficient filtering
 */
export const groupBlockStatusesByType = (blockStatusMap: BlockStatusMap) => {
  const groups = {
    idle: [] as string[],
    loading: [] as string[],
    modified: [] as string[],
    error: [] as string[],
  };

  Object.entries(blockStatusMap).forEach(([blockId, statusDetail]) => {
    if (statusDetail.status in groups) {
      groups[statusDetail.status].push(blockId);
    }
  });

  return groups;
};

/**
 * Creates an index for fast lookups by action type
 */
export const createActionIndex = (blockStatusMap: BlockStatusMap) => {
  const actionIndex = {
    insert: [] as string[],
    update: [] as string[],
    delete: [] as string[],
    noAction: [] as string[],
  };

  Object.entries(blockStatusMap).forEach(([blockId, statusDetail]) => {
    if (statusDetail.action) {
      actionIndex[statusDetail.action].push(blockId);
    } else {
      actionIndex.noAction.push(blockId);
    }
  });

  return actionIndex;
};

/**
 * Efficiently computes statistics for the block status map
 */
export const computeBlockStatusStats = (blockStatusMap: BlockStatusMap) => {
  let totalBlocks = 0;
  let loadingCount = 0;
  let errorCount = 0;
  let modifiedCount = 0;
  let idleCount = 0;

  Object.values(blockStatusMap).forEach((statusDetail) => {
    totalBlocks++;
    switch (statusDetail.status) {
      case 'loading':
        loadingCount++;
        break;
      case 'error':
        errorCount++;
        break;
      case 'modified':
        modifiedCount++;
        break;
      case 'idle':
        idleCount++;
        break;
    }
  });

  return {
    totalBlocks,
    loadingCount,
    errorCount,
    modifiedCount,
    idleCount,
    hasAnyLoading: loadingCount > 0,
    hasAnyErrors: errorCount > 0,
    hasAnyModified: modifiedCount > 0,
  };
};

/**
 * Memoized selector factory for creating optimized state slices
 */
export const createMemoizedSelector = <T>(
  selector: (blockStatusMap: BlockStatusMap) => T,
  isEqual?: (a: T, b: T) => boolean
) => {
  let lastResult: T;
  let lastInput: BlockStatusMap;

  return (blockStatusMap: BlockStatusMap): T => {
    // Simple reference equality check first
    if (blockStatusMap === lastInput) {
      return lastResult;
    }

    const result = selector(blockStatusMap);

    // Use custom equality check if provided, otherwise use strict equality
    if (isEqual ? isEqual(lastResult, result) : lastResult === result) {
      return lastResult;
    }

    lastInput = blockStatusMap;
    lastResult = result;
    return result;
  };
}; 