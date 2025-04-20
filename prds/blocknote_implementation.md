# PRD: AI Interaction with BlockNote Editor

## 1. Goal

Enable seamless interaction between the user, the AI assistant, and the BlockNote editor content via the chat interface. Users should be able to query the editor's content and instruct the AI to modify it.

## 2. Core Scenarios

*   **Reading/Evaluating Content:**
    *   User asks the AI about the content within the BlockNote editor (e.g., "Summarize the second paragraph", "Are there any headings?").
    *   AI analyzes the provided editor content and responds in the chat interface.
*   **Modifying/Inserting Content:**
    *   User instructs the AI to make changes (add, delete, modify) to the BlockNote editor content (e.g., "Add a heading called 'Introduction'", "Change the first sentence to bold", "Insert a paragraph after the heading").
    *   AI analyzes the request and the current editor content.
    *   AI generates instructions for the frontend to update the editor.
    *   AI responds in the chat interface summarizing the action taken.
    *   Frontend applies the changes to the BlockNote editor instance.

## 3. Technical Approach

### 3.1. Frontend (React Component Hosting BlockNote)

*   **Editor Instance:** Manage the BlockNote editor instance using the `useCreateBlockNote` hook. [Ref](https://www.blocknotejs.org/docs/editor-basics/setup#usecreateblocknote-hook)
    *   Basic Example:
        ```typescript
        import "@blocknote/core/fonts/inter.css";
        import { BlockNoteView } from "@blocknote/mantine";
        import "@blocknote/mantine/style.css";
        import { useCreateBlockNote } from "@blocknote/react";
        
        export default function App() {
          // Creates a new editor instance.
          const editor = useCreateBlockNote();
        
          // Renders the editor instance using a React component.
          return <BlockNoteView editor={editor} />;
        }
        ```
*   **State Capture:** When the user initiates an interaction requiring editor context, capture:
    *   The current editor state using `editor.document` (array of `Block` objects). [Ref](https://www.blocknotejs.org/docs/editor-basics/document-structure#document-json)
    *   The current text cursor position block ID using `editor.getTextCursorPosition().block.id`. [Ref](https://www.blocknotejs.org/docs/editor-api/cursor-and-selections#getting-text-cursor-position)
    *   The block IDs within the current selection (if any) using `editor.getSelection()?.blocks.map(b => b.id)`. [Ref](https://www.blocknotejs.org/docs/editor-api/cursor-and-selections#getting-selection)
*   **API Communication:**
    *   Send the `editor.document` JSON, `messages`, and the captured cursor/selection context (e.g., `currentBlockId`, `selectedBlockIds`) within the `data` payload of the `useChat` hook's `handleSubmit` function to the backend API endpoint (`/api/chat`).
    *   Receive responses from the backend. The `useChat` hook handles the response stream.
*   **Applying Updates:** Listen for appended data on assistant messages using the `data` property returned by the `useChat` hook. When an assistant message completes and its `data` property contains the `editorUpdates` array, iterate through the array and dynamically call the corresponding editor methods: `editor[update.operation](...update.args);`. This handles both block and inline content manipulations.
    *   Many inline operations (like `addStyles`, `insertInlineContent`) implicitly use the current selection/cursor state managed by BlockNote itself, so the frontend doesn't need complex logic to re-apply selections before these calls.
*   **Rendering:** Use the `<BlockNoteView>` component to display the editor. [Ref](https://www.blocknotejs.org/docs/editor-basics/setup#rendering-the-editor-with-blocknoteview)

### 3.2. Backend (API Route - `app/api/chat/route.ts`)

*   **Request Handling:** Modify the `POST` handler to accept `editorDocument` (JSON `Block[]`), `currentBlockId` (string, optional), and `selectedBlockIds` (string[], optional) within the `data` property received from the `useChat` hook.
*   **Contextual Prompting:**
    *   Integrate the received `editorDocument` and cursor/selection context (`currentBlockId`, `selectedBlockIds`) into the context provided to the language model (e.g., within the system prompt or as a dedicated user message).
    *   Assume sending full `editorDocument` JSON initially.
*   **AI Instruction:**
    *   Enhance the system prompt to explain the BlockNote structure, the provided context, and the task.
    *   Instruct the AI on how to interpret user requests relative to the document content, explicit IDs, and cursor/selection context.
    *   **Block Identification Strategy:**
        *   Prefer using explicit `block.id`s when possible (either found in the document or provided via `currentBlockId`/`selectedBlockIds`).
        *   For content-based descriptions (e.g., "the paragraph starting with X"): The AI should attempt to find the corresponding block ID within the provided `editorDocument`. If successful and unambiguous, use the ID. If ambiguous or not found, the AI should ask the user for clarification rather than guessing.
    *   Define the expected AI *text* output format: A standard text response. If modifications are needed, the AI must embed a valid JSON array of `EditorUpdateOperation` objects at the *end* of its text response, enclosed in specific markers (e.g., `[EDITOR_UPDATES_START]` and `[EDITOR_UPDATES_END]`).
*   **Response Structuring (using `streamText` and `StreamData`):**
    *   Use the Vercel AI SDK `streamText` function to get the AI response stream.
    *   Initialize a `StreamData` object (`import { StreamData } from "ai";`).
    *   Return the result immediately using `result.toDataStreamResponse({ data })`. This starts streaming text to the client.
    *   Concurrently, `await` the full text response (`result.text`).
    *   Parse the full text to find the `[EDITOR_UPDATES_START]` and `[EDITOR_UPDATES_END]` markers.
    *   Extract the JSON string between the markers.
    *   Parse and validate the JSON against the `EditorUpdateOperation` schema (e.g., using Zod).
    *   If valid updates are found, `append` them to the `StreamData` instance (`data.append(validatedUpdates)`).
    *   `close` the `StreamData` instance (`data.close()`) after processing.
    *   **Structure (Appended Data):** The `data` appended will be the `EditorUpdateOperation[]` array.
        ```typescript
        type EditorUpdateOperation = {
          operation: 
            | "insertBlocks" 
            | "updateBlock" 
            | "removeBlocks" 
            | "replaceBlocks"
            | "insertInlineContent"
            | "addStyles"
            | "removeStyles"
            | "toggleStyles"
            | "createLink";
          args: any[];
        };
        ```
    *   **Example `editorUpdates` Value (as JSON array):**  
    
        ```json
        [
          // ... (block examples remain the same) ...
          // Example 5: Insert styled text at the cursor/selection
          {
            "operation": "insertInlineContent",
            "args": [
              ["Hello ", { "type": "text", "text": "World", "styles": { "bold": true } }]
            ]
          },
          // Example 6: Apply bold style to the current selection
          {
            "operation": "addStyles",
            "args": [
              { "bold": true }
            ]
          },
          // Example 7: Remove bold style from the current selection
          {
            "operation": "removeStyles",
            "args": [
               { "bold": true }
            ]
          },
          // Example 8: Toggle italic style on the current selection
          {
            "operation": "toggleStyles",
            "args": [
               { "italic": true }
            ]
          },
          // Example 9: Create a link from the current selection
          {
            "operation": "createLink",
            "args": [
              "https://www.blocknotejs.org/", 
              "BlockNote Link" // Optional text
            ]
          }
        ]
        ```

### 3.3. AI Prompting

*   **System Prompt:** Craft a detailed system prompt that includes:
    *   Explanation of the AI's role in interacting with a BlockNote editor.
    *   Description of the `Block`, `InlineContent`, and `PartialBlock` JSON structures.
    *   Explanation of the provided context: `editorDocument`, `currentBlockId`, `selectedBlockIds`.
    *   Instructions on block identification priority.
    *   Instructions on differentiating read vs. modify requests.
    *   **Specification of the required output format:** A text response, optionally ending with embedded `editorUpdates` JSON between `[EDITOR_UPDATES_START]` and `[EDITOR_UPDATES_END]` markers if modifications are required.
    *   Instruction for graceful failure: If the AI cannot confidently fulfill a modification request, it should explain the issue clearly in the text response and *not* include the JSON markers or block.
*   **Few-Shot Examples (Optional but Recommended):** Include examples showing requests and the expected *full text response*, including the embedded JSON block with markers when appropriate. Also include examples of failure messages without the JSON block.

### 3.4. Handling Streaming and Editor Updates

*   **Challenge:** We need to stream text immediately while also delivering structured `editorUpdates` data if generated.
*   **Solution:** Utilize the AI SDK's `streamText` function combined with `StreamData` for appending.
    *   **Backend:** Uses `streamText`. Returns `result.toDataStreamResponse({ data })` promptly. Asynchronously awaits the full text, parses the embedded JSON (between markers), validates it, and appends the `editorUpdates` array to the `StreamData` object.
    *   **Frontend:** Uses the `ai/react` hook (`useChat`). Displays streamed text as it arrives. After the stream completes for a message, checks the hook's `data` property on that message for the appended `editorUpdates` array. If present, parses and applies the updates to the BlockNote editor.

### 3.5. Basic Error Handling (V1)

*   **Goal:** Provide basic resilience against common issues without implementing complex recovery mechanisms initially.
*   **Backend Responsibilities:**
    *   Handle potential errors during JSON parsing of the extracted string.
    *   Perform basic validation on the parsed JSON (e.g., using Zod schema check).
    *   If parsing/validation fails or markers are missing, do not append data.
    *   Rely on the AI's prompted graceful failure message in the text response.
    *   Log backend errors (parsing issues, AI output format errors).
*   **Frontend Responsibilities:**
    *   Check for presence and basic type (array) of `editorUpdates` in appended stream data.
    *   Wrap individual `editor[update.operation](...update.args);` calls in `try...catch` blocks during processing.
    *   On error within the loop:
        *   Log the specific error and the failing `update` object to the console.
        *   Stop processing subsequent updates in the current batch.
        *   Display a generic system message in the chat UI (e.g., "⚠️ Error applying editor updates. Check console.").
    *   No automatic rollback of partially applied updates in V1.

## 4. Data Flow

### 4.1. Read Scenario

1.  **User:** Types query.
2.  **Frontend:** Captures `editor.document`.
3.  **Frontend:** Sends `{ messages: [...], data: { editorDocument: [...] } }` via `useChat`.
4.  **Backend:** Constructs prompt with messages and editor context.
5.  **Backend:** Calls `streamText`.
6.  **AI Model:** Generates text response (no markers/JSON).
7.  **Backend:** Returns `result.toDataStreamResponse()`. Full text processing finds no markers.
8.  **Frontend:** Displays streamed text. `data` on the message remains empty/null.

### 4.2. Modify Scenario

1.  **User:** Types instruction.
2.  **Frontend:** Captures `editor.document`, `currentBlockId`, `selectedBlockIds`.
3.  **Frontend:** Sends `{ messages: [...], data: { editorDocument: [...], currentBlockId: '...', selectedBlockIds: [...] } }` via `useChat`.
4.  **Backend:** Constructs prompt including editor context and instructions for embedded JSON output format.
5.  **Backend:** Calls `streamText`.
6.  **AI Model:** Analyzes, generates text response ending with `[EDITOR_UPDATES_START]...JSON...[EDITOR_UPDATES_END]`.
7.  **Backend:** Initializes `StreamData`, returns `result.toDataStreamResponse({ data })` immediately.
8.  **Backend (Async):** Awaits `result.text`, extracts and validates JSON, calls `data.append(updates)`, calls `data.close()`.
9.  **Frontend:** Displays streamed text. On stream completion, checks the `data` property on the message, finds the appended `editorUpdates` array.
10. **Frontend:** Parses `editorUpdates` and executes `editor[update.operation](...update.args);`.
11. **BlockNote Editor:** Updates visually.

## 5. Key BlockNote APIs & Concepts

*   **Setup & Rendering:**
    *   `useCreateBlockNote` [Ref](https://www.blocknotejs.org/docs/editor-basics/setup#usecreateblocknote-hook)
      ```typescript
      // hook
      function useCreateBlockNote(
        options?: BlockNoteEditorOptions,
        deps?: React.DependencyList = [],
        ): BlockNoteEditor;
        
        type BlockNoteEditorOptions = {
        animations?: boolean;
        collaboration?: CollaborationOptions;
        comments?: CommentsConfig;
        defaultStyles?: boolean;
        dictionary?: Dictionary;
        disableExtensions?: string[];
        domAttributes?: Record<string, string>;
        dropCursor?: (opts: {
            editor: BlockNoteEditor;
            color?: string | false;
            width?: number;
            class?: string;
        }) => Plugin;
        initialContent?: PartialBlock[];
        pasteHandler?: (context: {
            event: ClipboardEvent;
            editor: BlockNoteEditor;
            defaultPasteHandler: (context: {
            pasteBehavior?: "prefer-markdown" | "prefer-html";
            }) => boolean | undefined;
        }) => boolean | undefined;
        resolveFileUrl: (url: string) => Promise<string>
        schema?: BlockNoteSchema;
        setIdAttribute?: boolean;
        sideMenuDetection?: "viewport" | "editor";
        tabBehavior?: "prefer-navigate-ui" | "prefer-indent";
        tables?: TableFeatures;
        trailingBlock?: boolean;
        uploadFile?: (file: File) => Promise<string>;
        };
        ```
        ```typescript 
        // render
        const editor = useCreateBlockNote();
 
        return <BlockNoteView editor={editor} />;
        ```
        ```typescript
        // props
        export type BlockNoteViewProps = {
        editor: BlockNoteEditor;
        editable?: boolean;
        onSelectionChange?: () => void;
        onChange?: () => void;
        theme?:
            | "light"
            | "dark"
            | Theme
            | {
                light: Theme;
                dark: Theme;
            };
        formattingToolbar?: boolean;
        linkToolbar?: boolean;
        sideMenu?: boolean;
        slashMenu?: boolean;
        emojiPicker?: boolean;
        filePanel?: boolean;
        tableHandles?: boolean;
        comments?: boolean;
        children?:
        } & HTMLAttributes<HTMLDivElement>;
        ```
    *   `BlockNoteView` [Ref](https://www.blocknotejs.org/docs/editor-basics/setup#rendering-the-editor-with-blocknoteview)
*   **Document Structure:**
    *   `editor.document` (Type: `Block[]`) [Ref](https://www.blocknotejs.org/docs/editor-basics/document-structure#document-json)
    *   `Block` Object (`id`, `type`, `props`, `content`, `children`) [Ref](https://www.blocknotejs.org/docs/editor-basics/document-structure#block-objects)
    *   `InlineContent` Object (`StyledText`, `Link`) [Ref](https://www.blocknotejs.org/docs/editor-basics/document-structure#inline-content-objects)
    *   `PartialBlock` Object: A type used for creating/updating blocks where most fields are optional, simplifying API calls.
      ```typescript
      type PartialBlock = {
        id?: string;
        type?: string;
        props?: Partial<Record<string, any>>; // exact type depends on "type"
        content?: string | InlineContent[] | TableContent;
        children?: PartialBlock[];
      };
      ```
*   **Core Manipulation APIs (Frontend):**
    *   Block Ops: `editor.insertBlocks`, `editor.updateBlock`, `editor.removeBlocks`, `editor.replaceBlocks` [Ref](https://www.blocknotejs.org/docs/editor-api/manipulating-blocks)
    *   Inline Content Ops: `editor.insertInlineContent`, `editor.addStyles`, `editor.removeStyles`, `editor.toggleStyles`, `editor.createLink` [Ref](https://www.blocknotejs.org/docs/editor-api/manipulating-inline-content)
    *   (Potentially useful for updates): `editor.updateInlineContent`, `editor.removeInlineContent`
*   **Cursor & Selection APIs (Frontend Context / AI Targeting):**
    *   `editor.getTextCursorPosition(): { block: Block, ... }` [Ref](https://www.blocknotejs.org/docs/editor-api/cursor-and-selections#getting-text-cursor-position)
    *   `editor.getSelection(): { blocks: Block[] } | undefined` [Ref](https://www.blocknotejs.org/docs/editor-api/cursor-and-selections#getting-selection)
    *   `editor.setTextCursorPosition(targetBlock, placement)` [Ref](https://www.blocknotejs.org/docs/editor-api/cursor-and-selections#setting-text-cursor-position)
    *   `editor.setSelection(startBlock, endBlock)` [Ref](https://www.blocknotejs.org/docs/editor-api/cursor-and-selections#setting-selection)
*   **Serialization (Alternative/Backend):**
    *   `editor.blocksToMarkdown()` [Ref](https://www.blocknotejs.org/docs/editor-api/markdown-html#converting-blocks-to-markdown)
    *   `editor.markdownToBlocks()` [Ref](https://www.blocknotejs.org/docs/editor-api/markdown-html#parsing-markdown-to-blocks)
      *(Note: Direct API manipulation guided by AI is preferred over full serialization/deserialization if possible).*

## 6. Future Considerations / Open Questions

*   How to handle complex user requests involving multiple steps or ambiguity?
*   Error handling:
    *   What if the AI generates invalid JSON between markers? (V1 handled via try/catch & logs on backend).
    *   Robustness: Informing the user if backend parsing/validation failed.
*   Cursor positioning: Can/should the AI control cursor position post-modification?
*   Improving reliability of content-based block identification.
*   Performance: Impact of sending full `editor.document`.
*   Security implications.
*   Alternative data embedding: Consider base64 encoding the JSON if complex characters cause issues, though direct JSON is simpler.

## 7. Dependencies

*   **Frontend:**
    *   `@blocknote/core`: Core BlockNote logic.
    *   `@blocknote/react`: React hooks (`useCreateBlockNote`) and components.
    *   `@blocknote/mantine` (or equivalent UI binding): Provides `BlockNoteView` and default UI components.
    *   `ai`: Vercel AI SDK for `useChat` hook and stream/data handling.
    *   `react`: Core React library.
*   **Backend:**
    *   `@ai-sdk/openai` / `@ai-sdk/google` (or other model providers): For accessing the LLMs.
    *   `ai`: Vercel AI SDK core library for `streamText`, `DataStream`, etc.
    *   `zod` (optional, for validation)
