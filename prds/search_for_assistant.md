# AI Assistant Document Search and Tagging Feature

## 1. Objective

To empower the AI assistant with the ability to search through documents based on user queries, utilizing both title matching and semantic similarity (via embeddings). The assistant will present the search results to the user, allowing them to "tag" specific documents to be included in the conversational context for subsequent interactions.

## 2. Background & Current State Analysis

The project currently has two distinct document search functionalities:

*   **`components/chat/DocumentSearchInput.tsx`**:
    *   Provides a user-facing input field for searching and tagging documents directly within the chat interface.
    *   Likely performs a title-based or keyword search via the `/api/chat-tag-search` endpoint.
    *   When a document is selected, it calls `onDocumentSelected` to notify the parent component, which then presumably adds it to a list of "tagged" documents for the chat.
    *   This component handles dynamic dropdown display, debouncing, and click-outside/escape key handling.

*   **`components/search/Omnibar.tsx`**:
    *   A global search component, potentially for navigating to documents rather than tagging them directly into chat context.
    *   Uses a Zustand store (`useSearchStore`) for managing search state (`searchQuery`, `searchResults`, `isLoadingSearch`, etc.).
    *   Calls `triggerSearch` (from `hooks/useSearch.ts`) to perform searches. This hook might implement more sophisticated search logic, possibly including semantic search if already built.
    *   Displays results inline or can navigate the user to the selected document (e.g., `/editor/${result.id}`).

*   **AI SDK Documentation (`@AI-SDKDocs`)**:
    *   **Tool Creation**: The RAG chatbot guide (`https://ai-sdk.dev/docs/guides/rag-chatbot`) demonstrates creating tools for the AI model (e.g., `getInformation`). This involves defining a tool with a schema (e.g., using Zod) and providing it to the model.
    *   **Semantic Search Example**: The `lib/ai/embedding.ts` file in the RAG guide contains `generateEmbedding` and `findRelevantContent` functions. `findRelevantContent` embeds the user query, searches a database (using Drizzle ORM and `cosineDistance` with `pgvector` or similar) for semantically similar content, and returns the top matches. This is highly relevant for our semantic search requirement.
    *   **Tool Invocation & Response**: The AI model can decide to call these tools based on the conversation. The results of the tool call are then available to the model to formulate its response. The system prompt can guide the AI on when and how to use tools and interpret their results.
    *   **Streaming & UI Updates**: The AI SDK supports streaming responses, including tool calls and results, which can be used to update the UI progressively.

## 3. Proposed Implementation

We will introduce a new tool for the AI assistant, `searchAndTagDocuments`, which encapsulates the search and presentation logic.

### 3.1. New AI Tool: `searchAndTagDocuments`

*   **Purpose**: To allow the AI to search documents using a combined strategy and present them with tagging options.
*   **Tool Definition (Conceptual, using AI SDK structure)**:
    ```typescript
    // In a relevant backend file, e.g., a new tools definition file or existing AI handler
    import { z } from 'zod';
    import { tool }_from_ 'ai'; // Assuming 'ai' package
    // ... other imports for search logic

    export const searchAndTagDocumentsTool = tool({
      description: 'Searches documents by title and semantic content. Returns a list of relevant documents that the user can choose to tag for context.',
      parameters: z.object({
        searchQuery: z.string().describe('The user's query to search for in the documents.'),
      }),
      execute: async ({ searchQuery }) => {
        // 1. Perform title-based search (details in 3.2)
        const titleMatches = await searchByTitle(searchQuery);

        // 2. Perform semantic search (details in 3.2)
        const semanticMatches = await searchByEmbeddings(searchQuery);

        // 3. Combine and rank results (details in 3.3)
        const combinedResults = combineAndRankResults(titleMatches, semanticMatches);

        // 4. Format results for the AI to present
        // The AI will then use this structured data to generate a message for the user.
        // The actual "Tag Document" buttons will be a UI concern triggered by user interaction with the AI's message.
        return {
          documents: combinedResults.map(doc => ({
            id: doc.id,
            name: doc.name,
            confidence: doc.confidence,
            // Add a snippet or summary if feasible
            summary: doc.summary || truncate(doc.content, 100) 
          })),
          searchPerformed: true,
          queryUsed: searchQuery,
          presentationStyle: 'listWithTagButtons'
        };
      },
    });
    ```

