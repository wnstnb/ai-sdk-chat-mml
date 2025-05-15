# PRD: Tag Documents in Chat (v2 - Search Input Method)

**Objective:** Allow users to select existing documents via a dedicated search interface within the chat input area to fetch their `searchable_content` and include it as context for the AI. Selected documents will be displayed as "tags" or "pills" that can be removed. This feature should be available in chat inputs on `/launch` and `/editor` (both main chat pane and pinned chat input). This revises the previous "@mention" approach.

## 1. Background

The initial approach for tagging documents involved an "@mention" style input. This v2 PRD shifts to a more explicit UI element—a dedicated search input—for selecting documents to improve usability and discoverability. The core goal remains: enhance contextual understanding by allowing users to explicitly pull in content from other documents in their workspace.

## 2. Proposed Changes

### 2.1. Frontend: Document Selection UI & State Management

**Affected Components:**
*   `components/editor/ChatInputArea.tsx` (Manages overall state for tagged documents and renders selected pills)
*   `components/editor/ChatInputUI.tsx` (Integrates the new document search input into the chat controls bar)
*   `components/chat/DocumentSearchInput.tsx` (New component: provides search input, fetches results, and handles selection)
*   Parent Page Components (e.g., in `/app/routes/editor/[documentId]/`, `/app/routes/launch/`) (Responsible for initializing and persisting the `taggedDocuments` state)

**Changes:**
[x] Checklist item

1.  **`components/chat/DocumentSearchInput.tsx` (New Component):**
    *   **Functionality:**
        *   Provides a text input field for users to type search queries for documents.
        *   On input, triggers a debounced search against an API endpoint (e.g., `/api/chat-tag-search?q=<query>`).
        *   Displays a dropdown list of matching documents (name).
        *   Handles user selection from the dropdown (keyboard and mouse).
        *   On selection, invokes a callback prop (e.g., `onDocumentSelected(doc: TaggedDocument)`) with the selected document's ID and name.
        *   Clears its search query after selection.
        *   Handles loading states and "no results" display in the dropdown.
        *   Dropdown closes on selection, click-outside, or Escape key.
    *   **Props:**
        *   `onDocumentSelected: (doc: TaggedDocument) => void` (required)
        *   `disabled?: boolean` (optional, to disable search input during AI response generation, uploads, etc.)
    *   **Styling:** Compact design suitable for embedding within a toolbar/controls area.

2.  **`components/editor/ChatInputArea.tsx` (Modified):**
    *   **State Management (Props from Parent):**
        *   Receives `taggedDocuments: TaggedDocument[]` from its parent component.
        *   Receives `setTaggedDocuments: React.Dispatch<React.SetStateAction<TaggedDocument[]>>` from its parent.
    *   **Internal Logic:**
        *   Implements `handleAddTaggedDocument(docToAdd: TaggedDocument)`:
            *   Checks for duplicates.
            *   Calls `setTaggedDocuments` to add the new document to the parent's state.
        *   Implements `handleRemoveTaggedDocument(docIdToRemove: string)`:
            *   Calls `setTaggedDocuments` to filter out the document by its ID from the parent's state.
    *   **UI for Selected Documents ("Pills"):**
        *   Renders a list of currently `taggedDocuments` (e.g., above the `ChatInputUI` component).
        *   Each document is displayed as a "pill" showing its name and an "x" icon/button.
        *   Clicking the "x" icon calls `handleRemoveTaggedDocument` with the respective document's ID.
    *   **Props to `ChatInputUI`:**
        *   Passes `taggedDocuments` (for potential UI cues in `ChatInputUI` or `DocumentSearchInput`).
        *   Passes `handleAddTaggedDocument` to `ChatInputUI`.
    *   **Removed Logic:** All previous "@mention" based detection, dropdown, and state management (`showTagDropdown`, `tagQuery`, etc.) are removed. `handleInputChange` prop passed to `ChatInputUI` is the original one from `useChatInteractions`.

