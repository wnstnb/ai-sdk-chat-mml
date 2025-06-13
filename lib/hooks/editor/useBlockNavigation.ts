import { useCallback, RefObject } from 'react';
import { BlockNoteEditor } from '@blocknote/core';
import { useEditorBlockStatusStore } from '@/app/stores/editorBlockStatusStore';
import { useHighlightingPreferences } from '@/lib/hooks/useAIPreferences';

interface ScrollToBlockOptions {
  /**
   * Scroll behavior (smooth or instant)
   */
  behavior?: ScrollBehavior;
  /**
   * Block alignment in viewport
   */
  block?: ScrollLogicalPosition;
  /**
   * Whether to focus the block after scrolling
   */
  focus?: boolean;
  /**
   * Whether to highlight the block temporarily
   */
  highlight?: boolean;
  /**
   * Duration of highlight in milliseconds
   */
  highlightDuration?: number;
  /**
   * Whether to update the block status as "focused"
   */
  updateStatus?: boolean;
}

interface UseBlockNavigationReturn {
  /**
   * Scroll to a specific block by ID
   */
  scrollToBlock: (
    blockId: string,
    options?: ScrollToBlockOptions
  ) => Promise<boolean>;
  
  /**
   * Scroll to multiple blocks sequentially
   */
  scrollToBlocks: (
    blockIds: string[],
    options?: ScrollToBlockOptions & { 
      /**
       * Delay between scrolling to each block
       */
      delay?: number;
    }
  ) => Promise<{ success: string[]; failed: string[] }>;
  
  /**
   * Find the DOM element for a block
   */
  findBlockElement: (blockId: string) => HTMLElement | null;
  
  /**
   * Get the current viewport position of a block
   */
  getBlockPosition: (blockId: string) => {
    isVisible: boolean;
    rect?: DOMRect;
    relativePosition?: 'above' | 'below' | 'partial';
  };
  
  /**
   * Scroll to the first visible block with a specific status
   */
  scrollToBlockWithStatus: (
    status: 'error' | 'modified' | 'loading',
    options?: ScrollToBlockOptions
  ) => Promise<boolean>;
}

const defaultScrollOptions: Required<ScrollToBlockOptions> = {
  behavior: 'smooth',
  block: 'center',
  focus: true,
  highlight: true,
  highlightDuration: 2000,
  updateStatus: false,
};

/**
 * Custom hook for block navigation and scroll-to functionality
 * Integrates with the block status system and toast notifications
 */
export const useBlockNavigation = (
  editorRef: RefObject<BlockNoteEditor | null>
): UseBlockNavigationReturn => {
  const { blockStatusMap, updateInteractionState } = useEditorBlockStatusStore();
  const highlightingPrefs = useHighlightingPreferences();

  /**
   * Find the DOM element for a block using BlockNote's data-id attribute
   */
  const findBlockElement = useCallback((blockId: string): HTMLElement | null => {
    if (!editorRef.current) return null;
    
    // BlockNote uses data-id attribute for block identification
    const editorContainer = editorRef.current.domElement || 
                           editorRef.current._tiptapEditor?.view?.dom?.closest('.bn-container');
    
    if (!editorContainer) return null;
    
    return editorContainer.querySelector(`[data-id="${blockId}"]`) as HTMLElement;
  }, [editorRef]);

  /**
   * Get the current viewport position of a block
   */
  const getBlockPosition = useCallback((blockId: string) => {
    const blockElement = findBlockElement(blockId);
    
    if (!blockElement) {
      return { isVisible: false };
    }

    const rect = blockElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    const isFullyVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
    const isPartiallyVisible = rect.bottom > 0 && rect.top < viewportHeight;
    
    let relativePosition: 'above' | 'below' | 'partial' | undefined;
    
    if (rect.bottom < 0) {
      relativePosition = 'above';
    } else if (rect.top > viewportHeight) {
      relativePosition = 'below';
    } else if (isPartiallyVisible && !isFullyVisible) {
      relativePosition = 'partial';
    }

    return {
      isVisible: isFullyVisible || isPartiallyVisible,
      rect,
      relativePosition,
    };
  }, [findBlockElement]);

  /**
   * Scroll to a specific block by ID
   */
  const scrollToBlock = useCallback(async (
    blockId: string,
    options: ScrollToBlockOptions = {}
  ): Promise<boolean> => {
    const opts = { ...defaultScrollOptions, ...options };
    
    // Validate block exists in editor
    if (!editorRef.current) {
      console.warn('[useBlockNavigation] Editor not available');
      return false;
    }

    const block = editorRef.current.getBlock(blockId);
    if (!block) {
      console.warn(`[useBlockNavigation] Block ${blockId} not found in editor`);
      return false;
    }

    // Find DOM element
    const blockElement = findBlockElement(blockId);
    if (!blockElement) {
      console.warn(`[useBlockNavigation] DOM element for block ${blockId} not found`);
      return false;
    }

    try {
      // Scroll to block
      blockElement.scrollIntoView({
        behavior: opts.behavior,
        block: opts.block,
      });

      // Wait for scroll animation to complete
      if (opts.behavior === 'smooth') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Focus the block if requested
      if (opts.focus) {
        // Update interaction state
        if (opts.updateStatus) {
          updateInteractionState({ lastFocusedBlockId: blockId });
        }
        
        // Set focus to the block element
        blockElement.focus();
      }

      // Add highlight effect if requested and highlighting is enabled in preferences
      if (opts.highlight && highlightingPrefs.enabled && highlightingPrefs.scrollToHighlight) {
        blockElement.classList.add('outline-pulse');
        setTimeout(() => {
          blockElement.classList.remove('outline-pulse');
        }, highlightingPrefs.duration || opts.highlightDuration);
      }

      return true;
    } catch (error) {
      console.error(`[useBlockNavigation] Error scrolling to block ${blockId}:`, error);
      return false;
    }
  }, [editorRef, findBlockElement, updateInteractionState]);

  /**
   * Scroll to multiple blocks sequentially
   */
  const scrollToBlocks = useCallback(async (
    blockIds: string[],
    options: ScrollToBlockOptions & { delay?: number } = {}
  ): Promise<{ success: string[]; failed: string[] }> => {
    const { delay = 1000, ...scrollOptions } = options;
    const success: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < blockIds.length; i++) {
      const blockId = blockIds[i];
      const result = await scrollToBlock(blockId, scrollOptions);
      
      if (result) {
        success.push(blockId);
      } else {
        failed.push(blockId);
      }

      // Add delay between scrolls (except for the last one)
      if (i < blockIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return { success, failed };
  }, [scrollToBlock]);

  /**
   * Scroll to the first visible block with a specific status
   */
  const scrollToBlockWithStatus = useCallback(async (
    status: 'error' | 'modified' | 'loading',
    options: ScrollToBlockOptions = {}
  ): Promise<boolean> => {
    // Find blocks with the specified status
    const blocksWithStatus = Object.entries(blockStatusMap)
      .filter(([, blockStatus]) => blockStatus.status === status)
      .map(([blockId]) => blockId);

    if (blocksWithStatus.length === 0) {
      console.warn(`[useBlockNavigation] No blocks found with status: ${status}`);
      return false;
    }

    // Try to scroll to the first block with the status
    return scrollToBlock(blocksWithStatus[0], options);
  }, [blockStatusMap, scrollToBlock]);

  return {
    scrollToBlock,
    scrollToBlocks,
    findBlockElement,
    getBlockPosition,
    scrollToBlockWithStatus,
  };
};

export default useBlockNavigation; 