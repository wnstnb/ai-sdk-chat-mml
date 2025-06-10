# AI Tool Payload Documentation

## Introduction

This document provides a reference for the payload structures and operational behavior of AI tools used within the application. It covers both client-side editor tools and server-side tools. The primary goal is to document the *current* state of these tools, not to propose changes.

## 1. Client-Side Editor Tools

These tools are primarily executed within `app/editor/[documentId]/page.tsx` and directly manipulate the BlockNote editor instance. They **do not return structured JSON payloads** in the traditional sense. Instead, their success or failure is communicated through:

*   Direct updates to the editor content.
*   User-facing toast notifications (e.g., `toast.success()`, `toast.error()`, `toast.info()`).
*   Console log messages for errors or warnings.

The Vercel AI SDK on the client-side (`lib/hooks/editor/useChatInteractions.ts`) uses a `mockExecutor` for these tools, which returns a generic `{ success: true, status: 'delegated_to_editor_page', args }`. This indicates that the actual execution and outcome handling occur in `app/editor/[documentId]/page.tsx`.

### 1.1. `addContent`

*   **Client-Side Executor Function:** `executeAddContent` in `app/editor/[documentId]/page.tsx`
*   **Input Parameters (`args`):**
    *   `markdownContent`: `string` - The Markdown content to be added.
    *   `targetBlockId`: `string | null` - Optional ID of the block to insert relative to.
        *   If `null`, content is inserted relative to the current text cursor's block.
        *   If a `targetBlockId` is provided but the block is not found, or if the cursor is not in a block when `targetBlockId` is `null`, it attempts to insert after the last block in the document.
        *   If the document is empty, content is inserted as the initial blocks.
*   **Success Effects:**
    *   Editor content is updated with the new blocks parsed from `markdownContent`.
    *   Toast Notification: "Content added from AI."
    *   `handleEditorChange(editor)` is called.
*   **Error/Warning Effects (Examples):**
    *   Toast: "Editor not available to add content."
    *   Toast: "Invalid content provided for addContent."
    *   Toast: "Failed to insert content: could not find reference block."
    *   Toast: `Error adding content: ${error.message}` (for general errors).
    *   Errors are logged to the console.

### 1.2. `modifyContent`

*   **Client-Side Executor Function:** `executeModifyContent` in `app/editor/[documentId]/page.tsx`
*   **Input Parameters (`args`):**
    *   `targetBlockId`: `string | string[]` - ID or array of IDs of the block(s) to modify.
    *   `newMarkdownContent`: `string | string[]` - New Markdown content for the corresponding block(s).
    *   `targetText`: `string | null` - (Defined in schema) Intended for specific text replacement within a block, though current implementation primarily focuses on block-level updates or checklist-specific logic.
*   **Success Effects:**
    *   Editor content is updated for the specified block(s).
    *   Toast Notification: `"${successCount} block(s) modified."`
    *   Toast Notification (if no changes but no errors): "No changes applied to blocks."
    *   `handleEditorChange(editor)` is called if modifications occurred.
*   **Error/Warning Effects (Examples):**
    *   Toast: "Editor not available to modify content."
    *   Toast: "Invalid arguments for modifyContent: targetBlockId and newMarkdownContent are required."
    *   Toast: `Modification failed: Block ID ${id} not found.`
    *   Toast: `Failed to parse Markdown for block ID ${id}: "${currentMarkdown}"`
    *   Toast: `"${errorCount} block(s) could not be modified."`
    *   Errors/warnings are logged to the console.

### 1.3. `deleteContent`

*   **Client-Side Executor Function:** `executeDeleteContent` in `app/editor/[documentId]/page.tsx`
*   **Input Parameters (`args`):**
    *   `targetBlockId`: `string | string[]` - ID or array of IDs of the block(s) to delete or from which to delete text.
    *   `targetText`: `string | null` - If provided for a single `targetBlockId`, attempts to delete this specific text. If this empties the block, the block is removed. If `null`, the entire block(s) identified by `targetBlockId` are deleted.
