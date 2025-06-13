import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { BlockStatus, type BlockStatusEntry } from '@/app/lib/clientChatOperationState';

/**
 * Extended block status information for detailed highlighting
 */
export interface BlockStatusDetails extends BlockStatusEntry {
  /** Whether the block is currently highlighted */
  isHighlighted: boolean;
  /** Time elapsed since the status was set (in milliseconds) */
  elapsedMs: number;
  /** Whether this is a newly inserted block */
  isNewContent: boolean;
  /** Whether this is updated/modified content */
  isUpdatedContent: boolean;
  /** Whether this block has an error state */
  hasError: boolean;
}

/**
 * Custom hook to get detailed status information for a specific editor block.
 * This hook provides extended information needed for highlighting components,
 * including timing data, action types, and computed states.
 * 
 * @param blockId The ID of the block to get detailed status for
 * @returns Extended BlockStatusDetails with computed highlighting information
 */
export function useBlockStatusDetails(blockId: string): BlockStatusDetails {
  const statusEntry = useClientChatOperationStore((state) => state.editorBlockStatuses[blockId]);
  
  // Default values for blocks without status entries
  const defaultStatus: BlockStatusEntry = {
    status: BlockStatus.IDLE,
    timestamp: Date.now(),
    action: undefined,
    message: undefined
  };
  
  // Use the stored entry or default
  const entry = statusEntry || defaultStatus;
  
  // Calculate timing information
  const currentTime = Date.now();
  const elapsedMs = currentTime - entry.timestamp;
  
  // Determine highlighting states
  const isHighlighted = entry.status === BlockStatus.MODIFIED;
  const isNewContent = entry.action === 'insert';
  const isUpdatedContent = entry.action === 'update';
  const hasError = entry.status === BlockStatus.ERROR;
  
  return {
    ...entry,
    isHighlighted,
    elapsedMs,
    isNewContent,
    isUpdatedContent,
    hasError
  };
}

/**
 * Hook to check if a block should show highlight animation based on duration
 * 
 * @param blockId The ID of the block to check
 * @param highlightDuration Duration in milliseconds (0 = until clicked, default: 3000ms)
 * @returns Whether the block should currently show highlighting
 */
export function useBlockHighlightState(blockId: string, highlightDuration: number = 3000): boolean {
  const { isHighlighted, elapsedMs } = useBlockStatusDetails(blockId);
  
  // If highlighting is disabled for this block, don't show
  if (!isHighlighted) {
    return false;
  }
  
  // Special case: highlightDuration = 0 means "until clicked" (permanent highlight)
  if (highlightDuration === 0) {
    return true;
  }
  
  // Normal time-based highlighting
  return elapsedMs < highlightDuration;
}

/**
 * Hook to get the remaining highlight progress as a percentage
 * 
 * @param blockId The ID of the block to check
 * @param highlightDuration Duration in milliseconds (0 = until clicked, default: 3000ms)
 * @returns Progress value between 0 and 1 (0 = expired, 1 = just started)
 */
export function useBlockHighlightProgress(blockId: string, highlightDuration: number = 3000): number {
  const { isHighlighted, elapsedMs } = useBlockStatusDetails(blockId);
  
  if (!isHighlighted) {
    return 0;
  }
  
  // Special case: highlightDuration = 0 means "until clicked" (always full progress)
  if (highlightDuration === 0) {
    return 1;
  }
  
  const remainingMs = Math.max(0, highlightDuration - elapsedMs);
  return remainingMs / highlightDuration;
}

/**
 * Utility function to get human-readable status description
 */
export function getBlockStatusDescription(details: BlockStatusDetails): string {
  if (details.hasError) {
    return details.message || 'An error occurred';
  }
  
  if (details.status === BlockStatus.LOADING) {
    return 'AI is processing this content...';
  }
  
  if (details.isHighlighted) {
    if (details.isNewContent) {
      return 'New content added by AI';
    }
    if (details.isUpdatedContent) {
      return 'Content updated by AI';
    }
    return 'Content modified by AI';
  }
  
  return 'Content is ready';
} 