3.  **`components/editor/ChatInputUI.tsx` (Modified):**
    *   **Props:**
        *   Accepts `taggedDocuments?: TaggedDocument[]`.
        *   Accepts `onAddTaggedDocument?: (doc: TaggedDocument) => void`.
    *   **Integration:**
        *   Imports `DocumentSearchInput` from `components/chat/DocumentSearchInput.tsx`.
        *   Renders `DocumentSearchInput` within its bottom controls bar, typically next to the `ModelSelector`.
        *   Passes its `onAddTaggedDocument` prop to `DocumentSearchInput`'s `onDocumentSelected` prop.
        *   Passes a `disabled` prop to `DocumentSearchInput` based on `isLoading`, `isUploading`, etc. (similar to `ModelSelector`).

4.  **Parent Page Components (e.g., Editor Page, Launch Page):**
    *   **State Ownership:**
        *   Maintains the `taggedDocuments: TaggedDocument[]` state using `React.useState`.
        *   Passes this state and its updater function down to `ChatInputArea`.
    *   This state is transient to the current chat session/input area unless explicitly persisted further (e.g., with a message).

### 2.2. Frontend: Modifying Chat Submission Logic

**Affected Components:**
*   `lib/hooks/editor/useChatInteractions.ts` (or equivalent logic in parent page components where `handleSubmit` is defined).

**Changes:**

1.  **Augment `handleSubmit` (or the function preparing the API call):**
    *   When a chat message is being prepared to be sent to `/api/chat`:
        *   Access the current `taggedDocuments` array (managed by the parent page component).
        *   Extract the document IDs: `const taggedDocumentIds = taggedDocuments.map(doc => doc.id);`
        *   If `taggedDocumentIds` is not empty, include it in the payload to the `/api/chat` endpoint.
            '''json
            {
              "model": "...",
              "documentId": "current_doc_id_if_any",
              "editorBlocksContext": [...],
              "taggedDocumentIds": ["id_of_doc_A", "id_of_doc_B"] // Populated from selected documents
            }
            '''

### 2.3. Backend: Processing Tagged Documents

**Affected Components:**
*   `app/api/chat/route.ts`

**Changes:** (This section remains largely the same as the original PRD, as the backend processing is independent of the frontend selection method)
1.  **Receive Tagged Document IDs:**
    *   In the `POST` handler, extract the `taggedDocumentIds` array from the request body.
2.  **Fetch `searchable_content`:**
    *   For each `documentId` in `taggedDocumentIds`:
        *   Perform a Supabase query to fetch `searchable_content` (and `name`) from the `documents` table.
        *   Ensure RLS is respected.
3.  **Inject Tagged Document Content into AI Messages:**
    *   Concatenate content from all tagged documents, clearly demarcated (including document names).
    *   Create a new 'user' role message object with this consolidated content.
    *   Insert this message immediately before the last actual user message in the `messages` array being prepared for the AI.

### 2.4. Data Model / Database & Shared Types

*   **Database:** No changes to the database schema are anticipated.
*   **Shared Types:**
    *   Define the `TaggedDocument` interface ( `{ id: string; name: string; }`) in a shared location (e.g., `lib/types.ts` or `types/index.ts`) and import it into all relevant components (`DocumentSearchInput`, `ChatInputArea`, `ChatInputUI`, parent page components).

### 2.5. API Endpoint for Document Search

**Affected Components:**
*   `app/api/chat-tag-search/route.ts` (or a similarly named existing/new endpoint)

**Changes:**
*   Ensure this `GET` endpoint accepts a query parameter (e.g., `q`).
*   Searches document names (and potentially other relevant fields) based on the query.
*   Returns an array of matching documents, each with at least `id` and `name`. Example response: `{ documents: [{ id: "...", name: "..." }] }`.
*   RLS must be enforced.

### 2.6. Persisted Tag Display & Interactivity (Future consideration from v1 PRD)
*   The v1 PRD detailed how `@DocumentName(document:ID)` could be rendered interactively in persisted chat messages.
*   With the new input method, if we want tagged documents to be explicitly part of the *saved message content* (and not just transient context for that one query), the `handleSubmit` logic would need to ensure these `taggedDocumentIds` (or their names/links) are incorporated into the message string sent to the AI and saved to the database.
*   For this v2, the primary focus is on using tagged documents as *transient context* for the next AI query. Persisting them as part of the message itself can be a follow-up. If they are persisted, then custom Markdown rendering for these tags in `ChatMessageItem.tsx` would be relevant.

