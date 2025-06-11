'use client';

import React, { useEffect, useRef } from 'react';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { getHighlightColors } from '@/lib/highlightColors';
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

    // Add or update highlights for active blocks
    activeBlockIds.forEach((blockId) => {
      const status = blockStatuses[blockId];
      if (!status) return;

             // Determine action type for color selection
       const action = status.status === BlockStatus.ERROR ? 'error' : 
                     status.action === 'insert' ? 'insert' :
                     status.action === 'update' ? 'update' : 'update';
      
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
            ${colors.background}20 0%, 
            ${colors.background}15 100%
          );
          border: 1px solid ${colors.border}40;
        `;
        overlay.appendChild(gradientOverlay);

        // Add accent bar with enhanced styling
        const accentBar = document.createElement('div');
        accentBar.style.cssText = `
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: linear-gradient(
            to bottom,
            ${colors.accent},
            ${colors.border}
          );
          border-radius: 8px 0 0 8px;
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
          clearBlockStatus(blockId);
        });

        // Add cursor pointer to indicate interactivity
        overlay.style.cursor = 'pointer';

        editorRef.current!.appendChild(overlay);

        // Create progress update interval
        const startTime = Date.now();
        const duration = 3000; // 3 seconds
        
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const opacity = 0.6 - (progress * 0.5); // Fade from 0.6 to 0.1
          
          if (overlay.parentNode) {
            overlay.style.opacity = opacity.toString();
            
            // Update development indicator if present
            const devIndicator = overlay.querySelector('.dev-indicator');
            if (devIndicator && process.env.NODE_ENV === 'development') {
              (devIndicator as HTMLElement).textContent = 
                `${action} (${Math.round((1 - progress) * 100)}%)`;
            }
          }

          if (progress >= 1) {
            console.log(`[BlockHighlight] Auto-dismissing highlight for ${blockId} after timeout`);
            clearInterval(interval);
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

        // Add development indicator in dev mode
        if (process.env.NODE_ENV === 'development') {
          const devIndicator = document.createElement('div');
          devIndicator.className = 'dev-indicator';
          devIndicator.style.cssText = `
            position: absolute;
            top: 4px;
            right: 4px;
            background: ${colors.accent};
            color: ${colors.text};
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            pointer-events: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          `;
          devIndicator.textContent = `${action} (100%)`;
          highlight.overlay.appendChild(devIndicator);
        }

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