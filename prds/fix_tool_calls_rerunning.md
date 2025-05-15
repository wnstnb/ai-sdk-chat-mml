# PRD: Fix Editor Tool Calls Re-running on Navigation

## 1. Problem Description

When the most recent message in a chat's history is an assistant message that triggered a tool call (specifically, a tool call that interacts with an editor, e.g., `addContent`), navigating away from the document and then back to it causes this last tool call to be re-executed. This results in undesired side effects, such as duplicated content in the editor.

**Example Flow:**
1. User is working on Document A.
2. User asks the AI to perform an action that involves an editor tool call (e.g., "add this paragraph").
3. The AI responds with a message that includes a tool call. The tool executes successfully, and content is added to the editor in Document A. This assistant message with the tool call is now the most recent in the message history. The UI displays the tool call arguments and its result.
4. User navigates to a different document (Document B).
5. User navigates back to Document A.
6. The chat messages for Document A are loaded.
7. The UI displays the tool call arguments *but the previously visible tool result section is now missing*.
8. The tool call from step 3 is subsequently re-executed, leading to the content being added to the editor *again*.

**Key Observation from UI:**
*   Initially, after a tool (e.g., `addContent`) executes, its arguments and results (e.g., `Result: { "status": "forwarded to client", ... }`) are displayed in the chat message.
*   Upon navigating away and then back to the chat, while the tool call arguments are still displayed for that historical message, the "Result" section is no longer visible in the UI. This occurs even if the underlying tool result data is present in the persisted storage.
*   This disappearance of the "Result" from the UI might lead the system to incorrectly perceive the tool call as incomplete or unresolved, triggering the re-execution.

## 2. Goals

- Identify the root cause of the tool call re-execution.
- Propose a robust solution to prevent editor-modifying tool calls from re-running when messages are loaded.
- Ensure chat history and editor state remain consistent upon navigation.

## 3. Analysis and Hypotheses

The issue likely stems from how chat messages are persisted and then loaded into the `useChat` hook (or equivalent state management for the chat) when a document/chat is reopened, and how the UI re-renders these messages.

### Key Components Involved (based on AI-SDK patterns):

-   **`useChat` hook**: Manages chat state, message history, and tool interactions on the client-side.
    -   `initialMessages` prop: Used to load existing chat history.
    -   `maxSteps` prop: Enables multi-step tool calls, where `useChat` can automatically send tool results back to the model.
-   **Message Persistence**: A mechanism (`loadChat`, `saveChat`) to store and retrieve chat messages, likely as an array of `Message` objects.
-   **Tool Call Lifecycle**:
    1.  User sends a message.
    2.  Assistant responds with a message containing `tool_calls` (e.g., `[{ id: "call123", name: "addContent", args: {...} }]`).
    3.  The tool (`addContent`) is executed.
    4.  A `tool` message with the result (e.g., `{ role: "tool", tool_call_id: "call123", content: "Content added" }`) is generated and appended to the message list.
    5.  (If `maxSteps` > 0 and further steps are needed) The model might generate another response based on the tool result.

### Hypotheses for Re-execution:

1.  **Incomplete Tool Interaction in Persisted History (Less Likely if Result Data Exists)**:
    *   The chat history might be persisted *after* the assistant's message with the `tool_calls` but *before* the corresponding `tool` message (with `role: 'tool'`, `tool_call_id`, and `content` representing the result) is fully processed and saved.
    *   When `initialMessages` is loaded, `useChat` sees an assistant message with a tool call that seemingly hasn't been "resolved" with a tool result message.

2.  **Broken Association/Rendering of Tool Result on Reload (More Likely given UI Observation)**:
    *   Both the assistant message (with `tool_calls`) and the corresponding `tool` message (containing the result) are correctly persisted in the database.
    *   However, upon reloading the chat and initializing with `initialMessages`, `useChat` or the UI rendering logic fails to correctly associate the persisted `tool` message's content as the "Result" for the corresponding `tool_call` in the assistant message.
    *   This failure to link or render the result in the UI could make the `tool_call` appear unresolved.
    *   If `useChat` (especially with `maxSteps` > 0) or other logic relies on this apparent state, it might attempt to re-process or re-execute the tool call.

