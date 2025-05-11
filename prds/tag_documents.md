# PRD: Tag Documents in Chat

**Objective:** Allow users to tag existing documents within the chat input (e.g., by typing `@DocumentName`) to fetch their `searchable_content` and include it as context for the AI. This feature should be available in chat inputs on `/launch` and `/editor` (both main chat pane and pinned chat input).

## 1. Background

Currently, users can chat with the AI in the context of the current document or general knowledge. This feature aims to enhance contextual understanding by allowing users to explicitly pull in content from other documents in their workspace during a conversation. This is particularly useful when discussing or referencing information spread across multiple documents.

## 2. Proposed Changes

### 2.1. Frontend: Chat Input & Document Tagging UI

**Affected Components:**
*   `components/editor/ChatInputArea.tsx` (and its potential counterpart for `/launch` or a shared chat input component)
*   Possibly a new component for the document selection dropdown: `components/chat/DocumentTagDropdown.tsx`

**Changes:**

1.  **Input Detection:**
    *   Modify the chat input component(s) to detect when a user types `@` followed by characters.
    *   As the user types after `@`, trigger a search for documents matching the typed string. This search should be debounced.

2.  **Document Selection Dropdown:**
    *   Display a dropdown list of matching documents (similar to the Omnibar search results).
    *   Each item should show the document name.
    *   Allow navigation and selection using keyboard (arrow keys, Enter) and mouse.
    *   On selection, the `@DocumentName` in the input field should be stylized (e.g., become a "pill" or have a different background) to indicate it's a recognized tag. The actual value sent to the backend should ideally be a more robust identifier, like `@[Document Name](document:ID)`.

3.  **Storing Tagged Document Information:**
    *   When a document is tagged, store its ID (and perhaps name for display) temporarily in the chat input component's state or the `useChatInteractions` hook. This information will be sent with the message.

**Search Logic:**
*   Reuse or adapt the existing document search functionality (currently used by Omnibar, likely via `/api/search-documents` or a similar client-side search hook like `useSearch.ts`).
*   The search should prioritize documents relevant to the user (e.g., owned by them or shared with them, based on existing RLS).

### 2.2. Frontend: Modifying Chat Submission Logic

**Affected Components:**
*   `lib/hooks/editor/useChatInteractions.ts`

**Changes:**

1.  **Augment `handleSubmit`:**
    *   Before sending the message to the backend, check for any tagged document IDs collected by the chat input.
    *   If tags exist, include an array of these document IDs in the `data` payload sent with the message to the `/api/chat` endpoint. Example payload structure:
        ```json
        {
          "model": "...",
          "documentId": "current_doc_id",
          "editorBlocksContext": [...],
          "taggedDocumentIds": ["id_of_doc_A", "id_of_doc_B"]
        }
        ```

### 2.3. Backend: Processing Tagged Documents

**Affected Components:**
*   `app/api/chat/route.ts`

**Changes:**

1.  **Receive Tagged Document IDs:**
    *   In the `POST` handler, extract the `taggedDocumentIds` array from the request body.

2.  **Fetch `searchable_content`:**
    *   For each `documentId` in the `taggedDocumentIds` array:
        *   Perform a Supabase query to fetch the `searchable_content` (and `name` for context message) from the `documents` table.
        *   Ensure RLS is respected, i.e., the current user has permission to access these documents. This might require using the user's Supabase client or performing an explicit permission check if using an admin client.

3.  **Inject Tagged Document Content into AI Messages:**
    *   If tagged documents' content is fetched successfully:
        *   Concatenate the `searchable_content` from all tagged documents into a single string. Each document's content should be clearly demarcated, including its name. For example:
            ```text
            [Content from document: <Document Name A>]
            <searchable_content of Document A>
            ---
            [Content from document: <Document Name B>]
            <searchable_content of Document B>
            ```
        *   Create a new message object for this consolidated content, similar to how `editorBlocksContext` is handled:
            ```typescript
            {
              role: 'user', // Consistent with CoreUserMessage and editorBlocksContext injection
              content: `[Tagged Document Context]\n${consolidatedTaggedContent}` // Content is a string, valid for CoreUserMessage
            }
            ```
        *   Find the index of the last actual user message in the `messages` array (this array is of type `CoreMessage[]` being prepared for the AI model).
        *   Insert this new context message into the `messages` array immediately before the last user message.
        *   **Note:** This insertion must be carefully sequenced within the existing message processing and transformation pipeline in `app/api/chat/route.ts` to ensure compatibility with other features like image handling, editor context injection, and tool call processing.
    *   This ensures the AI receives the tagged document context just before processing the user's most recent query, mirroring the `editorBlocksContext` injection pattern.

### 2.4. Data Model / Database

*   No changes to the database schema are anticipated initially, as we are leveraging the existing `documents.searchable_content` field and `documents.id`.

### 2.5. Frontend: Persisted Tag Display & Interactivity

**Objective:** When a message containing a document tag is persisted and displayed in the chat history, the tag should function as an interactive link, offering a preview on hover and navigation on click.

**Affected Components:**
*   `components/editor/ChatMessageItem.tsx` (specifically the Markdown rendering part)
*   `components/markdown.tsx` (or wherever `NonMemoizedMarkdown` / `react-markdown` is configured)
*   Possibly a new simple component for hover previews: `components/chat/DocumentTagPreview.tsx`

