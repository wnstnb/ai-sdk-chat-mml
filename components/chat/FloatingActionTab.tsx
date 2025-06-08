import React from 'react';
import { MessageCircle } from 'lucide-react';
import styles from './FloatingActionTab.module.css';

interface FloatingActionTabProps {
  onClick: () => void;
  isOpen: boolean; // To correctly set aria-expanded
  ariaLabel?: string;
}

export const FloatingActionTab: React.FC<FloatingActionTabProps> = ({
  onClick,
  isOpen,
  ariaLabel = 'Toggle chat',
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={styles.floatingActionTab}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-expanded={isOpen}
    >
      <MessageCircle size={16} /> {/* Adjusted size to match ChatPaneTab */}
    </div>
  );
}; 