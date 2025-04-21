# Orchestrator Agent PRD

## 1. Overview

The Orchestrator Agent acts as an intermediary between the user's natural language instructions in the chat interface and specific actions to be performed on the BlockNote editor content or discussed within the chat context. Its primary goal is to understand the user's intent (Add, Modify, Delete, Read) regarding the editor content and translate that into appropriate function calls or responses.

## 2. Goals

-   Reliably interpret user intent regarding editor manipulation or discussion.
-   Enable seamless interaction between the chat interface and the editor component.
-   Provide clear instructions (via function calls) to the client-side application for executing editor actions.
-   Handle cases where the user wants to discuss existing editor content without modifying it.

## 3. Agent Actions / Function Calls

The agent should be able to invoke the following functions based on user instructions and the provided context (chat history, editor content):

### 3.1. `addContent`

-   **Description:** Generates new content based on user instructions and adds it to the editor. This is typically used for creating new text, lists, sections, etc.
-   **User Prompts (Examples):**
    -   "Generate a list of ideas for..."
    -   "Can you create a short summary about X?"
    -   "Make a poem based on the first paragraph."
    -   "Add a section about Y."
-   **Parameters:**
    -   `markdownContent: string`: The Markdown content to be added to the editor.
    -   `position: 'append' | 'afterBlock' | 'beforeBlock'`: (Optional) Where to add the content. Defaults to appending or inserting after the current selection.
    -   `targetBlockId: string | null`: (Optional) The ID of the block to insert relative to, if `position` is `afterBlock` or `beforeBlock`.
-   **Client-Side Action:** Parses `markdownContent` into BlockNote blocks and uses `editor.insertBlocks()` at the specified (or default) location.

### 3.2. `modifyContent`

-   **Description:** Modifies existing content within the editor based on user instructions. This requires identifying the specific block(s) and potentially specific text within a block to change.
-   **User Prompts (Examples):**
    -   "Summarize the selected text."
    -   "Expand on the second paragraph."
    -   "Break the long paragraph starting with '...' into bullet points."
    -   "Cite sources for the claims in this section."
    -   "Rewrite this sentence to be more formal."
-   **Parameters:**
    -   `targetBlockId: string`: The ID of the primary block to modify. (Identifying the target is a key challenge).
    -   `targetText: string | null`: (Optional) The specific text *within* the `targetBlockId` block to modify. If `null`, the modification applies to the entire block's content.
    -   `newMarkdownContent: string`: The new Markdown content to replace the target block(s) content.
    -   `modificationType: 'replace' | 'summarize' | 'expand' | 'reformat' | ...`: (Optional) Provides context on the type of modification.
-   **Client-Side Action:**
    -   Locates the block using `targetBlockId`.
    -   If `targetText` is `null`, updates the entire block content (e.g., using `editor.updateBlock` with parsed `newMarkdownContent`).
    -   If `targetText` is provided, searches for the `targetText` within the block's `InlineContent` structure and uses BlockNote APIs to replace that specific text with `newMarkdownContent` (treated as plain text or simple inline content). *This requires advanced BlockNote API usage for inline content manipulation.*

### 3.3. `deleteContent`

-   **Description:** Removes specific content from the editor based on user instructions.
-   **User Prompts (Examples):**
    -   "Remove the last paragraph."
    -   "Take out the section about X."
    -   "Delete the bullet points under Y."
-   **Parameters:**
    -   `targetBlockId: string | Array<string>`: The ID(s) of the block(s) to remove. (Identifying the target is a key challenge).
    -   `targetText: string | null`: (Optional) The specific text *within* the `targetBlockId` block to delete. If `null`, the entire block specified by `targetBlockId` is deleted. Only applicable when `targetBlockId` is a single ID.
-   **Client-Side Action:**
    -   Locates the block(s) using `targetBlockId`.
    -   If `targetText` is `null`, removes the entire block(s) using `editor.removeBlocks()`.
    -   If `targetText` is provided (and `targetBlockId` is a single ID), searches for the `targetText` within the block's `InlineContent` structure and uses BlockNote APIs to remove that specific text/nodes. *This requires advanced BlockNote API usage for inline content manipulation.*

### 3.4. `readDiscussContent`

-   **Description:** Addresses user queries or requests for discussion *about* the editor content without modifying the editor itself. The AI's response should be delivered purely as a chat message.
-   **User Prompts (Examples):**
    -   "What do you mean by the phrase '...' in the first paragraph?"
    -   "Tell me more about the concept mentioned in the second section."
    -   "Explain the third bullet point."
    -   "Does this section accurately reflect Z?"
-   **Parameters:**
    -   `query: string`: The user's specific question or topic for discussion.
    -   `contextText: string`: (Optional) The specific text snippet from the editor the user is referring to.
-   **Client-Side Action:** No editor modification. The AI generates a standard text response which is displayed in the chat interface. The agent should *not* attempt to call `addContent`, `modifyContent`, or `deleteContent` for these types of prompts.

## 4. Implementation Considerations

-   **Backend (`/api/chat/route.tsx`):**
    -   Needs to be updated to support Vercel AI SDK's Tool/Function Calling features.
    -   Define the schemas for the `addContent`, `modifyContent`, `deleteContent`, and `readDiscussContent` tools, including the new `targetText` parameter.
    -   Pass the editor content (as Markdown or structured JSON) to the AI as context.
    -   **Proposed Context Format:** Send a structured representation, e.g., an array of `{ id: string, contentSnippet: string }`.
    -   Include instructions in the system prompt guiding the AI on when to use which tool, emphasizing the `readDiscussContent` tool for non-editing queries, and how to use `targetBlockId` and `targetText` parameters.
-   **Frontend (`app/page.tsx`):**
    -   Modify the `useChat` hook setup to handle tool calls and results.
    -   Implement logic to execute the corresponding BlockNote editor actions based on the tool call (`addContent`, `modifyContent`, `deleteContent`), including handling the `targetText` parameter for inline modifications/deletions.
    -   Ensure standard chat messages are displayed correctly when `readDiscussContent` is (implicitly) used.
    -   **Proposed:** Send a structured representation of the editor content (e.g., an array of `{ id: string, contentSnippet: string }`) as context. The AI identifies the `targetBlockId` based on the user prompt and this structured context, and optionally identifies `targetText` if the request is for intra-block modification/deletion. Client-side validation is still needed.
    -   **Ambiguity Handling:** If the user's instruction is ambiguous regarding the target (block or specific text) or the desired action, the agent should default to asking for clarification via a chat response (`readDiscussContent` pattern) instead of guessing.

## 5. Open Questions

-   How can we most reliably identify the `targetBlockId` for modification and deletion actions initiated from chat?
    -   Can we infer this somehow by aligning blockIds with content? something like (arrayBlockIds, arrayContentBlocksToMarkdownLossy)? Or is this too simple -> *See proposed approach: Send structured `{id, contentSnippet}` context, AI returns `targetBlockId`.* How reliable is the AI at identifying the correct ID from snippets?
-   How can we reliably target specific text *within* a block for modification/deletion?
    -   *See proposed approach: Add `targetText` parameter to tools. AI identifies the text. Client finds and modifies/deletes using BlockNote inline content APIs.* How reliable is the AI at extracting `targetText` accurately? What are the BlockNote API capabilities/limitations for manipulating inline content based on text search?
-   How should the agent handle ambiguous instructions (e.g., "change this")? Should it ask for clarification?
    -   *Yes, agent should default to clarification via chat.*
