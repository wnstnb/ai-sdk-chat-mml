# Improving AI Interpretation of Document Structure (Strategy 2)

## 1. Goal

To enable the AI to accurately understand and interact with hierarchically structured content within the editor, particularly nested lists, by providing an explicit and simplified tree structure in the context.

## 2. Current Problem

The AI currently receives a flattened list of editor blocks with truncated text snippets. For list items (and potentially other nestable blocks), the `contentSnippet` only contains the text of the item itself, not its children. This makes it difficult for the AI to "see" or reliably interact with nested structures, leading to a suboptimal user experience when querying or attempting to modify nested content.

## 3. Proposed Solution: Explicit Tree Structure (Simplified)

This strategy involves augmenting the context provided to the AI with explicit structural information for each block, specifically its nesting level and the ID of its parent.

### 3.1. Context Generation Changes (`editorBlocksContext`)

The primary change will be in how the `editorBlocksContext` array is constructed (currently in `lib/hooks/editor/useChatInteractions.ts` within the `getEditorContext` function, before being sent to `app/api/chat/route.ts`).

For each block object sent to the AI, we will add two new fields:

*   `level`: An integer representing the nesting depth of the block (e.g., top-level items are level 1, their children are level 2, and so on).
*   `parentId`: A string containing the ID of the direct parent block. For top-level blocks, this can be `null` or an empty string.

The existing `contentSnippet` field (or potentially renamed to `blockText` for clarity) should continue to represent the direct textual content of the block itself, likely truncated to a reasonable length. It should *not* attempt to recursively include children's text, as the new `level` and `parentId` fields will handle the structural representation.

**Implementation Steps:**

1.  **Traverse BlockNote Document:** When `getEditorContext` processes `editor.document`, it will need to traverse the BlockNote block structure. BlockNote blocks typically have a `children` array (or similar mechanism like `props.children` for list items) that defines nesting.
2.  **Calculate `level`:**
    *   Top-level blocks in `editor.document` are `level: 1`.
    *   For each child block, its `level` is `parent.level + 1`.
3.  **Determine `parentId`:**
    *   For each child block, its `parentId` is the `id` of its parent block.
    *   Top-level blocks will have `parentId: null`.
4.  **Construct Block Objects:** Each object in `editorBlocksContext` will now look like:
    ```json
    {
      "id": "block-unique-id",
      "type": "bulletListItem", // or "paragraph", "heading", etc.
      "contentSnippet": "Text content of this specific block...",
      "level": 2,
      "parentId": "parent-block-id"
    }
    ```

### 3.2. System Prompt Updates

The system prompt (defined in `app/api/chat/route.ts`) must be updated to instruct the AI on how to interpret these new structural fields.

**Instructions for the AI:**

*   "The `editorBlocksContext` you receive is an array of block objects. Each object may contain `level` and `parentId` fields."
*   "`level` indicates the nesting depth of a block. A higher number means deeper nesting."
*   "`parentId` indicates the `id` of the block under which the current block is nested. Top-level blocks will have a null `parentId`."
*   "Use `level` and `parentId` to understand the hierarchical relationships between blocks, especially for outlines, nested lists, and other structured content."
*   "When a user refers to 'sub-items', 'nested content', or items 'under' another, use this structural information to identify the correct blocks."

## 4. Example Block Representation in Context

```json
[
  {
    "id": "blockA",
    "type": "bulletListItem",
    "contentSnippet": "Top level item 1",
    "level": 1,
    "parentId": null
  },
  {
    "id": "blockB",
    "type": "bulletListItem",
    "contentSnippet": "Nested item 1.1",
    "level": 2,
    "parentId": "blockA"
  },
  {
    "id": "blockC",
    "type": "bulletListItem",
    "contentSnippet": "Nested item 1.1.1",
    "level": 3,
    "parentId": "blockB"
  },
  {
    "id": "blockD",
    "type": "bulletListItem",
    "contentSnippet": "Nested item 1.2",
    "level": 2,
    "parentId": "blockA"
  },
  {
    "id": "blockE",
    "type": "bulletListItem",
    "contentSnippet": "Top level item 2",
    "level": 1,
    "parentId": null
  }
]
```

