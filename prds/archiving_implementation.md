# Archiving Features

## Show Only Last 12 Messages
* Conversations can get quite long, so we need a way to show only the last 12 messages in the chat pane. I believe we implemented this before and we just need to put it back.
* To be clear: the message pane should show the last 12 messages, but then have a "Load More" button which will load the next 12 messages, etc. 
* We should also add a persistent, small unobtrusive button positioned directly above the chat input in the message pane to scroll to bottom (like an arrow down or something)

### Expected Outcomes As Result of Implementation
- All existing functionality of messages works. No loss in functionality for messages whatsoever.
    - Tool calls still able to be seen as they are now (collapsible)
    - Images in message bubbles
    - Add to Editor button still there
- Able to implement "Show Last 12 messages" without any loss of functionality mentioned above.

### Plan to Implement

1.  **Modify Message Fetching (Backend/API - `app/api/documents/[documentId]/messages/route.ts`)**:
    *   Update the `GET` handler to accept optional query parameters for pagination (e.g., `limit=12`, `before=<message_timestamp_or_id>`).
    *   Modify the Supabase query:
        *   Fetch messages in `created_at` *descending* order.
        *   Apply the `limit` (defaulting to 12 if not provided).
        *   If `before` is provided, add a filter (`.lt('created_at', before)` or similar) to fetch messages older than the specified timestamp/ID.
    *   Return the fetched messages (which will now be oldest-first within the batch due to descending fetch) and a `hasMore` flag. Calculate `hasMore` by fetching `limit + 1` messages and checking if the count exceeds `limit`. If it does, trim the extra message before returning and set `hasMore` to true.

2.  **Update Frontend State Management (`lib/hooks/editor/useInitialChatMessages.ts` & potentially `useChatInteractions`)**:
    *   Modify `useInitialChatMessages`:
        *   Adjust the initial fetch to call the API *without* `before` but with `limit=12`.
        *   Store the fetched messages (maybe reversing them client-side so newest is last for display) and the `hasMore` flag in state.
        *   Keep track of the oldest message's timestamp/ID from the current batch (needed for the next `before` parameter).
    *   Implement `loadMoreMessages` function (likely passed down from the component using the hooks):
        *   Track a loading state for *more* messages (`isLoadingMore`).
        *   Call the `GET` API endpoint again, this time passing `limit=12` and the `before` parameter using the stored oldest message timestamp/ID.
        *   Prepend the newly fetched messages (again, reverse if needed) to the existing message list state.
        *   Update the `hasMore` flag and the oldest message timestamp/ID.
        *   Handle the `isLoadingMore` state.
    *   Modify `useChatInteractions` or the component using it (`EditorWrapper.tsx` likely) to receive and manage the message list, `isLoadingMore`, `hasMore`, and the `loadMoreMessages` function from `useInitialChatMessages` (or a shared parent state).

3.  **Update Message List UI (`components/editor/ChatMessagesList.tsx` and potentially parent `ChatPaneWrapper.tsx`)**:
    *   **Button Placement**: Modify the structure in `ChatPaneWrapper.tsx` or wherever `ChatMessagesList` is rendered. Place the "Load More" button container *above* the scrollable `div` that holds the messages. Ensure this button container is styled appropriately (e.g., padding, border) and is always visible when `hasMore` is true.
    *   **Component Props**: `ChatMessagesList.tsx` no longer needs props for `loadMoreMessages`, `hasMore`, or `isLoadingMore` as the button is handled in the parent. It just renders the messages.
    *   **Button Logic (Parent Component)**: The parent component (`ChatPaneWrapper.tsx` or similar) will manage the `hasMore` and `isLoadingMore` states and the `loadMoreMessages` function. It renders the button conditionally based on `hasMore` and disables it based on `isLoadingMore`.
    *   **Scroll Preservation**: When the "Load More" button in the parent component is clicked:
        *   Before calling `loadMoreMessages`, get a reference to the current topmost message *element* within the `ChatMessagesList`'s scrollable container (e.g., via a ref passed to `ChatMessagesList` or accessed from the parent). Store its unique `id`.
        *   After `loadMoreMessages` completes, new messages are prepended, and the component re-renders, use a `useEffect` hook in the parent component.
        *   Inside this effect, find the DOM element corresponding to the stored message `id` within the `ChatMessagesList` container.
        *   Call `element.scrollIntoView()` on that specific message element. This adjusts the scroll position so the message that was previously at the top remains visible at the top.

4.  **Add "Scroll to Bottom" Button (`components/editor/ChatInputArea.tsx` or `ChatInputUI.tsx`):**
    *   Add a small, persistent button (e.g., `ArrowDown` icon) positioned visually above the chat input text area (likely absolute positioning relative to the `ChatInputArea` container).
    *   Receive the `messagesEndRef` (currently passed to `ChatMessagesList`).
    *   Connect the button's `onClick` handler to `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`.
    *   Add state (`showScrollDownButton`) to track scroll position: Add an `onScroll` handler to the message list container (`ChatMessagesList`). If `element.scrollHeight - element.scrollTop - element.clientHeight > threshold` (e.g., 200px), set `showScrollDownButton` to true, otherwise false. Conditionally render the button based on this state.

5.  **Refine Styling (`globals.css` or Tailwind classes):**
    *   Style the "Load More" button/indicator.
    *   Style the "Scroll to Bottom" button and ensure correct absolute positioning.

## Feed Last 12 Messages in Full
* Instead of feeding the whole conversation as context (because this can get lengthy on top of feeding document content), we should feed just the last 12 messages in full.

## Agent to Summarizes All Messages and Add to Context

* To provide the agent with a concise overview of the conversation history, especially as it grows long, allowing it to maintain context without processing every single message.

* How it should work:

  * AI Agent takes whole conversation history. Summarizes into some bullet points but is very careful as to elevate important points or things the user specifies as important to know

  * By distinguishing general context from important points, UX can be improved.

  * **Trigger to run**: Not practical to run every message. Let's run it every 6 to start.

  * **Need to build**

    * Mechanism for agent to summarize

    * Mechanism to store summary (open to suggestions, but seems like a `summary` column on documents could be the way forward)

    * Mechanism to feed summary to AI at run time

## Feed Last 12 Messages in Full & Agent Summary as Context

* This approach gives the agent the immediate detail from recent messages while also providing the broader historical context captured in the summary.

* This combines `Feed Last 12 Messages in Full` and `Agent to Summarizes All Messages and Add to Context`

## Archive Messages -> Permanent Context for the Document

* Archiving allows important parts of the conversation to be permanently stored and used as context for the document itself, ensuring relevant information is retained and accessible. The whole problem this solves is NOT having to switch to a new conversation just for the sake of continuing work on a single document.

* How the user should experience this:

  * At any point in time, the user can click the Archive button

  * Archiving will take all of the current messages, summarize them, store the summary

  * The user will no longer see archived messages by default, but can access them with a dropdown by selecting the conversation (they can load the conversation history but can no longer add to it eg. chat input is disabled).

  * Archiving is sequential and users will not be able to manually select messages to archive. Whatever is in the message pane at time of archiving is what is going to get archived.

* How this should work is like it does in Cursor: previous chats get summarized and then are able to be referenced in future chats.

  * Summary Agent summarizes.

  * `messages_archive` will be where summaries for conversations get stored. Should have columns:

    * `id` which will be PK

    * `document_id` (FK to `documents.id` )

    * `summary`, which should have the summary stored in a way to add to context to AI

  * `messages` table will have new columns:

    * `is_archived` (bool)

    * `archive_id` (FK to `messages_archive.id` )