### 3.2. Backend Search Logic

We'll need to implement or adapt backend functions for both title and semantic search. This might involve creating a new API endpoint or integrating logic directly into the tool's `execute` function if it runs server-side.

*   **Title Search (`searchByTitle`)**:
    *   This function should perform a search based on the document's title (likely the `name` field in the `documents` table).
    *   The implementation should be similar to the backend logic that powers the existing `/api/chat-tag-search` endpoint used by `DocumentSearchInput.tsx`.
    *   It will likely use a case-insensitive partial match (e.g., SQL `ILIKE '%query%'`) against the document titles.
    *   This search should return a list of matching documents with at least their `id` and `name`.
    *   For scoring purposes, a simple approach could be to assign a binary score (e.g., 1 for a match, 0 for no match) or a normalized relevance score if the underlying search mechanism provides one (e.g., from a full-text search rank). This score will then be used in the combined ranking (see section 3.3).

*   **Semantic Search (`searchByEmbeddings`)**:
    *   This will leverage the existing `documents_embeddings` table and the established embedding generation and querying mechanisms.
    *   The function will:
        1.  Generate an embedding for the `searchQuery` using the project's standard embedding model (e.g., Gemini `models/text-embedding-004`, ensure consistency with how `documents_embeddings` are populated, like in `app/api/generate-embedding/route.ts` and `app/api/search-documents/route.ts`).
        2.  Query the `documents_embeddings` table. This can be done by:
            *   Adapting the logic from `app/api/search-documents/route.ts`, potentially by calling the Supabase RPC function `match_documents` if it's suitable for direct use or re-implementing a similar query using `cosineDistance` (or the appropriate distance/similarity metric for the vector type, e.g., `L2` distance, inner product for normalized embeddings) against the `documents_embeddings.embedding` column.
            *   The query should filter by `user_id` to respect data ownership/visibility, similar to how `match_documents` RPC likely operates.
        3.  The `match_threshold` (e.g., for `match_documents` or a `WHERE similarity > X` clause) will need to be determined and potentially made configurable or tuned.
    *   This search should return a list of document IDs and their similarity scores. The function will then need to fetch other document details (like `name`) from the main `documents` table using these IDs.
    *   The result should be a list of documents with `id`, `name`, and `similarity` score.

### 3.3. Combining and Ranking Results

*   A crucial step is to merge the results from title and semantic searches into a single, ranked list.
*   **Strategy**:
    1.  **De-duplication**: Documents found by both methods should appear once. If a document is found by both title and semantic search, its scores from both methods should be used in the combined calculation.
    2.  **Scoring**:
        *   **Normalization**: Ensure both `semanticScore` (from `searchByEmbeddings`) and `titleMatchScore` (from `searchByTitle`) are normalized to a common range (e.g., 0 to 1) before combination. The `semanticScore` from vector similarity searches is often already in this range (e.g., cosine similarity). The `titleMatchScore` might be binary (1 for match, 0 for no match) or could be a more nuanced score from a full-text search system.
        *   **Combination**: The final combined score for a document will be calculated as: 
            `finalScore = (0.55 * semanticScore) + (0.45 * titleMatchScore)`.
        *   If a document is only found by one method, the score from the other method can be considered 0 for this calculation (or a very low default if that makes more sense for the normalization strategy).
    3.  **Thresholding**: Only documents with a `finalScore >= 0.6` will be considered relevant and returned.
    4.  **Sorting**: Sort the final list of relevant documents by their `finalScore` in descending order.
    5.  **Limit**: Limit the number of results returned (e.g., top 5-10) from the sorted and thresholded list.

### 3.4. AI Assistant Integration

