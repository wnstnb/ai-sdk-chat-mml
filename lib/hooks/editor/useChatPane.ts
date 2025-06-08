import { useState, useEffect, useRef, useCallback } from 'react';

interface UseChatPaneProps {
    // Removed initialWidthPercent, minWidthPx, maxWidthPercent
}

interface UseChatPaneReturn {
    isExpanded: boolean;
    isCollapsed: boolean;
    toggleExpanded: () => void;
    previousWidth: string;
    handleWidthChange: (newWidth: string) => void;
    handleTabPointerDown: (event: React.PointerEvent) => void;
    mobileVisiblePane: 'editor' | 'chat';
    toggleMobilePane: () => void;
}

const DRAG_THRESHOLD_PX = 50; // Threshold for drag-to-expand

export function useChatPane({}: UseChatPaneProps): UseChatPaneReturn {
    const [isExpanded, setIsExpanded] = useState(true);
    const [previousWidth, setPreviousWidth] = useState('30%'); // New state for string width
    const [mobileVisiblePane, setMobileVisiblePane] = useState<'editor' | 'chat'>('editor'); // New state for mobile

    const toggleExpanded = useCallback(() => {
        setIsExpanded(prevIsExpanded => {
            const newState = !prevIsExpanded;
            try {
                localStorage.setItem('chatPaneExpandedState', JSON.stringify(newState));
            } catch (error) {
                console.error('Error saving chat pane state to localStorage:', error);
            }
            return newState;
        });
    }, []);

    const latestIsExpandedRef = useRef(isExpanded);
    const latestToggleExpandedRef = useRef(toggleExpanded);
    const dragStartPointXRef = useRef<number | null>(null);

    useEffect(() => {
        latestIsExpandedRef.current = isExpanded;
    }, [isExpanded]);

    useEffect(() => {
        latestToggleExpandedRef.current = toggleExpanded;
    }, [toggleExpanded]);

    // Effect to load saved state from localStorage on mount
    useEffect(() => {
        try {
            const savedIsExpanded = localStorage.getItem('chatPaneExpandedState');
            if (savedIsExpanded !== null) {
                setIsExpanded(JSON.parse(savedIsExpanded));
            }
            const savedPreviousWidth = localStorage.getItem('chatPaneWidth'); // Load previousWidth
            if (savedPreviousWidth !== null) {
                setPreviousWidth(savedPreviousWidth);
            }
            // Note: mobileVisiblePane is not persisted by default, it's session-specific.
            // If persistence is needed for mobileVisiblePane, it could be added here.
        } catch (error) {
            console.error('Error loading chat pane state from localStorage:', error);
        }
    }, []);

    const handleWidthChange = useCallback((newWidth: string) => {
        setPreviousWidth(newWidth);
        try {
            localStorage.setItem('chatPaneWidth', newWidth);
        } catch (error) {
            console.error('Error saving chat pane width to localStorage:', error);
        }
    }, []);

    const stableHandleTabPointerMove = useCallback((event: PointerEvent) => {
        if (dragStartPointXRef.current === null || latestIsExpandedRef.current) {
            // Drag not started, or already expanded (e.g., toggled by other means or quick succession)
            document.removeEventListener('pointermove', stableHandleTabPointerMove);
            document.removeEventListener('pointerup', stableHandleTabPointerUp); // Ensure stableHandleTabPointerUp is defined or passed if different
            dragStartPointXRef.current = null;
            return;
        }

        const currentX = event.clientX;
        const deltaX = currentX - dragStartPointXRef.current;

        // Assuming pane is on the right, dragging left (negative deltaX) expands it.
        if (deltaX < -DRAG_THRESHOLD_PX) {
            latestToggleExpandedRef.current(); // Expand the pane
            // Clean up listeners as the action is completed
            document.removeEventListener('pointermove', stableHandleTabPointerMove);
            document.removeEventListener('pointerup', stableHandleTabPointerUp); // Ensure stableHandleTabPointerUp is defined or passed
            dragStartPointXRef.current = null;
        }
    }, []); // Stable: relies on refs for dynamic values

    const stableHandleTabPointerUp = useCallback(() => {
        document.removeEventListener('pointermove', stableHandleTabPointerMove);
        document.removeEventListener('pointerup', stableHandleTabPointerUp); // Self-removal
        dragStartPointXRef.current = null;
    }, [stableHandleTabPointerMove]); // Depends on stableHandleTabPointerMove for removal logic if it were complex

    const handleTabPointerDown = useCallback((event: React.PointerEvent) => {
        if (latestIsExpandedRef.current || !event.isPrimary) {
            // Don't initiate drag if already expanded or not a primary pointer action
            return;
        }
        // Optional: event.preventDefault(); // If needed to prevent text selection or other default browser actions
        dragStartPointXRef.current = event.clientX;
        document.addEventListener('pointermove', stableHandleTabPointerMove);
        document.addEventListener('pointerup', stableHandleTabPointerUp);
    }, [stableHandleTabPointerMove, stableHandleTabPointerUp]); // Depends on stable handlers

    // Cleanup effect for global listeners on unmount
    useEffect(() => {
        return () => {
            if (dragStartPointXRef.current !== null) {
                document.removeEventListener('pointermove', stableHandleTabPointerMove);
                document.removeEventListener('pointerup', stableHandleTabPointerUp);
                dragStartPointXRef.current = null;
            }
        };
    }, [stableHandleTabPointerMove, stableHandleTabPointerUp]);

    // Mobile toggle function
    const toggleMobilePane = useCallback(() => {
        setMobileVisiblePane(prev => (prev === 'editor' ? 'chat' : 'editor'));
    }, []);

    return {
        isExpanded,
        isCollapsed: !isExpanded,
        toggleExpanded,
        previousWidth,
        handleWidthChange,
        handleTabPointerDown,
        mobileVisiblePane,
        toggleMobilePane,
    };
} 