*   **Success Effects:**
    *   Editor content is updated (blocks or text removed).
    *   Toast Notifications (Examples): `Text "${targetText}" deleted.`, `Removed block ${targetBlock.id}.`, `Removed ${existingBlockIds.length} block(s).`
    *   `handleEditorChange(editor)` is called.
*   **Error/Warning Effects (Examples):**
    *   Toast: "Editor not available to delete content."
    *   Toast: "Deletion failed: Missing target block ID(s)."
    *   Toast: `Deletion failed: Block ID ${blockId} not found.`
    *   Toast (Warning): `Could not find text "${targetText}" to delete in block ${blockId}.`
    *   Toast (Warning): "Cannot delete specific text across multiple blocks. Deleting blocks instead."
    *   Toast: `Error deleting content: ${error.message}` (for general errors).
    *   Errors/warnings are logged to the console.

### 1.4. `createChecklist`

*   **Client-Side Executor Function:** `executeCreateChecklist` in `app/editor/[documentId]/page.tsx`
*   **Input Parameters (`args`):**
    *   `items`: `string[]` - An array of plain text strings, where each string is the content for a new checklist item.
    *   `targetBlockId`: `string | null` - Optional ID of the block to insert the new checklist after.
        *   If `null`, content is inserted relative to the current text cursor's block.
        *   If a `targetBlockId` is provided but the block is not found, or if the initial reference block is otherwise unsuitable, a series of fallbacks occur:
            1.  Attempt to insert after the last block in the document.
            2.  Attempt to insert relative to the current text cursor's block (if `targetBlockId` was initially problematic).
            3.  Attempt again to insert after the last block in the document.
            4.  If the document is empty or no valid reference block can be found, content is inserted as the initial blocks.
*   **Success Effects:**
    *   Editor content is updated with the new checklist items.
    *   Toast Notification: `"${blocksToInsert.length} checklist item(s) added."` or `"${blocksToInsert.length} checklist item(s) added to the end."`
    *   `handleEditorChange(editor)` is called.
*   **Error/Warning Effects (Examples):**
    *   Toast: "Editor not available to create checklist."
    *   Toast: "Invalid arguments for createChecklist: items must be an array of strings."
    *   Toast (Info): "No items provided to create a checklist."
    *   Toast: "Failed to create checklist: reference block not found or disappeared."
    *   Toast: `Failed to create checklist: ${error.message}` (for general errors).
    *   Errors are logged to the console.

### 1.5. `modifyTable`

*   **Client-Side Executor Function:** `executeModifyTable` in `app/editor/[documentId]/page.tsx`
*   **Input Parameters (`args`):**
    *   `tableBlockId`: `string` - The ID of the table block to modify.
    *   `newTableMarkdown`: `string` - The complete, final Markdown content for the entire table.
*   **Success Effects:**
    *   The specified table block in the editor is replaced with the content parsed from `newTableMarkdown`. If `newTableMarkdown` is empty, the table block is removed.
    *   Toast Notification: `Table block ${tableBlockId} updated.` or `Table block ${tableBlockId} removed as replacement was empty.`
    *   `handleEditorChange(editor)` is called.
*   **Error/Warning Effects (Examples):**
    *   Toast: "Editor not available to modify table."
    *   Toast: "Invalid arguments for modifyTable."
    *   Toast: `Modification failed: Table block ID ${tableBlockId} not found.`
    *   Toast: `Modification failed: Block ${tableBlockId} is not a table.`
    *   Toast: `Failed to parse the updated table structure. Original table retained.`
    *   Toast: `Failed to modify table: ${error.message}` (for general errors).
    *   Errors are logged to the console.

## 2. Server-Side Tools

