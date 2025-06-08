import React, { useRef, useCallback, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import styles from './ChatPaneTab.module.css';

interface ChatPaneTabProps {
  onExpand: () => void;
  onWidthChange: (newWidth: string) => void;
  isChatPaneExpanded: boolean;
}

export const ChatPaneTab: React.FC<ChatPaneTabProps> = ({
  onExpand,
  onWidthChange,
  isChatPaneExpanded,
}) => {
  const dragStartXRef = useRef<number | null>(null);

  const handleClick = () => {
    onExpand();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onExpand();
    }
  };

  const handleDragMove = useCallback((event: PointerEvent) => {
    if (dragStartXRef.current === null) return;

    const deltaX = dragStartXRef.current - event.clientX;
    const windowWidth = window.innerWidth;
    
    let newWidthPercent = (deltaX / windowWidth) * 100;
    newWidthPercent = Math.max(20, Math.min(newWidthPercent, 70)); 
    
    onWidthChange(`${newWidthPercent.toFixed(0)}%`);
  }, [onWidthChange]);

  const handleDragEnd = useCallback(() => {
    document.removeEventListener('pointermove', handleDragMove);
    document.removeEventListener('pointerup', handleDragEnd);
    dragStartXRef.current = null;
    onExpand();
  }, [onExpand, handleDragMove]);

  const handleDragStart = useCallback((event: React.PointerEvent) => {
    if (!event.isPrimary) return;
    event.preventDefault();
    dragStartXRef.current = event.clientX;
    document.addEventListener('pointermove', handleDragMove);
    document.addEventListener('pointerup', handleDragEnd);
  }, [handleDragMove, handleDragEnd]);

  useEffect(() => {
    return () => {
      if (dragStartXRef.current !== null) {
        document.removeEventListener('pointermove', handleDragMove);
        document.removeEventListener('pointerup', handleDragEnd);
        dragStartXRef.current = null;
      }
    };
  }, [handleDragMove, handleDragEnd]);

  return (
    <div
      className={styles.chatPaneTab}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handleDragStart}
      role="button"
      tabIndex={0}
      aria-label="Expand chat pane by clicking or dragging"
      aria-expanded={isChatPaneExpanded}
    >
      <MessageCircle size={16} />
    </div>
  );
}; 