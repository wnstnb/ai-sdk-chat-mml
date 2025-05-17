# Tool Call Hotfix: Investigation and Plan

This document outlines the investigation into the "Unsupported role: tool" error and the plan to address it.

## First Order: Determine the Issue(s)

**Observed Behavior:**

1.  User can initiate a new document and instruct the AI to execute a tool call in the initial message.
2.  The AI successfully executes this initial tool call.
3.  When the user attempts to interact with the AI again (sending a subsequent message), an error occurs.

**Error Message:**

```
[API Chat Stream/Execute Error] An error occurred: MessageConversionError [AI_MessageConversionError]: Unsupported role: tool
    at convertToCoreMessages (webpack-internal:///(rsc)/./node_modules/ai/dist/index.mjs:1999:15)
    at standardizePrompt (webpack-internal:///(rsc)/./node_modules/ai/dist/index.mjs:2234:53)
    at new DefaultStreamTextResult (webpack-internal:///(rsc)/./node_modules/ai/dist/index.mjs:5561:27)
    at streamText (webpack-internal:///(rsc)/./node_modules/ai/dist/index.mjs:5191:10)
    at POST (webpack-internal:///(rsc)/./app/api/chat/route.ts:1049:70)
    ...
```

**Analysis of Provided Message History and Error:**

The error `MessageConversionError: Unsupported role: tool` clearly indicates that the Vercel AI SDK's `convertToCoreMessages` function does not support messages with `role: "tool"` in the format they are currently being provided.

Looking at the message sequence:
```json
  { // This is message 1 in the example, but let's focus on the pattern
    "role": "user",
    "content": "start a doc with 5 random colors"
  },
  // ... other messages ...
  { // Message X: Assistant provides a text response
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I've started your document with a list of 5 random colors: Red, Blue, Green, Yellow, and Purple. If you'd like to change the format or add more details, just let me know!"
      }
    ]
  },
  { // Message X+1: THIS IS THE PROBLEMATIC MESSAGE causing the error later on
    "role": "tool",
    "content": [
      {
        "type": "tool-result",
        "toolCallId": "call_TonJTow8ig1eBfxG0VBP9NPV",
        "toolName": "addContent",
        "result": "{\"tool\":\"addContent\",\"status\":\"forwarded to client\"}"
      }
    ]
  },
  { // Message X+2: Assistant makes the tool call
    "role": "assistant",
    "content": [
      {
        "type": "tool-call",
        "toolCallId": "call_TonJTow8ig1eBfxG0VBP9NPV",
        "toolName": "addContent",
        "args": {
          "targetBlockId": null,
          "markdownContent": "* Red\n* Blue\n* Green\n* Yellow\n* Purple"
        }
      }
    ]
  },
  { // Message X+3: User sends another message
    "role": "user",
    "content": "nice, can you add 5 more random colors"
  },
  // ... further user/assistant messages ...
  { // User sends the message that triggers the API call
    "role": "user",
    "content": "hi, you there still?"
  }
  // When the API call is made (e.g., streamText), the entire history including Message X+1 is sent.
  // The SDK's convertToCoreMessages function encounters Message X+1 with role: "tool" and fails.
```

**Core Issue:**

The Vercel AI SDK's `convertToCoreMessages` function (used internally by `streamText`) expects messages in the `CoreMessage` format. The error `MessageConversionError: Unsupported role: tool` arises because the `role: "tool"` messages in the chat history being processed do not conform to this expected structure.

Specifically, a `CoreMessage` with `role: "tool"` should look like this:
```json
{
  "role": "tool",
  "tool_call_id": "string", // The ID of the tool call this message is a result for
  "content": "string"       // The actual result of the tool execution (often a stringified JSON)
  // "name": "string"      // Optional: the name of the tool that was called
}
```

However, the problematic `role: "tool"` message in the provided logs has this structure:
```json
{
  "role": "tool",
  "content": [ // Problem 1: 'content' is an array instead of the direct result string.
    {
      "type": "tool-result", // Problem 2: The actual result and metadata are nested.
      "toolCallId": "call_TonJTow8ig1eBfxG0VBP9NPV",
      "toolName": "addContent",
      "result": "{\"tool\":\"addContent\",\"status\":\"forwarded to client\"}" // This should be the top-level 'content'.
    }
  ]
}
```
The `convertToCoreMessages` function cannot process this nested structure for `role: "tool"` messages.

