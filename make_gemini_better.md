# Investigating Gemini Model Fragility in Historical Documents

## Problem Description

Users encounter a "A chat error occurred" browser error when attempting to interact with a Gemini model in a document (Document A) after the following sequence:
1. Start a new document with Gemini.
2. Interact with the AI (e.g., chat).
3. Instruct the AI to perform an action that involves a **tool call**.
4. Navigate away from Document A (e.g., to Document B).
5. Navigate back to Document A.
6. Attempt further interaction with the Gemini model.

This error **does not occur** if no tool calls were made before navigating away and back. It also does not occur with GPT models, which continue to function normally even after tool calls. The Gemini model becomes unusable in Document A *only* if a tool call was successfully executed before the navigation away/back sequence.

This strongly points towards an issue with how tool call messages (`tool_calls` type) or tool result messages (`tool_results` type) are being serialized, stored, deserialized, or rehydrated specifically for Gemini conversations within the `ai.sdk` or the application's state management.

## Error Details Captured (Tool Call Scenario)

When the failure occurs after a tool call, navigation, and returning, the following error trace is observed in the browser console, originating from `ai.sdk`:

```
[useChat onError] Full error object: Error: An error occurred.
    at onErrorPart (index.mjs:1155:13)
    at processDataStream (index.mjs:854:49)
    at async processChatResponse (index.mjs:960:3)
    at async callChatApi (index.mjs:1272:7)
    at async eval (index.mjs:305:9) 
```

This indicates the error happens during the processing of the response stream (`processDataStream`, `onErrorPart`) from the backend API call made via `ai.sdk` (`callChatApi`).

## Request/Response Analysis (Tool Call Scenario)

When the error occurs, the following request body is sent to the backend API (`/api/chat`):

```json
{
  "id": "6ab6ef04-e5e5-4de3-ad33-6371e72fa0e5",
  "messages": [
    // ... previous user/assistant text messages ...
    {
      "role": "user",
      "content": "please add a table...",
      "parts": [/*...*/]
    },
    {
      "role": "assistant",
      "content": "",
      "parts": [
        {
          "type": "tool-invocation", 
          "toolInvocation": {
            "state": "result", 
            "toolCallId": "4OdyhYm3eqC64WoR",
            "toolName": "addContent",
            "args": { /*...*/ },
            "result": { 
              "tool": "addContent",
              "status": "forwarded to client"
            }
          }
        }
      ]
    },
    {
      "role": "assistant",
      "content": "OK. I've added a table...",
      "parts": [/*...*/]
    },
     {
      "role": "user",
      "content": "hi, you there?", // <-- Subsequent request causing error
      "parts": [/*...*/]
    }
    // ...
  ],
  "data": { /* ... */ }
}
```

The backend responds with a streaming chunk indicating an error:

```
3:"An error occurred."
```

**Key Findings & Hypothesis:**

*   The representation of the tool call and its result in the rehydrated message history appears incorrect according to standard `ai.sdk` / Google Generative AI patterns.
*   Specifically, the tool call (`toolCallId`, `toolName`, `args`) and the tool result (`result: {...}`) are combined into a single `assistant` message part with `type: "tool-invocation"`.
*   The standard approach involves separate messages/parts:
    1.  An `assistant` message with `toolCalls` parts.
    2.  A `tool` message with `toolResults` parts containing the actual output.
*   The content of the nested `result` field (`{"tool":"addContent","status":"forwarded to client"}`) also seems like internal application state rather than the actual result data the model would expect.
*   **Hypothesis:** The Gemini API is rejecting the request because the rehydrated message history containing the improperly formatted `tool-invocation` message part does not conform to its required schema for tool interactions. GPT models might be more tolerant of this deviation.

## Codebase Analysis & Confirmation

Based on analysis of the `ai.sdk` documentation and a scan of the `/app` directory:

1.  **Standard Flow Confirmation:** The `ai.sdk` documentation confirms that the standard message history format involves separate `assistant` messages containing `toolCalls` parts and subsequent `tool` messages containing `toolResults` parts.
2.  **Backend Interaction (`app/api/chat/route.ts`):**
    *   During the actual AI call (`streamText`), the backend correctly handles the standard flow (receives `toolCalls`, sends back `toolResults`).
    *   The `execute` function for editor tools returns `{ status: 'forwarded to client' }`, indicating frontend execution.
    *   The `onFinish` callback correctly saves the `assistant` message content and associated tool details (call args, result) to Supabase tables (`messages`, `tool_calls`), linking them via the assistant message ID.