## 5. Key Tasks

1.  **Investigate BlockNote Nesting:** Confirm how BlockNote `Block` objects (especially for list items and potentially other types like paragraphs if they can contain nested lists directly) store their children. This is crucial for accurate `level` and `parentId` calculation. (Likely via a `children: Block[]` property on the parent `Block`).
2.  **Modify `getEditorContext` in `lib/hooks/editor/useChatInteractions.ts`:**
    *   Implement the logic to recursively traverse `editor.document`.
    *   Calculate and add `level` and `parentId` to each block object in `editorBlocksContext`.
3.  **Update System Prompt in `app/api/chat/route.ts`:** Add clear instructions for the AI on using `level` and `parentId`.
4.  **Testing:** Thoroughly test with various nested structures (lists, outlines if applicable) to ensure the AI can correctly identify and interact with elements at different levels.
    *   Queries about specific nested items.
    *   Requests to modify content within nested structures.
    *   Requests to add new items at specific nested locations.

## 6. Considerations

*   **Performance:** Traversing the entire document to calculate levels and parent IDs on every interaction might have a minor performance impact for very large documents. However, this is likely preferable to the AI failing to understand structure. This calculation happens client-side before API submission.
*   **Maximum Depth:** While this system supports arbitrary depth, extremely deep nesting might still be complex for the AI to manage in its own reasoning, but the explicit structure is the best we can provide.
*   **Non-List Nesting:** Consider if other block types can have children (e.g., a paragraph containing a list). The traversal logic should ideally be generic enough to handle any block with a recognized children structure. BlockNote's schema might define this.
*   **Clarity of `contentSnippet` vs. `blockText`:** Decide if renaming `contentSnippet` to something like `blockText` or `directText` would improve clarity, given that it will now solely represent the text of the block itself, not any children.

## 7. Phased Implementation Plan

This plan breaks down the implementation into manageable phases.

### Phase 1: Backend - Context Generation (`lib/hooks/editor/useChatInteractions.ts`)

**Goal:** Modify `getEditorContext` to generate `level` and `parentId` for each block.

1.  **Define a Recursive Helper Function:**
    *   Create a new internal helper function within or called by `getEditorContext`.
    *   Signature (example): `const processBlocksRecursive = (blocks: Block[], currentLevel: number, currentParentId: string | null): ProcessedBlock[] => { ... }`
    *   `ProcessedBlock` would be the new type for objects in `editorBlocksContext`, including `id`, `type`, `contentSnippet`, `level`, and `parentId`.
2.  **Implement Recursive Logic:**
    *   This function will iterate through the input `blocks` array.
    *   For each `block`:
        *   Construct the `ProcessedBlock` object.
        *   Set `level: currentLevel`.
        *   Set `parentId: currentParentId`.
        *   Keep existing logic for `id`, `type`.
        *   Keep existing logic for `contentSnippet` (using `getInlineContentText` for non-tables, and `blocksToMarkdownLossy` for tables). **Ensure this snippet does NOT include children's text.**
        *   Add the constructed object to a result array.
        *   If `block.children` exists and has items, recursively call `processBlocksRecursive(block.children, currentLevel + 1, block.id)` and append its results to the main result array.
3.  **Initial Call:**
    *   In `getEditorContext`, initiate the process by calling the recursive helper with `editor.document`, `level: 1`, and `parentId: null`.
    *   `editorBlocksContext` will now be the flat list of `ProcessedBlock` objects returned by this initial call.
4.  **Type Definitions:**
    *   Update or create TypeScript interfaces for the new `ProcessedBlock` structure that will be part of `EditorContextData` and sent to the API.