**Hypotheses:**

1.  **Incorrect Message Structuring for Tool Results (Confirmed primary issue):** The application is constructing, persisting (in DB), or retrieving `role: "tool"` messages in a format with a nested `content` array and `tool-result` object. This format is incompatible with the Vercel AI SDK's `CoreMessage` expectations for the `streamText` function. The messages need to be transformed to the flat structure (shown above) before being passed to the SDK.
    *   **Pinpointed Cause:** The code block in `app/api/chat/route.ts` (around lines 884-892, in the loop processing `messagesToProcess`) incorrectly handles messages that *already have* `role: "tool"`. It expects `msg.content` for these messages to be a JSON string representing an array of `ToolResultPart` objects. It then parses this string and sets the `content` of the outgoing `role: "tool"` message (intended for `streamText`) to be this *parsed array*. This creates the malformed structure: `{ role: "tool", content: [{type: "tool-result", ...}] }`.
    *   The Vercel AI SDK (`convertToCoreMessages`) expects a `role: "tool"` message to be flat: `{ role: "tool", tool_call_id: "string", content: "string_result" }`.

2.  **Client-Side Formatting vs. Server-Side Expectation:** While the client-side formatting (e.g., using `useChat` and how it prepares data for `req.json()`) and the message retrieval from the database (via `app/api/documents/[documentId]/messages/route.ts`) contribute to the data that `app/api/chat/route.ts` receives, the final erroneous structuring for `role: "tool"` messages passed to `streamText` happens within `app/api/chat/route.ts` itself, as described above.

