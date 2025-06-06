import { useState, useEffect, useCallback } from 'react';
import type { PartialBlock } from '@blocknote/core';
import type { Document as SupabaseDocument } from '@/types/supabase';
import { BlockNoteSchema } from '@blocknote/core';

// Define the schema inline for now
// Consider centralizing if used elsewhere
const schema = BlockNoteSchema.create();

export interface UseDocumentReturn {
    documentData: SupabaseDocument | null;
    initialEditorContent: PartialBlock<typeof schema.blockSchema>[] | undefined;
    isLoadingDocument: boolean;
    error: string | null;
    // fetchDocument: () => Promise<void>; // Keep internal for now
}

export function useDocument(documentId: string | undefined | null): UseDocumentReturn {
    const [documentData, setDocumentData] = useState<SupabaseDocument | null>(null);
    const [initialEditorContent, setInitialEditorContent] = useState<
        PartialBlock<typeof schema.blockSchema>[] | undefined
    >(undefined);
    const [isLoadingDocument, setIsLoadingDocument] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch Document Details (Name, Initial Content)
    const fetchDocument = useCallback(async () => {
        // Reset states on new fetch attempt (e.g., if documentId changes)
        setIsLoadingDocument(true);
        setError(null);
        setDocumentData(null);
        setInitialEditorContent(undefined);

        if (!documentId) {
            setError("Document ID is missing.");
            setIsLoadingDocument(false);
            // Set default content even on error to prevent editor crash
            setInitialEditorContent([{ type: 'paragraph', content: [] }]);
            return;
        }

        console.log(`[useDocument] Fetching document: ${documentId}`);

        try {
            const response = await fetch(`/api/documents/${documentId}`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                throw new Error(
                    errData.error?.message || `Failed to fetch document (${response.status})`
                );
            }
            const { data }: { data: SupabaseDocument } = await response.json();
            if (!data) {
                throw new Error("Document not found or access denied.");
            }
            setDocumentData(data);

            // Initialize Editor Content - provide default block if empty/invalid
            const defaultInitialContent: PartialBlock[] = [{ type: 'paragraph', content: [] }];
            if (typeof data.content === 'object' && data.content !== null && Array.isArray(data.content)) {
                // Validate if content somewhat matches BlockNote structure (basic check)
                if (data.content.length === 0) {
                    console.log("[useDocument] Document content is empty array, initializing editor with default block.");
                    setInitialEditorContent(defaultInitialContent);
                } else if (data.content[0] && typeof data.content[0].type === 'string') {
                    setInitialEditorContent(data.content as PartialBlock<typeof schema.blockSchema>[]); // Trust the fetched content
                    console.log("[useDocument] Initialized editor with fetched BlockNote content.");
                } else {
                    console.warn('[useDocument] Fetched content does not look like BlockNote structure. Initializing with default block.', data.content);
                    setInitialEditorContent(defaultInitialContent);
                }
            } else if (!data.content) {
                console.log("[useDocument] Document content is null/undefined, initializing editor with default block.");
                setInitialEditorContent(defaultInitialContent);
            } else {
                console.warn(
                    '[useDocument] Document content is not in expected BlockNote format. Initializing with default block.', data.content
                );
                setInitialEditorContent(defaultInitialContent);
            }

        } catch (err: any) {
            console.error('[useDocument] Error fetching document:', err);
            setError(`Failed to load document: ${err.message}`);
            setDocumentData(null); // Clear data on error
            // Set default content even on error to prevent editor crash
            setInitialEditorContent([{ type: 'paragraph', content: [] }]);
        } finally {
            setIsLoadingDocument(false);
        }
    }, [documentId]); // Dependency: only refetch if documentId changes

    // Initial data fetch on component mount or when documentId changes
    useEffect(() => {
        fetchDocument();
    }, [fetchDocument]); // Effect depends on the memoized fetchDocument

    return {
        documentData,
        initialEditorContent,
        isLoadingDocument,
        error,
    };
} 