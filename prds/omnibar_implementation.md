# Implementation Plan: Reusable Semantic Search Omnibar

## Goal
Implement a **reusable** omnibar component that allows users to perform semantic search on documents. This component will be used on both the `/launch` page (integrated with the file manager) and the `/editor` page (for quick document switching).

## Context
- **Component:** `components/search/Omnibar.tsx` (Renamed for clarity, was `SearchBar.tsx`)
- **Display Locations:**
    - `/launch`: Above the `NewFileManager` component.
    - `/editor`: Typically in the header or a persistent top bar.
- **Data Source:** `documents` table and `documents_embeddings` table in Supabase.
- **Search Fields:** `documents.name` and `documents_embeddings.embedding`.
- **Technology:** Supabase, `pgvector`, BlockNote, Google GenAI SDK, **Next.js API Routes**, React, Zustand.

## Core Behaviors by Page

1.  **`/launch` Page (File Manager Integration):**
    *   **Search Input:** User types in the Omnibar.
    *   **API Call:** Debounced query triggers backend search API.
    *   **Result Display:** The `NewFileManager` component observes the search state (query, results, loading, error) from the global store and displays the results *within its own view*, replacing the normal file/folder list when a search is active (`isSearching` is true).
    *   **Clearing Search:** Clearing the Omnibar input resets the search state, and `NewFileManager` reverts to the normal file/folder view.
    *   **Selecting Result:** Clicking a search result item *within the `NewFileManager` display* navigates the user to `/editor/[documentId]`.

2.  **`/editor/[documentId]` Page (Quick Switch):**
    *   **Search Input:** User types in the Omnibar.
    *   **API Call:** Debounced query triggers backend search API.
    *   **Result Display:** Search results appear in a **dropdown/overlay directly below the Omnibar** component itself. The main editor content remains unchanged.
    *   **Clearing Search:** Clearing the Omnibar input hides the results dropdown.
    *   **Selecting Result:** Clicking a search result item *in the dropdown* navigates the user to the selected document (`/editor/[selectedDocumentId]`), effectively switching documents.

## Implementation Steps

**Phase 1: UI & Global State (✅ Completed)**

✅ **1. Create Omnibar Component:**
    *   Create `components/search/Omnibar.tsx`.
    *   Include an input field.
    *   Add a clear button ('X').
    *   **(New for /editor):** Implement logic to display a dropdown/overlay containing search results *when results are available and the component is used in a context requiring it* (e.g., via a prop `displayResultsInline={true}`). This dropdown should render `SearchResultItem` components.
    *   Style appropriately (Tailwind CSS).
✅ **2. Global State (Zustand):**
    *   **(New):** Add search state to a new or existing Zustand store (e.g., `stores/useSearchStore.ts` or integrated into `stores/useAppStore.ts`).
    *   Ensure the Zustand store includes:
        *   `searchQuery`: string.
        *   `searchResults`: array of document objects (e.g., `{ id, name, folder_id }[]`) or null.
        *   `isSearching`: boolean (Primarily relevant for `/launch` view state).
        *   `isLoadingSearch`: boolean.
        *   `searchError`: string | null.
    *   Add actions: `setSearchQuery`, `setSearchResults`, `setIsLoadingSearch`, `setSearchError`, `clearSearch`.
✅ **3. Connect Omnibar to State:**
    *   `Omnibar.tsx` reads `searchQuery`, `searchResults`, `isLoadingSearch`, `searchError` from the store.
    *   Input `onChange` calls `setSearchQuery`.
    *   Clear button calls `clearSearch` action (which should reset query, results, error, loading, isSearching states).
    *   **(New):** Result items in the inline dropdown (for `/editor`) should trigger navigation (`router.push('/editor/[id]')`).

**Phase 2: Backend Setup & Embedding Generation (✅ Completed)**

✅ **1. Database Schema & Setup:** (Enable `vector`, modify `documents`, create `documents_embeddings` with `VECTOR(768)`, add indexes, RLS - **No Trigger Function/Trigger**).
✅ **2. Client-Side Save Logic Update:** (Update document **autosave** logic in `/editor` to generate markdown via `blocksToMarkdownLossy` and save **both `content` and `searchable_content`** to the `documents` table).
✅ **3. Embedding Generation API Endpoint:** Create a **new API Route** (e.g., `app/api/generate-embedding/route.ts`) that:
    *   Accepts a `documentId` (likely via POST request body).
    *   Authenticates the user.
    *   Fetches the `searchable_content` for the given `documentId` and authenticated `user_id` from the `documents` table.
    *   If content exists, calls the Google GenAI API (`text-embedding-004`, `RETRIEVAL_DOCUMENT`) to get the embedding.
    *   Upserts the embedding into the `documents_embeddings` table.
    *   If content is NULL/empty, deletes any existing embedding for the document.