3.  **Data Persistence and Retrieval:** The way data is stored (e.g., `role: "tool"` message's `content` being a stringified array of `ToolResultPart`) influences the processing in `app/api/chat/route.ts`. However, even with this storage format, `app/api/chat/route.ts` *could* correctly transform it into the `CoreMessage` format. The current logic fails to do so for pre-existing `role: "tool"` messages.

**Immediate Next Steps for Investigation:**

1.  **Consult Vercel AI SDK Documentation:** Specifically look for how to format messages when using tools/function calling. Pay attention to the expected roles and structure for:
    *   The assistant's request to call a tool.
    *   The providing of tool execution results back to the model.
2.  **Inspect Code Generating/Storing/Retrieving Messages:**
    *   Examine `app/api/chat/route.ts` (around line 1049, where `streamText` is called) to see how the `messages` array is populated. Since it comes from `req.json()`, the client is sending it this way.
    *   Trace back to the client-side code (likely using `useChat` or similar from `ai/react`) that constructs and sends these messages, especially how `addToolResult` (or equivalent logic) formats the tool result message.
    *   Investigate how messages, particularly `role: "tool"` messages, are stored in and retrieved from the database if they are persisted. Identify where the transformation to the correct `CoreMessage` format should occur (ideally before `streamText` is called).
3.  **Compare with Working Examples:** Review Vercel AI SDK examples for `streamText` with tool usage, focusing on the exact structure of the `messages` array passed, especially the `role: "tool"` messages.

**Conclusion of First Order Investigation:** The root cause is the specific logic block in `app/api/chat/route.ts` (approx. lines 884-892) that processes messages with `role: "tool"`. It incorrectly sets the `content` of these messages to be an array of `ToolResultPart` objects, rather than transforming them into the flat `CoreMessage` structure (with `tool_call_id` and a string `content`) expected by the Vercel AI SDK's `streamText` function.

## Second Order: Plan Specific Code Changes

The following steps detail the modifications required in `app/api/chat/route.ts` to fix the "Unsupported role: tool" error and ensure correct processing of tool call messages for the Vercel AI SDK.

**Target File:** `app/api/chat/route.ts`

**Core Principle:** Transform `role: "tool"` messages from their current persisted/received format into the flat `CoreMessage` structure expected by the Vercel AI SDK before they are included in the `transformedMessages` array passed to `streamText`.

**Expected `CoreMessage` format for `role: "tool"`:**
```json
{
  "role": "tool",
  "tool_call_id": "string_id_of_the_tool_call",
  "content": "string_containing_the_tool_output_or_result" // Typically a string, can be stringified JSON
}
```

**Current problematic structure being generated for `streamText` (within the loop processing `messagesToProcess`):**
```json
{
  "role": "tool",
  "content": [
    {
      "type": "tool-result",
      "toolCallId": "call_xxx",
      "toolName": "yyy",
      "result": "{\"status\":\"ok\"}"
    }
  ]
}
```

**Step-by-Step Implementation Plan:**

1.  **Locate the Target Code Block:**
    *   In `app/api/chat/route.ts`, find the loop that iterates through `messagesToProcess` (or a similarly named variable that holds messages before they are put into the `messages` array that then becomes `transformedMessages`). This is likely around lines 802-901 based on previous analysis.
    *   Within this loop, specifically target the `else if (msg.role === 'tool') { ... }` block (around lines 884-892).

2.  **Modify the Logic for `role: 'tool'` messages:**
    *   The current code (simplified) is:
        ```typescript
        // Inside the loop: else if (msg.role === 'tool')
        try {
            const toolResultParts = JSON.parse(msg.content) as ToolResultPart[]; // Assumes msg.content is a stringified array
            if (Array.isArray(toolResultParts) && toolResultParts.every(p => p.type === 'tool-result')) {
                messages.push({ role: 'tool', content: toolResultParts }); // <<< THIS IS THE LINE CAUSING THE ISSUE
            } else { /* ... warning ... */ }
        } catch (e) { /* ... warning ... */ }
        ```
    *   Given that `messages.content` is `JSONB` in the database, `msg.content` (when fetched for a `role: "tool"` message) is likely already a JavaScript array of `ToolResultPart`-like objects. If it *is* a string, it implies an intermediate step stringified it, or it came directly from a client request in string form.
    *   **Replace the problematic `messages.push(...)` line.** Iterate through the `toolResultParts` (which should be derived from `msg.content`). For each `part`, create a new SDK-compliant `CoreMessage`.
    *   **New Logic:**
        ```typescript
        // Inside the loop: else if (msg.role === 'tool')
        try {
            let toolResultParts: any[] = [];

            if (Array.isArray(msg.content)) {
                // msg.content is already an array (likely from JSONB deserialization or direct client structured data)
                toolResultParts = msg.content;
            } else if (typeof msg.content === 'string') {
                // msg.content is a string, attempt to parse it as JSON
                // This might occur if data comes from a source that stringifies JSONB content
                // or from older records before a direct JSONB object handling was implemented.
                try {
                    toolResultParts = JSON.parse(msg.content);
                    if (!Array.isArray(toolResultParts)) {
                        console.warn(`[API Chat Pre-Transform] Parsed tool message content (ID: ${msg.id}) was not an array. Original String:`, msg.content);
                        toolResultParts = []; // Treat as empty if not an array after parsing
                    }
                } catch (parseError: any) {
                    console.warn(`[API Chat Pre-Transform] Failed to parse string content of tool message (ID: ${msg.id}). Error: ${parseError.message}. Original String:`, msg.content);
                    toolResultParts = []; // Treat as empty on parse error
                }
            } else {
                console.warn(`[API Chat Pre-Transform] Received tool message (ID: ${msg.id}) with unexpected content type: ${typeof msg.content}. Content:`, msg.content);
                // toolResultParts remains empty
            }

            if (toolResultParts.length > 0) {
                for (const part of toolResultParts) {
                    if (part && part.type === 'tool-result' && typeof part.toolCallId === 'string' && part.result !== undefined) {
                        const sdkToolMessage: { role: 'tool'; tool_call_id: string; content: string } = {
                            role: 'tool',
                            tool_call_id: part.toolCallId,
                            content: typeof part.result === 'string' ? part.result : JSON.stringify(part.result)
                        };
                        messages.push(sdkToolMessage);
                        console.log(`[API Chat Pre-Transform] Added SDK-compliant tool message for toolCallId: ${part.toolCallId}`);
                    } else {
                        console.warn(`[API Chat Pre-Transform] Invalid/incomplete tool-result part in tool message (ID: ${msg.id}). Part:`, part);
                    }
                }
            } else {
                // This warning now also covers cases where msg.content was not string/array or was an empty array.
                console.warn(`[API Chat Pre-Transform] No valid tool-result parts found in tool message (ID: ${msg.id}). Original Content:`, msg.content);
            }
        } catch (e: any) { // General catch for unexpected errors in this block
            console.error(`[API Chat Pre-Transform] Unexpected error processing tool message content (ID: ${msg.id}). Error: ${e.message}. Original Content:`, msg.content);
        }
        ```

3.  **Type Definitions and Imports:**
    *   Ensure necessary type definitions are available. `CoreMessage` should be available if `ai` package types are imported.
    *   The `ToolResultPart` (or whatever type `part` is expected to be within `msg.content` if it's an array) should align with what's stored in the `JSONB` field or sent by the client for historical tool messages. It typically would include `type: 'tool-result'`, `toolCallId: string`, `toolName: string` (optional for SDK message), and `result: any` (which we ensure becomes a string).

4.  **Stringification of `part.result`:**
    *   The `content` field of the SDK `tool` message must be a string. The suggested code `content: typeof part.result === 'string' ? part.result : JSON.stringify(part.result)` ensures this. This is crucial as `part.result` from the `JSONB` (or parsed JSON) could be an object.

5.  **Handling of `messagesToProcess` vs. `transformedMessages`:**
    *   The modification above pushes the correctly formatted `sdkToolMessage` into the `messages` array. This `messages` array is later used as the input to the main "TRANSFORMATION STEP" (around line 940 in `app/api/chat/route.ts`) which produces `transformedMessages`.
    *   The existing transformation step primarily deals with assistant messages having `tool-invocation` parts. It has an `else { transformedMessages.push(msg); }`. Since our correctly formatted `sdkToolMessage` is not an assistant message with `tool-invocation`, it will pass through this `else` block and be correctly added to `transformedMessages` without further (undesired) modification.

6.  **Testing and Validation Strategy:**
    *   **Primary Scenario:**
        1.  User initiates a new chat and makes a request that triggers a tool call.
        2.  AI assistant responds with the tool call.
        3.  Tool executes, and result is processed.
        4.  User sends a follow-up message.
        5.  **Crucially, verify no "Unsupported role: tool" error occurs and the AI responds correctly to the follow-up, using the context of the tool call result.**
    *   **History Loading:** Load a chat that has previous tool calls and results. Ensure subsequent interactions work correctly.
    *   **No Regression:**
        *   Verify that assistant messages involving `tool-call` parts (not `role: "tool"` messages from history) are still handled correctly by the existing transformation logic (the one that handles `tool-invocation`).
        *   Ensure text-only user/assistant messages, system messages, and messages with images continue to work as expected.
        *   Confirm that the display of tool calls and their results in the chat UI remains unchanged and correct.
        *   Confirm that messages (including tool calls and results) are still persisted to the database in their existing format. The change is in *preparing data for the AI SDK*, not altering DB schema or fundamental storage logic for now.
    *   **Edge Cases for `role: 'tool'` content:**
        *   What if `msg.content` for a `role: "tool"` message is not a stringified array but something else? (The revised logic includes a basic check and warning).
        *   What if the parsed `toolResultParts` array is empty or contains items not matching the expected structure? (The revised logic includes warnings).

7.  **Review `saveAssistantMessageAndToolResults` (or similar in `onFinish`):**
    *   Briefly review how assistant messages and their tool results are saved to the database in the `onFinish` callback of `streamText` (or related functions like `saveAssistantMessageAndToolResults`).
    *   **Impact of `JSONB`**: If `messages.content` is `JSONB`, then the saving mechanism should ensure it's writing a valid JSON structure (e.g., an array of `ToolResultPart`-like objects) directly to this column, rather than double-stringifying it. The reading logic (Step 2) now anticipates `msg.content` might already be an array.
    *   The key is consistency: the format written to the `JSONB` `content` field for `role: "tool"` messages (if any directly written like that) or the format reconstructed for client history should be an array of `ToolResultPart`-like objects, which the new logic in Step 2 can process.

This plan aims for a targeted fix with minimal disruption to other functionalities, focusing on correcting the message structure just before it's sent to the AI SDK. 