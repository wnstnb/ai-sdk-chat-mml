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

    // Refs to store the latest logic for event handlers
    const mouseMoveLogicRef = useRef<(me: MouseEvent) => void>(() => {});
    const mouseUpLogicRef = useRef<() => void>(() => {});

    // Update mouse move logic ref when dependencies change
    useEffect(() => {
        mouseMoveLogicRef.current = (me: MouseEvent) => {
            requestAnimationFrame(() => {
                const currentX = me.clientX;
                const deltaX = currentX - startXRef.current;
                const newWidth = startWidthRef.current - deltaX;
                const windowWidth = window.innerWidth;
                const maxWidth = Math.max(minWidthPx, (windowWidth * maxWidthPercent) / 100);
                const clampedWidth = Math.max(minWidthPx, Math.min(newWidth, maxWidth));
                setChatPaneWidth(clampedWidth);
            });
        };
    }, [minWidthPx, maxWidthPercent]); // Keep original dependencies

    // Stable mouse move handler that calls the logic ref
    const handleMouseMoveStable = useCallback((me: MouseEvent) => {
        mouseMoveLogicRef.current(me);
    }, []);

    // Update mouse up logic ref when dependencies change
    useEffect(() => {
        mouseUpLogicRef.current = () => {
            // Check isResizing state directly, no need to pass as arg
            if (!isResizing) return;
            setIsResizing(false);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', handleMouseMoveStable);
            window.removeEventListener('mouseup', handleMouseUpStable); // Use stable handler
            console.log("Mouse Up - Resizing stopped (Stable Ref)");
        };
        // Add handleMouseMoveStable dependency? No, it's stable.
    }, [isResizing, handleMouseMoveStable]); // Add isResizing here

    // Stable mouse up handler that calls the logic ref
    const handleMouseUpStable = useCallback(() => {
        mouseUpLogicRef.current();
    }, []);

    // Resize Mouse Down Handler (Initiation) - Uses stable handlers
    const handleMouseDownResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Read chatPaneWidth directly, no need for it to be a dependency if logic is simple
        const currentWidth = chatPaneWidth; // Read latest value
        if (currentWidth === null) return;
        console.log("Mouse Down - Resizing started (Stable Ref)");
        setIsResizing(true);
        startXRef.current = e.clientX;
        startWidthRef.current = currentWidth; // Use the read value
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        // Add the STABLE handlers
        window.addEventListener('mousemove', handleMouseMoveStable);
        window.addEventListener('mouseup', handleMouseUpStable);
    // Depend only on stable handlers and state setters
    }, [chatPaneWidth, handleMouseMoveStable, handleMouseUpStable, setIsResizing]); 

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

    // Effect for Cleaning Up Global Listeners (Use stable handlers)
    useEffect(() => {
        return () => {
            if (isResizing) {
                window.removeEventListener('mousemove', handleMouseMoveStable);
                window.removeEventListener('mouseup', handleMouseUpStable);
                if (document.body.style.cursor === 'col-resize') {
                    document.body.style.userSelect = '';
                    document.body.style.cursor = '';
                }
                console.log("[useChatPane Cleanup] Removed stable resize listeners on unmount.");
            }
        };
    }, [isResizing, handleMouseMoveStable, handleMouseUpStable]); // Depend on isResizing and stable handlers

    return {
        isChatCollapsed,
        setIsChatCollapsed,
        chatPaneWidth,
        isResizing,
        dragHandleRef,
        handleMouseDownResize,
    };
} 