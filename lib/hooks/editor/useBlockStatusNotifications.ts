import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useAllBlockStatuses } from '@/app/hooks/useBlockStatus';
import { createBlockStatusToast } from '@/lib/utils/aiToast';
import { useBlockNavigation } from './useBlockNavigation';
import { BlockStatus } from '@/app/types/ai-editor.types';
import { useModalStore } from '@/stores/useModalStore';

interface NotificationOptions {
  /**
   * Whether to show notifications for block status changes
   */
  enabled?: boolean;
  
  /**
   * Minimum time between notifications to prevent spam (in ms)
   */
  debounceTime?: number;
  
  /**
   * Which status changes should trigger notifications
   */
  notifyOnStatus?: BlockStatus[];
  
  /**
   * Maximum number of blocks to show in a single notification
   */
  maxBlocksPerNotification?: number;
  
  /**
   * Whether to automatically group similar status changes
   */
  groupSimilarChanges?: boolean;
}

const DEFAULT_OPTIONS: Required<NotificationOptions> = {
  enabled: true,
  debounceTime: 1000, // 1 second
  notifyOnStatus: ['modified', 'error'],
  maxBlocksPerNotification: 5,
  groupSimilarChanges: true,
};

/**
 * Custom hook that automatically shows toast notifications based on block status changes.
 * Provides intelligent grouping and debouncing to prevent notification overload.
 */
export function useBlockStatusNotifications(options: NotificationOptions = {}) {
  const config = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);
  const { editorRef } = useModalStore();
  
  // Create a fallback ref if editorRef is null
  const fallbackRef = useRef<any>(null);
  const safeEditorRef = editorRef || fallbackRef;
  
  const { scrollToBlock } = useBlockNavigation(safeEditorRef);
  const { allStatuses } = useAllBlockStatuses();
  
  // Track previous state to detect changes
  const prevStatusesRef = useRef<typeof allStatuses>({});
  const lastNotificationRef = useRef<number>(0);

  /**
   * Show a toast notification for block status changes
   */
  const showNotification = useCallback((
    blockIds: string[],
    status: BlockStatus,
    action?: 'insert' | 'update' | 'delete'
  ) => {
    const onScrollToChange = (blockId: string) => {
      scrollToBlock(blockId, {
        highlight: true,
        focus: true,
        behavior: 'smooth',
      });
    };

    let message: string;
    const blockCount = blockIds.length;

    if (status === 'error') {
      message = blockCount === 1 ? 'Error processing block' : `Error processing ${blockCount} blocks`;
    } else if (status === 'modified') {
      switch (action) {
        case 'insert':
          message = blockCount === 1 ? 'New block added' : `${blockCount} blocks added`;
          break;
        case 'update':
          message = blockCount === 1 ? 'Block updated' : `${blockCount} blocks updated`;
          break;
        case 'delete':
          message = blockCount === 1 ? 'Block deleted' : `${blockCount} blocks deleted`;
          break;
        default:
          message = blockCount === 1 ? 'Block modified' : `${blockCount} blocks modified`;
      }
    } else {
      message = `${blockCount} block${blockCount > 1 ? 's' : ''} ${status}`;
    }

    createBlockStatusToast(blockIds, status, action, message, onScrollToChange);
  }, [scrollToBlock]);

  useEffect(() => {
    if (!config.enabled) return;

    const now = Date.now();
    const timeSinceLastNotification = now - lastNotificationRef.current;
    
    if (timeSinceLastNotification < config.debounceTime) {
      return;
    }

    const prevStatuses = prevStatusesRef.current;
    const changedBlocks: Array<{
      blockId: string;
      status: BlockStatus;
      action?: 'insert' | 'update' | 'delete';
    }> = [];

    Object.entries(allStatuses).forEach(([blockId, currentStatus]) => {
      if (!currentStatus || !config.notifyOnStatus.includes(currentStatus.status)) {
        return;
      }

      const prevStatus = prevStatuses[blockId];
      const hasChanged = !prevStatus || 
        prevStatus.status !== currentStatus.status ||
        prevStatus.timestamp !== currentStatus.timestamp;

      if (hasChanged) {
        changedBlocks.push({
          blockId,
          status: currentStatus.status,
          action: currentStatus.action,
        });
      }
    });

    if (changedBlocks.length > 0) {
      if (config.groupSimilarChanges) {
        const groups = new Map<string, string[]>();
        
        changedBlocks.forEach(({ blockId, status, action }) => {
          const key = `${status}-${action || 'none'}`;
          const existing = groups.get(key) || [];
          if (existing.length < config.maxBlocksPerNotification) {
            existing.push(blockId);
            groups.set(key, existing);
          }
        });

        groups.forEach((blockIds, key) => {
          const [status, action] = key.split('-');
          showNotification(
            blockIds, 
            status as BlockStatus, 
            action === 'none' ? undefined : action as 'insert' | 'update' | 'delete'
          );
        });
      } else {
        changedBlocks.forEach(({ blockId, status, action }) => {
          showNotification([blockId], status, action);
        });
      }
      
      lastNotificationRef.current = now;
    }

    prevStatusesRef.current = { ...allStatuses };
  }, [allStatuses, config, showNotification]);

  return {
    /**
     * Manually trigger a notification for specific blocks
     */
    notifyBlockStatus: useCallback((
      blockIds: string[],
      status: BlockStatus,
      action?: 'insert' | 'update' | 'delete',
      customMessage?: string
    ) => {
      if (!config.enabled) return;
      
      const onScrollToChange = (blockId: string) => {
        scrollToBlock(blockId, {
          highlight: true,
          focus: true,
          behavior: 'smooth',
        });
      };

      createBlockStatusToast(blockIds, status, action, customMessage, onScrollToChange);
    }, [config.enabled, scrollToBlock]),
    
    /**
     * Current configuration
     */
    config,
    
    /**
     * Statistics about notifications
     */
    stats: {
      lastNotificationTime: lastNotificationRef.current,
    },
  };
}

export default useBlockStatusNotifications; 