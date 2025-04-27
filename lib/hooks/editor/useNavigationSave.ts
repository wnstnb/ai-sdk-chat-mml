import { useEffect, useRef, MutableRefObject } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import type { AutosaveStatus } from './useAutosave'; // Import the status type
import type { Block } from '@blocknote/core'; // Import Block type if needed for save function

interface UseNavigationSaveProps {
    documentId: string | null;
    autosaveStatus: AutosaveStatus;
    latestEditorContentRef: MutableRefObject<string | null>;
    // Need refs for timers and setter for status to manage them during navigation/unload
    autosaveTimerIdRef: MutableRefObject<NodeJS.Timeout | null>; 
    revertStatusTimerIdRef: MutableRefObject<NodeJS.Timeout | null>;
    setAutosaveStatus: (status: AutosaveStatus) => void; 
    // Pass the core save function logic
    saveContent: (contentString: string, blocks: Block[], docId: string) => Promise<boolean>; 
}

export function useNavigationSave({
    documentId,
    autosaveStatus,
    latestEditorContentRef,
    autosaveTimerIdRef,
    revertStatusTimerIdRef,
    setAutosaveStatus,
    saveContent
}: UseNavigationSaveProps): void {
    const pathname = usePathname();
    const previousPathnameRef = useRef(pathname);

    // --- beforeunload Hook for Unsaved Changes ---
    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            const currentAutosaveStatus = autosaveStatus; // Capture status at time of event
            const currentAutosaveTimerId = autosaveTimerIdRef.current;
            const currentRevertStatusTimerId = revertStatusTimerIdRef.current;

            // Check if there are unsaved changes OR if an autosave is pending
            if (currentAutosaveStatus === 'unsaved' || currentAutosaveTimerId) {
                console.log('[useNavigationSave beforeunload] Unsaved changes detected. Attempting synchronous save.');

                // Clear any pending autosave timer immediately
                if (currentAutosaveTimerId) {
                    clearTimeout(currentAutosaveTimerId);
                    autosaveTimerIdRef.current = null; // Clear the ref
                }
                // Clear status revert timer too
                if (currentRevertStatusTimerId) {
                    clearTimeout(currentRevertStatusTimerId);
                    revertStatusTimerIdRef.current = null; // Clear the ref
                }

                // Attempt a synchronous (best-effort) save using fetch with keepalive or sendBeacon
                if (latestEditorContentRef.current && documentId) {
                    try {
                        const contentToSave = latestEditorContentRef.current;
                        const url = `/api/documents/${documentId}/content`;
                        // Note: sendBeacon/fetch keepalive needs the FULL payload including searchable_content if the API expects it.
                        // However, generating markdown here synchronously might be too slow/complex.
                        // Sending only the core 'content' is a compromise for beforeunload.
                        // The API endpoint needs to gracefully handle potentially missing searchable_content in this scenario.
                        const payload = JSON.stringify({ content: JSON.parse(contentToSave) }); 

                        if (navigator.sendBeacon) {
                            const blob = new Blob([payload], { type: 'application/json' });
                            const success = navigator.sendBeacon(url, blob);
                            console.log(`[useNavigationSave beforeunload] Sent data via navigator.sendBeacon. Success: ${success}`);
                        } else {
                            // Fallback: fetch with keepalive
                            fetch(url, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: payload,
                                keepalive: true, 
                            }).catch(err => {
                                console.warn('[useNavigationSave beforeunload] fetch keepalive error (may be expected):', err);
                            });
                            console.log('[useNavigationSave beforeunload] Sent data via fetch keepalive.');
                        }
                    } catch (err) {
                        console.error('[useNavigationSave beforeunload] Error preparing sync save data:', err);
                    }
                } else {
                    console.warn('[useNavigationSave beforeunload] Could not attempt sync save: Missing content or document ID.');
                }
                // We don't set returnValue = '' as modern browsers ignore custom messages 
                // and the sync save attempt is the primary goal.
            } else {
                console.log('[useNavigationSave beforeunload] No unsaved changes detected.');
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            console.log('[useNavigationSave beforeunload] Cleanup: Removed listener.');
        };
        // Re-run if dependencies change (status, timers, content ref, docId)
    }, [autosaveStatus, documentId, latestEditorContentRef, autosaveTimerIdRef, revertStatusTimerIdRef]);

    // --- Navigation Handling Hook ---
    useEffect(() => {
        const currentAutosaveStatus = autosaveStatus; // Capture status at time of effect run
        const currentAutosaveTimerId = autosaveTimerIdRef.current;
        const currentRevertStatusTimerId = revertStatusTimerIdRef.current;
        const previousPathname = previousPathnameRef.current;
        
        // Check if navigating *away* from an editor page to a non-editor page
        const isLeavingEditor = !!(
            previousPathname?.startsWith('/editor/') && 
            pathname && 
            !pathname.startsWith('/editor/')
        );

        if (isLeavingEditor && (currentAutosaveStatus === 'unsaved' || currentAutosaveTimerId)) {
            console.log('[useNavigationSave Navigation] Leaving editor with unsaved changes. Triggering async save.');

            // Clear pending timers
            if (currentAutosaveTimerId) {
                clearTimeout(currentAutosaveTimerId);
                autosaveTimerIdRef.current = null;
            }
            if (currentRevertStatusTimerId) {
                clearTimeout(currentRevertStatusTimerId);
                revertStatusTimerIdRef.current = null;
            }

            // Trigger an asynchronous save (fire-and-forget)
            if (latestEditorContentRef.current && documentId) {
                const contentToSave = latestEditorContentRef.current;
                // Here we *can* potentially get the blocks and call the full save function, 
                // but it depends on whether the block ref is available/passed in.
                // For simplicity, let's assume we need the full save function passed in.
                // We also need the blocks, which are not currently passed. 
                // Option 1: Pass latestEditorBlocksRef as well.
                // Option 2: Modify `saveContent` prop to only require stringified content?
                // Let's stick to requiring the full `saveContent` signature for now and assume
                // the consuming component passes it correctly, potentially requiring the blocks ref.
                // *** Correction: We need the blocks ref here for the saveContent function passed from useAutosave ***
                // This hook needs the blocks ref. Let's add it to props.
                
                // *** REVISED PLAN: Pass blocksRef instead of saveContent ***
                // We will call the API directly here for navigation save, similar to manualSave logic.
                // This avoids needing the block ref AND the saveContent function from useAutosave.
                
                // *** RE-REVISED PLAN: Pass saveContent from useAutosave ***
                // It's cleaner to reuse the save logic. We *do* need the blocks ref passed in.
                // Let's add `latestEditorBlocksRef` to the props.
                
                // *** Final Plan: Just call the save function passed in. Assume it handles getting blocks if needed. ***
                // The saveContent function passed from useAutosave already has access to the necessary refs via its closure.
                
                setAutosaveStatus('saving'); // Show saving status briefly
                
                // We need the Block[] content here. Parse the string ref.
                let blocksToSave: Block[] = [];
                try {
                    blocksToSave = JSON.parse(contentToSave);
                } catch (e) {
                    console.error("[useNavigationSave Navigation] Failed to parse blocks for save:", e);
                    toast.error("Failed to save on navigation: Invalid content.");
                    setAutosaveStatus('error'); // Indicate failure
                    return; // Don't proceed if parsing failed
                }
                
                saveContent(contentToSave, blocksToSave, documentId)
                    .then((success) => {
                        if (success) {
                            console.log('[useNavigationSave Navigation] Async save successful.');
                            // Don't revert status here, user is gone.
                        } else {
                            // Should not happen if saveContent throws on error
                            console.warn('[useNavigationSave Navigation] Async save function returned false?');
                        }
                    })
                    .catch(err => {
                        console.error("[useNavigationSave Navigation] Save on navigate failed:", err);
                        toast.error(`Save failed: ${err.message || 'Unknown error'}`);
                        // Don't necessarily set status to error, user is navigating away.
                    })
                    .finally(() => {
                        // Don't clear timers here, they were cleared synchronously above.
                        // Don't change status from 'saving' if success, user won't see it.
                    });
            }
        }

        // Update the previous pathname ref *after* checking the navigation condition
        if (pathname !== previousPathname) {
            previousPathnameRef.current = pathname;
        }

        // Dependencies: Check status, timers, content, pathname, save function
    }, [pathname, autosaveStatus, documentId, latestEditorContentRef, saveContent, autosaveTimerIdRef, revertStatusTimerIdRef, setAutosaveStatus]);
} 