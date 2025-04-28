# Refactoring Deprecated `toolInvocations`

This document outlines the plan to refactor the usage of the deprecated `toolInvocations` property in the `Message` type, replacing it with the recommended `parts` property.

## Background

The `@ai-sdk/ui-utils` library has deprecated the `toolInvocations` property on the `Message` interface. The recommended approach is to use the `parts` array, which contains structured information about the message content, including tool calls.

```typescript
// Deprecated property in Message interface
toolInvocations?: Array<ToolInvocation>;

// Recommended structure within Message interface
parts?: Array<TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart>;

// Relevant part type for tool calls
type ToolInvocationUIPart = {
  type: 'tool-invocation';
  toolInvocation: ToolInvocation; // The actual ToolInvocation object
};
```

## Analysis of Current Usage

A codebase search revealed two primary locations using `message.toolInvocations`:

1.  **`app/editor/[documentId]/page.tsx` (Lines ~492-515):**
    *   **Purpose:** This `useEffect` hook processes the last assistant message to execute tool calls.
    *   **Logic:** It checks if `lastMessage.toolInvocations` exists, filters out already processed tool calls using `processedToolCallIds`, and then iterates through the remaining `toolInvocations`, calling functions like `executeAddContent`, `executeModifyContent`, etc., based on the `toolName`.

2.  **`components/editor/ChatMessageItem.tsx` (Lines ~48-50):**
    *   **Purpose:** This component renders individual chat messages in the UI.
    *   **Logic:** It checks if `message.role === 'assistant'` and `message.toolInvocations` exists and has items. If so, it maps over `message.toolInvocations` to render UI elements representing the tool calls (e.g., displaying the tool name, arguments, or results).

## Refactoring Plan

The refactoring strategy involves updating both identified locations to use the `message.parts` array:

1.  **Modify `app/editor/[documentId]/page.tsx`:**
    *   Change the `if` condition to check `lastMessage?.role === 'assistant' && lastMessage.parts`.
    *   Inside the `if` block, filter `lastMessage.parts` to get only parts where `part.type === 'tool-invocation'`.
    *   Extract the `toolInvocation` object from each filtered part (e.g., `part.toolInvocation`).
    *   Use this list of extracted `toolInvocation` objects for the subsequent filtering logic based on `toolCallId` and the `switch` statement for execution.

2.  **Modify `components/editor/ChatMessageItem.tsx`:**
    *   Change the condition to check `message.role === 'assistant' && message.parts`.
    *   Filter `message.parts` to get only parts where `part.type === 'tool-invocation'`.
    *   Map over the filtered `ToolInvocationUIPart` array.
    *   Inside the map function, access `part.toolInvocation` to render the necessary UI elements, similar to how `toolCall` was used previously.

## Considerations

*   Ensure type safety by using type guards (`part.type === 'tool-invocation'`) or casting when accessing `part.toolInvocation`.
*   Verify that the structure of the `ToolInvocation` object obtained from `part.toolInvocation` is identical to the one previously accessed directly via `message.toolInvocations`. Based on the type definitions, this should be the case.
*   Test thoroughly after refactoring to confirm that tool calls are both executed correctly and displayed properly in the chat UI. 

## Database Persistence Verification

An analysis of the relevant backend API routes confirmed the following:

*   **Loading (`/api/documents/[documentId]/messages/route.ts`):** Messages are loaded from the `messages` table (containing text `content`, `role`, etc.) and associated tool calls are loaded separately from the `tool_calls` table (containing `tool_call_id`, `tool_name`, `tool_input`, `tool_output`). The API returns messages with an attached `tool_calls` array.
*   **Saving (`/api/chat/route.ts` - `onFinish`):** After an AI response, the assistant message's text content is extracted from the AI SDK's `CoreMessage` (which uses a `parts`-like structure internally) and saved to the `messages` table. Tool calls and their corresponding results are also extracted from the `CoreMessage` structure and saved separately to the `tool_calls` table, linked to the message ID.

**Conclusion:** The database schema and the backend saving/loading logic **do not need modification**. They are already designed to handle tool calls separately from the main message content. The backend correctly extracts tool call details from the modern `CoreMessage` structure during saving. The frontend is responsible for reconstructing the full `Message` object (including the `parts` array) from the data loaded from the API. Therefore, the planned frontend refactor only affects how the client-side code interacts with the `Message` objects provided by the `useChat` hook and initial load, and does not impact data persistence. 

