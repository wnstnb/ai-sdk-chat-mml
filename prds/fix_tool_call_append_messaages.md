# Investigation: Tool Call Loading and Display Bug


## Problem Description

When loading chat messages from the database, associated tool calls are not being displayed correctly in the UI, despite the underlying functionality being intact. The tool calls appear correctly during the live chat session but are malformed upon reloading the chat history. The suspicion is that the association between the loaded message and its corresponding tool calls (`tool_calls.message_id = messages.id`) is not being handled correctly during the load process for UI display.

## Code Analysis Findings

Based on a review of the codebase, the following components are involved in loading and displaying messages and tool calls:

1.  **Database Schema (`types/supabase.ts`, `prds/supabase_implementation.md`):**
    *   The `messages` table stores core message data (role, content, etc.).
    *   The `tool_calls` table stores details about each tool call (`tool_call_id`, `tool_name`, `tool_input`, `tool_output`) and includes a `message_id` foreign key linking it back to the `messages` table. This confirms the relationship is correctly defined in the database.

2.  **API Endpoint (`app/api/documents/[documentId]/messages/route.ts`):**
    *   This route fetches all messages for a given `documentId`.
    *   It then performs a *separate* query to fetch all `tool_calls` associated with the IDs of the messages retrieved in the first step (`.from('tool_calls').select('*').in('message_id', messageIds)`).
    *   It iterates through the messages and filters the fetched `toolCalls` to find those matching the current message's ID (`toolCalls?.filter(tc => tc.message_id === msg.id)`).
    *   It returns an array of `MessageWithDetails` objects, where each object contains the message data and an embedded `tool_calls` array (or `null`).
    *   **Conclusion:** The backend API *appears* to correctly fetch and associate tool calls with their parent messages before sending the data to the client.

3.  **Client-side Hook (`app/lib/hooks/editor/useInitialChatMessages.ts`):**
    *   This hook takes the raw data fetched from the API endpoint.
    *   It transforms the `MessageWithDetails[]` into the `Message[]` format expected by the Vercel AI SDK's `useChat` hook.
    *   Crucially, for assistant messages, it maps the `msg.tool_calls` array from the API into:
        *   The `toolCalls` property on the assistant `Message` object (containing `{ toolCallId, toolName, args }`).
        *   Separate `Message` objects with `role: 'tool'` for each tool call *result* (using `tool_output`). The content for these tool messages is structured as `JSON.stringify([{ type: 'tool-result', ... }])`.
    *   **Conclusion:** This hook *appears* to correctly format the loaded data, including tool calls and results, into the structure the AI SDK expects.

4.  **UI Components (`components/editor/ChatMessagesList.tsx`, `components/editor/ChatMessageItem.tsx`):**
    *   These components are responsible for rendering the `Message[]` array provided by `useChat` (which includes the initially loaded messages).
    *   `ChatMessageItem.tsx` likely contains the logic to display assistant messages and their associated tool calls/results.

## Potential Causes of the Bug

Given that the backend API and the initial data formatting hook seem correct, the issue likely arises later in the process on the client-side:

1.  **UI Rendering Logic (`ChatMessageItem.tsx`):** The component might not be correctly interpreting the message structure for loaded messages. During runtime streaming, `useChat` uses the `message.parts` array (containing `ToolInvocationUIPart`) to represent tool calls and results. However, the loading process (`useInitialChatMessages.ts`) generates a different structure for `initialMessages`: it populates a `message.toolCalls` property on the assistant message and creates separate `role: 'tool'` messages for results. The UI component likely expects the `message.parts` structure and fails to correctly render the `message.toolCalls`/`role: 'tool'` structure used for loaded messages.
2.  **State Management (`useChat` / `page.tsx`):** While the initial formatting seems right, how the `useChat` hook manages the state internally or how the main page component (`EditorPage`) interacts with this state upon loading might cause the tool call information to be lost or misinterpreted after the initial load.
3.  **Hydration Issues:** There could potentially be a mismatch between server-rendered or initially processed data and the client-side hydration/rendering pass, although less likely if the formatting hook runs purely client-side after fetching.
4.  **AI SDK Discrepancy:** There might be a subtle difference in how the AI SDK (`ai/react`) handles messages populated initially via the `initialMessages` option versus messages added dynamically during the chat stream.

## Next Steps & Proposed Changes (Implementation)

**The investigation confirms the hypothesis: `ChatMessageItem.tsx` is only designed to render tool calls based on the streaming `message.parts` structure and does not handle the structure used for loaded messages.**