*   **Tool Registration**: Add the `searchAndTagDocumentsTool` to the list of tools available to the AI model in the main chat handler (e.g., `app/api/chat/route.ts` or similar).
    ```typescript
    // app/api/chat/route.ts (example)
    // ...
    const result = await streamText({
      model: openai('gpt-4o'), // or your chosen model
      messages,
      system: `You are a helpful assistant. 
               If the user asks to find information in documents, use the "searchAndTagDocuments" tool. 
               When the tool returns a list of documents (presentationStyle: 'listWithTagButtons'), you MUST present these documents as a list to the user. 
               For each document, state its name and inform the user that there will be an option (a button rendered by the interface) next to it to "Tag Document" for context. 
               Do not ask the user to type a command to tag the document. The tagging will happen via UI interaction with the buttons.
               After presenting the list, await further instructions or questions from the user.`,
      tools: {
        // ... other tools
        searchAndTagDocuments: searchAndTagDocumentsTool
      }
    });
    // ...
    ```
*   **System Prompt Update**: Modify the system prompt to guide the AI on:
    *   When to use the `searchAndTagDocumentsTool`.
    *   How to interpret the tool's output (the list of documents).
    *   How to present the results to the user (e.g., "I found these documents related to your query. For each document listed below, you can click the 'Tag Document' button next to its name to add it to our current context:").
    *   The AI should understand that its role is to present this list, and the frontend will handle rendering the actual buttons. The AI should then await the user's next action (e.g., a follow-up question using the newly tagged context, or a new query).

### 3.5. Frontend: Rendering Search Results and "Tag Document" Interaction

This is where the AI's response (which includes the tool call results) is translated into a user interface.

*   **Message Parsing**: The frontend chat component (`components/chat-messages.tsx` or similar) will receive messages from the AI. If a message contains results from the `searchAndTagDocumentsTool`, it needs to be rendered specially.
*   **Custom UI for Search Results**:
    *   Instead of plain text, display a list of documents.
    *   Each item in the list should show:
        *   Document name (e.g., `doc.name`).
        *   Confidence score (optional, for internal debugging or if useful for the user).
        *   A "Tag Document" button or a similar interactive element.
*   **"Tag Document" Button/Action**:
    *   The `ChatInputUI.tsx` already demonstrates a system for managing and displaying tagged documents (pills with remove buttons) using `onAddTaggedDocument` and `onRemoveTaggedDocument` props.
    *   When the user clicks a "Tag Document" button next to a document in the AI's search result message:
        1.  **Identify the Document**: The button needs to be associated with the document's `id` and `name` (or the full `TaggedDocument` object if the tool returns it).
        2.  **Trigger Existing Tagging Mechanism**: The click handler for this button should call the existing `onAddTaggedDocument` function (available in the context of `ChatInputUI.tsx` or its parent component/hook that manages chat interactions). This function is already responsible for updating the state of tagged documents.
            *   Example: User clicks "Tag" for "Project Alpha Spec" (ID: "doc-alpha-spec"). The button's `onClick` handler would effectively call `onAddTaggedDocument({ id: "doc-alpha-spec", name: "Project Alpha Spec" })`.
    *   **No New AI Tool for Tagging**: The AI's role is to *present* the documents. The actual act of tagging is a UI-driven interaction that utilizes the existing frontend infrastructure.
*   **Updating Context**:
    *   Since we are using the existing tagging mechanism (e.g., in `ChatInputUI.tsx` or a shared store), the newly tagged document will automatically be part of the application's state for tagged documents.
    *   This existing state should already be used to inform the AI about the context. For example, the list of tagged documents (or their content/summaries) might be appended to subsequent `messages` sent to the AI or provided in the system prompt. We need to ensure this integration is robust.

### 3.6. State Management for Tagged Documents

*   **Leverage Existing System**: As identified, `ChatInputUI.tsx` (and its related hooks/stores) already manages the state of tagged documents. This includes adding, removing, and displaying them as pills.
*   **No New Store Needed (Likely)**: We should utilize this existing state management. The `onAddTaggedDocument` prop in `ChatInputUI.tsx` (passed from `useChatInteractions.ts` or a similar hook) is the key to adding a document to this state.
*   **Contextual Information for AI**: The primary concern is ensuring that the AI is aware of these tagged documents. The existing mechanism for passing context (e.g., attached files, summaries of tagged documents in the prompt) should be reviewed and confirmed to correctly include documents tagged via this new AI-driven search workflow. The `DocumentSearchInput.tsx`'s `onDocumentSelected` flow is a good reference for how a document selection translates into context for the AI.

