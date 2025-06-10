import { act, renderHook } from '@testing-library/react';
import { useEditorBlockStatusStore } from '@/app/stores/editorBlockStatusStore';
import {
  useBlockStatus,
  useAllBlockStatuses,
  useEditorInteraction,
  useEditorFeatureFlags,
  useBlockStatusActions,
} from '../useBlockStatus';

// Mock the store for isolated testing
jest.mock('@/app/stores/editorBlockStatusStore');

const mockUseEditorBlockStatusStore = useEditorBlockStatusStore as jest.MockedFunction<typeof useEditorBlockStatusStore>;

const mockStore = {
  blockStatusMap: {},
  interactionState: {
    lastFocusedBlockId: undefined,
    lastSelectionRange: undefined,
  },
  featureFlags: {
    enableRealtimeCollaboration: false,
    enableAdvancedHighlighting: true,
  },
  setBlockStatus: jest.fn(),
  setErrorStatus: jest.fn(),
  clearBlockStatus: jest.fn(),
  toggleFeatureFlag: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseEditorBlockStatusStore.mockReturnValue(mockStore);
});

describe('useBlockStatus', () => {
  const blockId = 'test-block';

  it('should return correct block status when block exists', () => {
    const blockStatus = {
      status: 'loading' as const,
      timestamp: Date.now(),
      message: 'Processing...',
    };
    
    // Mock the selector return value
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return blockStatus;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useBlockStatus(blockId));
    
    expect(result.current.blockStatus).toBe(blockStatus);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isModified).toBe(false);
    expect(result.current.isIdle).toBe(false);
  });

  it('should return idle state when block does not exist', () => {
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return undefined;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useBlockStatus(blockId));
    
    expect(result.current.blockStatus).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isModified).toBe(false);
    expect(result.current.isIdle).toBe(true);
  });

  it('should return correct status for error block', () => {
    const errorStatus = {
      status: 'error' as const,
      timestamp: Date.now(),
      errorMessage: 'Save failed',
    };
    
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return errorStatus;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useBlockStatus(blockId));
    
    expect(result.current.hasError).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isModified).toBe(false);
    expect(result.current.isIdle).toBe(false);
  });

  it('should return correct status for modified block', () => {
    const modifiedStatus = {
      status: 'modified' as const,
      timestamp: Date.now(),
      message: 'Content changed',
    };
    
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return modifiedStatus;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useBlockStatus(blockId));
    
    expect(result.current.isModified).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isIdle).toBe(false);
  });

  it('should format status correctly', () => {
    const blockStatus = {
      status: 'loading' as const,
      timestamp: Date.now(),
      message: 'Saving...',
    };
    
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return blockStatus;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useBlockStatus(blockId));
    
    expect(result.current.formattedStatus).toBe('Loading - Saving...');
  });

  it('should format error status correctly', () => {
    const errorStatus = {
      status: 'error' as const,
      timestamp: Date.now(),
      errorMessage: 'Network error',
    };
    
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return errorStatus;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useBlockStatus(blockId));
    
    expect(result.current.formattedStatus).toBe('Error (Error: Network error)');
  });

  it('should return default formatted status for non-existent block', () => {
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return undefined;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useBlockStatus(blockId));
    
    expect(result.current.formattedStatus).toBe('No status');
  });
});

describe('useAllBlockStatuses', () => {
  it('should return all block statuses and computed arrays', () => {
    const allStatuses = {
      'block-1': { status: 'loading' as const, timestamp: Date.now() },
      'block-2': { status: 'error' as const, timestamp: Date.now() },
      'block-3': { status: 'modified' as const, timestamp: Date.now() },
      'block-4': { status: 'idle' as const, timestamp: Date.now() },
    };
    
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return allStatuses;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useAllBlockStatuses());
    
    expect(result.current.allStatuses).toBe(allStatuses);
    expect(result.current.loadingBlocks).toEqual(['block-1']);
    expect(result.current.errorBlocks).toEqual(['block-2']);
    expect(result.current.modifiedBlocks).toEqual(['block-3']);
    expect(result.current.blockCount).toBe(4);
  });

  it('should return empty arrays when no blocks exist', () => {
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return {};
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useAllBlockStatuses());
    
    expect(result.current.allStatuses).toEqual({});
    expect(result.current.loadingBlocks).toEqual([]);
    expect(result.current.errorBlocks).toEqual([]);
    expect(result.current.modifiedBlocks).toEqual([]);
    expect(result.current.blockCount).toBe(0);
  });
});

