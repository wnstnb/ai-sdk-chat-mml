import {
  normalizeBlockStatusUpdates,
  denormalizeBlockStatusMap,
  batchUpdateBlockStatuses,
  cleanupStaleEntries,
  groupBlockStatusesByType,
  createActionIndex,
  computeBlockStatusStats,
  createMemoizedSelector,
} from '../stateNormalization';
import type { BlockStatusMap, BlockStatusDetail } from '@/app/types/ai-editor.types';

describe('State Normalization Utilities', () => {
  describe('normalizeBlockStatusUpdates', () => {
    it('should normalize updates array to map correctly', () => {
      const updates = [
        {
          blockId: 'block-1',
          statusDetail: { status: 'loading' as const, timestamp: 1000 },
        },
        {
          blockId: 'block-2',
          statusDetail: { status: 'error' as const, timestamp: 2000, errorMessage: 'Failed' },
        },
      ];

      const result = normalizeBlockStatusUpdates(updates);

      expect(result).toEqual({
        'block-1': { status: 'loading', timestamp: 1000 },
        'block-2': { status: 'error', timestamp: 2000, errorMessage: 'Failed' },
      });
    });

    it('should handle empty updates array', () => {
      const result = normalizeBlockStatusUpdates([]);
      expect(result).toEqual({});
    });

    it('should handle duplicate block IDs by keeping the last one', () => {
      const updates = [
        {
          blockId: 'block-1',
          statusDetail: { status: 'loading' as const, timestamp: 1000 },
        },
        {
          blockId: 'block-1',
          statusDetail: { status: 'modified' as const, timestamp: 2000 },
        },
      ];

      const result = normalizeBlockStatusUpdates(updates);

      expect(result).toEqual({
        'block-1': { status: 'modified', timestamp: 2000 },
      });
    });
  });

  describe('denormalizeBlockStatusMap', () => {
    it('should convert map back to array correctly', () => {
      const blockStatusMap: BlockStatusMap = {
        'block-1': { status: 'loading', timestamp: 1000 },
        'block-2': { status: 'error', timestamp: 2000, errorMessage: 'Failed' },
      };

      const result = denormalizeBlockStatusMap(blockStatusMap);

      expect(result).toEqual([
        {
          blockId: 'block-1',
          statusDetail: { status: 'loading', timestamp: 1000 },
        },
        {
          blockId: 'block-2',
          statusDetail: { status: 'error', timestamp: 2000, errorMessage: 'Failed' },
        },
      ]);
    });

    it('should handle empty map', () => {
      const result = denormalizeBlockStatusMap({});
      expect(result).toEqual([]);
    });
  });

  describe('batchUpdateBlockStatuses', () => {
    it('should merge updates correctly', () => {
      const currentMap: BlockStatusMap = {
        'block-1': { status: 'idle', timestamp: 1000 },
        'block-2': { status: 'loading', timestamp: 2000 },
      };

      const updates: BlockStatusMap = {
        'block-2': { status: 'modified', timestamp: 3000 },
        'block-3': { status: 'error', timestamp: 4000, errorMessage: 'Failed' },
      };

      const result = batchUpdateBlockStatuses(currentMap, updates);

      expect(result).toEqual({
        'block-1': { status: 'idle', timestamp: 1000 },
        'block-2': { status: 'modified', timestamp: 3000 },
        'block-3': { status: 'error', timestamp: 4000, errorMessage: 'Failed' },
      });
    });

    it('should not mutate original maps', () => {
      const currentMap: BlockStatusMap = {
        'block-1': { status: 'idle', timestamp: 1000 },
      };

      const updates: BlockStatusMap = {
        'block-2': { status: 'loading', timestamp: 2000 },
      };

      const result = batchUpdateBlockStatuses(currentMap, updates);

      expect(currentMap).toEqual({
        'block-1': { status: 'idle', timestamp: 1000 },
      });
      expect(updates).toEqual({
        'block-2': { status: 'loading', timestamp: 2000 },
      });
      expect(result).not.toBe(currentMap);
      expect(result).not.toBe(updates);
    });
  });

  describe('cleanupStaleEntries', () => {
    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2023-01-01T12:00:00Z'));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should remove stale entries based on maxAgeMs', () => {
      const now = Date.now();
      const blockStatusMap: BlockStatusMap = {
        'fresh-block': { status: 'loading', timestamp: now - 1000 }, // 1 second ago
        'stale-block': { status: 'modified', timestamp: now - 10 * 60 * 1000 }, // 10 minutes ago
        'very-stale-block': { status: 'error', timestamp: now - 60 * 60 * 1000 }, // 1 hour ago
      };

      const result = cleanupStaleEntries(blockStatusMap, 5 * 60 * 1000); // 5 minutes threshold

      expect(result).toEqual({
        'fresh-block': { status: 'loading', timestamp: now - 1000 },
      });
    });

    it('should use default maxAgeMs when not provided', () => {
      const now = Date.now();
      const blockStatusMap: BlockStatusMap = {
        'recent-block': { status: 'loading', timestamp: now - 1000 },
        'old-block': { status: 'modified', timestamp: now - 10 * 60 * 1000 }, // 10 minutes ago
      };

      const result = cleanupStaleEntries(blockStatusMap); // default is 5 minutes

      expect(result).toEqual({
        'recent-block': { status: 'loading', timestamp: now - 1000 },
      });
    });

    it('should handle empty map', () => {
      const result = cleanupStaleEntries({});
      expect(result).toEqual({});
    });
  });

  describe('groupBlockStatusesByType', () => {
    it('should group blocks by status type correctly', () => {
      const blockStatusMap: BlockStatusMap = {
        'block-1': { status: 'loading', timestamp: 1000 },
        'block-2': { status: 'error', timestamp: 2000 },
        'block-3': { status: 'modified', timestamp: 3000 },
        'block-4': { status: 'loading', timestamp: 4000 },
        'block-5': { status: 'idle', timestamp: 5000 },
      };

      const result = groupBlockStatusesByType(blockStatusMap);

      expect(result).toEqual({
        idle: ['block-5'],
        loading: ['block-1', 'block-4'],
        modified: ['block-3'],
        error: ['block-2'],
      });
    });

    it('should handle empty map', () => {
      const result = groupBlockStatusesByType({});
      expect(result).toEqual({
        idle: [],
        loading: [],
        modified: [],
        error: [],
      });
    });
  });

  describe('createActionIndex', () => {
    it('should create action index correctly', () => {
      const blockStatusMap: BlockStatusMap = {
        'block-1': { status: 'loading', timestamp: 1000, action: 'insert' },
        'block-2': { status: 'error', timestamp: 2000, action: 'update' },
        'block-3': { status: 'modified', timestamp: 3000, action: 'delete' },
        'block-4': { status: 'loading', timestamp: 4000, action: 'insert' },
        'block-5': { status: 'idle', timestamp: 5000 }, // no action
      };

      const result = createActionIndex(blockStatusMap);

      expect(result).toEqual({
        insert: ['block-1', 'block-4'],
        update: ['block-2'],
        delete: ['block-3'],
        noAction: ['block-5'],
      });
    });

    it('should handle empty map', () => {
      const result = createActionIndex({});
      expect(result).toEqual({
        insert: [],
        update: [],
        delete: [],
        noAction: [],
      });
    });
  });

  describe('computeBlockStatusStats', () => {
    it('should compute statistics correctly', () => {
      const blockStatusMap: BlockStatusMap = {
        'block-1': { status: 'loading', timestamp: 1000 },
        'block-2': { status: 'error', timestamp: 2000 },
        'block-3': { status: 'modified', timestamp: 3000 },
        'block-4': { status: 'loading', timestamp: 4000 },
        'block-5': { status: 'idle', timestamp: 5000 },
        'block-6': { status: 'error', timestamp: 6000 },
      };

      const result = computeBlockStatusStats(blockStatusMap);

      expect(result).toEqual({
        totalBlocks: 6,
        loadingCount: 2,
        errorCount: 2,
        modifiedCount: 1,
        idleCount: 1,
        hasAnyLoading: true,
        hasAnyErrors: true,
        hasAnyModified: true,
      });
    });

    it('should handle empty map', () => {
      const result = computeBlockStatusStats({});
      expect(result).toEqual({
        totalBlocks: 0,
        loadingCount: 0,
        errorCount: 0,
        modifiedCount: 0,
        idleCount: 0,
        hasAnyLoading: false,
        hasAnyErrors: false,
        hasAnyModified: false,
      });
    });

    it('should handle map with all idle blocks', () => {
      const blockStatusMap: BlockStatusMap = {
        'block-1': { status: 'idle', timestamp: 1000 },
        'block-2': { status: 'idle', timestamp: 2000 },
      };

      const result = computeBlockStatusStats(blockStatusMap);

      expect(result).toEqual({
        totalBlocks: 2,
        loadingCount: 0,
        errorCount: 0,
        modifiedCount: 0,
        idleCount: 2,
        hasAnyLoading: false,
        hasAnyErrors: false,
        hasAnyModified: false,
      });
    });
  });

  describe('createMemoizedSelector', () => {
    it('should memoize selector results based on reference equality', () => {
      const selector = jest.fn((map: BlockStatusMap) => Object.keys(map).length);
      const memoizedSelector = createMemoizedSelector(selector);

      const map1: BlockStatusMap = {
        'block-1': { status: 'loading', timestamp: 1000 },
      };

      // First call
      const result1 = memoizedSelector(map1);
      expect(result1).toBe(1);
      expect(selector).toHaveBeenCalledTimes(1);

      // Second call with same reference
      const result2 = memoizedSelector(map1);
      expect(result2).toBe(1);
      expect(selector).toHaveBeenCalledTimes(1); // Should not call selector again

      // Third call with different reference but same content
      const map2: BlockStatusMap = {
        'block-1': { status: 'loading', timestamp: 1000 },
      };
      const result3 = memoizedSelector(map2);
      expect(result3).toBe(1);
      expect(selector).toHaveBeenCalledTimes(2); // Should call selector again
    });

    it('should use custom equality function when provided', () => {
      const selector = jest.fn((map: BlockStatusMap) => Object.keys(map));
      const isEqual = jest.fn((a: string[], b: string[]) => a.length === b.length);
      const memoizedSelector = createMemoizedSelector(selector, isEqual);

      const map1: BlockStatusMap = {
        'block-1': { status: 'loading', timestamp: 1000 },
      };

      const map2: BlockStatusMap = {
        'block-2': { status: 'error', timestamp: 2000 },
      };

      // First call
      const result1 = memoizedSelector(map1);
      expect(result1).toEqual(['block-1']);
      expect(selector).toHaveBeenCalledTimes(1);

      // Second call with different map but same length
      const result2 = memoizedSelector(map2);
      expect(result2).toEqual(['block-1']); // Should return memoized result
      expect(selector).toHaveBeenCalledTimes(2);
      expect(isEqual).toHaveBeenCalledWith(['block-1'], ['block-2']);
    });

    it('should handle undefined last result correctly', () => {
      const selector = jest.fn((map: BlockStatusMap) => Object.keys(map).length);
      const memoizedSelector = createMemoizedSelector(selector);

      const map: BlockStatusMap = {
        'block-1': { status: 'loading', timestamp: 1000 },
      };

      const result = memoizedSelector(map);
      expect(result).toBe(1);
      expect(selector).toHaveBeenCalledTimes(1);
    });
  });
}); 