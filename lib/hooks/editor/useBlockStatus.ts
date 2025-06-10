import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { BlockStatus } from '@/app/lib/clientChatOperationState';

/**
 * Custom hook to get the status of a specific editor block.
 * @param blockId The ID of the block to get the status for.
 * @returns The BlockStatus of the specified block, or IDLE if not found.
 */
export function useBlockStatus(blockId: string): BlockStatus {
  const statusEntry = useClientChatOperationStore((state) => state.editorBlockStatuses[blockId]);
  return statusEntry?.status || BlockStatus.IDLE;
} 