✅ **4. Client-Side Trigger Logic:** Implement logic in `app/editor/[documentId]/page.tsx` to call the `/api/generate-embedding` endpoint **when the user navigates away from the editor page**.

**Phase 3: Backend Search API & Logic (✅ Completed - Standard Runtime)**

✅ **1. API Endpoint:** (`app/api/search-documents/route.ts` handling GET, **using standard Serverless Function runtime, not Edge**).
✅ **2. Search Logic:** (Generate query embedding using Google GenAI SDK ('text-embedding-004', `RETRIEVAL_QUERY`), perform vector search, join documents, return results).

**Phase 4: Frontend Integration & Logic (✅ Completed)**

✅ **1. API Hook:**
    *   Ensure `hooks/useSearch.ts` (or similar) provides a function `triggerSearch(query: string)`.
    *   This function calls the backend API (`GET /api/search-documents`).
    *   It updates the Zustand store with results, loading, and error states.
✅ **2. Debounced Search Trigger:**
    *   **(New):** Install the `use-debounce` dependency (`npm install use-debounce`).
    *   In the `Omnibar` component, use `useEffect` and `useDebounce` to watch the `searchQuery` from the store.
    *   When the debounced query changes (and isn't empty), call `triggerSearch` and set `isSearching` (in store) to true.
    *   If the debounced query becomes empty, call `clearSearch`.
✅ **3. Integrate into `/launch` Page:**
    *   In `app/launch/page.tsx`, render `<Omnibar />` above `NewFileManager`.
    *   Modify `NewFileManager.tsx`:
        *   Read `searchQuery`, `searchResults`, `isSearching`, `isLoadingSearch`, `searchError` from the store.
        *   If `isSearching` is true, display the search results (handling loading/error/empty states) *instead of* the normal file/folder list.
        *   Ensure result items, when clicked, navigate to `/editor/[id]`. (`SearchResultItem` reused or adapted).
✅ **4. Integrate into `/editor` Page:**
    *   In `app/editor/[documentId]/page.tsx` (or its layout/header), render `<Omnibar displayResultsInline={true} />`.
    *   The `Omnibar` component itself will handle showing the results dropdown based on the store's `searchResults` and this prop.
    *   Clicking results in the dropdown navigates to the corresponding editor page.

**Phase 5: Refinements (⏳ Pending)**

⏳ 1. Loading/Error States (visuals in Omnibar dropdown and `NewFileManager`).
2.  Debouncing effectiveness.
3.  Accessibility.
4.  Hybrid Ranking tuning.
5.  Embedding Status indication (optional).
6.  Backfilling UI/feedback.

## Considerations (Updated)
- **Component Reusability:** Ensure `Omnibar.tsx` props and state usage support both display modes (inline dropdown vs. delegating display).
- **State Management:** Global state simplifies sharing search status, but ensure clear separation of concerns between the Omnibar input/triggering and the result display logic on different pages.
- (Other considerations like Embedding Model, Pipeline Robustness, etc., remain the same)

## Additional Considerations
- **Embedding Model Choice:** Impacts cost, performance, dimensionality, and search quality. Choose carefully and consistently.
- **Pipeline Robustness:** Ensure the async embedding function handles errors gracefully (e.g., embedding API failures, transient DB issues). Add monitoring/logging.
- **Backfilling Strategy:** (Skipped for initial implementation) No backfilling of existing documents needed at this stage.
- **`pgvector` Indexing:** Choose the right index type (HNSW vs. IVFFlat) and parameters based on dataset size and query patterns. HNSW is generally preferred for better recall.
- **Hybrid Search:** Adds complexity but often improves relevance by capturing both keyword and semantic matches.
- **Cost:** Factor in embedding API costs (if applicable), Supabase compute for Edge Functions/DB Functions, and vector storage/querying resources.

## Additional Considerations
- **Scalability:** The backend search approach (Phase 3) is crucial for scalability compared to frontend filtering.
- **FTS Setup:** Implementing Full-Text Search requires database migrations/setup in Supabase.
- **Result Context:** Decide if displaying the parent folder name or path alongside search results is necessary. This adds complexity to the search query or requires additional client-side lookup.

## Detailed Implementation Steps

This section outlines specific code changes based on the current project structure.

**1. Database Schema Changes (Manual/Supabase UI)**

*   **Enable Extension:** In your Supabase project SQL editor, run: `CREATE EXTENSION IF NOT EXISTS vector;`
*   **Modify `documents` Table:** Add the `searchable_content` column:
    ```sql
    ALTER TABLE public.documents
    ADD COLUMN searchable_content TEXT NULL;
    ```
*   **Create `documents_embeddings` Table:** Run the SQL provided in Phase 2, Step 1 of the plan, ensuring the `VECTOR(768)` dimensionality matches `text-embedding-004`.
*   **Setup RLS:** Ensure RLS is enabled and appropriate policies are added to `documents_embeddings` as detailed in the plan.
*   **Create Index:** Run the `CREATE INDEX` command (HNSW recommended) on `documents_embeddings(embedding)`.

**2. Client-Side Save Logic Update (`app/editor/[documentId]/page.tsx`)**

*   **Locate Save Function:** Find the function responsible for saving document updates to Supabase (e.g., likely within a `useEffect` hook watching editor changes, or an explicit save button handler).
*   **Generate Markdown:** Inside this function, *before* the Supabase client call:
    ```typescript
    // Assuming editorRef is the ref to the BlockNoteView
    const editor = editorRef.current?._editor;
    if (editor) {
        try {
            const currentBlocks = editor.document;
            // Generate markdown, handle potential emptiness
            const markdownContent = currentBlocks.length > 0
                ? await editor.blocksToMarkdownLossy(currentBlocks)
                : ''; // Use empty string if editor content is empty

            // Prepare data payload for Supabase
            const updateData = {
                name: documentName, // Assuming you have the current name
                content: currentBlocks.length > 0 ? currentBlocks : null, // Store null if empty
                searchable_content: markdownContent.trim() || null, // Store null if markdown is empty/whitespace
                // Include user_id if needed for the update call
            };

            // *** Original Supabase update call goes here, using updateData ***
            // e.g., const { error } = await supabase
            //          .from('documents')
            //          .update(updateData)
            //          .match({ id: params.documentId, user_id: userId });

        } catch (error) {
            console.error('Error preparing document data for saving:', error);
            // Handle error appropriately (e.g., toast notification)
        }
    }
    ```
*   **Modify Supabase Call:** Ensure the `supabase.from('documents').update(...)` or `insert(...)` call within the **autosave logic** uses the `updateData` object containing `name`, `content`, and `searchable_content`.
*   **(New) Implement Navigation Trigger:** Add logic (e.g., `useEffect` cleanup function) to call the `/api/generate-embedding` endpoint when the component unmounts or the user navigates away.

**3. Implement Embedding Generation API Route (`app/api/generate-embedding/route.ts`)**

*   **Create File:** `app/api/generate-embedding/route.ts`
*   **Implement Logic:**
    ```typescript
    // app/api/generate-embedding/route.ts
    import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
    import { cookies } from 'next/headers'
    import { NextResponse } from 'next/server'
    import { createClient } from '@supabase/supabase-js'

    // Using fetch directly for Gemini API
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_EMBEDDING_MODEL = 'models/text-embedding-004';
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

    export async function POST(request: Request) {
        if (!GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY environment variable not set for embedding route.");
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const { documentId } = await request.json();

        if (!documentId) {
            return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
        }

        const cookieStore = cookies();
        const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
        // Need admin client for potential cross-schema access or elevated privileges if necessary,
        // but try with user client first respecting RLS.
        // Use Admin Client to fetch document content as RLS might prevent direct access needed here
        // Ensure proper security checks are in place if using Admin Client.
         const supabaseAdmin = createClient(
             process.env.NEXT_PUBLIC_SUPABASE_URL || '',
             process.env.SUPABASE_SERVICE_ROLE_KEY || ''
         );

        try {
            // 1. Get User Session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session?.user?.id) {
                console.error('Auth Error:', sessionError);
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const userId = session.user.id;

            // 2. Fetch Document Content using Admin Client (verify ownership)
            const { data: documentData, error: fetchError } = await supabaseAdmin
                .from('documents')
                .select('searchable_content, user_id')
                .eq('id', documentId)
                .single();

            if (fetchError) {
                 console.error(`Error fetching document ${documentId}:`, fetchError);
                 if (fetchError.code === 'PGRST116') { // Not found
                    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
                 }
                 return NextResponse.json({ error: 'Failed to fetch document content' }, { status: 500 });
            }

            // !! SECURITY CHECK: Ensure the fetched document belongs to the authenticated user !!
            if (documentData.user_id !== userId) {
                 console.error(`User ${userId} attempted to access document ${documentId} owned by ${documentData.user_id}`);
                 return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }

            const searchable_content = documentData.searchable_content;

            // 3. Handle NULL/Empty Content - Delete existing embedding
            if (!searchable_content?.trim()) {
                console.log(`Document ${documentId} content is empty. Deleting existing embedding.`);
                const { error: deleteError } = await supabaseAdmin // Use Admin for delete too
                    .from('documents_embeddings')
                    .delete()
                    .match({ document_id: documentId }); // Only need documentId due to unique constraint

                if (deleteError) {
                    console.error(`Error deleting embedding for ${documentId}:`, deleteError);
                    // Log error but proceed; maybe embedding didn't exist
                }
                return NextResponse.json({ message: 'Embedding deleted due to empty content.' }, { status: 200 });
            }

            // 4. Generate Embedding via Gemini API
            console.log(`Generating Gemini embedding for document ${documentId}...`);
             const embedApiResponse = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: { parts: [{ text: searchable_content }] },
                    task_type: "RETRIEVAL_DOCUMENT",
                }),
            });
            // ... (Error handling for fetch and parsing response as before) ...
            if (!embedApiResponse.ok) { /* ... handle Gemini API error ... */ throw new Error(/*...*/); }
            const embedApiData = await embedApiResponse.json();
            if (!embedApiData.embedding?.values) { /* ... handle invalid response ... */ throw new Error(/*...*/); }
            const embedding = embedApiData.embedding.values;
            console.log(`Gemini embedding generated for document ${documentId}.`);

            // 5. Upsert Embedding using Admin Client
            const { error: upsertError } = await supabaseAdmin
                .from('documents_embeddings')
                .upsert({
                    document_id: documentId,
                    user_id: userId, // Store user_id for RLS on embedding table
                    embedding: embedding,
                }, { onConflict: 'document_id' });

            if (upsertError) {
                console.error('Upsert Error:', upsertError);
                throw new Error(`Failed to upsert embedding: ${upsertError.message}`);
            }

            console.log(`Successfully upserted embedding for document ${documentId}.`);
            return NextResponse.json({ success: true }, { status: 200 });

        } catch (error) {
            console.error(`Error processing embedding for document ${documentId}:`, error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to generate embedding';
            return NextResponse.json({ error: 'Failed to generate embedding', details: errorMessage }, { status: 500 });
        }
    }
    ```
*   **Set Environment Variables:** Ensure `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are available to your Next.js API route environment.

**4. Implement Search API Route (`app/api/search-documents/route.ts`)**

*   **Create File:** `app/api/search-documents/route.ts`
*   **Implement Logic (Using Google GenAI REST API):**
    ```typescript
    // app/api/search-documents/route.ts
    import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
    import { cookies } from 'next/headers'
    import { NextResponse } from 'next/server'
    // Using fetch directly for Gemini API

    // NOTE: This route runs as a standard Serverless Function (Node.js runtime).
    // const runtime = 'edge' // <-- REMOVED

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Access via process.env
    const GEMINI_EMBEDDING_MODEL = 'models/text-embedding-004';
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

    export async function GET(request: Request) {
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('query')

        if (!query) {
            return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
        }
        if (!GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY environment variable not set for search route.");
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }


        const cookieStore = cookies()
        const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session?.user?.id) {
                console.error('Auth Error:', sessionError);
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const userId = session.user.id;

            // Generate query embedding using Gemini REST API
             const embedApiResponse = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: { parts: [{ text: query }] },
                    task_type: "RETRIEVAL_QUERY", // Use for embedding the search query
                }),
            });

            if (!embedApiResponse.ok) {
                const errorBody = await embedApiResponse.text();
                 console.error("Gemini API Error Response (Query Embedding):", errorBody);
                throw new Error(`Gemini query embedding request failed with status ${embedApiResponse.status}: ${errorBody}`);
            }

            const embedApiData = await embedApiResponse.json();

            if (!embedApiData.embedding?.values) {
                 throw new Error("Invalid response structure from Gemini API (Query Embedding): embedding.values missing.");
            }
            const queryEmbedding = embedApiData.embedding.values;

            // Perform semantic search using Supabase RPC ('match_documents' needs VECTOR(768))
            const { data: documents, error: rpcError } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.7, // Adjust based on testing with Gemini embeddings
                match_count: 10,
                user_id_input: userId
            });

            if (rpcError) {
                console.error('RPC Error:', rpcError);
                throw rpcError;
            }

            return NextResponse.json(documents || []);

        } catch (error) {
            console.error('Search Error:', error);
            // Avoid leaking sensitive details like API errors in production responses
            const errorMessage = error instanceof Error ? error.message : 'Failed to perform search';
            return NextResponse.json({ error: 'Failed to perform search', details: errorMessage }, { status: 500 });
        }
    }
    ```
*   **Set Environment Variable:** Ensure `GEMINI_API_KEY` is set as an environment variable for your Next.js deployment (e.g., in Vercel settings).
*   **Update SQL Function (`match_documents`)**: In Supabase SQL Editor, ensure the function signature uses `vector(768)`:
    ```sql
    CREATE OR REPLACE FUNCTION match_documents (
      query_embedding vector(768), -- <<< CHANGE DIMENSION HERE
      match_threshold float,
      match_count int,
      user_id_input uuid
    )
    RETURNS TABLE (
      id uuid,
      name text,
      folder_id uuid,
      similarity float
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        d.id,
        d.name,
        d.folder_id,
        1 - (de.embedding <=> query_embedding) AS similarity
      FROM public.documents_embeddings de
      JOIN public.documents d ON de.document_id = d.id
      WHERE de.user_id = user_id_input
      AND 1 - (de.embedding <=> query_embedding) > match_threshold
      ORDER BY similarity DESC
      LIMIT match_count;
    END;
    $$;
    ```

**5. Global State Setup (Zustand)**

*   **Locate/Create Store:** Find where your Zustand store is defined (e.g., `store/useAppStore.ts`, `hooks/useStore.ts`) or create one.
*   **Add Search State:**
    ```typescript
    import { create } from 'zustand';

    interface SearchState {
        searchQuery: string;
        searchResults: { id: string; name: string; folder_id: string | null; similarity?: number }[] | null;
        isSearching: boolean;
        isLoadingSearch: boolean;
        searchError: string | null;
        setSearchQuery: (query: string) => void;
        setSearchResults: (results: SearchState['searchResults'] | null) => void;
        setIsLoadingSearch: (loading: boolean) => void;
        setSearchError: (error: string | null) => void;
        clearSearch: () => void;
    }

    // Assuming this is combined with other stores or standalone
    export const useSearchStore = create<SearchState>((set) => ({
        searchQuery: '',
        searchResults: null,
        isSearching: false,
        isLoadingSearch: false,
        searchError: null,
        setSearchQuery: (query) => set({ searchQuery: query }),
        setSearchResults: (results) => set({ searchResults: results }),
        setIsLoadingSearch: (loading) => set({ isLoadingSearch: loading }),
        setSearchError: (error) => set({ searchError: error }),
        clearSearch: () => set({
            searchQuery: '',
            searchResults: null,
            isSearching: false,
            isLoadingSearch: false,
            searchError: null,
        }),
    }));
    ```

**6. Create `Omnibar` Component (`components/search/Omnibar.tsx`)**

*   **Create File:** `components/search/Omnibar.tsx`
*   **Implement Logic:**
    ```typescript
    // components/search/Omnibar.tsx
    'use client';

    import React, { useState, useEffect, useRef } from 'react';
    import { Input } from '@/components/ui/input'; // Assuming Shadcn UI
    import { Button } from '@/components/ui/button';
    import { XIcon, SearchIcon, Loader2 } from 'lucide-react';
    import { useSearchStore } from '@/stores/useAppStore'; // Adjust path
    import { useRouter } from 'next/navigation';
    import { useDebounce } from 'use-debounce'; // Install use-debounce
    import { triggerSearch } from '@/hooks/useSearch'; // Create this hook/function

    interface OmnibarProps {
        displayResultsInline?: boolean;
    }

    interface SearchResult {
        id: string;
        name: string;
        folder_id: string | null;
        similarity?: number;
    }

    export function Omnibar({ displayResultsInline = false }: OmnibarProps) {
        const router = useRouter();
        const {
            searchQuery,
            searchResults,
            isLoadingSearch,
            searchError,
            setSearchQuery,
            clearSearch,
            setIsLoadingSearch,
            setSearchResults,
            setSearchError,
            setIsSearching // Add setIsSearching to store if not present
        } = useSearchStore();

        const [debouncedQuery] = useDebounce(searchQuery, 300);
        const inputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
            const performSearch = async () => {
                if (debouncedQuery.trim()) {
                    setIsLoadingSearch(true);
                    setIsSearching(true); // Mark search as active
                    setSearchError(null);
                    try {
                        const results = await triggerSearch(debouncedQuery);
                        setSearchResults(results);
                    } catch (error: any) {
                        console.error('Search failed:', error);
                        setSearchError(error.message || 'Search failed');
                        setSearchResults(null);
                    } finally {
                        setIsLoadingSearch(false);
                    }
                } else {
                    // Clear results if query is empty, but keep isSearching managed by clearSearch
                    if (searchQuery === '') {
                        clearSearch(); // Use clearSearch to fully reset
                    }
                }
            };
            performSearch();
         }, [debouncedQuery, setSearchResults, setIsLoadingSearch, setSearchError, setIsSearching, clearSearch, searchQuery]); // Added searchQuery dependency

        const handleSelectResult = (result: SearchResult) => {
            clearSearch(); // Clear search state on selection
            router.push(`/editor/${result.id}`);
            inputRef.current?.blur(); // Close dropdown potentially
        };

        const handleClear = () => {
            clearSearch();
            inputRef.current?.focus();
        };

        return (
            <div className="relative w-full max-w-lg mx-auto"> {/* Adjust styling as needed */} 
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10"
                />
                {isLoadingSearch && (
                    <Loader2 className="absolute right-10 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                )}
                {searchQuery && !isLoadingSearch && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6"
                        onClick={handleClear}
                    >
                        <XIcon className="h-4 w-4" />
                    </Button>
                )}

                {displayResultsInline && searchQuery && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                        {isLoadingSearch && !searchResults && (
                            <div className="p-4 text-center text-muted-foreground">Searching...</div>
                        )}
                        {searchError && (
                            <div className="p-4 text-center text-destructive">Error: {searchError}</div>
                        )}
                        {!isLoadingSearch && searchResults && searchResults.length === 0 && (
                            <div className="p-4 text-center text-muted-foreground">No results found.</div>
                        )}
                        {!isLoadingSearch && searchResults && searchResults.length > 0 && (
                            <ul>
                                {searchResults.map((result) => (
                                    <li key={result.id}>
                                        <button
                                            onClick={() => handleSelectResult(result)}
                                            className="block w-full text-left px-4 py-2 hover:bg-accent focus:outline-none focus:bg-accent"
                                        >
                                            {result.name}
                                            {/* Optionally add folder info here */}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        );
    }
    ```
*   **Create Search Hook (`hooks/useSearch.ts`)**:
    ```typescript
    // hooks/useSearch.ts
    export const triggerSearch = async (query: string) => {
        if (!query.trim()) {
            return [];
        }
        try {
            const response = await fetch(`/api/search-documents?query=${encodeURIComponent(query)}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Search request failed with status ${response.status}`);
            }
            const results = await response.json();
            return results;
        } catch (error) {
            console.error("Error fetching search results:", error);
            throw error; // Re-throw to be caught in the component
        }
    };
    ```

**7. Integrate `Omnibar` into Pages**

*   **`/app/launch/page.tsx`:**
    *   Import `Omnibar`.
    *   Render `<Omnibar />` above the `<NewFileManager />` component (when `activeView === 'newFileManager'`).
    *   Modify `NewFileManager`:
        *   Import `useSearchStore`.
        *   Get `isSearching`, `searchResults`, `isLoadingSearch`, `searchError` from the store.
        *   Conditionally render: If `isSearching`, map over `searchResults` to display them (using `DocumentItem` or a new `SearchResultItem`). Handle loading/error/empty states. Otherwise, render the normal file/folder view.
*   **`/app/editor/[documentId]/page.tsx` (or `components/header.tsx`)**:
    *   Import `Omnibar`.
    *   Render `<Omnibar displayResultsInline={true} />` in the desired location (e.g., header).

**8. Backfilling (Skipped)**

*   (No action needed for initial implementation)

**9. Styling & Refinements**

*   Apply Tailwind CSS classes to `Omnibar` and results dropdown for a sleek look.
*   Refine loading/error states.
*   Test keyboard navigation and accessibility.
*   Tune the `match_threshold` in the SQL function based on results **using Gemini embeddings**.
*   Tune the `match_threshold` in the SQL function based on results. 