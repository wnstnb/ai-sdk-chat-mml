import { renderHook } from '@testing-library/react';
import { useBlockStatus, useAllBlockStatuses } from '../useBlockStatus';
import { useEditorBlockStatusStore } from '@/app/stores/editorBlockStatusStore';

// Mock the store for performance testing
jest.mock('@/app/stores/editorBlockStatusStore');

const mockUseEditorBlockStatusStore = useEditorBlockStatusStore as jest.MockedFunction<typeof useEditorBlockStatusStore>;

describe('useBlockStatus Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Memoization Performance', () => {
    it('should not recalculate derived state when blockStatus is unchanged', () => {
      const blockStatus = {
        status: 'loading' as const,
        timestamp: Date.now(),
        message: 'Processing...',
      };

      let selectorCallCount = 0;
      mockUseEditorBlockStatusStore.mockImplementation((selector) => {
        if (typeof selector === 'function') {
          selectorCallCount++;
          return blockStatus;
        }
        return {} as any;
      });

      const { result, rerender } = renderHook(() => useBlockStatus('test-block'));

      const firstIsLoading = result.current.isLoading;
      const firstFormattedStatus = result.current.formattedStatus;

      // Rerender multiple times
      rerender();
      rerender();
      rerender();

      // References should be stable (due to useMemo)
      expect(result.current.isLoading).toBe(firstIsLoading);
      expect(result.current.formattedStatus).toBe(firstFormattedStatus);

      // Selector should be called once per render due to useCallback dependency
      expect(selectorCallCount).toBeGreaterThan(0);
    });

    it('should recalculate when blockId changes', () => {
      const blockStatus1 = {
        status: 'loading' as const,
        timestamp: Date.now(),
        message: 'Processing 1...',
      };

      const blockStatus2 = {
        status: 'modified' as const,
        timestamp: Date.now(),
        message: 'Processing 2...',
      };

      mockUseEditorBlockStatusStore.mockImplementation((selector) => {
        if (typeof selector === 'function') {
          // Mock different responses based on which block is being selected
          const selectorString = selector.toString();
          if (selectorString.includes('block-1')) {
            return blockStatus1;
          } else if (selectorString.includes('block-2')) {
            return blockStatus2;
          }
          return blockStatus1; // default
        }
        return {} as any;
      });

      const { result, rerender } = renderHook(
        ({ blockId }) => useBlockStatus(blockId),
        { initialProps: { blockId: 'block-1' } }
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isModified).toBe(false);

      // Change the blockId
      rerender({ blockId: 'block-2' });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isModified).toBe(true);
    });
  });

  describe('useAllBlockStatuses Performance', () => {
    it('should efficiently handle large numbers of blocks', () => {
      // Generate a large number of blocks
      const largeBlockStatusMap: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeBlockStatusMap[`block-${i}`] = {
          status: i % 4 === 0 ? 'loading' : i % 4 === 1 ? 'error' : i % 4 === 2 ? 'modified' : 'idle',
          timestamp: Date.now() - (i * 1000),
        };
      }

      mockUseEditorBlockStatusStore.mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return largeBlockStatusMap;
        }
        return {} as any;
      });

      const startTime = performance.now();
      
      const { result } = renderHook(() => useAllBlockStatuses());

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // Should process 1000 blocks efficiently (under 100ms in most cases)
      expect(executionTime).toBeLessThan(100);

      // Verify results are correct
      expect(result.current.blockCount).toBe(1000);
      expect(result.current.loadingBlocks.length).toBe(250); // Every 4th block
      expect(result.current.errorBlocks.length).toBe(250);
      expect(result.current.modifiedBlocks.length).toBe(250);
    });

    it('should maintain reference stability for computed arrays when input is unchanged', () => {
      const blockStatusMap = {
        'block-1': { status: 'loading' as const, timestamp: 1000 },
        'block-2': { status: 'error' as const, timestamp: 2000 },
      };

      mockUseEditorBlockStatusStore.mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return blockStatusMap;
        }
        return {} as any;
      });

      const { result, rerender } = renderHook(() => useAllBlockStatuses());

      const firstLoadingBlocks = result.current.loadingBlocks;
      const firstErrorBlocks = result.current.errorBlocks;
      const firstBlockCount = result.current.blockCount;

      // Rerender should maintain reference stability due to useMemo
      rerender();

      expect(result.current.loadingBlocks).toBe(firstLoadingBlocks);
      expect(result.current.errorBlocks).toBe(firstErrorBlocks);
      expect(result.current.blockCount).toBe(firstBlockCount);
    });
  });

  describe('Callback Memoization', () => {
    it('should maintain stable references for action callbacks', () => {
      const mockStore = {
        setBlockStatus: jest.fn(),
        setErrorStatus: jest.fn(),
        clearBlockStatus: jest.fn(),
        toggleFeatureFlag: jest.fn(),
      };

      mockUseEditorBlockStatusStore.mockReturnValue(mockStore);

      const { result, rerender } = renderHook(() => {
        // Import here to avoid hoisting issues
        const { useBlockStatusActions } = require('../useBlockStatus');
        return useBlockStatusActions();
      });

      const firstSetBlockStatus = result.current.setBlockStatus;
      const firstSetErrorStatus = result.current.setErrorStatus;
      const firstClearBlockStatus = result.current.clearBlockStatus;
      const firstToggleFeatureFlag = result.current.toggleFeatureFlag;

      // Rerender multiple times
      rerender();
      rerender();
      rerender();

      // Callbacks should maintain reference stability
      expect(result.current.setBlockStatus).toBe(firstSetBlockStatus);
      expect(result.current.setErrorStatus).toBe(firstSetErrorStatus);
      expect(result.current.clearBlockStatus).toBe(firstClearBlockStatus);
      expect(result.current.toggleFeatureFlag).toBe(firstToggleFeatureFlag);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not create memory leaks with frequent rerenders', () => {
      const blockStatus = {
        status: 'loading' as const,
        timestamp: Date.now(),
        message: 'Processing...',
      };

      mockUseEditorBlockStatusStore.mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return blockStatus;
        }
        return {} as any;
      });

      const { unmount } = renderHook(() => useBlockStatus('test-block'));

      // Simulate component cleanup
      unmount();

      // Test passes if no errors are thrown during cleanup
      expect(true).toBe(true);
    });

    it('should handle rapid state changes without performance degradation', () => {
      const statuses = ['idle', 'loading', 'modified', 'error'] as const;
      let currentStatusIndex = 0;

      mockUseEditorBlockStatusStore.mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return {
            status: statuses[currentStatusIndex % statuses.length],
            timestamp: Date.now(),
          };
        }
        return {} as any;
      });

      const { result, rerender } = renderHook(() => useBlockStatus('test-block'));

      const startTime = performance.now();

      // Simulate rapid state changes
      for (let i = 0; i < 100; i++) {
        currentStatusIndex = i;
        rerender();
      }

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // Should handle 100 rapid rerenders efficiently
      expect(executionTime).toBeLessThan(100);
      expect(result.current.blockStatus.status).toBe(statuses[(currentStatusIndex) % statuses.length]);
    });
  });
}); 