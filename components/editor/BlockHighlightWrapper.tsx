'use client';

import React, { useEffect, useRef } from 'react';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { getHighlightColors } from '@/lib/highlightColors';
import { useHighlightingPreferences } from '@/lib/hooks/useAIPreferences';
import { BlockStatus } from '@/app/lib/clientChatOperationState';

interface BlockHighlightWrapperProps {
  children: React.ReactNode;
  isDarkTheme?: boolean;
}

/**
 * BlockHighlightWrapper provides visual highlighting for BlockNote blocks
 * during AI operations. Uses DOM-based approach for reliable block targeting.
 */
export const BlockHighlightWrapper: React.FC<BlockHighlightWrapperProps> = ({
  children,
  isDarkTheme = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const clearBlockStatus = useClientChatOperationStore((state) => state.clearBlockStatus);
  const blockStatuses = useClientChatOperationStore((state) => state.editorBlockStatuses);
  const highlightingPrefs = useHighlightingPreferences();
  
  const activeHighlights = useRef<Map<string, {
    overlay: HTMLDivElement;
    interval: NodeJS.Timeout;
    startTime: number;
  }>>(new Map());

  console.log('[BlockHighlight] useEffect triggered:', {
    editorRefExists: !!editorRef.current,
    statusCount: Object.keys(blockStatuses).length,
    statuses: blockStatuses
  });

  useEffect(() => {
    if (!editorRef.current) return;

    const activeBlockIds = Object.keys(blockStatuses);
    const currentHighlights = activeHighlights.current;

    // Remove highlights for blocks that no longer have status
    currentHighlights.forEach((highlight, blockId) => {
      if (!activeBlockIds.includes(blockId)) {
        console.log(`[BlockHighlight] Removing highlight for block ${blockId}`);
        clearInterval(highlight.interval);
        highlight.overlay.remove();
        currentHighlights.delete(blockId);
      }
    });

    // Add or update highlights for active blocks - only if highlighting is enabled
    if (!highlightingPrefs.enabled) {
      return;
    }
    
    activeBlockIds.forEach((blockId) => {
      const status = blockStatuses[blockId];
      if (!status) return;

             // Determine action type for color selection
       const action = status.status === BlockStatus.ERROR ? 'error' : 
                     status.action === 'insert' ? 'insert' :
                     status.action === 'update' ? 'update' :
                     status.action === 'delete' ? 'delete' : 'update';
      
      const colors = getHighlightColors(action, isDarkTheme);
      
      console.log(`[BlockHighlight] Attempting to highlight block ${blockId} with ${action} color ${colors.background}`);

      // Find the block element
      const blockElement = editorRef.current?.querySelector(`[data-id="${blockId}"]`);
      if (!blockElement) {
        console.log(`[BlockHighlight] Block element not found for ${blockId}`);
        return;
      }

      console.log(`[BlockHighlight] Found block ${blockId}:`, {
        type: (blockElement as any).type,
        contentType: (blockElement as any).contentType,
        isArray: Array.isArray((blockElement as any).content),
        content: (blockElement as any).content
      });

      // Create or update highlight overlay
      let highlight = currentHighlights.get(blockId);
      
      if (!highlight) {
        // Create new highlight overlay
        const overlay = document.createElement('div');
        overlay.className = 'block-highlight-overlay';
        overlay.style.cssText = `
          position: absolute;
          top: -2px;
          left: -2px;
          right: -2px;
          bottom: -2px;
          pointer-events: none;
          border-radius: 8px;
          z-index: 1;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(0.5px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05), 
                      0 1px 2px rgba(0, 0, 0, 0.05),
                      inset 0 1px 0 rgba(255, 255, 255, 0.05);
        `;

        // Add subtle gradient overlay for depth
        const gradientOverlay = document.createElement('div');
        gradientOverlay.style.cssText = `
          position: absolute;
          inset: 0;
          border-radius: 8px;
          background: linear-gradient(
            135deg, 
            ${colors.background}30 0%, 
            ${colors.background}25 100%
          );
          border: 1px solid ${colors.border}50;
        `;
        overlay.appendChild(gradientOverlay);

        // Add delete styling for delete actions
        if (action === 'delete') {
          // Apply strikethrough and opacity directly to the block content
          const blockElement = editorRef.current?.querySelector(`[data-id="${blockId}"]`);
          if (blockElement) {
            (blockElement as HTMLElement).style.textDecoration = 'line-through';
            (blockElement as HTMLElement).style.opacity = '0.7';
          }
        }

        // Add accent bar with enhanced styling (offset from text like IDE diffs)
        const accentBar = document.createElement('div');
        accentBar.style.cssText = `
          position: absolute;
          left: -12px;
          top: 0;
          bottom: 0;
          width: 4px;
          background: linear-gradient(
            to bottom,
            ${colors.accent},
            ${colors.border}
          );
          border-radius: 8px;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
        `;
        overlay.appendChild(accentBar);

        // Add subtle pulse animation on creation
        overlay.style.animation = 'highlight-enter 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

        // Position overlay relative to block
        const blockRect = blockElement.getBoundingClientRect();
        const editorRect = editorRef.current!.getBoundingClientRect();
        
        overlay.style.position = 'absolute';
        overlay.style.top = `${blockRect.top - editorRect.top - 2}px`;
        overlay.style.left = `${blockRect.left - editorRect.left - 2}px`;
        overlay.style.width = `${blockRect.width + 4}px`;
        overlay.style.height = `${blockRect.height + 4}px`;

        // Add click handler for dismiss
        overlay.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log(`[BlockHighlight] User clicked to dismiss highlight for ${blockId}`);
          
          // Cleanup delete styling if dismissing a delete action
          if (action === 'delete') {
            const blockElement = editorRef.current?.querySelector(`[data-id="${blockId}"]`);
            if (blockElement) {
              (blockElement as HTMLElement).style.textDecoration = '';
              (blockElement as HTMLElement).style.opacity = '';
            }
          }
          
          clearBlockStatus(blockId);
        });

        // Add cursor pointer to indicate interactivity
        overlay.style.cursor = 'pointer';

        editorRef.current!.appendChild(overlay);

        // Create progress update interval with preference-based duration
        const startTime = Date.now();
        const userDuration = highlightingPrefs.duration || 5000; // Use user preference or fallback
        const holdDuration = Math.max(1000, userDuration * 0.8); // Hold for 80% of duration
        const fadeDuration = Math.max(500, userDuration * 0.2); // Fade for 20% of duration
        const totalDuration = holdDuration + fadeDuration;
        
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          let opacity = 0.6;
          
          if (elapsed < holdDuration) {
            // Hold period - maintain full opacity
            opacity = 0.6;
          } else {
            // Fade period - calculate fade progress
            const fadeElapsed = elapsed - holdDuration;
            const fadeProgress = Math.min(fadeElapsed / fadeDuration, 1);
            opacity = 0.6 - (fadeProgress * 0.5); // Fade from 0.6 to 0.1
          }
          
          const totalProgress = Math.min(elapsed / totalDuration, 1);
          
          if (overlay.parentNode) {
            overlay.style.opacity = opacity.toString();
            
            // Development indicator updates (disabled)
            // const devIndicator = overlay.querySelector('.dev-indicator');
            // if (devIndicator && process.env.NODE_ENV === 'development') {
            //   (devIndicator as HTMLElement).textContent = 
            //     `${action} (${Math.round((1 - totalProgress) * 100)}%)`;
            // }
          }

          if (totalProgress >= 1) {
            console.log(`[BlockHighlight] Auto-dismissing highlight for ${blockId} after timeout`);
            clearInterval(interval);
            
            // Handle delete action - actually remove the block
            if (action === 'delete') {
              const blockElement = editorRef.current?.querySelector(`[data-id="${blockId}"]`);
              if (blockElement) {
                console.log(`[BlockHighlight] Removing block ${blockId} after delete preview`);
                // Trigger block removal through editor
                const deleteEvent = new CustomEvent('block-delete-confirmed', {
                  detail: { blockId }
                });
                document.dispatchEvent(deleteEvent);
              }
            }
            
            // Cleanup delete styling if it was applied
            if (action === 'delete') {
              const blockElement = editorRef.current?.querySelector(`[data-id="${blockId}"]`);
              if (blockElement) {
                (blockElement as HTMLElement).style.textDecoration = '';
                (blockElement as HTMLElement).style.opacity = '';
              }
            }
            
            overlay.remove();
            currentHighlights.delete(blockId);
            clearBlockStatus(blockId);
          }
        }, 50); // Update every 50ms for smooth animation

        highlight = {
          overlay,
          interval,
          startTime
        };

        currentHighlights.set(blockId, highlight);

        // Development indicator creation (disabled)
        // if (process.env.NODE_ENV === 'development') {
        //   const devIndicator = document.createElement('div');
        //   devIndicator.className = 'dev-indicator';
        //   devIndicator.style.cssText = `
        //     position: absolute;
        //     top: 4px;
        //     right: 4px;
        //     background: ${colors.accent};
        //     color: ${colors.text};
        //     padding: 2px 6px;
        //     border-radius: 4px;
        //     font-size: 10px;
        //     font-weight: 600;
        //     pointer-events: none;
        //     box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        //   `;
        //   devIndicator.textContent = `${action} (100%)`;
        //   highlight.overlay.appendChild(devIndicator);
        // }

        console.log(`[BlockHighlight] Applied ${action} highlight to block ${blockId}`);
      }
    });

  }, [blockStatuses, isDarkTheme, clearBlockStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeHighlights.current.forEach((highlight) => {
        clearInterval(highlight.interval);
        highlight.overlay.remove();
      });
      activeHighlights.current.clear();
    };
  }, []);

  // Add CSS keyframes for highlight animations
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes highlight-enter {
        0% {
          opacity: 0;
          transform: scale(0.98);
        }
        50% {
          opacity: 1;
          transform: scale(1.01);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      .block-highlight-overlay:hover {
        transform: scale(1.005) !important;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15), 
                    0 2px 6px rgba(0, 0, 0, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
      }
      
      @media (prefers-reduced-motion: reduce) {
        .block-highlight-overlay,
        .block-highlight-overlay * {
          animation: none !important;
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, []);

  return (
    <div ref={editorRef} style={{ position: 'relative' }}>
      {children}
    </div>
  );
}; 