## Detailed Implementation Plan

This plan breaks the refactoring into two phases to allow for testing functional correctness separately from UI rendering.

**Phase 1: Refactor Tool Execution Logic (`page.tsx`)**

*   **Goal:** Modify the `useEffect` hook in `app/editor/[documentId]/page.tsx` to use `lastMessage.parts` for identifying and executing tool calls, ensuring the core AI-editor interaction remains functional.
*   **Steps:**
    1.  **Locate:** Open `app/editor/[documentId]/page.tsx` and navigate to the `useEffect` hook that depends on `[chatMessages, processedToolCallIds]` (around line 491).
    2.  **Modify `if` Condition:** Change the initial check from `if (lastMessage?.role === 'assistant' && lastMessage.toolInvocations)` to `if (lastMessage?.role === 'assistant' && lastMessage.parts && lastMessage.parts.length > 0)`.
    3.  **Extract Tool Invocations from `parts`:**
        *   Inside the `if` block, *before* the line `const callsToProcess = ...`, add code to filter the `parts` array and extract the actual `toolInvocation` objects.
            ```typescript
            // Find parts that are tool invocations
            const toolInvocationParts = lastMessage.parts.filter(
              (part): part is { type: 'tool-invocation'; toolInvocation: ToolInvocation } => part.type === 'tool-invocation'
            );
            // Extract the toolInvocation objects
            const currentToolInvocations = toolInvocationParts.map(part => part.toolInvocation);
            ```
    4.  **Adapt Filtering Logic:** Modify the existing `callsToProcess` line to use the new `currentToolInvocations` array instead of `lastMessage.toolInvocations`:
        ```typescript
        // Filter out already processed tool calls using the extracted invocations
        const callsToProcess = currentToolInvocations.filter(tc => !processedToolCallIds.has(tc.toolCallId));
        ```
        *(The rest of the loop and the `switch` statement should work as is, since they operate on the `toolInvocation` objects themselves.)*
    5.  **Apply Edit:** Use the edit tool to apply these changes to `app/editor/[documentId]/page.tsx`.
    6.  **Test Phase 1:**
        *   Run the application and open an editor document.
        *   Interact with the chat assistant, asking it to perform actions using editor tools (`addContent`, `modifyContent`, `deleteContent`).
        *   **Verification:** Confirm that the editor content changes correctly according to the tool calls. The UI representation in the chat message *might* be broken at this stage.

**Phase 2: Refactor Tool Call UI Rendering (`ChatMessageItem.tsx`)**

*   **Goal:** Modify the `components/editor/ChatMessageItem.tsx` component to correctly display tool call information based on the `message.parts` array.
*   **Steps:**
    1.  **Locate:** Open `components/editor/ChatMessageItem.tsx` and find the JSX section rendering tool calls (around line 48, checking `message.toolInvocations`).
    2.  **Extract Tool Invocation Parts:** Add logic (e.g., near the start of the component) to filter `message.parts` and get the `toolInvocationParts` array and a boolean `hasToolInvocations`.
        ```typescript
        const toolInvocationParts = message.parts?.filter(
          (part): part is { type: 'tool-invocation'; toolInvocation: ToolInvocation } => part.type === 'tool-invocation'
        ) || [];
        const hasToolInvocations = toolInvocationParts.length > 0;
        ```
    3.  **Modify Conditional Render:** Change the condition rendering the tool call section to use `message.role === 'assistant' && hasToolInvocations`.
    4.  **Adapt Mapping:** Change the mapping logic to iterate over `toolInvocationParts.map((part) => ...)` instead of `message.toolInvocations.map(...)`.
    5.  **Update Data Access within Map:** Inside the map function, replace accesses like `toolCall.toolCallId` with `part.toolInvocation.toolCallId`, `toolCall.toolName` with `part.toolInvocation.toolName`, etc.
    6.  **Apply Edit:** Use the edit tool to apply these changes to `components/editor/ChatMessageItem.tsx`.
    7.  **Test Phase 2:**
        *   Run the application.
        *   Open an editor document where tool calls were made (or make new ones).
        *   **Verification:** Examine assistant messages involving tool calls. Confirm that the UI elements for tool name, status, arguments, and results are displayed correctly. 