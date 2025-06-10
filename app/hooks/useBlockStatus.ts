import { useMemo, useCallback } from 'react';
import { useEditorBlockStatusStore } from '@/app/stores/editorBlockStatusStore';
import { 
  selectBlockStatus, 
  selectAllBlockStatuses, 
  selectInteractionState,
  selectFeatureFlags 
} from '@/app/stores/selectors/editorBlockStatusSelectors';
import { BlockStatus } from '@/app/types/ai-editor.types';

// Custom hook for optimized block status access
export const useBlockStatus = (blockId: string) => {
  // Use selector to only re-render when this specific block changes
  const blockStatus = useEditorBlockStatusStore(
    useCallback((state) => selectBlockStatus(blockId)(state), [blockId])
  );

  // Memoized computed properties
  const isLoading = useMemo(() => blockStatus?.status === 'loading', [blockStatus?.status]);
  const hasError = useMemo(() => blockStatus?.status === 'error', [blockStatus?.status]);
  const isModified = useMemo(() => blockStatus?.status === 'modified', [blockStatus?.status]);
  const isIdle = useMemo(() => blockStatus?.status === 'idle' || !blockStatus, [blockStatus?.status]);

  // Memoized formatted status
  const formattedStatus = useMemo(() => {
    if (!blockStatus) return 'No status';
    let status = blockStatus.status.charAt(0).toUpperCase() + blockStatus.status.slice(1);
    if (blockStatus.message) status += ` - ${blockStatus.message}`;
    if (blockStatus.errorMessage) status += ` (Error: ${blockStatus.errorMessage})`;
    return status;
  }, [blockStatus]);

  return {
    blockStatus,
    isLoading,
    hasError,
    isModified,
    isIdle,
    formattedStatus,
  };
};

// Hook for accessing all block statuses with optimization
export const useAllBlockStatuses = () => {
  const allStatuses = useEditorBlockStatusStore(selectAllBlockStatuses);
  
  // Memoized computed arrays for different status types
  const loadingBlocks = useMemo(
    () => Object.keys(allStatuses).filter(id => allStatuses[id]?.status === 'loading'),
    [allStatuses]
  );

  const errorBlocks = useMemo(
    () => Object.keys(allStatuses).filter(id => allStatuses[id]?.status === 'error'),
    [allStatuses]
  );

  const modifiedBlocks = useMemo(
    () => Object.keys(allStatuses).filter(id => allStatuses[id]?.status === 'modified'),
    [allStatuses]
  );

  const blockCount = useMemo(() => Object.keys(allStatuses).length, [allStatuses]);

  return {
    allStatuses,
    loadingBlocks,
    errorBlocks,
    modifiedBlocks,
    blockCount,
  };
};

// Hook for editor interaction state
export const useEditorInteraction = () => {
  const interactionState = useEditorBlockStatusStore(selectInteractionState);
  
  return {
    lastFocusedBlockId: interactionState.lastFocusedBlockId,
    lastSelectionRange: interactionState.lastSelectionRange,
  };
};

// Hook for feature flags with memoization
export const useEditorFeatureFlags = () => {
  const featureFlags = useEditorBlockStatusStore(selectFeatureFlags);
  
  // Memoized feature flag accessors
  const isRealtimeCollaborationEnabled = useMemo(
    () => featureFlags.enableRealtimeCollaboration,
    [featureFlags.enableRealtimeCollaboration]
  );

  const isAdvancedHighlightingEnabled = useMemo(
    () => featureFlags.enableAdvancedHighlighting,
    [featureFlags.enableAdvancedHighlighting]
  );

  return {
    featureFlags,
    isRealtimeCollaborationEnabled,
    isAdvancedHighlightingEnabled,
  };
};

// Hook that provides actions with memoized callbacks
export const useBlockStatusActions = () => {
  const store = useEditorBlockStatusStore();

  const setBlockStatus = useCallback(
    (blockId: string, status: BlockStatus, message?: string, action?: 'insert' | 'update' | 'delete') => {
      store.setBlockStatus(blockId, status, message, action);
    },
    [store.setBlockStatus]
  );

  const setErrorStatus = useCallback(
    (blockId: string, errorMessage: string) => {
      store.setErrorStatus(blockId, errorMessage);
    },
    [store.setErrorStatus]
  );

  const clearBlockStatus = useCallback(
    (blockId: string) => {
      store.clearBlockStatus(blockId);
    },
    [store.clearBlockStatus]
  );

  const toggleFeatureFlag = useCallback(
    (flagName: keyof typeof store.featureFlags) => {
      store.toggleFeatureFlag(flagName);
    },
    [store.toggleFeatureFlag]
  );

  return {
    setBlockStatus,
    setErrorStatus,
    clearBlockStatus,
    toggleFeatureFlag,
  };
}; 