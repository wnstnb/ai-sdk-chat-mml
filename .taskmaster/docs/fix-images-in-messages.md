# PRD: Fix Image Handling in Chat Messages

## 1. Problem Statement

Users are experiencing issues with images in chat messages. While image uploads seem to work and images appear optimistically in the UI, the AI assistant is unable to "see" or process these images. Furthermore, upon a hard refresh of the page, these images disappear from the chat history. This significantly hinders the multi-modal capabilities of the application.

## 2. How It Should Work

1.  **Image Input:** User uploads an image file or pastes a screenshot directly into the chat input area.
2.  **Upload Process:**
    *   Image uploading commences.
    *   Chat controls (e.g., message input, send button) are disabled or indicate a busy state until the upload is complete.
3.  **Upload Outcome:**
    *   **Success:** Image upload completes successfully. The image might be previewed in the input area. Chat controls are re-enabled.
    *   **Failure:** Upload is unsuccessful. An appropriate error message is displayed to the user. Chat controls are re-enabled.
4.  **Message Sending:** User types a message (optional) and sends it along with the uploaded image(s).
5.  **AI Processing:** The AI model receives both the text and the image(s) as part of the user's message.
6.  **AI Response:** The AI is able to "see" and understand the content of the image(s) and responds accordingly, referencing or incorporating information from the image(s) if relevant.
7.  **Persistence & Display:**
    *   The user's message, including the image, is correctly displayed in the chat UI.
    *   The message (with text and image reference) is persisted in the database.
    *   Upon a hard refresh, the chat history loads correctly, and the image is still visible in the message.

## 3. Current Behavior

*   **Upload Success:** Image upload to the storage bucket (e.g., Supabase Storage) is working correctly. The image file exists in the bucket. (GOOD)
*   **Optimistic Display:** The uploaded image loads optimistically in the chat message UI immediately after being "sent". (OK, but potentially misleading if not fully processed for AI)
*   **AI Cannot See Image:** When the user sends a message with an image, the AI assistant responds that it cannot see or access the image. (BAD)
*   **Disappears on Hard Refresh:** After a hard refresh of the browser, the image that was previously visible in the chat message disappears. The text part of the message might remain, but the image is gone. (BAD)

## 4. Investigation Areas

*   Message construction and data format when sending to the AI (API route: `app/api/chat/route.ts`).
*   How image data/references are included in the message parts sent to the AI model, aligning with AI-SDK requirements.
*   Storage of image references in the database (Supabase `messages` table, `content` JSONB column, `ImagePart` structure).
*   Retrieval and processing of messages with images from the database (API route: `app/api/documents/[documentId]/messages/route.ts`).
*   Generation of signed URLs for images and their inclusion in the message data sent to the frontend.
*   Frontend rendering of messages with `ImagePart`s.
*   Consistency between `UIMessage` and `ModelMessage` formats, especially concerning attachments/image parts.
*   Adherence to AI-SDK documentation for multi-modal messages (`experimental_attachments`, `parts` array).

## 5. Relevant Documentation & Previous Work

