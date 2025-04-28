# Fixing Message Metadata Storage

## Problem

The `messages.metadata` column in the database is currently not being populated for new messages. This is crucial for monitoring LLM performance and understanding usage patterns.

## Goal

Ensure that all new messages have their `metadata` column populated with an object containing `usage` (totalTokens, promptTokens, completionTokens) and `raw_content` (the original, unprocessed response from the LLM).

**Example Structure:**

```json
{
  "usage": {
    "totalTokens": 12108,
    "promptTokens": 11841,
    "completionTokens": 267
  },
  "raw_content": [
    {
      "text": "Here are a few more Filipino restaurants in the 94555 area:

1. **Adobolicious**  
   Description: Known for its delicious Filipino dishes, Adobolicious offers a variety of traditional meals. [Visit their website](https://myadobolicious.com/) for more information.

2. **Maharlika Restaurant**  
   Location: 3671 Thornton Ave, Fremont, CA 94536  
   Description: This restaurant is renowned for its barbecued cuisine, including broasted chicken, lumpia, sinigang, mongo beans, and pancit. It's a cash-only establishment known for its authentic flavors. [More info](https://www.mapquest.com/us/california/maharlika-restaurant-11842786)

3. **Isla Restaurant**  
   Description: Specializing in Kapampangan cuisine, Isla Restaurant offers dishes like the original Sisig Kapampangan. It's a destination for those looking to experience the essence of Filipino-Kapampangan flavors. [Visit their website](https://www.islafilipinorestaurant.com/) for more details.

These restaurants provide a taste of authentic Filipino cuisine and are popular choices in the area.",
      "type": "text"
    }
  ]
}
```

## Investigation Plan

1.  ~~Identify where new messages are created and inserted/updated in the database.~~ **DONE**: Assistant messages are saved in `app/api/chat/route.ts` within the `onFinish` callback. User messages are saved via `app/api/documents/[documentId]/messages/route.ts` (called by `useChatInteractions` hook) and during initial document creation in `app/api/launch/route.ts`.
2.  ~~Locate where the LLM response (including usage data and raw content) is received.~~ **DONE**: The `onFinish` callback in `app/api/chat/route.ts` receives `usage` and `response` arguments from the `streamText` call. `usage` contains token counts. The `response` object needs further inspection to confirm the structure of the `raw_content`.
3.  ~~Determine how the metadata (`usage` and `raw_content`) can be passed to the point where the message is saved.~~ **DONE**: The `usage` and `response` objects are directly available within the `onFinish` callback where the assistant message saving occurs.
4.  Outline the specific code changes needed to correctly populate the `messages.metadata` column.

## Implementation Plan (Draft)

1.  **Modify `app/api/chat/route.ts` (`onFinish` callback):**
    *   Inside the `onFinish` function (around line 421):
        *   **Create the metadata object *once* using the `onFinish` arguments:**
            ```typescript
            const assistantMetadata = {
                usage: usage, // From onFinish args
                raw_content: response.messages // Confirmed from logs: the full message sequence from this turn
            };
            ```
        *   In the loop processing `allResponseMessages` (`response.messages`), which iterates through each message part of the response (around line 441):
            *   **If the current `message` being processed has `role === 'assistant'**:
                *   When creating the `messageData` object for database insertion (around line 470), assign the *previously created* `assistantMetadata` object to the `metadata` field, replacing `null`.
                ```typescript
                // Inside the loop in onFinish...
                const message = allResponseMessages[i]; // This is response.messages[i]

                // --- Process ONLY assistant messages for saving ---
                if (message.role === 'assistant') {
                    // ... (existing logic to extract plainTextContent, tool calls for THIS assistant message)

                    // --- Prepare DB object ---
                    const messageData: Omit<SupabaseMessage, 'id' | 'created_at'> = {
                        document_id: documentId,
                        user_id: userId,
                        role: 'assistant',
                        content: plainTextContent, // Content derived from this specific assistant message
                        image_url: null,
                        metadata: assistantMetadata, // <-- Assign the metadata object (same for all assistant messages in this turn)
                    };

                    // ... (rest of insert logic for this assistant message, including saving tool calls IF this message contained them)
                }
                // We don't save 'tool' role messages directly to the messages table here.
                // Their results are saved in the tool_calls table, linked to the assistant message that made the call.
                ```

2.  **Verify User Message Handling:**
    *   Confirm that `metadata: null` remains the correct behavior for user messages inserted via `app/api/documents/[documentId]/messages/route.ts` and `app/api/launch/route.ts`.

3.  **Testing:**
    *   After implementing the change, send various messages (text-only, with tool calls, with images) and verify the `messages.metadata` column in the Supabase table is populated correctly for assistant messages and remains null (or as expected) for user messages.
    *   Check the structure of `raw_content` to ensure it matches the desired format.

## Potential Challenges

*   Ensuring metadata is available at the correct point in the data flow.
*   Handling different types of messages (user vs. assistant).
*   Potential database schema considerations (confirming the `metadata` column type supports JSON).
*   Avoiding regressions or performance issues.

---

*This document will be updated as the investigation progresses.* 