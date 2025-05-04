# Message Storage Refactor Plan (Aligning with AI SDK `CoreMessage`)

## 1. Discussion & Rationale

**Current State:**

*   **User Messages:** Currently stored with text in `messages.content` (VARCHAR/TEXT) and image info in a separate `messages.image_url` column. Frontend hooks (`useInitialChatMessages`, `useChatInteractions`) have been recently modified to *attempt* to use the AI SDK `parts` array (`[{type: 'text', ...}, {type: 'image', ...}]`), but the backend saving logic ignores this structure.
*   **Assistant Messages:** Stored with text in `messages.content`. Tool call information (`ToolCallPart`) and results (`ToolResultPart`) are stored separately in the `tool_calls` table, linked via `message_id`.

**Problem:**

*   **Inconsistency:** User and assistant message content are stored using different approaches.
*   **Misalignment with AI SDK:** The current storage (especially for user messages, and arguably for assistant messages) doesn't directly reflect the `CoreMessage` structure defined by the AI SDK, where `content` can be an array of different part types (`TextPart`, `ImagePart`, `ToolCallPart`, `ToolResultPart`).
*   **Brittleness:** Relying on custom fields (`image_url`) or separate tables for core message structure components makes the system potentially harder to maintain and adapt to new multi-modal features supported by the SDK.

**Rationale for Change:**

*   **Consistency:** Store all message types (user, assistant) using a unified approach based on the AI SDK's `CoreMessage` structure.
*   **AI SDK Alignment:** Directly persist the `parts` array structure (`Array<TextPart | ImagePart | ToolCallPart | ToolResultPart>`) within the `messages.content` column. This ensures the data model matches the library's design.
*   **Future-Proofing:** Easily accommodate future multi-modal additions (e.g., audio parts, file parts) supported by the AI SDK by simply adding new part types to the stored array.
*   **Reduced Complexity (Potentially):** Consolidating message structure information into the `content` column might simplify data handling, although it requires robust JSON parsing on retrieval.

## 2. Findings (Code Investigation Summary)

*   **`useInitialChatMessages.ts`:** Modified to fetch messages and format the `content` field for user messages as a `parts` array (using `Message` type from `ai/react` with `content as any` assertion). It expects `signedDownloadUrl` to be provided by the backend. Logic needs adjustment to handle assistant `parts` if they are stored in `content`.
*   **`useChatInteractions.ts`:** Modified to send user messages to the backend with `content` formatted as a `parts` array (using `content as any` assertion).
*   **`app/api/chat/route.ts` (Saving):**
    *   *User Messages:* Ignores the incoming `parts` array. Extracts text to save in `messages.content` and extracts image path from `firstImageSignedUrl` to save in `messages.image_url`. **Needs significant modification.**
    *   *Assistant Messages:* Saves text content to `messages.content` and tool details to `tool_calls` table. **Needs modification** to save `parts` array (containing `TextPart` and `ToolCallPart`) to `messages.content`.
*   **`app/api/documents/[documentId]/messages/route.ts` (Loading - *Presumed Path*):** This file was not provided but is assumed to exist. It currently likely fetches `messages.content` (text) and `messages.image_url` (for user messages) and potentially joins `tool_calls` (for assistant messages). **Needs significant modification** to fetch the JSON `content` column, parse the `parts` array, and generate signed URLs for `ImagePart`s.
*   **Database Schema:** The `messages.content` column is likely `VARCHAR` or `TEXT`. The `messages.image_url` column exists. The `tool_calls` table exists.

## 3. Implementation Plan

**Phase 1: Backend & Database**

1.  **Database Schema Change:**
    *   **Action:** Modify the `messages.content` column type to `JSONB` (PostgreSQL recommended) or equivalent JSON type.
    *   **Data Migration:** Decide whether to attempt migrating existing data or clear the `messages` and `tool_calls` tables. Clearing is simpler if historical data is not critical at this stage.
    *   **Column Cleanup:** Decide whether to keep or drop the `messages.image_url` column. Recommendation: Drop it, as the image path/URL will be within the `content` JSON.
    *   **Tool Table Decision:** Decide whether to keep or drop the `tool_calls` table. Recommendation: **Keep** it for now. While `ToolCallPart`/`ToolResultPart` can be stored in `content`, the separate table is highly beneficial for indexing, querying, and analyzing tool usage statistics. We can store *references* (like `toolCallId`) in the `content` parts and the full details in the `tool_calls` table.