describe('useEditorInteraction', () => {
  it('should return interaction state', () => {
    const interactionState = {
      lastFocusedBlockId: 'focused-block',
      lastSelectionRange: { start: 0, end: 10 },
    };
    
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return interactionState;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useEditorInteraction());
    
    expect(result.current.lastFocusedBlockId).toBe('focused-block');
    expect(result.current.lastSelectionRange).toEqual({ start: 0, end: 10 });
  });
});

describe('useEditorFeatureFlags', () => {
  it('should return feature flags and memoized accessors', () => {
    const featureFlags = {
      enableRealtimeCollaboration: true,
      enableAdvancedHighlighting: false,
    };
    
    mockUseEditorBlockStatusStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return featureFlags;
      }
      return mockStore;
    });
    
    const { result } = renderHook(() => useEditorFeatureFlags());
    
    expect(result.current.featureFlags).toBe(featureFlags);
    expect(result.current.isRealtimeCollaborationEnabled).toBe(true);
    expect(result.current.isAdvancedHighlightingEnabled).toBe(false);
  });
});

describe('useBlockStatusActions', () => {
  beforeEach(() => {
    mockUseEditorBlockStatusStore.mockReturnValue(mockStore);
  });

  it('should provide memoized action callbacks', () => {
    const { result } = renderHook(() => useBlockStatusActions());
    
    expect(typeof result.current.setBlockStatus).toBe('function');
    expect(typeof result.current.setErrorStatus).toBe('function');
    expect(typeof result.current.clearBlockStatus).toBe('function');
    expect(typeof result.current.toggleFeatureFlag).toBe('function');
  });

  it('should call setBlockStatus with correct parameters', () => {
    const { result } = renderHook(() => useBlockStatusActions());
    
    act(() => {
      result.current.setBlockStatus('block-1', 'loading', 'Processing', 'update');
    });
    
    expect(mockStore.setBlockStatus).toHaveBeenCalledWith('block-1', 'loading', 'Processing', 'update');
  });

  it('should call setErrorStatus with correct parameters', () => {
    const { result } = renderHook(() => useBlockStatusActions());
    
    act(() => {
      result.current.setErrorStatus('block-1', 'Error message');
    });
    
    expect(mockStore.setErrorStatus).toHaveBeenCalledWith('block-1', 'Error message');
  });

  it('should call clearBlockStatus with correct parameters', () => {
    const { result } = renderHook(() => useBlockStatusActions());
    
    act(() => {
      result.current.clearBlockStatus('block-1');
    });
    
    expect(mockStore.clearBlockStatus).toHaveBeenCalledWith('block-1');
  });

  it('should call toggleFeatureFlag with correct parameters', () => {
    const { result } = renderHook(() => useBlockStatusActions());
    
    act(() => {
      result.current.toggleFeatureFlag('enableRealtimeCollaboration');
    });
    
    expect(mockStore.toggleFeatureFlag).toHaveBeenCalledWith('enableRealtimeCollaboration');
  });

  it('should maintain referential equality for memoized callbacks', () => {
    const { result, rerender } = renderHook(() => useBlockStatusActions());
    
    const firstSetBlockStatus = result.current.setBlockStatus;
    const firstSetErrorStatus = result.current.setErrorStatus;
    
    rerender();
    
    expect(result.current.setBlockStatus).toBe(firstSetBlockStatus);
    expect(result.current.setErrorStatus).toBe(firstSetErrorStatus);
  });
}); 