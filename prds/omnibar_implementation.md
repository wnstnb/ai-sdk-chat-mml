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
- **Technology:** Supabase, `pgvector`, BlockNote, Edge Functions, React, Zustand.

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

**Phase 1: UI & Global State**

1.  **Create Omnibar Component:**
    *   Create `components/search/Omnibar.tsx`.
    *   Include an input field.
    *   Add a clear button ('X').
    *   **(New for /editor):** Implement logic to display a dropdown/overlay containing search results *when results are available and the component is used in a context requiring it* (e.g., via a prop `displayResultsInline={true}`). This dropdown should render `SearchResultItem` components.
    *   Style appropriately (Tailwind CSS).
2.  **Global State (Zustand):**
    *   Ensure the Zustand store includes:
        *   `searchQuery`: string.
        *   `searchResults`: array of document objects (e.g., `{ id, name, folder_id }[]`) or null.
        *   `isSearching`: boolean (Primarily relevant for `/launch` view state).
        *   `isLoadingSearch`: boolean.
        *   `searchError`: string | null.
    *   Add actions: `setSearchQuery`, `setSearchResults`, `setIsLoadingSearch`, `setSearchError`, `clearSearch`.
3.  **Connect Omnibar to State:**
    *   `Omnibar.tsx` reads `searchQuery`, `searchResults`, `isLoadingSearch`, `searchError` from the store.
    *   Input `onChange` calls `setSearchQuery`.
    *   Clear button calls `clearSearch` action (which should reset query, results, error, loading, isSearching states).
    *   **(New):** Result items in the inline dropdown (for `/editor`) should trigger navigation (`router.push('/editor/[id]')`).

**Phase 2: Backend Setup & Embedding Pipeline (Unchanged from previous plan)**

1.  **Database Schema & Setup:** (Enable `vector`, modify `documents`, create `documents_embeddings`, add indexes, RLS).
2.  **Client-Side Save Logic Update:** (Update document save logic in `/editor` to generate markdown via `blocksToMarkdownLossy` and save to `searchable_content`).
3.  **Embedding Generation Pipeline:** (Implement async Edge Function using `gte-small` via `Supabase.ai.Session`, trigger on document changes, handle NULL content, backfill).

**Phase 3: Backend Search API & Logic (Unchanged from previous plan)**

1.  **API Endpoint:** (`app/api/search-documents/route.ts` handling GET).
2.  **Search Logic:** (Generate query embedding, perform vector search + optional hybrid, join documents, return results).

**Phase 4: Frontend Integration & Logic**

1.  **API Hook:**
    *   Ensure `hooks/useSearch.ts` (or similar) provides a function `triggerSearch(query: string)`.
    *   This function calls the backend API (`GET /api/search-documents`).
    *   It updates the Zustand store with results, loading, and error states.
