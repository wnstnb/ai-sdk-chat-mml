import React from 'react';
import { ChevronRight } from 'lucide-react'; // Icon for collapsing
import styles from './CollapseChatTab.module.css';

interface CollapseChatTabProps {
  onCollapse: () => void;
  chatPaneWidth: string; // Expecting a string like '300px' or '30%'
}

// The resizable divider in page.tsx is 7px wide with a 1px visual line in the center.
// This means there are 3px of interactive space on either side of the 1px line.
const HALF_RESIZER_INVISIBLE_PART_PX = 3;

export const CollapseChatTab: React.FC<CollapseChatTabProps> = ({
  onCollapse,
  chatPaneWidth,
}) => {
  const handleClick = () => {
    onCollapse();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCollapse();
    }
  };

  const style: React.CSSProperties = {
    // Position the tab so its right edge aligns with the 1px visual resizer line.
    // The 1px resizer line is at chatPaneWidth + 3px (half of the invisible part of the 7px resizer).
    right: `calc(${chatPaneWidth} + ${HALF_RESIZER_INVISIBLE_PART_PX}px)`,
  };

  return (
    <div
      className={styles.collapseChatTab} // Width is 32px from CSS
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Collapse chat pane"
      style={style}
    >
      <ChevronRight size={16} />
    </div>
  );
}; 