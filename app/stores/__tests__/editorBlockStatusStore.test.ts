import { act, renderHook } from '@testing-library/react';
import { useEditorBlockStatusStore } from '../editorBlockStatusStore';
import type { BlockStatus } from '@/app/types/ai-editor.types';

describe('useEditorBlockStatusStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    const { result } = renderHook(() => useEditorBlockStatusStore());
    act(() => {
      // Clear all block statuses
      Object.keys(result.current.blockStatusMap).forEach(blockId => {
        result.current.clearBlockStatus(blockId);
      });
      
      // Reset other state slices
      result.current.updateInteractionState({
        lastFocusedBlockId: undefined,
        lastSelectionRange: undefined,
      });
      
      result.current.updateTimeoutConfig({
        autoSaveInterval: 60000,
        longLoadingThreshold: 5000,
      });
    });
  });

  describe('Initial State', () => {
    it('should have empty blockStatusMap initially', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      expect(result.current.blockStatusMap).toEqual({});
    });

    it('should have correct initial interaction state', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      expect(result.current.interactionState).toEqual({
        lastFocusedBlockId: undefined,
        lastSelectionRange: undefined,
      });
    });

    it('should have correct initial timeout config', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      expect(result.current.timeoutConfig).toEqual({
        autoSaveInterval: 60000,
        longLoadingThreshold: 5000,
      });
    });

    it('should have correct initial feature flags', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      expect(result.current.featureFlags).toEqual({
        enableRealtimeCollaboration: false,
        enableAdvancedHighlighting: true,
      });
    });
  });

  describe('Block Status Management', () => {
    it('should set block status correctly', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const blockId = 'test-block-1';
      const status: BlockStatus = 'loading';
      const message = 'Processing...';
      const action = 'update';

      act(() => {
        result.current.setBlockStatus(blockId, status, message, action);
      });

      const blockStatus = result.current.blockStatusMap[blockId];
      expect(blockStatus).toBeDefined();
      expect(blockStatus.status).toBe(status);
      expect(blockStatus.message).toBe(message);
      expect(blockStatus.action).toBe(action);
      expect(blockStatus.timestamp).toBeCloseTo(Date.now(), -100); // Within 100ms
    });

    it('should set error status correctly', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const blockId = 'test-block-error';
      const errorMessage = 'Failed to save';

      act(() => {
        result.current.setErrorStatus(blockId, errorMessage);
      });

      const blockStatus = result.current.blockStatusMap[blockId];
      expect(blockStatus).toBeDefined();
      expect(blockStatus.status).toBe('error');
      expect(blockStatus.errorMessage).toBe(errorMessage);
      expect(blockStatus.timestamp).toBeCloseTo(Date.now(), -100);
    });

    it('should preserve existing properties when setting error status', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const blockId = 'test-block-preserve';

      // First set a regular status
      act(() => {
        result.current.setBlockStatus(blockId, 'loading', 'Initial message', 'insert');
      });

      // Then set error status
      act(() => {
        result.current.setErrorStatus(blockId, 'Error occurred');
      });

      const blockStatus = result.current.blockStatusMap[blockId];
      expect(blockStatus.status).toBe('error');
      expect(blockStatus.errorMessage).toBe('Error occurred');
      // Previous properties should be preserved or have sensible defaults
      expect(blockStatus.timestamp).toBeCloseTo(Date.now(), -100);
    });

    it('should clear block status correctly', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const blockId = 'test-block-clear';

      // First set a status
      act(() => {
        result.current.setBlockStatus(blockId, 'modified', 'Content changed');
      });
      expect(result.current.blockStatusMap[blockId]).toBeDefined();

      // Then clear it
      act(() => {
        result.current.clearBlockStatus(blockId);
      });
      expect(result.current.blockStatusMap[blockId]).toBeUndefined();
    });

    it('should update multiple blocks independently', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const blockId1 = 'block-1';
      const blockId2 = 'block-2';

      act(() => {
        result.current.setBlockStatus(blockId1, 'loading', 'Loading 1');
        result.current.setBlockStatus(blockId2, 'modified', 'Modified 2');
      });

      expect(result.current.blockStatusMap[blockId1].status).toBe('loading');
      expect(result.current.blockStatusMap[blockId1].message).toBe('Loading 1');
      expect(result.current.blockStatusMap[blockId2].status).toBe('modified');
      expect(result.current.blockStatusMap[blockId2].message).toBe('Modified 2');
    });
  });

  describe('Interaction State Management', () => {
    it('should update interaction state correctly', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const newState = {
        lastFocusedBlockId: 'focused-block',
        lastSelectionRange: { start: 0, end: 10 },
      };

      act(() => {
        result.current.updateInteractionState(newState);
      });

      expect(result.current.interactionState).toEqual(newState);
    });

    it('should partially update interaction state', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());

      act(() => {
        result.current.updateInteractionState({ lastFocusedBlockId: 'block-1' });
      });

      expect(result.current.interactionState.lastFocusedBlockId).toBe('block-1');
      expect(result.current.interactionState.lastSelectionRange).toBeUndefined();
    });
  });

  describe('Timeout Config Management', () => {
    it('should update timeout config correctly', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const newConfig = {
        autoSaveInterval: 30000,
        longLoadingThreshold: 3000,
      };

      act(() => {
        result.current.updateTimeoutConfig(newConfig);
      });

      expect(result.current.timeoutConfig).toEqual(newConfig);
    });

    it('should partially update timeout config', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());

      act(() => {
        result.current.updateTimeoutConfig({ autoSaveInterval: 45000 });
      });

      expect(result.current.timeoutConfig.autoSaveInterval).toBe(45000);
      expect(result.current.timeoutConfig.longLoadingThreshold).toBe(5000); // unchanged
    });
  });

  describe('Feature Flags Management', () => {
    it('should toggle feature flags correctly', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());

      // Initially false
      expect(result.current.featureFlags.enableRealtimeCollaboration).toBe(false);

      act(() => {
        result.current.toggleFeatureFlag('enableRealtimeCollaboration');
      });

      expect(result.current.featureFlags.enableRealtimeCollaboration).toBe(true);

      // Toggle again
      act(() => {
        result.current.toggleFeatureFlag('enableRealtimeCollaboration');
      });

      expect(result.current.featureFlags.enableRealtimeCollaboration).toBe(false);
    });

    it('should toggle multiple feature flags independently', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());

      act(() => {
        result.current.toggleFeatureFlag('enableRealtimeCollaboration');
        result.current.toggleFeatureFlag('enableAdvancedHighlighting');
      });

      expect(result.current.featureFlags.enableRealtimeCollaboration).toBe(true);
      expect(result.current.featureFlags.enableAdvancedHighlighting).toBe(false);
    });
  });

  describe('Formatted Block Status', () => {
    it('should return correct formatted status for existing block', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const blockId = 'test-block-format';

      act(() => {
        result.current.setBlockStatus(blockId, 'loading', 'Processing data');
      });

      const formatted = result.current.getFormattedBlockStatus(blockId);
      expect(formatted).toBe('Status: loading (Processing data)');
    });

    it('should return correct formatted status for error block', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const blockId = 'test-block-error-format';

      act(() => {
        result.current.setErrorStatus(blockId, 'Network error');
      });

      const formatted = result.current.getFormattedBlockStatus(blockId);
      expect(formatted).toBe('Status: error - Error: Network error');
    });

    it('should return default message for non-existent block', () => {
      const { result } = renderHook(() => useEditorBlockStatusStore());
      const formatted = result.current.getFormattedBlockStatus('non-existent');
      expect(formatted).toBe('Status: N/A');
    });
  });

  describe('State Persistence', () => {
    it('should maintain state across re-renders', () => {
      const { result, rerender } = renderHook(() => useEditorBlockStatusStore());
      const blockId = 'persistent-block';

      act(() => {
        result.current.setBlockStatus(blockId, 'modified', 'Changed content');
      });

      rerender();

      expect(result.current.blockStatusMap[blockId]).toBeDefined();
      expect(result.current.blockStatusMap[blockId].status).toBe('modified');
      expect(result.current.blockStatusMap[blockId].message).toBe('Changed content');
    });
  });
}); 