3.  **Frontend Reconstruction (`app/lib/hooks/editor/useInitialChatMessages.ts`):**
    *   **This is the source of the non-standard format.** When fetching historical messages and their associated `tool_calls` from the database, this hook combines the assistant's text content and each tool call/result pair into a single `assistant` message object for the `useChat` hook.
    *   It creates parts with `{ type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId, toolName, args, result } }`.
4.  **Frontend Execution (`app/editor/[documentId]/page.tsx`):**
    *   A `useEffect` hook correctly identifies these `tool-invocation` parts in messages from `useChat` and triggers the corresponding client-side execution functions (e.g., `executeAddContent`).
5.  **Conclusion:** The application uses the standard `ai.sdk` format during live interaction and saving but intentionally reconstructs messages into a non-standard format (`tool-invocation` parts) when loading history for the frontend (`useChat`). This custom format facilitates frontend display/execution but breaks compatibility with Gemini when this history is sent back for subsequent interactions.

## Plan to Fix Gemini Compatibility (Preserving Existing Functionality)

**Goal:** Align the message history sent *to the AI model* with the standard format required by `ai.sdk`/Gemini, ensuring all expected outcomes listed below are met, particularly the preservation of existing visual presentation, persistence, and execution logic.

**Analysis Regarding `tool-invocation`:** The current use of `{ type: 'tool-invocation', ... }` parts within a single assistant message (created during history loading in `useInitialChatMessages.ts`) is non-standard for the `ai.sdk` history format expected by models. While openness to changing this is noted, the current frontend rendering and execution logic (`app/editor/[documentId]/page.tsx`) appears tightly coupled to this specific structure. Altering it would require significant frontend changes and risks breaking the existing user experience (Expected Outcome #3).

**Recommended Solution: Transform on Send**

This approach is chosen because it directly targets the incompatibility with the AI model's expected history format *without requiring any changes to the frontend or database*, thereby maximizing the likelihood of meeting all Expected Outcomes.

1.  **No Changes to Database:** Keep the `messages` and `tool_calls` tables as they are. (Supports Outcome #4)
2.  **No Changes to Frontend Message Loading/State:** Keep the logic in `useInitialChatMessages.ts` that creates the `tool-invocation` parts. The `useChat` hook's state will retain this structure. (Supports Outcome #3, #5)
3.  **Modify Backend API (`app/api/chat/route.ts`):**
    *   Inside the `POST` function, locate the section where the final `messages` array is prepared to be sent to `ai.sdk`'s `streamText` function.
    *   **Add a transformation step:** *Immediately before* passing the `messages` array to `streamText`, iterate through it. Identify any `assistant` messages containing the custom `tool-invocation` parts.
    *   For each such message, replace it *in the array being sent to `streamText`* with the standard sequence:
        *   An `assistant` message containing only the text content part (if any).
        *   An `assistant` message containing the `toolCalls` part(s) derived from the original `toolInvocation`.
        *   A separate `tool` message containing the `toolResults` part(s) derived from the original `toolInvocation`.
    *   This transformation ensures the history sent *to the model* adheres to the standard format. (Supports Outcome #1, #2, #6)
4.  **Verification:** Test the full workflow with Gemini and other models, confirming error resolution and that frontend tool execution/display remains unchanged. (Verifies All Outcomes)

**This approach isolates the fix to the backend API just before the AI call, preserving the current data structures and frontend logic responsible for persistence, presentation, and execution, directly aligning with the expected outcomes.**

**Awaiting Approval:** Please review this refined plan. I will only proceed with proposing specific code changes for the backend transformation step if you approve.

## Expected Outcomes
1. User is able to interact with Gemini models IN GENERAL.
2. User is able to interact with Gemini models in historical documents.
3. User can see tool calls as they are now, with their tool call formatting in the messages.
4. Tool calls are getting stored in tool_calls table in full (eg. all columns have the corrent information + metadata is there)
5. Messages load up normally.
6. No loss in functionality in interacting with any other models. 

## Potential Areas of Investigation

Based on the described behavior and the specific trigger (tool calls), here are the focused areas to explore:

1.  **Tool Call/Result State Management & Rehydration:**
    *   How are `tool_calls` and `tool_results` messages specifically represented within the conversation state that gets serialized and stored?
    *   When rehydrating the conversation for Document A, are the `tool_calls` and `tool_results` messages being correctly deserialized and placed back into the message history in the exact format `ai.sdk` expects for Gemini?
    *   Is there a subtle structural difference in how Gemini requires these messages compared to GPT upon resuming a conversation? (e.g., IDs, content structure, metadata).
    *   Compare the rehydrated message array for a Gemini conversation *with* a tool call (that fails) vs. a GPT conversation *with* a tool call (that succeeds). Pay close attention to the `tool_calls` and `tool_results` objects.

2.  **`ai.sdk` Interaction (Tool Call Focus):**
    *   Review the specific `ai.sdk` functions used for appending `tool_calls` and `tool_results` messages to the history and for sending the *entire* history (including these tool messages) when resuming the conversation.
    *   Are there specific requirements or known issues documented for `ai.sdk` regarding the format or handling of tool messages for Gemini models, especially when reconstructing history?
    *   Is the `CoreMessage` structure for tool-related messages potentially losing information during the save/load cycle?

3.  **Gemini API Specifics (Tool Call Focus):**
    *   Does the Gemini API have stricter validation on the format or sequence of `tool_calls` and `tool_results` messages within the conversation history compared to GPT?
    *   Could there be an issue with how tool call IDs or function call details are presented in the rehydrated history that Gemini rejects?

4.  **Frontend/Backend Communication & Data Integrity:**
    *   Verify that the complete and structurally correct `tool_calls` and `tool_results` message objects are being transferred between the frontend and backend during the load process without modification or truncation.

5.  **Error Logging and Diagnostics:**
    *   **Crucially:** Reproduce the error *with* the tool call scenario. Capture the *specific* error message/stack trace from the backend or the network tab response when the "A chat error occurred" message appears. The request payload sent to the backend API route (`/api/chat`) and potentially the request payload sent *from* the backend to the Gemini API itself will be highly informative.
    *   Enable verbose logging if possible to see the exact message history array being passed to `ai.sdk`/Gemini API when the failure occurs.

## Potential Solutions & Chosen Path

Given the root cause (non-standard `tool-invocation` structure created during history loading breaks Gemini), there are two main approaches to fix the compatibility issue. **Initial attempts focused on Option B (Transform on Send), but we are now pivoting to Option A (Full Compliance) to ensure architectural consistency and address potential limitations encountered with Option B.**

**Option A: Full Compliance (Modify Frontend Reconstruction & Rendering)**

*   **How:**
    1.  **Modify `useInitialChatMessages.ts`:**
        *   Fetch historical messages and associated `tool_calls` data from the database.
        *   Instead of creating single `assistant` messages with `tool-invocation` parts, reconstruct the message history according to the standard `ai.sdk` format:
            *   Create an `assistant` message containing only the text content part (if any).
            *   Create a subsequent `assistant` message containing the `toolCalls` part(s), derived from the stored `tool_calls` data (mapping `toolName`, `toolCallId`, `args`).
            *   Create a final `tool` message containing the `toolResults` part(s), using the `toolCallId` and the stored `result` from the `tool_calls` data.
        *   Pass this array of standard `CoreMessage` objects to the `useChat` hook's `initialMessages` prop.
    2.  **Refactor `app/editor/[documentId]/page.tsx`:**
        *   **Rendering:** Update the component responsible for rendering messages to correctly identify and display the distinct `assistant` (with `toolCalls`) and `tool` messages. This might involve adjusting the visual representation to still clearly indicate a tool call occurred, potentially linking the visual elements of the `assistant` (tool call request) and `tool` (result) messages. Ensure it still meets the visual requirements of Outcome #3.
        *   **Execution:** Modify the `useEffect` hook (or equivalent logic) that currently looks for `tool-invocation` parts. It should now look for `assistant` messages containing `toolCalls` parts. When found, it needs to trigger the appropriate client-side execution function (e.g., `executeAddContent`) using the `toolName` and `args` from the `toolCalls` part. The result from the execution might need to be handled differently, potentially updating the corresponding `tool` message's state if necessary, though the primary trigger will be the `assistant` message's `toolCalls`.
*   **Pros:** Achieves architectural consistency and full compliance with `ai.sdk` standards throughout the application state. Removes the need for backend transformation.
*   **Cons:** Requires significant frontend refactoring (both message loading in the hook and page rendering/execution logic). Carries a higher risk of unintentionally altering the current visual presentation or breaking existing frontend tool execution logic (potentially failing Outcome #3) if not done carefully. Higher development effort compared to Option B.

**Option B: Pragmatic Fix (Transform on Send) - *Attempted, Now Deprecated***

*   **How:** Keep the database schema and frontend reconstruction logic (`useInitialChatMessages.ts`, `page.tsx`) exactly as they are. Add a transformation step in the backend API (`app/api/chat/route.ts`) to convert the non-standard `tool-invocation` message structure back into the standard `assistant` + `tool` sequence *only* in the message array being sent to the AI model via `streamText`.
*   **Pros:** Minimal code changes, isolated to the backend API route. Guarantees preservation of the existing frontend state structure, rendering, and execution logic, directly meeting Outcome #3 with low risk. Fixes the Gemini compatibility issue (Outcomes #1, #2, #6). Preserves database storage (Outcome #4) and message loading (Outcome #5). Lower development effort.
*   **Cons:** Introduces an inconsistency where the frontend state format differs from the format sent to the AI. Less architecturally pure than Option A. **May not cover all edge cases or future compatibility issues.**

**Chosen Path: Option A - Full Compliance**

**We will now proceed with Option A.** While Option B was initially preferred for its lower effort and risk to the frontend, the decision has been made to pursue Option A. This approach ensures full compliance with the expected `ai.sdk` message structure throughout the application, leading to a more robust and maintainable solution in the long term, despite the higher initial refactoring effort. This requires careful implementation to ensure the existing user experience (Outcome #3) is preserved.

**Next Step: Implement Option A Frontend Refactoring**

**Awaiting Approval:** Please confirm you approve proceeding with the implementation of the frontend refactoring as described in Option A. I will then propose the specific code changes for `useInitialChatMessages.ts` and `app/editor/[documentId]/page.tsx`.

## Expected Outcomes
1. User is able to interact with Gemini models IN GENERAL.
2. User is able to interact with Gemini models in historical documents.
3. User can see tool calls along with messages, where tool calls are clearly formatted vs. messages.
4. Tool calls are getting stored in tool_calls table in full (eg. all columns have the corrent information + metadata is there)
5. Messages load up normally.
6. No loss in functionality in interacting with any other models. 

## Next Steps

1.  **Capture Detailed Error Information (Tool Call Scenario):** Reproduce the error *after* a tool call. Capture the exact error message from the browser console, network tab (failed request payload and response), and any relevant backend logs.
2.  **Inspect State (Tool Call Messages):** Analyze the persisted conversation state, focusing *specifically* on the structure and content of `tool_calls` and `tool_results` messages. Compare this to the state rehydrated upon returning to the document.
3.  **Review `ai.sdk` Tool Message Handling:** Examine the code responsible for adding tool messages to the history and passing that history when resuming conversations via `ai.sdk`.
4.  **Verify Standard Tool Message Structure:** Consult `ai.sdk` documentation (specifically for the Google Generative AI provider) to confirm the expected structure for `tool-calls` and `tool-results` messages in the history.
5.  **Inspect State Serialization/Deserialization:** Examine the code responsible for saving the conversation state (specifically how the `assistant` message with the tool invocation and result is created/stored) and loading it back (rehydrating the `messages` array).
6.  **Correct Message Structure:** Modify the saving/loading logic to ensure tool calls and their results are stored and rehydrated as separate, correctly formatted messages (likely an `assistant` message with `tool-calls` followed by a `tool` message with `tool-results`) as per `ai.sdk`/Gemini requirements.
7.  **Test:** After correction, re-run the test scenario (tool call -> navigate away -> navigate back -> interact) to confirm the Gemini model remains usable.

Let's start by trying to get that detailed error information *specifically for the tool call scenario*. 