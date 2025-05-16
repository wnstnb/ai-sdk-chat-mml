# PRD: Fix "Unsupported role: tool" Error with Follow Up Context

## 1. Problem Description

Users encounter an error that prevents interaction with the AI after using features like "Follow Up Context". The error log indicates an issue with message formatting when tool calls are involved:

```
[API Chat Stream/Execute Error] An error occurred: MessageConversionError [AI_MessageConversionError]: Unsupported role: tool
    at convertToCoreMessages (webpack-internal:///(rsc)/./node_modules/ai/dist/index.mjs:1999:15)
    // ... other stack trace lines
  originalMessage: { role: 'tool', content: [ [Object] ] },
  // ...
}
```

This error suggests that a message with `role: 'tool'` is being sent to the Vercel AI SDK's `streamText` function in a format it does not support. The issue appears to manifest after user actions that likely trigger tool usage by the assistant.

## 2. Investigation and Findings

### 2.1. Initial Hypothesis
The initial thought was that the error might be related to applying a `role:tool` to a user message, potentially due to the "Follow Up Context" feature. However, further analysis showed this was a misdirection. The "Follow Up Context" is part of the user's input that may *trigger* an assistant to use a tool, but the error occurs in how the *result* of that tool call is subsequently formatted and sent back to the AI.

### 2.2. Root Cause Analysis
The investigation pinpointed the issue to the backend API route `app/api/chat/route.ts`, specifically within the message transformation logic that prepares messages for the Vercel AI SDK's `streamText` function.

*   **Log Analysis:** The error `originalMessage: { role: 'tool', content: [ [Object] ] }` was key. It showed that the `content` of the problematic `tool` message was an array of objects.
*   **Code Review (`app/api/chat/route.ts`):**
    *   The code responsible for transforming assistant messages that have `tool-invocation` parts (often from rehydrated historical messages or complex interactions) collects tool results into an array called `toolResultsForSdk`. This array contains `ToolResultPart` objects.
    *   The problematic code block is approximately:
        ```typescript
        // Inside the loop transforming messages, after processing toolInvocationParts
        if (toolResultsForSdk.length > 0) {
            transformedMessages.push({
                role: 'tool',
                content: toolResultsForSdk // This is an array of ToolResultPart objects
            });
            console.log(`[API Chat Transform] Added tool message with ${toolResultsForSdk.length} tool result(s) for SDK.`);
        }
        ```
*   **Vercel AI SDK Expectation:** The `streamText` function (and its internal `convertToCoreMessages` utility) expects `tool` messages to adhere to a specific format:
    1.  **One `tool` message per individual tool result.**
    2.  Each `tool` message must have a **top-level `tool_call_id` property**, matching the `toolCallId` of the specific tool call it's a result for.
    3.  Each `tool` message must have a **`content` property that is a string** (typically the JSON stringified output of the tool).

*   **The Discrepancy:** The current backend logic creates a *single* `tool` message whose `content` is an *array* of `ToolResultPart` objects. This message also lacks the required top-level `tool_call_id`. This mismatch is the direct cause of the "Unsupported role: tool" error.

## 3. Conceptual Solution

To resolve the error, the message transformation logic in `app/api/chat/route.ts` needs to be modified. Instead of creating a single `tool` message containing an array of all results, it must create individual `tool` messages for each tool result, formatted correctly.

**Conceptual Change in `app/api/chat/route.ts`:**

Within the `if (isAssistantWithToolInvocation)` block, during the iteration over `toolInvocationParts`:

*   **Current Logic (Simplified):**
    ```typescript
    // Collect all results
    if (result !== undefined && result !== null) {
        toolResultsForSdk.push({ type: 'tool-result', toolCallId, toolName, result });
    }
    // Later, push a single tool message
    if (toolResultsForSdk.length > 0) {
        transformedMessages.push({ role: 'tool', content: toolResultsForSdk });
    }
    ```

*   **Proposed Corrected Logic (Conceptual):**
    ```typescript
    // For each tool invocation part that has a result
    if (result !== undefined && result !== null) {
        // Create and push an individual, correctly formatted tool message
        transformedMessages.push({
            role: 'tool',
            tool_call_id: toolCallId, // Top-level property
            content: typeof result === 'string' ? result : JSON.stringify(result) // Stringified content
        });
        console.log(`[API Chat Transform] Added individual tool message for tool_call_id ${toolCallId}.`);
    }
    // The block that pushed a single tool message with an array of results would be removed or replaced by this individual pushing logic.
    ```

This change ensures that each tool result is sent to the AI SDK as a separate, correctly formatted `tool` message.

## 4. Impact Assessment

*   **Database (`messages.content` for assistant messages):**
    *   This fix **does not change** how assistant messages (containing `tool-call` parts with embedded `result` objects) are saved to the database.
    *   The `content` for `role: 'assistant'` messages will continue to be saved as an array of part objects (e.g., `[{type: 'text', ...}, {type: 'tool-call', ..., result: ...}]`), suitable for JSONB storage. This aligns with the existing loading logic in `useInitialChatMessages.ts`.

*   **Message Loading and UI (`useInitialChatMessages.ts`, `ChatMessageItem.tsx`, `ChatMessagesList.tsx`):**
    *   This fix **should not negatively affect or require changes** to the existing client-side message loading or UI rendering logic.
    *   `useInitialChatMessages.ts` is designed to handle assistant messages with embedded results.
    *   `ChatMessageItem.tsx` renders these messages correctly based on their structure and the `state` field.
    *   The problem being addressed is specific to the backend's construction of `tool` (result) messages during active conversations for the `streamText` API, not how historical messages are stored or displayed.

