import { renderHook, act } from '@testing-library/react';
import { useBlockStatus } from '../useBlockStatus';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { BlockStatus, BlockStatusMap, BlockStatusEntry } from '@/app/lib/clientChatOperationState';

// Mock the store
jest.mock('@/lib/stores/useClientChatOperationStore');

// Helper to set up the mock store state for a test
const mockUseClientChatOperationStore = useClientChatOperationStore as jest.MockedFunction<typeof useClientChatOperationStore>;

describe('useBlockStatus', () => {
  const mockEditorBlockStatuses: BlockStatusMap = {};

  beforeEach(() => {
    // Reset mocks and mock store state before each test
    mockUseClientChatOperationStore.mockImplementation((selector) => {
      // Simulate the selector logic of Zustand
      return selector({ editorBlockStatuses: mockEditorBlockStatuses } as any);
    });
    // Clear the mockEditorBlockStatuses for a clean state in each test, unless specifically set
    for (const key in mockEditorBlockStatuses) {
      delete mockEditorBlockStatuses[key];
    }
  });

  it('should return BlockStatus.IDLE if blockId is not found', () => {
    const { result } = renderHook(() => useBlockStatus('nonExistentBlock'));
    expect(result.current).toBe(BlockStatus.IDLE);
  });

  it('should return BlockStatus.IDLE if editorBlockStatuses is empty', () => {
    const { result } = renderHook(() => useBlockStatus('someBlock'));
    expect(result.current).toBe(BlockStatus.IDLE);
  });

  it('should return the correct status if blockId is found', () => {
    mockEditorBlockStatuses['testBlock1'] = {
      status: BlockStatus.LOADING,
      timestamp: Date.now(),
    };
    const { result } = renderHook(() => useBlockStatus('testBlock1'));
    expect(result.current).toBe(BlockStatus.LOADING);
  });

  it('should return BlockStatus.MODIFIED correctly', () => {
    mockEditorBlockStatuses['testBlock2'] = {
      status: BlockStatus.MODIFIED,
      timestamp: Date.now(),
    };
    const { result } = renderHook(() => useBlockStatus('testBlock2'));
    expect(result.current).toBe(BlockStatus.MODIFIED);
  });

  it('should return BlockStatus.ERROR correctly', () => {
    mockEditorBlockStatuses['testBlock3'] = {
      status: BlockStatus.ERROR,
      timestamp: Date.now(),
      message: 'Test error',
    };
    const { result } = renderHook(() => useBlockStatus('testBlock3'));
    expect(result.current).toBe(BlockStatus.ERROR);
  });

  it('should update when the store state changes for the specific block', () => {
    const blockId = 'dynamicBlock';
    mockEditorBlockStatuses[blockId] = { status: BlockStatus.IDLE, timestamp: Date.now() };

    const { result, rerender } = renderHook(() => useBlockStatus(blockId));
    expect(result.current).toBe(BlockStatus.IDLE);

    // Simulate store update for this block
    act(() => {
      mockEditorBlockStatuses[blockId] = { status: BlockStatus.LOADING, timestamp: Date.now() };
      // To make the hook re-run with new state from mock, we need to simulate how Zustand would trigger it.
      // For this simple selector, just re-rendering the hook after changing the mock data source works.
      // In more complex scenarios, you might need to mock the subscribe/setState part of Zustand.
      mockUseClientChatOperationStore.mockImplementation((selector) => {
        return selector({ editorBlockStatuses: mockEditorBlockStatuses } as any);
      });
    });
    rerender(); // Rerender the hook
    expect(result.current).toBe(BlockStatus.LOADING);

    act(() => {
        mockEditorBlockStatuses[blockId] = { status: BlockStatus.MODIFIED, timestamp: Date.now() };
        mockUseClientChatOperationStore.mockImplementation((selector) => {
            return selector({ editorBlockStatuses: mockEditorBlockStatuses } as any);
        });
    });
    rerender();
    expect(result.current).toBe(BlockStatus.MODIFIED);
  });

   it('should not update for unrelated block changes', () => {
    const targetBlockId = 'targetBlock';
    const otherBlockId = 'otherBlock';

    mockEditorBlockStatuses[targetBlockId] = { status: BlockStatus.IDLE, timestamp: Date.now() };
    mockEditorBlockStatuses[otherBlockId] = { status: BlockStatus.IDLE, timestamp: Date.now() };

    const { result, rerender } = renderHook(() => useBlockStatus(targetBlockId));
    expect(result.current).toBe(BlockStatus.IDLE);

    // Simulate store update for the *other* block
    act(() => {
      mockEditorBlockStatuses[otherBlockId] = { status: BlockStatus.LOADING, timestamp: Date.now() };
      mockUseClientChatOperationStore.mockImplementation((selector) => {
        return selector({ editorBlockStatuses: mockEditorBlockStatuses } as any);
      });
    });
    rerender();
    // The status for targetBlockId should remain IDLE
    expect(result.current).toBe(BlockStatus.IDLE);
  });
}); 