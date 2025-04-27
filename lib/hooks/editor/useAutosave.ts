import { useState, useRef, useCallback, useEffect, MutableRefObject } from 'react';
import type { Block, BlockNoteEditor as BlockNoteEditorType } from '@blocknote/core';
import { toast } from 'sonner';

// Define the possible autosave statuses
export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

// Define the props for the hook
interface UseAutosaveProps {
    editorRef: MutableRefObject<BlockNoteEditorType | null>; // Ref to the editor instance
    documentId: string | null; // The ID of the document being edited
}

// --- NEW: Define the return type separately ---
export interface UseAutosaveReturn {
    autosaveStatus: AutosaveStatus;
    handleEditorChange: (editor: BlockNoteEditorType) => void;
    manualSave: () => Promise<void>;
    latestEditorContentRef: MutableRefObject<string | null>;
    latestEditorBlocksRef: MutableRefObject<Block[] | null>;
}
// --- END NEW ---

// --- UPDATED: Use the named return type ---
export function useAutosave({ editorRef, documentId }: UseAutosaveProps): UseAutosaveReturn {
    // --- State Variables ---
    const [autosaveTimerId, setAutosaveTimerId] = useState<NodeJS.Timeout | null>(null);
    const [revertStatusTimerId, setRevertStatusTimerId] = useState<NodeJS.Timeout | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
    const latestEditorContentRef = useRef<string | null>(null); // JSON stringified content
    const latestEditorBlocksRef = useRef<Block[] | null>(null); // Blocks for direct use
    const isContentLoadedRef = useRef<boolean>(false); // To prevent save on initial load
    const [isSavingManually, setIsSavingManually] = useState(false); // Track manual save state

    // --- Internal Save Function ---
    const saveContent = useCallback(async (
        contentString: string,
        blocks: Block[],
        docId: string
    ): Promise<boolean> => {
        const editor = editorRef.current; // Get editor instance for markdown generation
        if (!editor) {
            console.warn("[useAutosave saveContent] Aborting save: Editor ref not available.");
            throw new Error("Editor instance not available.");
        }

        // --- Generate Markdown ---
        let markdownContent: string | null = null;
        if (blocks.length > 0) {
            try {
                console.log("[useAutosave saveContent] Generating markdown...");
                markdownContent = await editor.blocksToMarkdownLossy(blocks);
                markdownContent = markdownContent.trim() || null; // Store null if empty/whitespace
                console.log(`[useAutosave saveContent] Markdown generated (length: ${markdownContent?.length ?? 0}).`);
            } catch (markdownError) {
                console.error("[useAutosave saveContent] Error generating markdown:", markdownError);
                toast.error("Failed to generate markdown for search.");
                // Continue save without markdown
            }
        }

        // --- Prepare JSON Content ---
        let jsonContent: Block[] | null = null;
        try {
            jsonContent = JSON.parse(contentString);
        } catch (parseError) {
            console.error("[useAutosave saveContent] Failed to parse content string for saving:", parseError);
            throw new Error("Failed to parse editor content.");
        }

        // --- Call Save API ---
        try {
            console.log(`[useAutosave saveContent] Calling save API for doc ${docId}`);
            const response = await fetch(`/api/documents/${docId}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: jsonContent, // Send parsed JSON blocks
                    searchable_content: markdownContent // Send generated markdown (or null)
                }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `Save failed (${response.status})`);
            }
            console.log(`[useAutosave saveContent] Document ${docId} saved successfully.`);
            return true; // Indicate success
        } catch (err: any) {
            console.error(`[useAutosave saveContent] Failed to save document ${docId}:`, err);
            throw err; // Re-throw the error
        }
    }, [editorRef]); // Dependency on editorRef

    // --- Editor Change Handler (Autosave Trigger) ---
    const handleEditorChange = useCallback((editor: BlockNoteEditorType) => {
        console.log("--- useAutosave handleEditorChange called ---");
        const editorContent = editor.document;

        if (!isContentLoadedRef.current) {
            isContentLoadedRef.current = true;
            console.log("[useAutosave handleEditorChange] Initial content flag SET. Storing refs.");
            latestEditorBlocksRef.current = editorContent;
            latestEditorContentRef.current = JSON.stringify(editorContent);
            return;
        }
        console.log("[useAutosave handleEditorChange] Editor content changed. Setting status to 'unsaved'.");

        // Store latest content
        latestEditorBlocksRef.current = editorContent;
        try {
            latestEditorContentRef.current = JSON.stringify(editorContent);
        } catch (stringifyError) {
             console.error("[useAutosave handleEditorChange] Failed to stringify editor content:", stringifyError);
             setAutosaveStatus('error');
             return;
        }

        setAutosaveStatus('unsaved');
        console.log("[useAutosave LOG] Status set to: unsaved");

        // Clear timers
        if (revertStatusTimerId) {
            console.log("[useAutosave handleEditorChange] Clearing existing REVERT timer:", revertStatusTimerId);
            clearTimeout(revertStatusTimerId);
            setRevertStatusTimerId(null);
        }
        if (autosaveTimerId) {
            console.log("[useAutosave handleEditorChange] Clearing existing AUTOSAVE timer:", autosaveTimerId);
            clearTimeout(autosaveTimerId);
        }

        console.log("[useAutosave handleEditorChange] Setting NEW autosave timer (3000ms)...");
        const newTimerId = setTimeout(async () => {
            console.log("[useAutosave Timer] --- Timer FIRED ---");
            const currentContentString = latestEditorContentRef.current;
            const currentBlocks = latestEditorBlocksRef.current;

            if (!documentId || !currentContentString || !currentBlocks) {
                console.warn("[useAutosave Timer] Aborting save: Missing documentId, content string, or blocks.");
                setAutosaveStatus('error');
                console.log("[useAutosave LOG] Status set to: error (missing data)");
                return;
            }

            setAutosaveStatus('saving');
            console.log("[useAutosave LOG] Status set to: saving");
            try {
                console.log("[useAutosave LOG] Calling saveContent from timer...");
                await saveContent(currentContentString, currentBlocks, documentId);

                // Success
                console.log("[useAutosave Timer] Save successful.");
                setAutosaveStatus('saved');
                console.log("[useAutosave LOG] Status set to: saved");
                // Set timer to revert status back to 'idle'
                const revertTimer = setTimeout(() => {
                    console.log("[useAutosave Status Revert Timer] Reverting status from 'saved' to 'idle'.");
                    setAutosaveStatus(status => status === 'saved' ? 'idle' : status);
                    console.log("[useAutosave LOG] Status reverted to: idle (or kept existing if not 'saved')");
                    setRevertStatusTimerId(null);
                }, 2000);
                console.log("[useAutosave Timer] Setting REVERT timer:", revertTimer);
                setRevertStatusTimerId(revertTimer);

            } catch (saveError: any) {
                console.error("[useAutosave Timer] Save failed:", saveError);
                toast.error(`Autosave failed: ${saveError.message}`);
                setAutosaveStatus('error');
                console.log("[useAutosave LOG] Status set to: error (save failed)");
            } finally {
                setAutosaveTimerId(null); // Clear timer ID after execution
            }

        }, 3000); // Autosave after 3 seconds
        setAutosaveTimerId(newTimerId);
        console.log(`[useAutosave LOG] Set new autosave timer ID: ${newTimerId}`);

    }, [documentId, autosaveTimerId, revertStatusTimerId, saveContent]);

    // --- Manual Save Handler ---
    const manualSave = useCallback(async () => {
        if (!documentId) { toast.error("Cannot save: Document ID missing."); return; }
        const currentContentString = latestEditorContentRef.current;
        const currentBlocks = latestEditorBlocksRef.current;
        if (!currentContentString || !currentBlocks) {
             console.warn('[useAutosave manualSave] Save aborted: Latest content refs not available.');
             toast.error("Cannot save: Editor content not ready.");
             return;
        }
        if (isSavingManually || autosaveStatus === 'saving') {
            console.log("[useAutosave manualSave] Save already in progress.");
            return; // Prevent multiple saves
        }

        console.log("[useAutosave manualSave] Triggered.");
        setIsSavingManually(true); // Indicate manual save process started

        // Clear any pending autosave timer
        if (autosaveTimerId) {
            clearTimeout(autosaveTimerId);
            setAutosaveTimerId(null);
            console.log("[useAutosave manualSave] Cleared pending autosave timer.");
        }
         // Clear any pending status revert timer
        if (revertStatusTimerId) {
            clearTimeout(revertStatusTimerId);
            setRevertStatusTimerId(null);
            console.log("[useAutosave manualSave] Cleared pending status revert timer.");
        }

         // Set status to saving immediately
        setAutosaveStatus('saving');

        console.log("Saving document content manually...");
        try {
            // Use the internal saveContent function
            await saveContent(currentContentString, currentBlocks, documentId);

            toast.success('Document saved!');
            setAutosaveStatus('saved'); // Update status

            // Set timer to revert to idle
             const newRevertTimerId = setTimeout(() => {
                 console.log("[useAutosave Manual Save Revert] Reverting status from 'saved' to 'idle'.");
                 setAutosaveStatus(status => status === 'saved' ? 'idle' : status);
                 setRevertStatusTimerId(null);
             }, 2000);
             setRevertStatusTimerId(newRevertTimerId);

        } catch (err: any) {
            console.error("[useAutosave manualSave] Save error:", err);
            toast.error(`Save failed: ${err.message}`);
            setAutosaveStatus('error'); // Update status on error
        } finally {
            setIsSavingManually(false); // Reset manual save flag
        }
    }, [documentId, isSavingManually, autosaveStatus, autosaveTimerId, revertStatusTimerId, saveContent]);

    // --- Timer Cleanup on Unmount ---
     useEffect(() => {
        return () => {
            console.log('[useAutosave Cleanup] Clearing timers on unmount.');
            if (autosaveTimerId) {
                clearTimeout(autosaveTimerId);
                console.log('[useAutosave Cleanup] Cleared autosaveTimerId:', autosaveTimerId);
            }
            if (revertStatusTimerId) {
                clearTimeout(revertStatusTimerId);
                 console.log('[useAutosave Cleanup] Cleared revertStatusTimerId:', revertStatusTimerId);
            }
        };
    }, [autosaveTimerId, revertStatusTimerId]); // Depend on timer IDs

    // --- Return Values ---
    return {
        autosaveStatus,
        handleEditorChange,
        manualSave,
        latestEditorContentRef, // Expose for other hooks
        latestEditorBlocksRef, // Expose for other hooks
    };
}

// --- Sync beforeunload Hook (Example - might move to separate hook later) ---
// Moved to useNavigationSave hook in Step 6
// --- Navigation Handling Hook (Example - might move to separate hook later) ---
// Moved to useNavigationSave hook in Step 6 