import { useState, useCallback, RefObject, KeyboardEvent, useEffect } from 'react';
import { toast } from 'sonner';
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';

// Define the schema based on default specs (or your custom ones)
const schema = BlockNoteSchema.create({ blockSpecs: defaultBlockSpecs /* Add other specs if needed */ });
type EditorSchema = typeof schema.blockSchema; // Correctly get the block schema type

interface UseTitleManagementProps {
    documentId: string;
    initialName: string;
    editorRef: RefObject<BlockNoteEditor<EditorSchema>>;
    onTitleSaveSuccess?: (newTitle: string) => void; // Optional callback
}

export function useTitleManagement({
    documentId,
    initialName,
    editorRef,
    onTitleSaveSuccess,
}: UseTitleManagementProps) {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [newTitleValue, setNewTitleValue] = useState(initialName);
    const [isInferringTitle, setIsInferringTitle] = useState(false);
    const [currentTitle, setCurrentTitle] = useState(initialName); // State to hold the persisted title

    // Update internal state if initialName changes (e.g., after initial load)
    useEffect(() => {
        setCurrentTitle(initialName);
        if (!isEditingTitle) {
            setNewTitleValue(initialName);
        }
    }, [initialName, isEditingTitle]);

    const handleEditTitleClick = useCallback(() => {
        setNewTitleValue(currentTitle); // Start editing with the current saved title
        setIsEditingTitle(true);
    }, [currentTitle]);

    const handleCancelEditTitle = useCallback(() => {
        setIsEditingTitle(false);
        setNewTitleValue(currentTitle); // Revert input to the current saved title
    }, [currentTitle]);

    const handleSaveTitle = useCallback(async (titleToSave?: string) => {
        const finalTitle = (titleToSave !== undefined ? titleToSave.trim() : newTitleValue.trim());

        if (!finalTitle || finalTitle === currentTitle) {
            if (!finalTitle) {
                toast.error("Document name cannot be empty.");
            }
            handleCancelEditTitle();
            return;
        }

        const optimisticNewTitle = finalTitle;
        setIsEditingTitle(false); // Exit edit mode optimistically

        try {
            const response = await fetch(`/api/documents/${documentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: optimisticNewTitle }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                throw new Error(errData.error?.message || `Failed to rename document (${response.status})`);
            }

            // const { data: updatedDoc } = await response.json(); // We might not need updatedDoc directly
            setCurrentTitle(optimisticNewTitle); // Update the persisted title state
            onTitleSaveSuccess?.(optimisticNewTitle); // Notify parent component

        } catch (err: any) {
            console.error('Error saving title:', err);
            toast.error(`Failed to rename: ${err.message}`);
            setNewTitleValue(currentTitle); // Rollback input value
            // Decide whether to re-enter edit mode or just revert the displayed title implicitly
            // For now, stay out of edit mode but ensure newTitleValue reflects the failed state
        }
    }, [newTitleValue, currentTitle, documentId, handleCancelEditTitle, onTitleSaveSuccess]);

    const handleTitleInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            handleSaveTitle();
        } else if (event.key === 'Escape') {
            handleCancelEditTitle();
        }
    }, [handleSaveTitle, handleCancelEditTitle]);

    const handleInferTitle = useCallback(async () => {
        const editor = editorRef.current;
        if (!editor) {
            toast.error("Editor not ready.");
            return;
        }

        setIsInferringTitle(true);
        toast.info("Generating title based on content...");

        try {
            const blocks = editor.document;
            if (!blocks || blocks.length === 0) {
                toast.warning("Cannot generate title from empty content.");
                setIsInferringTitle(false);
                return;
            }
            const markdown = await editor.blocksToMarkdownLossy(blocks);
            const snippet = markdown.substring(0, 500);

            if (!snippet.trim()) {
                toast.warning("Cannot generate title from empty content.");
                setIsInferringTitle(false);
                return;
            }

            const response = await fetch('/api/generate-title', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: snippet }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
                throw new Error(errorData.error || `Failed to generate title (${response.status})`);
            }

            const { title } = await response.json();

            if (!title) {
                throw new Error("Received empty title from API.");
            }

            toast.success("Title suggested!");
            setNewTitleValue(title); // Update the input field value
            setIsEditingTitle(true); // Enter edit mode if not already
            await handleSaveTitle(title); // Directly save the inferred title

        } catch (error) {
            console.error("Error inferring title:", error);
            const message = error instanceof Error ? error.message : "Unknown error occurred";
            toast.error(`Title generation failed: ${message}`);
        } finally {
            setIsInferringTitle(false);
        }
    }, [editorRef, handleSaveTitle]);

    return {
        currentTitle, // The currently persisted/displayed title
        isEditingTitle,
        newTitleValue, // The value in the input field during editing
        isInferringTitle,
        handleEditTitleClick,
        handleCancelEditTitle,
        handleSaveTitle,
        handleTitleInputKeyDown,
        handleInferTitle,
        setNewTitleValue, // Expose setter for the input field
    };
} 