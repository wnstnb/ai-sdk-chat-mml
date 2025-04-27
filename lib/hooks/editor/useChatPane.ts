import { useState, useEffect, useRef, useCallback } from 'react';

interface UseChatPaneProps {
    initialWidthPercent: number;
    minWidthPx: number;
    maxWidthPercent: number;
}

interface UseChatPaneReturn {
    isChatCollapsed: boolean;
    setIsChatCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    chatPaneWidth: number | null;
    isResizing: boolean;
    dragHandleRef: React.RefObject<HTMLDivElement>;
    handleMouseDownResize: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function useChatPane({
    initialWidthPercent,
    minWidthPx,
    maxWidthPercent,
}: UseChatPaneProps): UseChatPaneReturn {
    const [isChatCollapsed, setIsChatCollapsed] = useState(false);
    const [chatPaneWidth, setChatPaneWidth] = useState<number | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const dragHandleRef = useRef<HTMLDivElement>(null);
    const startWidthRef = useRef<number>(0);
    const startXRef = useRef<number>(0);

    // Resize Mouse Move Handler
    const handleMouseMoveResize = useCallback((me: MouseEvent) => {
        requestAnimationFrame(() => {
            const currentX = me.clientX;
            const deltaX = currentX - startXRef.current;
            const newWidth = startWidthRef.current - deltaX;
            const windowWidth = window.innerWidth;
            const maxWidth = Math.max(minWidthPx, (windowWidth * maxWidthPercent) / 100);
            const clampedWidth = Math.max(minWidthPx, Math.min(newWidth, maxWidth));
            setChatPaneWidth(clampedWidth);
        });
    }, [minWidthPx, maxWidthPercent]); // Use props in dependency array

    // Resize Mouse Up Handler (Cleanup)
    const handleMouseUpResize = useCallback(() => {
        if (!isResizing) return; // Prevent running if not resizing
        setIsResizing(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMoveResize);
        window.removeEventListener('mouseup', handleMouseUpResize); // Remove self
        console.log("Mouse Up - Resizing stopped");
    }, [isResizing, handleMouseMoveResize]); // Add isResizing dependency

    // Resize Mouse Down Handler (Initiation)
    const handleMouseDownResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!chatPaneWidth) return;
        console.log("Mouse Down - Resizing started");
        setIsResizing(true);
        startXRef.current = e.clientX;
        startWidthRef.current = chatPaneWidth;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', handleMouseMoveResize);
        window.addEventListener('mouseup', handleMouseUpResize);
    }, [chatPaneWidth, handleMouseMoveResize, handleMouseUpResize]); // Include handlers in dependencies

    // Effect for Initial Width Calculation and Window Resize Handling
    useEffect(() => {
        const calculateWidth = () => {
            if (!isChatCollapsed) { // Only calculate if pane is visible
                const windowWidth = window.innerWidth;
                const initialWidth = Math.max(minWidthPx, (windowWidth * initialWidthPercent) / 100);
                const potentialMaxWidth = (windowWidth * maxWidthPercent) / 100;
                const effectiveMaxWidth = Math.max(potentialMaxWidth, minWidthPx);
                // Only set width if not currently resizing
                // or if the current width is invalid (null, too large, too small)
                if (!isResizing) {
                    if (chatPaneWidth === null || chatPaneWidth > effectiveMaxWidth || chatPaneWidth < minWidthPx) {
                        const newWidth = Math.max(minWidthPx, Math.min(initialWidth, effectiveMaxWidth));
                        console.log(`[useChatPane] Calculating initial/resize width: ${newWidth}`);
                        setChatPaneWidth(newWidth);
                    }
                }
            }
        };
        
        calculateWidth(); // Initial calculation
        
        window.addEventListener('resize', calculateWidth);
        return () => window.removeEventListener('resize', calculateWidth);
    // Dependencies: Include props and state affecting calculation
    }, [isResizing, chatPaneWidth, isChatCollapsed, initialWidthPercent, minWidthPx, maxWidthPercent]);

    // Effect for Cleaning Up Global Listeners on Unmount or if resizing stops unexpectedly
    useEffect(() => {
        return () => {
            // Ensure listeners are removed if the hook unmounts during a resize
            if (isResizing) {
                window.removeEventListener('mousemove', handleMouseMoveResize);
                window.removeEventListener('mouseup', handleMouseUpResize);
                // Restore body styles if necessary
                if (document.body.style.cursor === 'col-resize') {
                    document.body.style.userSelect = '';
                    document.body.style.cursor = '';
                }
                console.log("[useChatPane Cleanup] Removed resize listeners on unmount.");
            }
        };
    // Include isResizing and handlers in dependency array
    }, [isResizing, handleMouseMoveResize, handleMouseUpResize]);

    return {
        isChatCollapsed,
        setIsChatCollapsed,
        chatPaneWidth,
        isResizing,
        dragHandleRef,
        handleMouseDownResize,
    };
} 