*   **AI-SDK Documentation:**
    *   Image Generation / Attachments: [https://ai-sdk.dev/docs/ai-sdk-ui/chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)
    *   Multi-Modal Chatbot (esp. FileList & `experimental_attachments`): [https://ai-sdk.dev/docs/guides/multi-modal-chatbot](https://ai-sdk.dev/docs/guides/multi-modal-chatbot)
    *   Message Overhaul (UIMessage, ModelMessage): [https://ai-sdk.dev/docs/announcing-ai-sdk-5-alpha](https://ai-sdk.dev/docs/announcing-ai-sdk-5-alpha)
*   **Internal PRD:** `@messages_refactor.md` (specifically sections related to `ImagePart` handling, storage path vs. signed URL, and frontend rendering).

## 6. Important Requirements (Constraints)

*   Implemented fixes must not cause loss in functionality for existing features, including but not limited to:
    *   Audio transcription
    *   Tool calls (execution, storage, display)
    *   Standard text message display and formatting
    *   Overall message storage and retrieval integrity.
*   Solutions must respect current authentication and authorization requirements (user ownership of documents, RLS policies).

## 7. Initial Findings & Hypotheses

Based on an initial review of `app/api/chat/route.ts` and `app/api/documents/[documentId]/messages/route.ts`:

**Image Handling in `app/api/chat/route.ts` (POST - Sending to AI & Saving Message):**

*   **Saving User Message (Current Turn):**
    *   Logic exists (lines ~445-515) to process the last user message for database saving.
    *   It correctly attempts to use `requestData.uploadedImagePath` (the direct storage path) for newly uploaded images when constructing the `ImagePart` to be stored in `messages.content` (JSONB). This aligns with the goal of storing canonical, non-expiring paths.
    *   **Potential Issue (DB Save):** For images that are *not* the one just uploaded (e.g., images from chat history resent by the client, or if `uploadedImagePath` is missing), there's a complex fallback logic (lines ~452-497) to extract a storage path from an existing `part.image` URL (assumed to be a Supabase signed URL). This extraction logic is a prime suspect for errors. If it fails to extract a clean storage path and instead stores a full (soon-to-expire) signed URL, a partial URL, an empty string, or an incorrect path into the database, this would explain images disappearing on refresh and the AI being unable to access them later.
*   **Preparing Messages for AI (Current Turn & History):**
    *   **Current Turn's Image (Lines ~612-750):**
        *   A fresh, short-lived signed URL (`finalImageUrlForAI`) is generated for the `requestData.uploadedImagePath`.
        *   The code then attempts to `fetch` this image using the `finalImageUrlForAI`, convert it to **base64**, and send this base64 data in an `ImagePart` to the AI model. This is a robust approach for the current image.
        *   If fetching/base64 conversion fails, it falls back to sending the `finalImageUrlForAI` (the signed URL) directly to the AI.
    *   **Historical Messages:**
        *   The rest of the message history is processed by `convertToCoreMessages(slicedHistoryToConvert as any[])` (line ~753).
        *   **Potential Issue (AI Access to History Images):** The `convertToCoreMessages` function likely does *not* regenerate fresh signed URLs or convert image paths/expired URLs from historical messages into base64. The explicit fetch-and-base64 logic (lines 672-732) is *only* applied to the identified "current turn's image" via `finalImageUrlForAI` in the `manuallyConstructedLastUserMessage` block. If historical messages contain `ImagePart`s with (now expired) signed URLs (loaded from the DB by `GET messages`) or plain storage paths, the AI will not be able to access these images.

**Image Loading in `app/api/documents/[documentId]/messages/route.ts` (GET - Loading for Frontend):**

*   This route appears to correctly parse the `messages.content` JSONB and, for `ImagePart`s, uses the stored `image` path to generate a fresh signed URL for the frontend (lines ~158-175). This seems aligned with the intended design.
*   If images disappear on hard refresh, it strongly implies that the `image` path stored in the database (by `app/api/chat/route.ts` during message save) is incorrect or missing. The loading logic can only work if valid storage paths are present in the `ImagePart`s in the database.

**Primary Hypotheses:**

1.  **`ImagePart` Missing Entirely from Database Record (Confirmed for Problematic Cases - High Likelihood for Refresh & AI Historical Issue):**
    *   **Observation:** For messages where the image disappears on refresh and the AI cannot see it, the `messages.content` field in the database is stored as `[{"text":"some user text","type":"text"}]`, with the `ImagePart` completely missing. The expected format is `[{"text":"...","type":"text"},{"type":"image","image":"bucket_name/image_path.png"}]`.
    *   **Cause:** The logic in `app/api/chat/route.ts` (lines ~445-546) responsible for constructing `contentForDb` (the array to be saved to the database) fails to create or include an `ImagePart` even when image upload was successful (indicated by `requestData.uploadedImagePath` being available).
    *   **Consequences:**
        *   **Disappearing on refresh:** `GET messages` route finds no `ImagePart` in the loaded `content` to process for display.
        *   **AI cannot see historical image:** When messages are loaded from the DB for subsequent AI turns, the `ImagePart` is absent from the history, so the AI has no image reference.

2.  **AI Cannot Access Current Turn's Image (Possible Secondary Issue or Related to `manuallyConstructedLastUserMessage`):**
    *   Even if the `ImagePart` *were* being saved correctly for the current turn, the logic in `app/api/chat/route.ts` that prepares the *immediate* message for the AI (the `manuallyConstructedLastUserMessage` block, lines ~650-750) might still have issues.
    *   This block attempts to fetch the image using a signed URL (`finalImageUrlForAI`) and convert it to base64. If this fetch/conversion fails (e.g., CORS, network, invalid URL) AND the fallback of sending the signed URL directly also fails (e.g., AI model can't access the URL, URL expires too fast), the AI would not see the image for the current turn.
    *   However, the primary issue (missing `ImagePart` in DB) needs to be addressed first, as it affects persistence and history.

3.  **AI Cannot Access Historical Images (If DB Save Were Correct):**
    *   This was a previous hypothesis: If `ImagePart`s *were* saved correctly with storage paths, and `GET messages` correctly provided signed URLs to the client, these signed URLs would likely expire before being re-sent to the AI in a long conversation. The `convertToCoreMessages` function does not refresh these. The current explicit base64 conversion in `app/api/chat/route.ts` only targets the *last/current* message's image, not historical ones.
    *   While this is a valid concern for robust historical image handling, the immediate problem is that the `ImagePart` isn't even making it to the database correctly.

**Refined Investigation Plan (Focus Shifted):**

1.  **Fix `ImagePart` Creation for DB Save (Priority 1 - Root Cause for Missing Images):**
    *   **Problem:** The current logic in `app/api/chat/route.ts` (user message saving block, lines ~445-546) for constructing `contentForDb` only processes/replaces `ImagePart`s if they *already exist* within the incoming `lastClientMessageForSave.content` array from the client. If `lastClientMessageForSave.content` is just a string (text only), or an array without an `ImagePart`, no new `ImagePart` is created from `requestData.uploadedImagePath`.
    *   **Action:** Modify this block in `app/api/chat/route.ts`. The goal is to ensure that if `requestData.uploadedImagePath` (containing the clean `bucket_name/filename.png` path) and `requestData.firstImageContentType` are present and valid, an `ImagePart` (e.g., `{ type: 'image', image: requestData.uploadedImagePath, mimeType: requestData.firstImageContentType }`) is **reliably created and included** in the `contentForDb` array that is saved to the `messages` table. This must happen regardless of the structure of `lastClientMessageForSave.content` (i.e., even if it's just a text string or doesn't contain a client-side image part).
    *   **Implementation Sketch:**
        *   Initialize `contentForDb` as an empty array.
        *   If `lastClientMessageForSave.content` is a string, add a `TextPart` to `contentForDb`.
        *   If `lastClientMessageForSave.content` is an array, iterate through it. Add any `TextPart`s to `contentForDb`. If an `ImagePart` is found that corresponds to the *current upload* (e.g., by matching `firstImageSignedUrl`), then use `requestData.uploadedImagePath` for it. For other pre-existing `ImagePart`s (e.g., from history, though less likely for the *last* message being saved), process them using the existing fallback logic (lines ~452-497) to try and get a storage path.
        *   **Crucially, AFTER processing `lastClientMessageForSave.content`:** If `requestData.uploadedImagePath` is present AND an `ImagePart` for this specific uploaded image hasn't already been added to `contentForDb` (e.g., if `lastClientMessageForSave.content` was just text), then **create and append a new `ImagePart`** using `requestData.uploadedImagePath` and `requestData.firstImageContentType` to `contentForDb`.
        *   Ensure `contentForDb` always ends up as an array, even if it's just a single `TextPart` or `ImagePart`.
    *   This fix directly addresses why `ImagePart`s are missing from the database, which is the root cause of images disappearing on refresh and AI not seeing historical images.

2.  **Verify `manuallyConstructedLastUserMessage` for AI (After DB Fix):**
    *   Once the `ImagePart` is correctly saved to the DB (Step 1), re-test sending a message with an image.
    *   If the AI *still* cannot see the image on the *current turn*, then investigate the `manuallyConstructedLastUserMessage` block (lines ~650-750) in `app/api/chat/route.ts`. Specifically, check:
        *   Is `finalImageUrlForAI` being generated correctly?
        *   Is the `fetch` call to this URL succeeding?
        *   Is the base64 conversion working?
        *   If it falls back to sending the URL, is that URL accessible to the model?
    *   Add detailed logging within this block to trace these steps.

3.  **Address Historical Image Access for AI (Future Enhancement / Robustness):**
    *   After fixing the DB save and ensuring the current turn's image works for the AI, address the issue of AI accessing images from older messages in the history.
    *   The solution would likely involve iterating through all messages being sent to the AI (not just the last one). For any `ImagePart` found that contains a storage path (which it would, after DB fix and loading via `GET messages` which then gives it to client, which sends it back), a fresh short-lived signed URL or base64 conversion needs to happen before sending to the AI via `streamText`. This would make `convertToCoreMessages` more of a pre-processor step, or this logic would need to be part of the loop that prepares `finalMessagesForStreamText`.

4.  **Test Image Path Extraction Logic (Lower Priority Now):** The fallback logic for extracting storage paths from existing URLs (lines ~452-497 during DB save) is less critical if we ensure new images always use `requestData.uploadedImagePath`. However, for handling older data or more complex scenarios, it might still need review eventually, but not for the primary fix.

--- 