2.  **Debounced Search Trigger:**
    *   In a central place (e.g., a hook used by both pages, or potentially within the `Omnibar` component itself if carefully managed), use `useEffect` and `useDebounce` to watch the `searchQuery` from the store.
    *   When the debounced query changes (and isn't empty), call `triggerSearch` and set `isSearching` (in store) to true.
    *   If the debounced query becomes empty, call `clearSearch`.
3.  **Integrate into `/launch` Page:**
    *   In `app/launch/page.tsx`, render `<Omnibar />` above `NewFileManager`.
    *   Modify `NewFileManager.tsx`:
        *   Read `searchQuery`, `searchResults`, `isSearching`, `isLoadingSearch`, `searchError` from the store.
        *   If `isSearching` is true, display the search results (handling loading/error/empty states) *instead of* the normal file/folder list.
        *   Ensure result items, when clicked, navigate to `/editor/[id]`. (`SearchResultItem` reused or adapted).
4.  **Integrate into `/editor` Page:**
    *   In `app/editor/[documentId]/page.tsx` (or its layout/header), render `<Omnibar displayResultsInline={true} />`.
    *   The `Omnibar` component itself will handle showing the results dropdown based on the store's `searchResults` and this prop.
    *   Clicking results in the dropdown navigates to the corresponding editor page.

**Phase 5: Refinements (Largely Unchanged)**

1.  Loading/Error States (visuals in Omnibar dropdown and `NewFileManager`).
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
- **Backfilling Strategy:** Plan how to process existing documents efficiently without overloading resources.
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
*   **Create `documents_embeddings` Table:** Run the SQL provided in Phase 2, Step 1 of the plan, ensuring the `VECTOR(384)` dimensionality matches `gte-small`.
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
*   **Modify Supabase Call:** Ensure the `supabase.from('documents').update(...)` or `insert(...)` call uses the `updateData` object containing `name`, `content`, and `searchable_content`.

**3. Implement Embedding Edge Function (`supabase/functions/generate-embedding/index.ts`)**

*   **Create Function:** Use Supabase CLI: `supabase functions new generate-embedding`
*   **Implement Logic:**
    ```typescript
    // supabase/functions/generate-embedding/index.ts
    import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
    import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
    import { Session } from 'https://esm.sh/@supabase/edge-runtime/ai'

    serve(async (req) => {
        // 1. Validate request (e.g., check for Supabase webhook secret)
        // const webhookSecret = req.headers.get('X-Webhook-Secret');
        // if (webhookSecret !== Deno.env.get('YOUR_WEBHOOK_SECRET')) {
        //   return new Response('Unauthorized', { status: 401 });
        // }

        const payload = await req.json()
        const record = payload.record; // Or payload.old_record depending on trigger

        if (!record || !record.id || !record.user_id) {
            console.warn('Invalid payload received:', payload);
            return new Response('Invalid payload', { status: 400 });
        }

        const { id: document_id, user_id, searchable_content } = record;

        try {
            // 2. Create Supabase client with service_role key
            const supabaseAdmin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );

            // 3. Handle NULL/Empty Content
            if (!searchable_content?.trim()) {
                console.log(`Document ${document_id} content is empty. Deleting existing embedding.`);
                const { error: deleteError } = await supabaseAdmin
                    .from('documents_embeddings')
                    .delete()
                    .match({ document_id: document_id, user_id: user_id }); // Ensure user_id match for safety
                if (deleteError) {
                    console.error(`Error deleting embedding for ${document_id}:`, deleteError);
                    // Decide if this is a critical error
                }
                return new Response('Embedding deleted due to empty content.', { status: 200 });
            }

            // 4. Generate Embedding
            console.log(`Generating embedding for document ${document_id}...`);
            const session = new Session('gte-small');
            const embedding = await session.run(searchable_content, {
                mean_pool: true,
                normalize: true,
            });
            console.log(`Embedding generated for document ${document_id}.`);

            // 5. Upsert Embedding
            const { error: upsertError } = await supabaseAdmin
                .from('documents_embeddings')
                .upsert({
                    document_id: document_id,
                    user_id: user_id,
                    embedding: embedding,
                }, { onConflict: 'document_id' }); // Assuming document_id should be unique or use PK

            if (upsertError) {
                throw new Error(`Failed to upsert embedding: ${upsertError.message}`);
            }

            console.log(`Successfully upserted embedding for document ${document_id}.`);
            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200,
            });

        } catch (error) {
            console.error(`Error processing document ${document_id}:`, error.message);
            return new Response(JSON.stringify({ error: error.message }), {
                headers: { 'Content-Type': 'application/json' },
                status: 500,
            });
        }
    });
    ```
*   **Set Environment Variables:** In Supabase project settings, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the Edge Function.
*   **Deploy Function:** `supabase functions deploy generate-embedding`
*   **Create DB Trigger:** In Supabase SQL editor, create a trigger on `documents` table `AFTER INSERT OR UPDATE` that calls this Edge Function (using `pg_net` or a webhook). Example using webhook:
    ```sql
    -- Function to trigger webhook
    CREATE OR REPLACE FUNCTION trigger_embedding_webhook()
    RETURNS TRIGGER AS $$
    DECLARE
      payload JSON;
      webhook_url TEXT := 'YOUR_EDGE_FUNCTION_URL'; -- Get from Supabase dashboard
      webhook_secret TEXT := 'YOUR_CHOSEN_WEBHOOK_SECRET'; -- Store securely
    BEGIN
      -- Choose record or old_record based on your needs
      payload := json_build_object('record', NEW);
      -- Or: payload := json_build_object('record', NEW, 'old_record', OLD);

      PERFORM net.http_post(
        url := webhook_url,
        body := payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Webhook-Secret', webhook_secret -- Optional secret header
        )
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql security definer;

    -- Trigger
    CREATE TRIGGER documents_embedding_trigger
    AFTER INSERT OR UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION trigger_embedding_webhook();
    ```
    *(Make sure `pg_net` is enabled: `create extension if not exists pg_net schema extensions;`)*

**4. Implement Search API Route (`app/api/search-documents/route.ts`)**

*   **Create File:** `app/api/search-documents/route.ts`
*   **Implement Logic:**
    ```typescript
    // app/api/search-documents/route.ts
    import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
    import { cookies } from 'next/headers'
    import { NextResponse } from 'next/server'
    import { Session } from '@supabase/edge-runtime/ai' // Use edge runtime for session
    import { createClient } from '@supabase/supabase-js' // For admin client if needed

    // Ensure this route uses edge runtime
    export const runtime = 'edge'

    export async function GET(request: Request) {
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('query')

        if (!query) {
            return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
        }

        const cookieStore = cookies()
        // Use route handler client for user auth
        const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

        try {
            // Get user session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session?.user?.id) {
                console.error('Auth Error:', sessionError);
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const userId = session.user.id;

            // Generate query embedding using the edge runtime session
            const aiSession = new Session('gte-small');
            const queryEmbedding = await aiSession.run(query, {
                mean_pool: true,
                normalize: true,
            });

            // Perform semantic search using Supabase RPC
            // Assumes you created a function `match_documents` in SQL
            const { data: documents, error: rpcError } = await supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.7, // Example threshold (adjust based on testing)
                match_count: 10,
                user_id_input: userId // Pass user_id for RLS in function
            });

            if (rpcError) {
                console.error('RPC Error:', rpcError);
                throw rpcError;
            }

            return NextResponse.json(documents || []);

        } catch (error) {
            console.error('Search Error:', error);
            return NextResponse.json({ error: 'Failed to perform search', details: error.message }, { status: 500 });
        }
    }
    ```
*   **Create SQL Function (`match_documents`)**: In Supabase SQL Editor:
    ```sql
    CREATE OR REPLACE FUNCTION match_documents (
      query_embedding vector(384),
      match_threshold float,
      match_count int,
      user_id_input uuid -- Parameter for user ID
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
        1 - (de.embedding <=> query_embedding) AS similarity -- Convert distance to similarity
      FROM documents_embeddings de
      JOIN documents d ON de.document_id = d.id
      WHERE de.user_id = user_id_input -- Filter by user ID here
      AND 1 - (de.embedding <=> query_embedding) > match_threshold
      ORDER BY similarity DESC
      LIMIT match_count;
    END;
    $$;
    ```
    *(Note: This function explicitly filters by `user_id`. Ensure RLS on the tables is also correctly set up for defense in depth).* 

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
    import { useSearchStore } from '@/store/useAppStore'; // Adjust path
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

**8. Backfilling (Manual Script/Process)**

*   Create a script (e.g., Node.js or another Edge Function) that:
    *   Fetches all documents from the `documents` table.
    *   For each document, generates the markdown (`searchable_content`) if missing (this might be tricky server-side, ideally populate `searchable_content` first via client interaction or a best-effort conversion).
    *   Calls the embedding function/API for each document's `searchable_content`.
    *   Inserts the results into `documents_embeddings`.

**9. Styling & Refinements**

*   Apply Tailwind CSS classes to `Omnibar` and results dropdown for a sleek look.
*   Refine loading/error states.
*   Test keyboard navigation and accessibility.
*   Tune the `match_threshold` in the SQL function based on results. 