**Changes:**

1.  **Tag Persistence Format:**
    *   When a user selects a document via the `@` mention, the chat input should transform the tag into a Markdown-like link format before it's included in the message content. Example: `@[Document Display Name](document:DOCUMENT_ID)`.
    *   This string will be part of the `message.content` (if it's a plain string) or a `TextPart`'s `text` property (if `message.content` is an array of parts) and saved to the database as such.

2.  **Custom Markdown Rendering for Tags:**
    *   Modify the Markdown rendering setup used by `ChatMessageItem.tsx` (likely within `NonMemoizedMarkdown` or its `react-markdown` configuration).
    *   Implement a custom renderer for links (`<a>` tags).
    *   The custom renderer will inspect the `href` of the link.
        *   If the `href` matches the pattern `document:DOCUMENT_ID`, it will render the link as a special interactive tag.
        *   Otherwise, it will use the default link rendering.

3.  **Interactive Tag Rendering:**
    *   **Styling:** The rendered tag (e.g., "@Document Display Name") should be visually distinct (e.g., different background color, similar to a pill).
    *   **Click Navigation:** On clicking the tag, the application should navigate the user to the respective document (e.g., `router.push('/editor/DOCUMENT_ID')`).
    *   **Hover Preview:**
        *   On hovering over the tag, a small popover/tooltip (`DocumentTagPreview.tsx`) should appear.
        *   This preview will display the document's name and the first few lines/sentences of its `searchable_content`.
        *   This content will be fetched on demand via a new lightweight API endpoint, e.g., `GET /api/documents/[documentId]/preview`.
            *   This endpoint should return `{ name: string, previewText: string }`.
            *   RLS must be enforced on this endpoint.

4.  **API Endpoint for Preview:**
    *   Create a new route handler `app/api/documents/[documentId]/preview/route.ts`.
    *   It will accept a `documentId`, fetch the document's `name` and the beginning of `searchable_content` (e.g., first 200 characters), and return them.
    *   This endpoint must be protected and respect user permissions (RLS).

5.  **Graceful Fallbacks:**
    *   If a `document:DOCUMENT_ID` link points to a non-existent document or one the user doesn't have access to, the tag should still render but could appear disabled or, on hover/click, indicate that the document is unavailable.

This enhancement focuses on the display of tags in *persisted* messages. The mechanism for initially creating the tag in the input field (step 2.1) remains the same.

## 3. Plan of Attack / Implementation Steps

1.  **Frontend - Input & Dropdown:**
    *   **(Component)** Create `DocumentTagDropdown.tsx` for displaying search results.
    *   **(Logic)** Modify `ChatInputArea.tsx` (or shared input):
        *   Implement `@` detection.
        *   Implement debounced search invocation (reusing `useSearch` or `/api/search-documents`).
        *   Integrate `DocumentTagDropdown.tsx` to show results.
        *   Handle selection and update input style/value.
        *   Store selected document IDs.

2.  **Frontend - Submission Logic:**
    *   **(Hook)** Modify `useChatInteractions.ts`:
        *   Update `handleSubmit` to include `taggedDocumentIds` in the payload to `/api/chat`.

3.  **Backend - API Handling:**
    *   **(API Route)** Modify `app/api/chat/route.ts`:
        *   Extract `taggedDocumentIds`.
        *   Implement logic to fetch `searchable_content` for each ID (respecting RLS).
        *   Format and prepend the fetched content to the AI's message context.

4.  **Testing:**
    *   Test in `/editor` chat pane.
    *   Test in `/editor` pinned chat input (if distinct from main chat pane input).
    *   Test in `/launch` chat input.
    *   Verify AI responses correctly use the context from tagged documents.
    *   Test edge cases: no match for `@tag`, tagging multiple documents, tagging very large documents (consider truncation or summarization for context if needed, though initially just raw `searchable_content` is fine).

## 4. Considerations & Future Enhancements

*   **Context Length:** Be mindful of the AI model's context window limits. If multiple large documents are tagged, the combined `searchable_content` could exceed limits.
    *   *Future:* Consider summarizing the `searchable_content` or using only relevant chunks if it's too long.
*   **Permissions:** Double-check RLS and security implications when fetching document content on the backend. The user initiating the chat must have access to the tagged documents.
*   **User Experience (UX):**
    *   Clear indication of tagged documents in the input.
    *   Easy way to remove a tag.
    *   Performance of the document search dropdown.
*   **Error Handling:**
    *   What if a tagged document ID is invalid or inaccessible?
    *   Graceful error messages to the user.
*   **Alternative to `@`:** If `@` is already used (e.g., for users/mentions), consider a different sigil (e.g., `#doc:` or similar). For now, `@` is assumed to be available.
*   **Discoverability:** How will users learn about this feature? (e.g., placeholder text in chat input, onboarding).

## 5. Out of Scope (for initial implementation)

*   Automatic suggestions for tagging without typing `@`.
*   Complex query parsing within the tag (e.g., `@DocumentA#section-title`).
*   Summarizing tagged document content before sending to AI (will use full `searchable_content`).
*   UI for managing "global" context documents outside of individual chat messages.

This plan provides a high-level overview. Detailed technical decisions will be made during implementation. 