5.  **Testing (Unit/Integration):**
    *   Prepare test cases with various document structures (nested lists, mixed block types, empty documents, documents with only top-level blocks).
    *   Verify that `level` and `parentId` are correctly assigned for all blocks.
    *   Verify that `contentSnippet` remains focused on the block's own content.

### Phase 2: Backend - System Prompt Update (`app/api/chat/route.ts`)

**Goal:** Instruct the AI on how to use the new structural information.

1.  **Modify System Prompt:**
    *   Locate the `systemPrompt` variable.
    *   Add the instructional text as detailed in Section 3.2 of this document.
    *   Example text snippet to add:
        ```
        You will receive editor content in an array called `editorBlocksContext`. Each object in this array represents a block from the editor and may contain the following fields to describe its structure:
        - `id`: A unique identifier for the block.
        - `type`: The type of block (e.g., 'paragraph', 'bulletListItem').
        - `contentSnippet`: A brief text preview of the block's own content.
        - `level`: An integer indicating the nesting depth (1 is top-level).
        - `parentId`: The `id` of the block under which this block is nested. Top-level blocks have a null `parentId`.

        Use `level` and `parentId` to understand the document's hierarchy, especially for nested lists or outlines. When a user refers to 'sub-items' or items 'under' another, use this structural information to accurately identify and target the correct blocks.
        ```
2.  **Review and Refine:** Ensure the language is clear, concise, and directly tells the AI how to interpret and use these fields.

### Phase 3: Frontend & AI Interaction - Testing and Validation

**Goal:** Verify the AI can understand and utilize the new context for improved interaction with nested structures.

1.  **End-to-End Testing Scenarios:**
    *   **Queries about Structure:**
        *   "How many items are in the list starting with 'XYZ'?"
        *   "What are the sub-items under 'Point A'?"
        *   "Is 'Sub-item B' nested under 'Main Item C'?"
    *   **Content Modification:**
        *   "Add 'New sub-item' under 'Parent Item X'."
        *   "Change the text of the second item in the nested list below 'Chapter 1'."
        *   "Delete the third sub-item of 'Section Alpha'."
    *   **Content Generation:**
        *   "Create an outline under the heading 'Project Plan' with three main points, and two sub-points for the second main point."
    *   **Complex Cases:** Test with multiple levels of nesting, mixed block types, and interactions that span across different parent blocks.
2.  **AI Response Analysis:**
    *   Carefully examine the AI's responses and any resulting editor operations (if applicable to the test).
    *   Verify that the AI correctly identifies target blocks based on their `level` and `parentId`.
    *   Check if the AI can reason about the hierarchy (e.g., understanding that a `level: 3` item is a child of a `level: 2` item).
3.  **Iterate on System Prompt (If Needed):**
    *   If the AI struggles with certain scenarios, refine the system prompt in Phase 2 to provide more clarity or examples.
4.  **User Experience Assessment:** Subjectively assess if interactions feel more natural and accurate when dealing with nested content.

### Phase 4: Optional Refinements (Post-MVP)

**Goal:** Consider further improvements based on initial rollout and feedback.

1.  **Rename `contentSnippet`:**
    *   If decided, implement the renaming of `contentSnippet` to `blockText` or `directText` (or similar) across the codebase (`getEditorContext`, system prompt, AI interaction logic) for improved clarity. This is a low-priority change if the current name isn't causing confusion.
2.  **Performance Monitoring:**
    *   For very large documents, monitor any potential performance impact of the recursive context generation. If noticeable, explore optimizations (though this is unlikely to be an issue for most common document sizes).
3.  **Advanced Structural Tools for AI:**
    *   (Future scope) Consider if the AI could benefit from dedicated tools that operate on this new structural understanding, e.g., a tool to "get all children of block X" or "find the parent of block Y." This is beyond the initial scope but could be a future enhancement. 