## 4. Key Considerations & Challenges

*   **Ranking Algorithm**: The logic for combining title and semantic search scores needs careful tuning to provide relevant and intuitive rankings.
*   **UI for Tagging in Chat**: Presenting interactive elements (like "Tag" buttons) within a streamed AI message can be complex. The AI SDK might offer utilities for this, or custom rendering logic will be needed. The "Tag" button will now directly interface with the existing `onAddTaggedDocument` handler.
*   **Context Management**: Efficiently providing the content of tagged documents to the AI without exceeding token limits. Summaries or key excerpts might be necessary for large documents. This should align with the current method for handling user-tagged documents.
*   **User Experience**: The workflow should be intuitive. How does the user know which documents are currently tagged? How do they untag? (Untagging is out of scope for the initial request but a future consideration).
*   **Performance**: Semantic search can be computationally intensive. Ensure the backend is optimized.
*   **Error Handling**: Robust error handling for API calls, search failures, etc.

## 5. Next Steps (Broad Strokes)

1.  **Setup Backend**:
    *   Ensure an `embeddings` table and document metadata table exist and are populated.
    *   Implement/refine `searchByTitle` and `searchByEmbeddings` functions.
    *   Develop the `combineAndRankResults` logic.
2.  **Develop AI Tool**:
    *   Create the `searchAndTagDocumentsTool` definition, incorporating the backend search logic.
    *   Integrate this tool into the AI chat route handler.
3.  **Update System Prompt**:
    *   Instruct the AI on using the new tool and presenting results.
4.  **Frontend Development**:
    *   Implement custom rendering for AI messages that contain document search results.
    *   Implement the user interaction for "tagging" a document (e.g., sending a follow-up message to the AI).