## 3. Implementation Steps

1.  **Shared Type Definition:**
    *   Define `TaggedDocument` in a shared types file (e.g., `lib/types.ts`).
    *   Update `DocumentSearchInput.tsx`, `ChatInputArea.tsx`, and `ChatInputUI.tsx` to import this shared type.

2.  **`components/chat/DocumentSearchInput.tsx` (Create/Finalize):**
    *   Implement the search input field.
    *   Implement debounced call to `/api/chat-tag-search` (ensure endpoint exists and is functional).
    *   Implement dropdown for displaying search results (with loading/no results states).
    *   Implement selection logic and `onDocumentSelected` callback.
    *   Add basic styling and `disabled` prop functionality.
    *   Implement click-outside and Escape key to close dropdown.

3.  **`components/editor/ChatInputArea.tsx` (Refactor):**
    *   Remove all old `@mention` tagging logic (state, effects, handlers).
    *   Ensure `handleInputChange` prop passed to `ChatInputUI` is the original one.
    *   Implement `handleAddTaggedDocument` and `handleRemoveTaggedDocument` using `setTaggedDocuments` prop.
    *   Add UI for displaying selected document "pills" with remove buttons.
    *   Ensure `taggedDocuments` and `handleAddTaggedDocument` are correctly passed as props to `ChatInputUI`.

4.  **`components/editor/ChatInputUI.tsx` (Refactor):**
    *   Update `ChatInputUIProps` to include `taggedDocuments?` and `onAddTaggedDocument?`.
    *   Import `DocumentSearchInput`.
    *   Render `DocumentSearchInput` in the control bar (e.g., next to `ModelSelector`).
        *   Pass `onAddTaggedDocument` to `DocumentSearchInput`'s `onDocumentSelected`.
        *   Pass `disabled` status (based on `isLoading`, etc.) to `DocumentSearchInput`.

5.  **Parent Page Component(s) (e.g., Editor, Launch pages):**
    *   Introduce `useState` for `taggedDocuments: TaggedDocument[]`.
    *   Pass `taggedDocuments` state and its setter to `ChatInputArea`.
    *   Modify the chat submission logic (`handleSubmit` or equivalent):
        *   Read `taggedDocuments` from state.
        *   Map to `taggedDocumentIds`.
        *   Include `taggedDocumentIds` in the payload to `/api/chat`.

6.  **Backend (`app/api/chat/route.ts`):**
    *   Verify existing logic correctly processes `taggedDocumentIds`, fetches content, and injects it into AI context (as per original PRD Section 2.3).

7.  **API Endpoint (`app/api/chat-tag-search/route.ts`):**
    *   Ensure this GET endpoint is functional, searches documents by query, respects RLS, and returns `id` and `name`.

8.  **Testing:**
    *   Test document search and selection in all relevant chat inputs.
    *   Test adding and removing document "pills".
    *   Verify context from selected documents is used by the AI.
    *   Test behavior during loading states, errors, and empty search results.
    *   Test UI responsiveness and styling.

## 4. Considerations & Future Enhancements (Adapted from v1)

*   **Context Length:** Be mindful of AI model's context window limits. (Future: summarization).
*   **Permissions:** Double-check RLS on all document fetching (search API, context fetching API).
*   **UX:**
    *   Clarity of selected documents (pills).
    *   Performance of document search.
    *   Clear "no results" / error states for search.
    *   Consider maximum number of documents that can be tagged.
*   **Error Handling:** Robust error handling for API calls.
*   **Discoverability:** Placeholder text in `DocumentSearchInput`.
*   **Persisting Tags in Messages:** Decide if selected documents should be part of the persisted message content or only transient context. If persisted, implement Markdown linking and rendering (see 2.6).

## 5. Out of Scope (for initial v2 implementation)

*   Complex query parsing within the document search.
*   Summarizing tagged document content before sending to AI (will use full `searchable_content`).
*   UI for managing "global" context documents outside of individual chat messages.
*   Advanced styling beyond functional clarity for the search input and pills.

This revised plan focuses on a more direct and user-friendly approach to document tagging using a dedicated search input. 