3.  **`useChat` Re-evaluation Logic for `initialMessages`**:
    *   Even if all data is present and notionally associated, `useChat` might have internal logic that, upon initialization with `initialMessages`, re-evaluates the last messages. If the sequence ends in a way that it interprets as an "in-flight" tool interaction (perhaps due to the UI not signaling the result's presence correctly), it could trigger further actions.

4.  **Client-Side Tool Execution and State Synchronization**:
    *   While the editor content is updated, the crucial `tool` message (with `role: 'tool'`) might not be reliably added to the `messages` array that `useChat` manages and subsequently persists *before* navigation. If this `tool` message is missing from `initialMessages`, the tool call would indeed appear unresolved.

5.  **Message Format Issues on Load**:
    *   Discrepancies in message format (`Message` vs. `CoreMessage`) between what's persisted and what `useChat` expects upon loading `initialMessages` could lead to misinterpretation of tool call states or the inability to correctly pair tool calls with their results for rendering.

## 4. Areas to Investigate in the Codebase

*   **Message Persistence Logic**:
    *   Where and how are chat messages saved (e.g., `saveChat`)? Crucially, is the `tool` message (with `role: 'tool'`, `tool_call_id`, and the result `content`) reliably saved alongside the assistant message that initiated the call?
    *   At what point in the tool call lifecycle does saving occur? Is it atomic for the assistant_tool_call + tool_result message pair?
*   **Message Loading Logic**:
    *   How are messages fetched for `initialMessages` (e.g., `loadChat`)? Verify that *both* the assistant tool call message and its corresponding `tool` result message are being loaded.
*   **`useChat` Configuration and Internal State**:
    *   How is `useChat` configured (e.g., `ui/chat.tsx`)? Specifically, `initialMessages`, `maxSteps`, `sendExtraMessageFields`.
    *   How does `useChat` internally manage the association between an assistant message with `tool_calls` and the subsequent `tool` message(s) containing results, especially when initialized via `initialMessages`?
*   **UI Rendering of Tool Calls and Results**:
    *   Examine the component responsible for rendering chat messages, particularly those containing `tool_calls`.
    *   How does it find and display the content of the `tool` message as the "Result" for a given `tool_call`?
    *   Is the `tool_call_id` from the `tool` message being correctly matched with the `id` of the tool call in the assistant's `tool_calls` array?
    *   Why might this association work for live messages but fail or not be triggered when rendering from `initialMessages`? Is there different rendering logic or state availability?
*   **Tool Definition and Handling**:
    *   How are client-side tools (like editor interactions) defined and how are their results reported back to the `useChat` message stream?
    *   Is a `tool` message with `role: 'tool'` and the `tool_call_id` consistently generated and added to the messages array managed by `useChat` *before* any potential persistence triggered by navigation or blur?
*   **Client-Side State vs. Persisted Chat State**:
    *   How is the editor's content state managed and persisted? Is it possible for the editor to be updated but the chat history reflecting this update (i.e., the tool result message) not be saved before navigation?

## 5. Potential Solution Strategies (High-Level - DO NOT IMPLEMENT YET)

1.  **Ensure Correct Loading and Association of Tool Result Messages**:
    *   Verify that the `tool` message (containing the actual result) is always loaded as part of `initialMessages`.
    *   Ensure that `useChat` and the UI rendering logic can robustly pair this `tool` message with its initiating assistant `tool_call` using the `tool_call_id`. The UI must then render this loaded result.

2.  **Atomic Persistence of Full Tool Interaction**:
    *   The assistant message initiating the tool call AND the subsequent tool result message (role: 'tool') MUST be saved together or in a way that ensures both are present upon reload if the interaction completed.
    *   This might involve queueing messages and ensuring the `tool` result message is added to the `useChat` state and then persisted *before* allowing navigation or before the component unmounts.

3.  **"Mark as Displayed/Resolved" in UI State (if applicable)**:
    *   If the issue is purely a rendering glitch on reload that then fools `useChat`, ensuring the UI correctly identifies and displays the result might be enough.
    *   Consider if `useChat` offers ways to understand that a tool call from `initialMessages` already has its result present in the loaded set, preventing re-action.

4.  **Pre-processing `initialMessages`**:
    *   Before passing `initialMessages` to `useChat`, inspect them. If an assistant message has a `tool_calls` array, ensure there's a corresponding `tool` message with a matching `tool_call_id` present in the `initialMessages` array. If not, this indicates a data integrity issue at the persistence level.

## 6. Next Steps

1.  **Code Review**: Examine the actual implementation of message saving/loading, `useChat` usage, and how client-side editor tools report their results.
2.  **Debugging**: Step through the message loading and `useChat` initialization process when navigating back to a document with a tool call as the last message. Observe the `messages` array state.
3.  **Test Scenarios**:
    *   Tool call as last message, navigate away, navigate back.
    *   Tool call followed by an AI text response as last message, navigate, navigate back.
    *   Tool call, then user message, then AI tool call as last message.

This document will be updated as more information is gathered.

## 7. Code Review Focus Areas (Preliminary)

Based on the problem description, UI observations, and typical AI-SDK patterns, the following areas of the codebase should be reviewed to diagnose why tool results might not be displayed on reload, potentially leading to re-execution:

### 7.1. Message Structure and Content in `initialMessages`
*   **Relevant Files**:
    *   `app/editor/[documentId]/page.tsx` (Initializes and uses chat hooks, contains tool re-processing logic)
    *   `app/lib/hooks/editor/useInitialChatMessages.ts` (Fetches and formats initial messages, adds custom `state` to tool invocations)
    *   `lib/hooks/editor/useChatInteractions.ts` (Wraps `useChat` and passes `initialMessages` to it)
    *   Backend API route: `/api/documents/{documentId}/messages` (Source of truth for persisted messages)
*   **Checks & Findings**:
    *   **Fetching**: `useInitialChatMessages.ts` fetches messages from `/api/documents/[documentId]/messages`.
        *   Logs raw API data and final formatted messages.
    *   **Transformation to `UIMessage`**: `useInitialChatMessages.ts` transforms API messages into `UIMessage[]` (from `ai/react`), which use a `parts: Array<...>` structure.
    *   **Tool Call Handling during Transformation (Key Finding in `useInitialChatMessages.ts`)**:
        *   When processing an assistant message from the API, if `msg.content` is an array:
            1.  It scans parts to find `ToolResultPart` items, mapping their `result` to their `toolCallId`.
            2.  When it encounters a `ToolCallPart`, it attempts to find its corresponding result from the map (i.e., from within the *same assistant message's content array*).
            3.  It constructs a `UIMessage` part of `type: 'tool-invocation'`. This `toolInvocation` object includes a custom `state` field:
                *   `state` is set to `'result'` if the `ToolResultPart` was found embedded within the same assistant message.
                *   `state` is set to `'call'` if the `ToolResultPart` was *not* found embedded within that same message.
    *   **`useChatInteractions.ts` Role**:
        *   Receives `initialMessages` (containing the `UIMessage` objects with the custom `state` field on `toolInvocation` parts) from `useInitialChatMessages.ts`.
        *   Passes these `initialMessages` directly to the Vercel AI SDK's `useChat({ initialMessages: initialMessages || [] })` hook.
        *   The `useChat` hook itself is not aware of the custom `state` field; it operates on standard `Message` (including `parts`) structures.
    *   **Re-processing Logic in `EditorPage.tsx`**:
        *   The `useEffect` hook in `app/editor/[documentId]/page.tsx` that processes tool calls explicitly checks `if (toolCall.state === 'result')` on `toolInvocation` objects found in assistant messages.
        *   If `toolCall.state` is not `'result'` (i.e., it's `'call'`), and the `toolCallId` hasn't been processed yet in the current session, it adds the tool call to a queue (`callsToProcessThisRun`) for re-execution by client-side functions like `executeAddContent`.
*   **Hypothesis based on 7.1 Findings**:
    *   **Primary Driver of Re-execution**: The re-execution is primarily driven by the logic in `EditorPage.tsx`. If `useInitialChatMessages.ts` sets `toolInvocation.state = 'call'` (because it couldn't find an *embedded* `ToolResultPart` in the API response for an assistant message), `EditorPage.tsx` will interpret this as an unresolved tool and trigger its re-execution functions.
    *   **API Data Structure is Key**: The critical factor is how the data from `/api/documents/[documentId]/messages` represents completed tool calls. For `useInitialChatMessages.ts` to set `state: 'result'`, the API response for an assistant message that made a tool call must also include the `ToolResultPart` *within the same message's `content` array*.
    *   **Vercel AI SDK Standard for Tool Results**: The Vercel AI SDK also commonly handles tool results via a separate message with `role: 'tool'` that follows an assistant message containing `tool_calls` (or `tool-invocation` parts). The current loader (`useInitialChatMessages.ts`) is specifically designed to look for *embedded* results within the assistant message to set its custom `state` field, and does not appear to explicitly look for separate `role: 'tool'` messages to mark a `tool-invocation` as `state: 'result'`.
    *   **User Observation**: The user mentioned "ALL tool calls ALREADY have a result stored in the DB." This PRD update clarifies *how* that result needs to be structured in the API output (embedded within the assistant message content, or as a separate `tool` message that `useInitialChatMessages.ts` would need to be modified to find and associate) to prevent the `state: 'call'` from being set, and thus prevent the re-execution by `EditorPage.tsx`.

### 7.2. UI Rendering Logic for Tool Calls and Results
*   **Relevant Files**:
    *   `components/editor/ChatMessagesList.tsx` (Iterates messages)
    *   `components/editor/ChatMessageItem.tsx` (Renders individual messages, including tool calls/results)
*   **Checks & Findings**:
    *   **Message Rendering**: `ChatMessagesList.tsx` maps over `chatMessages` and passes each to `ChatMessageItem.tsx`.
    *   **`ChatMessageItem.tsx` Logic (Key Finding for UI)**:
        *   It expects a `message: Message` (from `ai/react`) which can have a `parts` array.
        *   When rendering parts of an assistant message, if a part is `type: 'tool-invocation',` it accesses `part.toolInvocation`.
        *   **To display the tool result, it explicitly checks**: `effectiveToolInvocation.state === 'result' && (effectiveToolInvocation as any).result`.
        *   The `effectiveToolInvocation.state` comes directly from the `initialMessages` prepared by `useInitialChatMessages.ts` (which sets `state: 'call'` or `state: 'result'` based on finding an *embedded* `ToolResultPart`).
    *   **Explaining the Disappearing Result UI Behavior**:
        *   **Live Execution (Result Visible)**: When a tool runs in an active session, the `useChat` hook (likely via `append` and its internal mechanisms for handling tool results) updates the message in its state. This update probably ensures the `toolInvocation` object within the message `parts` gets its `result` property populated and its `state` (or an equivalent anaphora) is set or interpreted as `'result'`, causing `ChatMessageItem.tsx` to display it.
        *   **On Reload (Result Disappears)**: When messages are loaded via `useInitialChatMessages.ts`:
            *   If this hook sets `toolInvocation.state = 'call'` (because it did not find a `ToolResultPart` *embedded within the same assistant message's content array* from the API), then the condition `effectiveToolInvocation.state === 'result'` in `ChatMessageItem.tsx` becomes false.
            *   Consequently, the UI does not render the `<pre>` block for the result, making it seem like the result has disappeared, even if the result data might exist elsewhere in the database or in a differently structured part of the loaded message.
*   **Conclusion for 7.2**: The UI correctly reflects the `state` of the `toolInvocation` as determined by `useInitialChatMessages.ts`. The disappearing result is a direct consequence of this `state` being `'call'` upon reload for the affected tool calls. This reinforces that the core issue lies in how historical tool calls and their results are fetched, structured, and interpreted by `useInitialChatMessages.ts`, which then dictates both the UI display and the re-execution logic in `EditorPage.tsx`.

### 7.3. `useChat` Hook: Tool Handling with `initialMessages`
*   **Relevant Files**: `lib/hooks/editor/useChatInteractions.ts` (where `useChat` is configured), Vercel AI SDK documentation for `useChat`.
*   **Checks & Findings**:
    *   **Configuration**: As found in 7.1, `useChatInteractions.ts` passes the `initialMessages` (prepared by `useInitialChatMessages.ts`, including the custom `state` field on `toolInvocation` parts) directly to `useChat({ initialMessages: ... })`.
    *   **`useChat` Behavior (Inference)**: The Vercel AI SDK's `useChat` hook:
        *   Is not aware of the custom `state: 'call' | 'result'` field. It will parse `initialMessages` based on standard `Message` properties (like `role`, `content`, `parts`, `tool_calls`).
        *   If it encounters a `tool-invocation` part within an assistant message in `initialMessages`, it likely expects to find its resolution either as an embedded result structure it recognizes (e.g., a standard `result` property on the invocation, or a `tool-result` part type) or via a subsequent, separate message with `role: 'tool'` and a matching `tool_call_id`.
        *   If `useChat` perceives a `tool-invocation` from `initialMessages` as unresolved *according to its own internal logic* (e.g., no clear result found via its standard mechanisms), it might have its own internal behaviors or state changes. However, the *explicit re-execution* of functions like `executeAddContent` is currently driven by the `EditorPage.tsx` logic reacting to the custom `state: 'call'`.
    *   **Potential for Compounding Issues**: If `useChat` *also* tries to act on what it deems an unresolved tool call from `initialMessages` (independently of our custom `state` logic), it could potentially lead to further unexpected behaviors, though the primary symptom (duplicate content) seems directly tied to the `EditorPage.tsx` re-processing path.
*   **Hypothesis for 7.3**: The Vercel `useChat` hook likely ignores the custom `state` field. Its own interpretation of whether a tool call in `initialMessages` is complete depends on standard SDK patterns for tool result representation. The observed re-execution is more directly caused by the `EditorPage.tsx` component's reaction to `state: 'call'`, but it's important to ensure the `initialMessages` are also formed in a way that `useChat` considers them resolved to prevent any underlying issues with the hook's internal state.

### 7.4. Persistence of Tool Result Messages (`tool` role messages) / API Data Structure
*   **Relevant Files**: Backend API route `/api/documents/{documentId}/messages` (and its underlying database query/persistence logic for chat messages).
*   **Checks & Findings (Based on Client-Side Logs of API Data)**:
    *   **Log Analysis**: Client-side logs from `useInitialChatMessages.ts` show that when processing historical assistant messages fetched from the API:
        *   A message part representing a completed tool call has `type: "tool-call"`.
        *   This `type: "tool-call"` part **directly contains an embedded `result` property** (e.g., `"result":{"tool":"addContent","status":"forwarded to client"}`).
        *   Example logged part: `{"args":{...},"type":"tool-call","result":{...},"toolName":"addContent","toolCallId":"call_..."}`.
    *   **`useInitialChatMessages.ts` Processing Mismatch**: 
        *   The loader (`useInitialChatMessages.ts`) attempts to build a `resultsMap` by looking for parts with `type: "tool-result"`.
        *   Since the API provides the result embedded directly in the `type: "tool-call"` part, no separate `type: "tool-result"` parts are found for these completed calls within the same message's content array.
        *   This leads to the `resultsMap` being empty when processing such a `type: "tool-call"` part.
        *   Consequently, `useInitialChatMessages.ts` sets `toolResult` to `undefined` when constructing the `toolInvocation` for the UI, which in turn sets `state: 'call'` and `toolInvocation.result = undefined`.
*   **Conclusion for 7.4 (API Data Structure)**:
    *   The backend API *does* provide the tool result data to the client.
    *   However, it provides it as a direct `result` property embedded within the `type: "tool-call"` part of an assistant message's content array.
    *   This structure is **not what `useInitialChatMessages.ts` currently expects** when it tries to associate results to set `state: 'result'`. The loader specifically looks for separate `type: "tool-result"` parts to make this association.
    *   This mismatch is the direct cause for `useInitialChatMessages.ts` setting `state: 'call'`, which then leads to the UI not rendering the result (Section 7.2) and `EditorPage.tsx` re-executing the tool (Section 7.1).
    *   This is distinct from the Vercel AI SDK pattern of expecting a completely separate message with `role: 'tool'`. Here, the issue is the format *within* the assistant message's `parts` array (or `content` array as it's named in `useInitialChatMessages`).

### 7.5. Debugging: State of `messages` Array on Reload
*   **Action**: Use browser developer tools to debug.
*   **Steps**:
    1.  Set a breakpoint immediately after `loadChat` returns `initialMessages` and before/during `useChat` initialization.
    2.  Inspect the `initialMessages` array. For a known re-triggering scenario, verify if both the assistant message (with `tool_calls`) and the `tool` message (with the result) are present and correctly structured.
    3.  Set a breakpoint in the UI component that renders messages. When it processes an assistant message with a `tool_call` from the reloaded set, step through the logic that should find and display the tool's result. Observe what data it sees and why the "Result" section might not be rendered. 

## 8. Implementation Plan

Based on the findings, the most direct solution is to modify the `useInitialChatMessages.ts` hook to correctly interpret the embedded `result` property within `type: "tool-call"` parts that it receives from the API. This will ensure the `state` is set to `'result'` and the `result` data is populated, preventing UI glitches and tool re-execution.

**File to Modify**: `app/lib/hooks/editor/useInitialChatMessages.ts`

**Step-by-Step Instructions:**

1.  **Locate the Target Code Block**:
    *   Open `app/lib/hooks/editor/useInitialChatMessages.ts`.
    *   Navigate to the `fetchInitialMessages` function.
    *   Inside this function, find the loop: `msg.content.forEach(part => { ... })` (within the `if (role === 'assistant')` block).
    *   Specifically, locate the conditional block: `else if (corePart.type === 'tool-call') { ... }`.

2.  **Modify the `tool-call` Processing Logic**:
    *   Replace the existing logic within the `else if (corePart.type === 'tool-call') { ... }` block with the following:

    ```typescript
    else if (corePart.type === 'tool-call') {
        console.log(`[useInitialChatMessages] Inspecting tool-call part for msg ${msg.id}:`, JSON.stringify(corePart, null, 2));

        // Cast corePart to include the possibility of an embedded result
        const toolCallPartWithPotentialResult = corePart as ToolCallPart & { result?: any };

        if (toolCallPartWithPotentialResult.toolCallId && 
            toolCallPartWithPotentialResult.toolName && 
            toolCallPartWithPotentialResult.args !== undefined) {

            // Check if the result is directly embedded in this "tool-call" part
            const embeddedResult = toolCallPartWithPotentialResult.result;
            
            // Still try to get from resultsMap in case the structure is mixed or changes in the future,
            // but prioritize embeddedResult if present.
            const resultFromMap = resultsMap.get(toolCallPartWithPotentialResult.toolCallId);
            
            const finalResult = embeddedResult !== undefined ? embeddedResult : resultFromMap;
            const state: 'result' | 'call' = finalResult !== undefined ? 'result' : 'call';

            // Log the determined state and result for this tool call
            console.log(`[useInitialChatMessages] Tool Call ID: ${toolCallPartWithPotentialResult.toolCallId}, Name: ${toolCallPartWithPotentialResult.toolName}, Embedded Result Found: ${embeddedResult !== undefined}, Result from Map: ${resultFromMap !== undefined}, Final State: ${state}`);

            uiParts.push({
                type: 'tool-invocation',
                toolInvocation: {
                    toolCallId: toolCallPartWithPotentialResult.toolCallId,
                    toolName: toolCallPartWithPotentialResult.toolName,
                    args: toolCallPartWithPotentialResult.args, 
                    result: finalResult, // Use the finalResult (embedded or from map)
                    state: state
                },
            });
        }
    }
    ```

3.  **Explanation of Changes in the New Code Block**:
    *   `const toolCallPartWithPotentialResult = corePart as ToolCallPart & { result?: any };`: This type assertion allows us to safely access a potential `result` property directly on the `corePart` if its `type` is `"tool-call"`.
    *   `const embeddedResult = toolCallPartWithPotentialResult.result;`: We directly check for this embedded result.
    *   `const resultFromMap = resultsMap.get(...)`: We keep the lookup in `resultsMap` as a fallback or for compatibility if some tool results *are* sent as separate `tool-result` parts.
    *   `const finalResult = embeddedResult !== undefined ? embeddedResult : resultFromMap;`: The `embeddedResult` is prioritized. If it exists, it's used; otherwise, it falls back to what might be in `resultsMap`.
    *   `const state: 'result' | 'call' = finalResult !== undefined ? 'result' : 'call';`: The `state` is now correctly determined based on whether a `finalResult` (either embedded or from the map) was found.
    *   `result: finalResult`: The `toolInvocation` object now gets populated with the `finalResult`.
    *   Added a `console.log` to show the determined state and result sources for easier debugging during testing.

4.  **Testing and Verification**:
    *   After applying the code changes, rebuild and run the application.
    *   **Test Scenario**: 
        1.  Navigate to a document (Document A).
        2.  Ask the AI to perform an action that uses an editor tool (e.g., "addContent": "add a list of colors").
        3.  Verify the tool call executes, content is added, and the "Result" section is visible in the chat UI for this new message.
        4.  Navigate away to a different document or section (Document B).
        5.  Navigate back to Document A.
    *   **Expected Outcome**: 
        1.  The chat history for Document A loads.
        2.  The historical assistant message with the tool call should now **display its "Result" section correctly** in the UI.
        3.  The tool call should **NOT be re-executed** (i.e., no duplicate content should be added to the editor).
    *   **Debugging Checks**: 
        1.  Open the browser's developer console.
        2.  Look for the logs from `useInitialChatMessages.ts`:
            *   `[useInitialChatMessages] Inspecting tool-call part for msg ...`
            *   `[useInitialChatMessages] Tool Call ID: ..., Embedded Result Found: true, Result from Map: false, Final State: result` (or similar, confirming `state: 'result'` is now set correctly for historical tool calls with embedded results).
        3.  Look for logs from `EditorPage.tsx` to ensure the tool call is not added to `callsToProcessThisRun` for these historical messages.
        4.  Verify no errors are thrown during message loading or rendering. 

## 9. Explanation of the Fix and Best Practices for Message Handling

This section details why the implemented fix was effective in resolving the tool call re-execution issue and outlines best practices for managing message and tool call structures to ensure robustness, particularly when working with the Vercel AI SDK and custom processing logic.

### 9.1. Why the Implemented Fix Was Effective

The core issue of tool calls re-executing upon navigating back to a document stemmed from how historical messages were processed by the `app/lib/hooks/editor/useInitialChatMessages.ts` hook. Here's a breakdown:

1.  **API Data Structure**: The backend API was providing assistant messages where the result of a tool call was *embedded directly within the `type: "tool-call"` part* (e.g., `corePart.result = { "status": "forwarded to client" }`).
2.  **Initial Processing Logic Mismatch**: The original logic in `useInitialChatMessages.ts` (specifically when building the `uiParts` for an assistant message) attempted to find tool results by:
    *   First, populating a `resultsMap` by looking for separate parts with `type: "tool-result"` within the same assistant message's content array.
    *   Then, when encountering a `type: "tool-call"` part, it would look up its `toolCallId` in this `resultsMap`.
3.  **Incorrect State Determination**: Because the results were embedded and not in separate `type: "tool-result"` parts, the `resultsMap` would often be empty for the `toolCallId` in question when processing historical messages from the API. This led to `toolResult` being `undefined`.
4.  **Cascade to Re-execution and UI Glitch**:
    *   The custom `state` field on the `toolInvocation` object (intended for UI and client-side processing) was then set to `'call'` (because `toolResult` was `undefined`).
    *   The `EditorPage.tsx` component specifically checked `if (toolCall.state === 'call')` to determine if a tool needed to be re-queued for execution via functions like `executeAddContent`.
    *   Simultaneously, the UI component `ChatMessageItem.tsx` used `effectiveToolInvocation.state === 'result'` to decide whether to render the tool's result, causing the result to "disappear" on reload.
5.  **The Solution**: The fix implemented in Section 8.2 modified the `useInitialChatMessages.ts` hook to:
    *   Explicitly check for the `result` property directly on the `corePart` if its `type` is `"tool-call"` (casting it as `toolCallPartWithPotentialResult`). This is referred to as the `embeddedResult`.
    *   Prioritize this `embeddedResult` when determining the `finalResult`. It still retains the lookup in `resultsMap` as a fallback for potential future structural variations or mixed content.
    *   Crucially, it then sets `state: 'result'` and populates `toolInvocation.result` if this `finalResult` (whether from embedded or map) is found.

By correctly identifying the embedded result, the `state` is accurately set to `'result'` for historical tool calls. This prevents `EditorPage.tsx` from incorrectly re-queueing the tool and allows `ChatMessageItem.tsx` to display the persisted result, resolving both the re-execution and the UI glitch.

### 9.2. Best Practices for Maintaining Optimal Message Structure

The Vercel AI SDK and managing message states, especially with tool calls, can be complex. The following practices can help maintain a more robust and debuggable system:

1.  **Clear Data Flow Mapping**:
    *   Document and understand the structure of messages at each critical point:
        *   **Backend/API**: How messages (especially tool calls and their results) are stored and sent by the API.
        *   **Transformation Layer**: Any client-side hooks or functions (like `useInitialChatMessages.ts`) that modify or reformat messages for UI or SDK consumption.
        *   **Vercel AI SDK (`useChat`)**: The structure the SDK expects for `initialMessages` and how it handles `tool_calls` and `tool` messages internally.
        *   **UI Components**: The structure UI components expect for rendering.

2.  **Consistency in API Output**:
    *   Strive for a **consistent and well-documented structure** for messages delivered by your backend API. If the API embeds results in `tool-call` parts, it should do so consistently. Avoid mixing structures for completed tool calls without clear discriminators.

3.  **Understand Vercel AI SDK Conventions**:
    *   Familiarize yourself with the SDK's standard `Message` properties (`id`, `role`, `content`, `parts`, `tool_calls`, `tool_call_id`) and `Part` types (`text`, `tool-call`, `tool-result`).
    *   For `useChat`, tool results are typically fed back to the SDK via a new message with `role: 'tool'`, containing `tool_call_id` and `content` (the result string/JSON). While `initialMessages` might pre-populate these, be aware of this standard flow for live interactions.
    *   The `parts` array within a message allows for mixed content (text, tool calls, tool results). The SDK uses this for rendering and potentially for internal logic. Our current fix leverages interpreting `parts` from the API.

4.  **Robust Tool Result Association in Loaders**:
    *   Client-side logic that loads/prepares `initialMessages` (like `useInitialChatMessages.ts`) must explicitly and robustly associate tool calls with their results based on the API's structure.
    *   The current fix handles results embedded in `tool-call` parts. If the API structure evolves (e.g., to use separate `tool-result` parts within the same assistant message, or even separate `role: 'tool'` messages if those were to be included in an "initial messages" batch), this loader logic would need careful adaptation. The fallback to `resultsMap` provides a small degree of flexibility.

5.  **Scoped Custom Fields**:
    *   Our custom `state: 'call' | 'result'` field on `toolInvocation` (within `UIMessage.parts`) is powerful for our application's specific UI and re-processing logic. However, remember that the Vercel `useChat` hook itself is unaware of this field.
    *   Ensure the base message structure passed to `useChat` (even with custom fields attached to parts) remains fundamentally valid and interpretable by the SDK according to its own schema.

6.  **Comprehensive and Strategic Logging**:
    *   Implement detailed logging at each stage: API data reception, message transformation (e.g., in `useInitialChatMessages.ts`), and right before data is passed to `useChat` or UI components.
    *   Log the *full structure* of messages or relevant parts, especially when dealing with tool calls, to make debugging data-related issues easier. The `JSON.stringify(data, null, 2)` pattern is very helpful.

7.  **Targeted Testing Scenarios**:
    *   Maintain and regularly run test scenarios covering various states of tool calls in `initialMessages`:
        *   Completed tool call with embedded result (current primary scenario).
        *   Tool call as the last message in history.
        *   Sequence of tool calls.
        *   Tool calls interspersed with user/assistant text messages.
    *   Verify both data integrity (correct `state`, presence of `result`) and UI rendering.

8.  **Centralized and Documented Logic**:
    *   Centralize the logic for interpreting custom states (like our `toolInvocation.state`) and triggering actions (like tool re-execution). `EditorPage.tsx` currently serves this role for re-execution based on the state set by `useInitialChatMessages.ts`.
    *   Document why this custom logic exists and how it interacts with the standard SDK flow.

9.  **API as a Contract**:
    *   Treat the structure of messages from your backend API as a strict contract. Any changes to this contract must be carefully planned, versioned if necessary, and propagated to all client-side consumers, especially data transformation layers like `useInitialChatMessages.ts`.
    *   Unexpected changes in API message structure are a common source of hard-to-debug issues on the client.

By adhering to these practices, the aim is to create a more resilient system for handling chat messages and tool interactions, reducing the likelihood of issues like the one addressed in this PRD.
This document will be updated as more information is gathered. 