1.  **Modify `ChatMessageItem.tsx`:**
    *   **Identify Tool Calls:** Keep the existing logic to check `message.parts` for `tool-invocation` parts for streaming updates.
    *   **Add Logic for Loaded Messages:**
        *   If `message.role === 'assistant'` and `message.parts` is empty or doesn't contain tool invocations, check if `message.toolCalls` exists and has items.
        *   If `message.toolCalls` exists, map over *this* array to render the "Using tool: ..." indicators, similar to how `toolInvocationParts` is currently mapped. Use `toolCall.toolCallId` for the key and `toolCall.toolName` for the name.
    *   **Render Tool Results (Separate Messages):**
        *   Add a condition to check if `message.role === 'tool'`.
        *   If it is, parse the `message.content` (which should be a JSON stringified array containing a `tool-result` object, as prepared by `useInitialChatMessages.ts`).
        *   Render the tool result information appropriately. This might involve displaying the `toolName` and a representation of the `result` (e.g., `[Tool Result for {toolName}]` or similar).

2.  **Testing:**
    *   Test with live streaming tool calls to ensure rendering is unchanged.
    *   Test loading a chat history that includes tool calls and results, verifying they now render correctly.

**No further debugging of `useChat` state is likely needed, as the rendering component is the clear point of failure.**

*(Previous point 3 about potential code change is now integrated into point 1)*

## Implementation Steps (Revised Approach)

This revised plan focuses on modifying the data loading process to ensure consistency, rather than altering the UI component to handle multiple formats.

**Target File:** `app/lib/hooks/editor/useInitialChatMessages.ts`

1.  **Locate Assistant Message Processing:** Find the section within the `fetchMessages` function (or equivalent logic) where messages fetched from the API are processed, specifically the block handling `msg.role === 'assistant'`.

2.  **Reconstruct `message.parts` for Tool Calls:**
    *   Modify the logic that currently creates the `toolCalls` property and separate `role: 'tool'` messages.
    *   Instead, when an assistant message (`msg`) has associated `msg.tool_calls`:
        *   Initialize an empty array, e.g., `const messageParts = [];`
        *   **Add Text Part:** If `msg.content` exists and is not empty, add a text part: `messageParts.push({ type: 'text', text: msg.content });`
        *   **Add Tool Invocation Parts:** Iterate through the `msg.tool_calls` array. For each `tool_call`:
            *   Create a `ToolInvocation` object matching the structure expected by `ToolInvocationUIPart`.
            *   Since we are loading history, the tool call is complete, so the state should be `'result'`. 
            ```typescript
            const toolInvocation = {
              state: 'result', // Mark as complete since we have the result
              toolCallId: tool_call.tool_call_id, 
              toolName: tool_call.tool_name,
              args: tool_call.tool_input,     // From DB
              result: tool_call.tool_output   // From DB
            };
            messageParts.push({ type: 'tool-invocation', toolInvocation });
            ```
        *   **Assign `parts` to Formatted Message:** When creating the final `Message` object for the `formattedMessages` array, assign the `messageParts` array to its `parts` property. Ensure the main `content` property of the message is set appropriately (it might be an empty string or null if the message *only* contained tool calls initially, or it could be the text part's content if you prefer - decide on consistency).
        ```typescript
        // Example structure for pushing to formattedMessages:
        formattedMessages.push({
            id: msg.id,
            role: 'assistant',
            // Content could be empty if only tool calls, or duplicate the text part's content
            content: msg.content || '', 
            createdAt: new Date(msg.created_at),
            parts: messageParts // Assign the reconstructed parts array
        } as Message); // Type assertion might be needed
        ```
    *   **Remove `role: 'tool'` Message Creation:** Delete the code block that previously iterated through `msg.tool_calls` again to create separate messages with `role: 'tool'`. This is no longer needed as the results are included in the assistant message's `parts`.

3.  **Verify `ChatMessageItem.tsx`:**
    *   Briefly review `components/editor/ChatMessageItem.tsx` again.
    *   Confirm that it renders tool calls *only* by looking at the `message.parts` array (specifically checking for `part.type === 'tool-invocation'`).
    *   Remove any conditional logic that might have been added previously to check for `message.toolCalls` (if any preliminary changes were made based on the old plan).

4.  **Testing:**
    *   Test loading chat history containing various combinations: text only, text + tool calls, tool calls only.
    *   Verify that assistant messages with tool calls and their results render correctly using the standard `message.parts` rendering logic in the UI component.
    *   Verify that live streaming still works as expected. 