These tools are defined and executed on the server, typically within `lib/tools/server-tools.ts`. Their results are streamed back to the client as part of the AI's response, usually as a `tool_result` part in the Vercel AI SDK message stream. They use a `safeExecuteTool` wrapper for consistent error handling.

### 2.1. `webSearch`

*   **Server-Side Definition:** `webSearchTool` in `lib/tools/server-tools.ts`
*   **Input Parameters (from tool arguments passed by AI):**
    *   `query`: `string` - The search query (min 1, max 100 characters).
*   **Success Payload Structure (JSON object):**
    \`\`\`json
    {
      "results": [
        {
          "title": "string",       // Title of the search result, or 'No title available'
          "url": "string",         // URL of the search result
          "content": "string",     // First 1000 characters of content, or 'No content available'
          "publishedDate": "string" // Published date, or 'No date available'
        }
        // ... up to 3 results
      ],
      "searchPerformed": true,
      "queryUsed": "string"      // The original query used
    }
    \`\`\`
*   **Error Payload Structure (JSON object, from `safeExecuteTool`):**
    \`\`\`json
    {
      "error": "string",    // General error message, e.g., "Failed to execute webSearch"
      "details": "string" // Optional: Specific error message from the caught error
    }
    \`\`\`

### 2.2. `searchAndTagDocumentsTool`

*   **Server-Side Definition:** `searchAndTagDocumentsTool` in `lib/tools/server-tools.ts`
*   **Input Parameters (from tool arguments passed by AI):**
    *   `searchQuery`: `string` - The user's query to search for in their documents.
*   **Success Payload Structure (JSON object):**
    \`\`\`json
    {
      "documents": [
        {
          "id": "string",          // ID of the document
          "name": "string",        // Name/title of the document
          "confidence": "number",  // Final score from combined search ranking
          "summary": "string"    // Optional: Summary of the document
        }
        // ...
      ],
      "searchPerformed": true,
      "queryUsed": "string",         // The original query used
      "presentationStyle": "listWithTagButtons" // Hint for UI display
    }
    \`\`\`
*   **Error Payload Structure (JSON object, from `safeExecuteTool`):**
    \`\`\`json
    {
      "error": "string",    // General error message, e.g., "Failed to execute searchAndTagDocuments"
      "details": "string" // Optional: Specific error message
    }
    \`\`\`

## 3. Summary of Patterns and Observations

*   **Client-Side vs. Server-Side Payloads:** There's a clear distinction.
    *   Client-side editor tools modify the editor directly and provide immediate UI feedback (toasts), without returning a structured payload that the AI message stream would traditionally process as a `tool_result`. The AI's `tool_call` for these effectively triggers a side effect on the client.
    *   Server-side tools perform their action and return a structured JSON object as a `tool_result`, which the AI can then use to formulate its next response to the user.
*   **Error Handling:**
    *   Client-side tools handle their own errors by displaying toasts and logging to the console.
    *   Server-side tools use the `safeExecuteTool` wrapper to return a standardized error object `{ error: string, details?: string }` as their payload in case of failure.
*   **Schema Definitions:**
    *   Zod schemas are defined for the *input parameters* of both client-side (in `lib/hooks/editor/useChatInteractions.ts` and `app/api/chat/route.ts`) and server-side tools (in `lib/tools/server-tools.ts`). These ensure the AI provides correctly structured arguments when invoking tools.
    *   There are no explicit Zod schemas for the *output/return payloads* of the client-side editor tools because they don't return structured data in that manner. The server-side tools' return structures are defined by their `execute` functions.
*   **Tool Invocation Handling on Client:** The client-side logic in `app/editor/[documentId]/page.tsx` (around line 950 and onwards in the `useEffect` for processing messages) correctly differentiates between server-side tools (like `webSearch`, `searchAndTagDocumentsTool`) and client-side editor tools. Server-side tool calls are expected to be resolved by the backend, while client-side tool calls trigger the local `execute*` functions.

This documentation should serve as a reference for how AI tools currently operate and what their expected inputs and outputs/effects are.

## 4. UI Handling of Payloads and Tool Results

This section describes how the user interface (primarily `app/editor/[documentId]/page.tsx`) handles the outcomes and payloads of AI tool calls.

### 4.1. Client-Side Editor Tools (`addContent`, `modifyContent`, etc.)

*   **No Complex Return Payload for Logic:** As detailed in Section 1, these tools do not return a complex JSON payload that the client-side UI logic then parses to *determine further actions or display detailed results based on the payload's content*. Their primary effect is direct manipulation of the editor.
*   **UI Display of Tool Invocation Details:** When a client-side editor tool is invoked by the AI, the UI renders an expandable widget within the assistant's message. This widget, as shown in user-provided screenshots, typically displays:
    *   **Tool Used:** The name of the tool (e.g., `addContent`, `deleteContent`).
    *   **Args:** The arguments that were passed to the tool (e.g., `{ "targetBlockId": "...", "markdownContent": "..." }`).
    *   **Result:** A simple JSON object. This is the object passed to `addToolResult()` on the client after the tool's local execution is initiated. Examples include `{ "status": "forwarded to client" }` or `{ "tool": "<toolName>", "status": "forwarded to client" }`. This provides transparency to the user that a specific client-side action was dispatched.
*   **Primary Feedback via Direct UI Manipulation & Toasts:** Beyond this informational widget in the chat, the main feedback to the user about the tool's *actual success or failure in modifying the editor* comes from:
    1.  Direct visual changes in the BlockNote editor content (e.g., text appearing, items deleted).
    2.  Toast notifications (e.g., "Content added," "Error modifying table.") displayed immediately after the tool's execution attempt on the client.

### 4.2. Server-Side Tools (`webSearch`, `searchAndTagDocumentsTool`)

*   **No Direct Client-Side Execution or UI Rendering of Raw JSON:** The client-side logic in `page.tsx` identifies these as server-side tools and **does not** execute them locally. It also **does not** have specific code to parse the raw JSON payloads returned by these tools (documented in Section 2) and render them directly into unique UI components.
*   **Reliance on AI's Textual Interpretation:** The standard flow is:
    1.  AI calls a server-side tool (e.g., `webSearch`).
    2.  The Vercel AI SDK and backend handle the tool's execution.
    3.  The server-side tool's `execute` function returns a JSON payload (e.g., search results) as a `tool_result` in the AI message stream.
    4.  The AI model receives this `tool_result`.
    5.  The AI model then formulates a **new text-based message** for the user, summarizing or presenting the information from the tool's JSON payload (e.g., "Here are the search results I found: ...").
    6.  **UI Handling:** The client UI (e.g., `ChatMessagesList`) primarily renders this final text-based message from the AI.
*   **`presentationStyle` Hint:** The `searchAndTagDocumentsTool` includes a `presentationStyle: 'listWithTagButtons'` in its success payload. The `page.tsx` logic does not show explicit handling for this hint to render custom UI from the raw `tool_result`. It's likely that the AI is expected to use this hint to format its textual response, or a more specialized component deeper in the UI rendering stack might interpret `tool_result` parts if they have such hints (though this was not apparent in the reviewed `page.tsx` sections).

### 4.3. Gemini Tool Execution Pathway

*   A separate event listener (`handleGeminiToolExecution`) in `page.tsx` can also trigger client-side editor tools.
*   In this case, the UI handling is identical to that described in Section 4.1: the corresponding `execute<ToolName>(params)` function is called, leading to direct editor manipulation and toast notifications.

In summary, the UI's approach to "payloads" is bifurcated: client-side tools' effects *are* the UI handling, while for server-side tools, the UI primarily displays the AI's textual summarization of the tool's JSON result rather than directly rendering the raw JSON data in a bespoke way (based on the `page.tsx` logic). 