## Hotfix: Messages & Tool Calls - V3 Investigation

**Objective:** Resolve errors preventing users from continuing a chat conversation after an AI tool call has been executed.

**Status (v3):** Investigating a server-side `MessageConversionError: Unsupported role: tool` after a client-side fix for `tool_call` argument stringification (implemented per `hotfix_messages_tool_calls_v2.md`) did not resolve the underlying issue.

### Problem Summary:

Users are unable to interact with the AI after a tool call completes. 

1.  **Initial Error (Addressed in v2 attempt):** A client-side "Chat Error" toast appeared, triggered by the `onError` handler in `lib/hooks/editor/useChatInteractions.ts`. This was due to the `args` field in the assistant's `tool_call` message part being an object instead of a JSON string, as required by the Vercel AI SDK.
    *   **Attempted Fix (v2):** Modified the backend (`/api/chat`) to ensure `JSON.stringify()` was used for the `args` in `tool-call` message parts.

2.  **Current Error (v3 Investigation):** After implementing the `args` stringification, a new error surfaced on the **server-side** when the user sends a subsequent message after a tool call:
    *   **Error Message:** `MessageConversionError: Unsupported role: tool`
    *   **Source:** `convertToCoreMessages` function within the Vercel AI SDK (called by `streamText` in `/app/api/chat/route.ts`).
    *   **Trigger:** The user sends a new message (e.g., "hello") after a tool has been called and its result processed.

### Root Cause Analysis (Current Understanding):

The `MessageConversionError: Unsupported role: tool` indicates that the Vercel AI SDK's `convertToCoreMessages` function, while preparing the chat history for the LLM, is encountering a message with `role: 'tool'` whose `content` structure is not recognized or supported.

**Sequence of Events Leading to the Current Error:**

1.  **User Initiates Tool Call:** User sends a message.
2.  **AI Responds with Tool Call:** Backend sends an assistant message with a `tool_call` (args now correctly stringified).
3.  **Tool Execution & Result Message Added to History (Client-Side):** The tool executes. A message representing the tool's result, with `role: 'tool'`, is added to the chat history on the client (likely via `useChat`'s `onToolCall` or `addToolResult`).
    *   The logged structure of this `role: 'tool'` message from the client is:
        ```json
        {
          "role": "tool",
          "content": [
            {
              "type": "tool-result", // <-- Problematic custom field
              "toolCallId": "call_Aly2WjsnBwPCOc7Za7eWDMjG",
              "toolName": "addContent",
              "result": "{\"tool\":\"addContent\",\"status\":\"forwarded to client\"}"
            }
          ]
        }
        ```
