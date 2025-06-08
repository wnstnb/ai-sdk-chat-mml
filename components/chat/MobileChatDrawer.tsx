import React, { useEffect } from 'react';
import { useSwipeable } from 'react-swipeable'; // Install with: npm install react-swipeable
import { X } from 'lucide-react'; // Or your preferred icon library
import FocusTrap from 'focus-trap-react'; // Import FocusTrap
import styles from './MobileChatDrawer.module.css';

interface MobileChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const DRAWER_TITLE_ID = 'mobile-chat-drawer-title';

export const MobileChatDrawer: React.FC<MobileChatDrawerProps> = ({ 
  isOpen, 
  onClose, 
  children 
}) => {
  // Prevent body scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.removeEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);
  
  // Setup swipe handlers
  const swipeHandlers = useSwipeable({
    onSwipedLeft: onClose, // Assuming drawer slides from right. Adjust if it slides from left.
    // onSwipedRight: onClose, // Use this if your drawer is on the left and swipes right to close
    trackMouse: false, // Disable mouse tracking for swipe, typically for touch devices
    trackTouch: true,
    delta: 50, // Minimum swipe distance in px
    preventScrollOnSwipe: true, // Add this to help distinguish horizontal swipes from vertical scrolls
  });
  
  if (!isOpen) return null;
  
  return (
    <div 
      className={styles.drawerContainer} 
      aria-modal="true" 
      role="dialog"
      aria-labelledby={DRAWER_TITLE_ID}
    >
      <div className={styles.backdrop} onClick={onClose} />
      <FocusTrap active={isOpen}>
        <div 
          className={styles.drawer} 
          {...swipeHandlers} 
        >
          <div className={styles.header}>
            <button 
              onClick={onClose}
              aria-label="Close chat drawer"
              className={styles.closeButton}
            >
              <X size={24} />
            </button>
            <h2 className={styles.title} id={DRAWER_TITLE_ID}>Chat</h2>
          </div>
          <div className={styles.content}>
            {children}
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}; 