import { useState, useEffect, useCallback, useRef } from 'react';
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
    
    // Use ref to track the last fetched documentId to prevent duplicate fetches
    const lastFetchedDocumentId = useRef<string | null>(null);

    console.log(`[useDocument] Hook called with documentId: ${documentId}, lastFetched: ${lastFetchedDocumentId.current}`);

    // Fetch Document Details (Name, Initial Content)
    const fetchDocument = useCallback(async () => {
        console.log(`[useDocument] fetchDocument called with documentId: ${documentId}, lastFetched: ${lastFetchedDocumentId.current}, hasContent: ${!!initialEditorContent}`);
        
        // Prevent duplicate fetches for the same document ONLY if we already have content
        if (lastFetchedDocumentId.current === documentId && initialEditorContent && initialEditorContent.length > 0) {
            console.log(`[useDocument] Skipping duplicate fetch for document: ${documentId} - already have content`);
            return;
        }

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
            lastFetchedDocumentId.current = null;
            return;
        }

        console.log(`[useDocument] Fetching document: ${documentId}`);
        lastFetchedDocumentId.current = documentId;

        try {
            const response = await fetch(`/api/documents/${documentId}`);
            console.log(`[useDocument] Fetch response status: ${response.status}`);
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                throw new Error(
                    errData.error?.message || `Failed to fetch document (${response.status})`
                );
            }
            const { data }: { data: SupabaseDocument } = await response.json();
            console.log(`[useDocument] Fetched data:`, data);
            
            if (!data) {
                throw new Error("Document not found or access denied.");
            }
            setDocumentData(data);

            // Initialize Editor Content - provide default block if empty/invalid
            const defaultInitialContent: PartialBlock[] = [{ type: 'paragraph', content: [] }];
            console.log(`[useDocument] Processing content, type: ${typeof data.content}, isArray: ${Array.isArray(data.content)}, length: ${Array.isArray(data.content) ? data.content.length : 'N/A'}`);
            
            if (typeof data.content === 'object' && data.content !== null && Array.isArray(data.content)) {
                // Validate if content somewhat matches BlockNote structure (basic check)
                if (data.content.length === 0) {
                    console.log("[useDocument] Document content is empty array, initializing editor with default block.");
                    setInitialEditorContent(defaultInitialContent);
                } else if (data.content[0] && typeof data.content[0].type === 'string') {
                    console.log("[useDocument] Setting initial content with fetched content, first block:", data.content[0]);
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
    }, [documentId, initialEditorContent]); // Dependency: only refetch if documentId changes

    // Initial data fetch on component mount or when documentId changes
    useEffect(() => {
        console.log(`[useDocument] useEffect triggered, documentId: ${documentId}, lastFetched: ${lastFetchedDocumentId.current}, hasContent: ${!!initialEditorContent}, shouldFetch: ${lastFetchedDocumentId.current !== documentId || !initialEditorContent}`);
        
        // Fetch if documentId has changed OR if we don't have content for the current document
        if (lastFetchedDocumentId.current !== documentId || !initialEditorContent) {
            fetchDocument();
        }
    }, [documentId, fetchDocument, initialEditorContent]); // Add initialEditorContent to dependency array

    console.log(`[useDocument] Returning state - isLoading: ${isLoadingDocument}, hasContent: ${!!initialEditorContent}, contentLength: ${initialEditorContent?.length || 0}`);

    return {
        documentData,
        initialEditorContent,
        isLoadingDocument,
        error,
    };
} 