*   **"Follow Up Context" Feature:**
    *   The "Follow Up Context" feature itself is not the cause of the error. The error is in the subsequent handling of tool results generated by the assistant.
    *   Fixing the `tool` message formatting should make interactions involving tool calls (including those potentially triggered by "Follow Up Context") more robust.

## 5. Next Steps

*   Confirm the conceptual solution.
*   Implement the code changes in `app/api/chat/route.ts` to correctly format individual `tool` messages.
*   Test thoroughly, especially scenarios involving tool usage triggered by various user inputs, including "Follow Up Context". 

## 6. Implementation Plan

The following changes should be made to `app/api/chat/route.ts` within the `POST` function, specifically in the message transformation loop that processes messages before sending them to the AI SDK (`streamText`).

**Target Code Block:** The primary area of modification is within the `if (isAssistantWithToolInvocation)` block, where `sourceParts` (derived from `msg.content` or `(msg as any).parts`) are iterated to handle `tool-invocation` types.

**Step-by-Step Instructions:**

1.  **Locate the `toolInvocationParts` Loop:**
    *   Inside the `if (isAssistantWithToolInvocation)` block, find the loop:
        ```typescript
        for (const tip of toolInvocationParts) {
            // ... existing logic ...
        }
        ```

2.  **Modify Tool Result Handling within the Loop:**
    *   Inside this `for (const tip of toolInvocationParts)` loop, find the section where `toolResultsForSdk` is populated if a `result` is present. It looks like this:
        ```typescript
        // Only add tool result if a result is actually present
        if (result !== undefined && result !== null) {
            toolResultsForSdk.push({
                type: 'tool-result',
                toolCallId: toolCallId,
                toolName: toolName, 
                result: result
            });
        }
        ```
    *   **Replace** this block with logic to directly create and push a correctly formatted `tool` message to `transformedMessages`:
        ```typescript
        // Only process tool result if a result is actually present
        if (result !== undefined && result !== null) {
            transformedMessages.push({
                role: 'tool',
                tool_call_id: toolCallId, // Ensure toolCallId is from tip.toolInvocation
                content: typeof result === 'string' ? result : JSON.stringify(result) // Stringify if not already a string
            });
            console.log(`[API Chat Transform] Added individual tool message for tool_call_id ${toolCallId}.`);
        }
        ```
        *Self-correction during planning: Ensure `toolCallId` used here is correctly sourced from `tip.toolInvocation.toolCallId` which is already deconstructed as `toolCallId` in the loop.* 

3.  **Remove the Old Aggregated `tool` Message Creation Block:**
    *   After the `for (const tip of toolInvocationParts)` loop, there's a block of code that creates a single `tool` message using the `toolResultsForSdk` array. This entire block must be **removed**.
    *   The block to remove is:
        ```typescript
        // This entire block should be REMOVED:
        if (toolResultsForSdk.length > 0) {
            transformedMessages.push({
                role: 'tool',
                content: toolResultsForSdk 
            });
            console.log(`[API Chat Transform] Added tool message with ${toolResultsForSdk.length} tool result(s) for SDK.`);
        } else if (toolCallsForSdk.length > 0 && toolInvocationParts.some(tip => tip.toolInvocation?.result === undefined || tip.toolInvocation?.result === null)) {
            console.warn(`[API Chat Transform] Tool call(s) were present, but some results were missing. Not all tool results messages could be created.`);
        }
        ```

4.  **Verify `toolResultsForSdk` Array (Optional Cleanup):**
    *   The array `const toolResultsForSdk: ToolResultPart[] = [];` is declared before the `for (const tip of toolInvocationParts)` loop.
    *   With the changes in step 2, this array is no longer used to construct the `tool` messages sent to the SDK.
    *   For a cleaner codebase, you can remove the declaration and any push operations to `toolResultsForSdk`. However, if you prefer a more minimal change for now, leaving the declaration and its population (which will no longer be used by the removed block in step 3) will not break functionality. The critical part is removing the incorrect usage of this array.

5.  **No Changes to Assistant `tool-call` Message Creation:**
    *   The logic that prepares and pushes the assistant message containing `tool-call` parts should remain untouched. This block typically looks like:
        ```typescript
        if (toolCallsForSdk.length > 0) {
            transformedMessages.push({
                role: 'assistant',
                content: toolCallsForSdk 
            });
            console.log(`[API Chat Transform] Added assistant message with ${toolCallsForSdk.length} tool call(s) for SDK.`);
        }
        ```

**Summary of Change:** The core change is to stop aggregating tool results into an array (`toolResultsForSdk`) to be put inside a single `tool` message. Instead, each tool result will generate its own distinct `tool` message, correctly formatted with `role: 'tool'`, a top-level `tool_call_id`, and stringified `content`, and pushed directly to `transformedMessages` during the loop.

**Testing Considerations:**
*   Test scenarios where an assistant's response includes one or more tool calls.
*   Specifically test with user inputs that utilize the "Follow Up Context" feature and lead to tool usage.
*   Verify that the AI interaction continues correctly after tool execution (i.e., the AI receives and understands the tool results).
*   Check server-side logs for `[API Chat Transform] Added individual tool message for tool_call_id ...` and ensure no new errors appear.
*   Confirm that historical message loading and display remain unaffected. 