2.  **Update Save Logic (`app/api/chat/route.ts`):**
    *   **User Messages:**
        *   Receive the `parts` array in `lastClientMessage.content`.
        *   Modify the `imagePathForDb` extraction: Instead of extracting from `firstImageSignedUrl`, find the `ImagePart` within the incoming `parts` array. The `ImagePart.image` will likely be a `URL` object; extract the storage path from its `pathname`. **Crucially, store the *storage path* (not the signed URL) inside the `ImagePart` object before serialization.**
        *   Serialize the *modified* `parts` array (with storage path in `ImagePart`) to JSON.
        *   Save this JSON string to the `messages.content` (JSONB) column. Remove saving to `image_url`.
    *   **Assistant Messages (`onFinish` callback):**
        *   Accumulate `TextPart`s and `ToolCallPart`s from the AI response into a `parts` array.
        *   Serialize this `parts` array to JSON.
        *   Save this JSON string to the `messages.content` (JSONB) column.
        *   Continue saving detailed tool call info (input, output) to the `tool_calls` table as currently done, linking via `message_id`.
3.  **Update Load Logic (`app/api/documents/[documentId]/messages/route.ts` - *Create or Modify*):**
    *   Fetch messages, selecting the `id`, `role`, `created_at`, and `content` (JSONB) columns.
    *   For each message:
        *   Parse the `content` JSON string into a `parts` array.
        *   **User Messages:** Iterate through the `parts`. If an `ImagePart` is found, use its stored `image` path to generate a signed download URL using Supabase admin functions (`storage.createSignedUrl`). Replace the path in the `ImagePart` with the generated signed URL *before* sending the message to the frontend.
        *   **Assistant Messages:** Iterate through the `parts`. `TextPart`s are used directly. For `ToolCallPart`s, decide if additional data needs to be joined from the `tool_calls` table for frontend display (e.g., the result). *Initially, just pass the parsed `parts` array.*
        *   Construct the final `Message` object (matching the structure expected by `useInitialChatMessages`) with the processed `parts` array in the `content` field.
    *   Return the array of processed messages.

**Phase 2: Frontend**

4.  **Update Message Loading (`useInitialChatMessages.ts`):**
    *   Ensure the hook correctly receives and handles the `parts` array in the `content` field for *both* user and assistant messages. The `content as any` assertion should still work with the `Message` type from `ai/react`.
    *   Verify that the `ImagePart.image` received from the backend is the signed URL (as processed in step 3).
5.  **Update Message Rendering (`ChatMessageItem.tsx` or similar):**
    *   Modify the component to check if `message.content` is an array (i.e., `parts` array) or a simple string.
    *   If it's an array:
        *   Iterate through the `parts`.
        *   Render `TextPart`s as text.
        *   Render `ImagePart`s as `<img>` tags using `part.image` (which should be the signed URL) as the `src`.
        *   Render `ToolCallPart`s appropriately (e.g., display call details, maybe link to results - requires further design).
    *   If it's a string (for older messages or simple assistant replies), render it directly.

**Phase 3: Testing & Verification**

6.  **Thorough Testing:**
    *   Test sending/receiving text-only messages (user & assistant).
    *   Test sending user messages with images -> Hard refresh -> Verify image persistence and display.
    *   Test assistant responses involving tool calls -> Hard refresh -> Verify text and tool call display.
    *   Inspect network requests to `/api/documents/.../messages` to confirm the `content` field contains the `parts` array with signed URLs for images.
    *   Inspect the database `messages` table to confirm `content` column stores JSON correctly (with storage paths for images).
    *   Inspect the `tool_calls` table.

## 4. Expected Outcomes

*   **Consistent Data Model:** The `messages.content` column reliably stores the structured message content (as `parts` array JSON) for all roles where applicable.
*   **AI SDK Alignment:** Database structure directly mirrors `CoreMessage` definitions, simplifying integration and leveraging SDK features.
*   **Robust Multi-modal Support:** The system is prepared to handle current (images) and future multi-modal message parts defined by the AI SDK with minimal backend storage changes.
*   **Improved Maintainability:** A single way of handling message content structure reduces cognitive load and potential bugs.
*   **Working Image Persistence:** Images attached to user messages persist correctly across sessions and refreshes.
*   **Working Tool Display:** Tool calls continue to be stored and displayed correctly.

## 5. Open Questions/Decisions

*   Data Migration strategy (migrate vs. clear). **Clearing everything. I need the DDL for updating the tables on the backend**
*   Final decision on keeping/dropping `tool_calls` table (Recommendation: Keep). **okay with me**
*   Final decision on keeping/dropping `messages.image_url` column (Recommendation: Drop). **okay with**