4.  **User Sends New Message:** User sends another message (e.g., "hello").
5.  **Client Sends Full History to Server:** The `useChat` hook sends the entire message history (including the initial user message, the assistant's `tool_call`, the client-generated `role: 'tool'` result message, and the new user message) to `/api/chat`.
6.  **Server-Side Error:** The `/api/chat` route attempts to use `streamText`. The internal `convertToCoreMessages` function fails when it tries to process the `role: 'tool'` message from the history due to its non-standard `content` structure (specifically the `type: "tool-result"` field).

**Why the Previous Fix (v2) Was Insufficient:**

The v2 fix correctly addressed the `args` stringification for `tool_call` messages, allowing the client to send the *complete* message history to the server. However, it did not address the structure of the `role: 'tool'` message (the tool *result*) which is also part of that history. This pre-existing structural issue with the tool result message was then exposed on the server-side.

**Database Context (`messages.content` as JSONB):**

*   Storing `messages.content` as `JSONB` means the database faithfully stores and retrieves the JSON structure provided by the application.
*   This is not the *cause* of the error but ensures that if an incorrectly structured `role: 'tool'` message (tool result) is created and saved, it will retain that incorrect structure when loaded and re-processed, leading to the server-side error.
*   The fix still lies in ensuring the `role: 'tool'` message has the correct `content` structure *before* it is processed by `streamText` on the server, which typically means correcting its construction on the client-side.

**Expected Structure for `role: 'tool'` Messages (Tool Results):

Based on Vercel AI SDK documentation (e.g., `addToolResult` usage), the `content` of a `role: 'tool'` message should be an array of objects, where each object directly provides the `toolCallId` and the `result` (or `toolResponse`). The custom `type: "tool-result"` field is not standard.

A more compliant structure would be:
```json
{
  "role": "tool",
  "content": [
    {
      "toolCallId": "call_Aly2WjsnBwPCOc7Za7eWDMjG",
      "result": "{\"tool\":\"addContent\",\"status\":\"forwarded to client\"}" 
      // Or potentially: "result": { "tool": "addContent", "status": "forwarded to client" }
      // The exact format of 'result' (string vs. object) needs to be confirmed against SDK expectations for the LLM.
    }
  ]
}
```

### Next Steps:

1.  **Pinpoint Client-Side Tool Result Construction:** Identify where the `role: 'tool'` message (representing the tool's output) is constructed and added to the `useChat` message history on the client-side (likely in `lib/hooks/editor/useChatInteractions.ts` or related UI components that call `addToolResult` or handle `onToolCall`).
2.  **Modify Structure:** Adjust the client-side logic to ensure the `content` of the `role: 'tool'` message conforms to the Vercel AI SDK's expected structure (i.e., remove `type: "tool-result"` and ensure `toolCallId` and `result` are direct properties).
3.  **Test Thoroughly:** Retest the end-to-end tool call flow. 

### Detailed Implementation Plan:

**Objective:** Modify the client-side construction of `role: 'tool'` messages (tool results) to align with Vercel AI SDK expectations, resolving the server-side `MessageConversionError`.

**Assumptions:**
*   The tool execution itself is happening correctly.
*   The `toolCallId` is available when the tool result is being processed.
*   The `result` of the tool is available (currently as a JSON string like `"{\"tool\":\"addContent\",\"status\":\"forwarded to client\"}"`).

**Steps:**

1.  **Locate Tool Result Handling Code (Client-Side):
    *   **Primary Search Area:** `lib/hooks/editor/useChatInteractions.ts`.
    *   **Keywords/Patterns to look for:** 
        *   `addToolResult` (if used directly from `useChat`).
        *   Manual construction of a message object with `role: 'tool'`.
        *   Code that processes the response after a tool execution promise resolves.
        *   Places where `toolCallId`, `toolName`, and the tool's output (`result`) are brought together to form a message.
    *   Examine how assistant messages with `tool_call` are handled, and how the subsequent `tool` (result) message is added to the `messages` array managed by `useChat`.

2.  **Analyze Existing `role: 'tool'` Message Construction:
    *   Once found, identify how the `content` array of the `role: 'tool'` message is being populated. It currently looks like this (based on logs):
        ```javascript
        // Conceptual existing structure being built
        const toolMessage = {
          role: 'tool',
          content: [
            {
              type: "tool-result", // To be removed
              toolCallId: previously_obtained_tool_call_id,
              toolName: tool_name, // May or may not be necessary to include directly
              result: tool_output_string 
            }
          ]
          // ... other message properties like id, createdAt if applicable
        };
        // This message is then likely added via setMessages or similar
        ```

3.  **Modify to Conform to SDK Standards:
    *   The `content` array should contain objects directly holding `toolCallId` and `result`.
    *   **New Structure Example:**
        ```javascript
        // Conceptual new structure to build
        const toolMessageContentPart = {
          toolCallId: previously_obtained_tool_call_id,
          result: tool_output_string // This is the "{\"tool\":\"addContent\",...}" string
          // toolName: tool_name, // Include if SDK for your LLM requires it explicitly here, 
                                // but often toolCallId is sufficient for mapping.
                                // The addToolResult Vercel AI SDK example only shows toolCallId and result.
        };

        const toolMessage = {
          role: 'tool',
          content: [toolMessageContentPart]
          // ... other message properties like id, createdAt if applicable
        };
        
        // If using addToolResult directly:
        // addToolResult({
        //   toolCallId: previously_obtained_tool_call_id,
        //   result: tool_output_string // Or potentially the parsed object if SDK expects that for 'result'
        // });
        ```
    *   **Important Consideration for `result` field:** The `addToolResult` documentation shows `result: { /* your tool result */ }`. This implies `result` can be an object. However, your current `result` is a string: `"{\"tool\":\"addContent\",\"status\":\"forwarded to client\"}"`. 
        *   **Option A (Safest first step):** Keep `result` as the JSON string. Many LLMs can handle a stringified JSON as the tool output.
        *   **Option B (If Option A fails):** Parse the JSON string into an object before assigning it to `result`. Example: `result: JSON.parse(tool_output_string)`. This depends on whether the specific LLM/SDK adapter expects a pre-parsed object.
        *   Start with Option A. The key is to remove the `type: "tool-result"` wrapper.

4.  **Handle Multiple Tool Calls (If Applicable):
    *   If a single assistant turn can request multiple tool calls, the `content` array of the `role: 'tool'` message should contain one object (structured as per step 3) for *each* tool result corresponding to each `toolCallId`.
        ```javascript
        // Conceptual: Multiple tool results for one 'tool' role message
        const toolMessage = {
          role: 'tool',
          content: [
            { toolCallId: id1, result: result1_string },
            { toolCallId: id2, result: result2_string }
          ]
        };
        ```

5.  **Testing and Verification:
    *   **Save Changes:** Apply the modifications to your client-side code.
    *   **Clear Cache/Hard Reload:** Ensure your browser gets the updated client-side bundle.
    *   **Test Scenario:**
        1.  Start a new chat.
        2.  Instruct the AI to perform an action that triggers a tool call (e.g., the "add 5 random colors" example).
        3.  Verify the tool executes (e.g., colors are added to the document).
        4.  **Crucially, send a new message to the AI** (e.g., "hello", "add 5 more").
    *   **Check Server Logs (`@node`):** Confirm that no `MessageConversionError: Unsupported role: tool` occurs.
    *   **Check Browser Console:** Ensure no client-side errors related to message formatting or SDK calls.
    *   **Verify Conversation Flow:** Confirm that the AI responds appropriately to the new message after the tool call, indicating the conversation state is correctly managed.

6.  **Iterate on `result` Format if Necessary:**
    *   If the error persists even after removing `type: "tool-result"` and correctly structuring with `toolCallId` and `result` (as a string), the next step would be to investigate if the `result` field itself needs to be a parsed JavaScript object instead of a JSON string (Option B from step 3).

By following these steps, the client should send a `role: 'tool'` message with a `content` structure that the Vercel AI SDK server-side components can correctly interpret, resolving the `MessageConversionError`. 