5.  **Contextual Integration**:
    *   Ensure that once a document is "tagged" (via user interaction with the AI's search results), its information is made available to the AI for subsequent turns.
6.  **Testing & Refinement**: Thoroughly test the end-to-end flow, tuning the search relevance and AI interaction.

This plan provides a high-level overview. Each step will require detailed design and implementation. 

## 6. Detailed Implementation Steps

This section breaks down the implementation into more granular, actionable steps.

**6.1. Backend Development: Search Logic Functions**

These functions will likely reside in a new or existing backend service/utility file (e.g., `lib/ai/searchService.ts` or similar) and will be called by the AI tool.

    **6.1.1. Implement `searchByTitle(query: string): Promise<Array<{id: string, name: string, titleMatchScore: number}>>`**
        *   **Objective**: Find documents matching the query by their title (`name` field).
        *   **Action**: Create a function that takes a search query string.
        *   Connect to the database (e.g., Supabase).
        *   Construct and execute a SQL query against the `documents` table (e.g., `SELECT id, name FROM documents WHERE name ILIKE '%${query}%' AND user_id = 'current_user_id';`). Ensure user-specific results.
        *   **Scoring**: For each match, assign a `titleMatchScore`. A simple approach is a binary score: `1` for a match. If a more nuanced FTS rank is available and preferred, normalize it to a 0-1 range.
        *   Return an array of objects, each containing `id`, `name`, and `titleMatchScore`.
        *   **Reference**: Mimic the core database query logic of the backend for `/api/chat-tag-search`.

    **6.1.2. Implement `searchByEmbeddings(query: string): Promise<Array<{id: string, name: string, semanticScore: number}>>`**
        *   **Objective**: Find documents semantically similar to the query using embeddings.
        *   **Action**: Create a function that takes a search query string.
        *   **Generate Query Embedding**: Use the project's standard embedding model (e.g., Gemini `models/text-embedding-004` via an API call, consistent with `app/api/generate-embedding/route.ts` and `app/api/search-documents/route.ts`) to generate an embedding vector for the input `query`.
        *   **Query Embeddings Table**: 
            *   Connect to the database.
            *   Perform a vector similarity search against the `documents_embeddings` table. This might involve calling the existing Supabase RPC function `match_documents(query_embedding, match_threshold, match_count, user_id_input)` if suitable, or constructing a custom SQL query using the appropriate vector distance function (e.g., cosine similarity: `1 - (embedding <=> query_embedding)` for `pgvector`).
            *   Ensure the query filters by `user_id`.
            *   The `match_threshold` for this initial query step (distinct from the final combined score threshold) should be set (e.g., `0.3` or `0.4` to cast a wider net before combined scoring).
        *   **Fetch Document Details**: The vector search will return `document_id`s and `semanticScore`s (similarity scores, typically 0-1). Fetch the corresponding `name` for each `document_id` from the `documents` table.
        *   Return an array of objects, each containing `id`, `name`, and `semanticScore`.

    **6.1.3. Implement `combineAndRankResults(titleMatches: Array<...>, semanticMatches: Array<...>): Array<{id: string, name: string, finalScore: number, summary?: string}>`**
        *   **Objective**: Merge, score, filter, and sort results from title and semantic searches.
        *   **Action**: Create a function that takes the outputs of `searchByTitle` and `searchByEmbeddings`.
        *   **Merge & De-duplicate**: Create a unified list of documents. If a document ID appears in both lists, ensure its `titleMatchScore` and `semanticScore` are both available for that document.
        *   **Calculate `finalScore`**: For each unique document:
            *   Retrieve its `titleMatchScore` (default to 0 if not found by title search).
            *   Retrieve its `semanticScore` (default to 0 if not found by semantic search).
            *   Ensure scores are normalized (0-1). `semanticScore` usually is. `titleMatchScore` (if binary) is already 1 or 0.
            *   Calculate `finalScore = (0.55 * semanticScore) + (0.45 * titleMatchScore)`.
        *   **Filter by Threshold**: Keep only documents where `finalScore >= 0.6`.
        *   **Sort**: Sort the filtered list in descending order of `finalScore`.
        *   **Limit**: Return the top N results (e.g., 5 or 10).
        *   **(Optional) Add Summaries**: If feasible and desired, for each top document, fetch a brief summary or the first few lines of its content to include in the return object. This would require an additional database lookup for `content` or `searchable_content`.

**6.2. Backend Development: AI Tool (`searchAndTagDocumentsTool`)**

    **6.2.1. Define Tool Schema and Description**
        *   **Objective**: Create the tool structure for the AI model.
        *   **Action**: In a relevant backend file (e.g., `lib/ai/tools.ts` or within the chat route handler if simple enough):
            *   Use `zod` to define the `parameters` schema: `z.object({ searchQuery: z.string().describe('The user's query to search for in the documents.') })`.
            *   Write a clear `description` for the tool, explaining its purpose (searches by title and semantics, returns list for tagging).

    **6.2.2. Implement Tool `execute` Method**
        *   **Objective**: Orchestrate the search and result formatting within the tool.
        *   **Action**: Within the tool definition:
            *   The `execute` async function will receive `{ searchQuery }`.
            *   Call `searchByTitle(searchQuery)`.
            *   Call `searchByEmbeddings(searchQuery)`.
            *   Call `combineAndRankResults(titleResults, semanticResults)`.
            *   Format the output as specified in Section 3.1: an object containing a `documents` array (each with `id`, `name`, `confidence` (which is `finalScore`), and optional `summary`), `searchPerformed: true`, `queryUsed: searchQuery`, and `presentationStyle: 'listWithTagButtons'`.

    **6.2.3. Register Tool with AI Model**
        *   **Objective**: Make the tool available to the AI.
        *   **Action**: In your AI chat route handler (e.g., `app/api/chat/route.ts`):
            *   Import the `searchAndTagDocumentsTool`.
            *   Add it to the `tools` object passed to the AI SDK function (e.g., `streamText` or `generateText`).

**6.3. AI Prompt Engineering**

    **6.3.1. Update System Prompt**
        *   **Objective**: Instruct the AI on how to use the tool and present results.
        *   **Action**: In the AI chat route handler, modify the `system` prompt for the AI model.
        *   Include instructions as detailed in Section 3.4 (updated): Tell the AI to use `searchAndTagDocumentsTool` for document search requests, and when results with `presentationStyle: 'listWithTagButtons'` are returned, it MUST list the documents and inform the user that UI buttons will be available for tagging. It should NOT ask the user to type a command to tag.

**6.4. Frontend Development: Rendering AI Search Results**

    **6.4.1. Design and Implement Custom Message Component/Renderer**
        *   **Objective**: Display the AI's search results with interactive "Tag Document" buttons.
        *   **Action**: In your chat message rendering logic (e.g., `components/editor/ChatMessageItem.tsx` or a similar file):
            *   Detect if an AI message contains tool results from `searchAndTagDocumentsTool` (e.g., by checking for a specific structure in `message.tool_calls` or a custom marker in `message.content` if the AI formats it that way based on the `presentationStyle` hint).
            *   If detected, render a custom component instead of plain text. This component will iterate through the `documents` array from the tool result.
            *   For each document, display its `name` (and `summary` if available).
            *   Next to each document name, render a "Tag Document" button.

    **6.4.2. Implement "Tag Document" Button onClick Handler**
        *   **Objective**: Connect the UI button to the existing document tagging mechanism.
        *   **Action**: For each "Tag Document" button rendered in step 6.4.1:
            *   The button should have an `onClick` handler.
            *   This handler will call the existing function responsible for adding a document to the tagged context (e.g., `onAddTaggedDocument` which is likely passed down from a hook like `useChatInteractions` to `ChatInputUI.tsx` and then needs to be made available to the chat message rendering scope).
            *   The document's `id` and `name` (as a `{ id: string, name: string }` object, i.e., `TaggedDocument` type) will be passed to this function.

**6.5. Context Management Integration**

    **6.5.1. Verify Tagged Document Context Propagation to AI**
        *   **Objective**: Ensure documents tagged via the new search UI are included in subsequent AI requests.
        *   **Action**: Review the existing mechanism that provides context of tagged documents to the AI (e.g., how documents tagged via `DocumentSearchInput` are included in the `messages` payload or system prompt).
        *   Confirm that documents added via `onAddTaggedDocument` (triggered by the new search result buttons) are correctly incorporated into this context management system without further changes. If `onAddTaggedDocument` already updates a shared state (e.g., in a Zustand store or React Context) that the AI request builder reads from, this should be seamless.

**6.6. Testing and Refinement**

    **6.6.1. Unit Tests**
        *   Test `searchByTitle` with various queries (match, no match, case differences).
        *   Test `searchByEmbeddings` (may require mocking embedding generation and DB calls) for similarity logic.
        *   Test `combineAndRankResults` with diverse inputs (both lists empty, one empty, overlaps, different scores) to verify scoring, thresholding, and sorting.

    **6.6.2. Integration Tests**
        *   Test the full `searchAndTagDocumentsTool` execution flow, from input query to formatted output.
        *   Test the AI's response generation when the tool is called – does it follow the system prompt for presenting results?

    **6.6.3. End-to-End (E2E) UI/UX Testing**
        *   User asks to search -> AI presents list -> User clicks "Tag Document" button -> Document appears as tagged (e.g., as a pill in `ChatInputUI.tsx`) -> Subsequent AI interactions correctly use the newly tagged document as context.

    **6.6.4. Performance Review**
        *   Assess the latency of the entire search process, especially the embedding generation and vector search steps.
        *   Optimize database queries and API calls if necessary.

    **6.6.5. Scoring and Threshold Tuning**
        *   Based on testing, iteratively adjust the weighting in `finalScore = (0.55 * semanticScore) + (0.45 * titleMatchScore)` and the `finalScore >= 0.6` threshold to achieve the desired relevance and number of results.
        *   Also, review the initial `match_threshold` for `searchByEmbeddings` if using an RPC like `match_documents`.

This plan provides a high-level overview. Each step will require detailed design and implementation. 