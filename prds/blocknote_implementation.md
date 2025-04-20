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
    *   Send the `editor.document` JSON, `messages`, and the captured cursor/selection context (e.g., `currentBlockId`, `selectedBlockIds`) to the backend API endpoint (`/api/chat`).
    *   Receive responses from the backend containing `chatResponse` (streamed text) and potentially `editorUpdates` (appended JSON data).
*   **Applying Updates:** Listen for `editorUpdates` appended to the data stream (see Section 3.4). When the stream finishes and `editorUpdates` data is present, iterate through the array and dynamically call the corresponding editor methods: `editor[update.operation](...update.args);`. This handles both block and inline content manipulations.
    *   Many inline operations (like `addStyles`, `insertInlineContent`) implicitly use the current selection/cursor state managed by BlockNote itself, so the frontend doesn't need complex logic to re-apply selections before these calls.
*   **Rendering:** Use the `<BlockNoteView>` component to display the editor. [Ref](https://www.blocknotejs.org/docs/editor-basics/setup#rendering-the-editor-with-blocknoteview)

### 3.2. Backend (API Route - `app/api/chat/route.ts`)

*   **Request Handling:** Modify the `POST` handler to accept `editorDocument` (JSON `Block[]`), `currentBlockId` (string, optional), and `selectedBlockIds` (string[], optional) in the request body alongside `messages`.
*   **Contextual Prompting:**
    *   Integrate the received `editorDocument` and cursor/selection context (`currentBlockId`, `selectedBlockIds`) into the context provided to the language model.
    *   Assume sending full `editorDocument` JSON initially. Revisit if necessary for prompt optimization or token limits.
*   **AI Instruction:**
    *   Enhance the system prompt to explain the BlockNote structure, the provided cursor/selection context, and the task.
    *   Instruct the AI on how to interpret user requests relative to the document content, explicit IDs, and cursor/selection context.
    *   **Block Identification Strategy:**
        *   Prefer using explicit `block.id`s when possible (either found in the document or provided via `currentBlockId`/`selectedBlockIds`).
        *   For content-based descriptions (e.g., "the paragraph starting with X"): The AI should attempt to find the corresponding block ID within the provided `editorDocument`. If successful and unambiguous, use the ID. If ambiguous or not found, the AI should ask the user for clarification rather than guessing.
    *   Define the expected output format: `chatResponse` (string for streaming) and optional `editorUpdates` (array of `EditorUpdateOperation` to be appended).
*   **Response Structuring:** The text part (`chatResponse`) will be streamed. If modifications are needed, the backend should perform a basic validation check on the AI-generated `editorUpdates`. If valid, it will be appended as a JSON data chunk at the end of the stream using AI SDK utilities (see Section 3.4). If invalid or missing when expected, it should be omitted, and the AI's `chatResponse` should ideally explain the issue (see Section 3.5).
    *   **Structure (Appended Data):**
        ```typescript
        type EditorUpdateOperation = {
          // The name of the BlockNote editor method to call
          operation: 
            | "insertBlocks" 
            | "updateBlock" 
            | "removeBlocks" 
            | "replaceBlocks"
            // Inline Content Ops:
            | "insertInlineContent"
            | "addStyles"
            | "removeStyles"
            | "toggleStyles"
            | "createLink";
          // Arguments for the method, matching the BlockNote API.
          // BlockIdentifiers -> string IDs. Block data -> PartialBlock.
          args: any[];
        };
        
        type ApiResponse = {
          chatResponse: string;
          editorUpdates?: EditorUpdateOperation[];
        }
        ```  

    *   **Example `editorUpdates` Value:**  
    
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
    *   Instructions on how to prioritize block identification: explicit IDs > cursor/selection context > content description (with clarification on failure).
    *   Instructions on how to differentiate between read/evaluate requests and modify/insert requests.
    *   Specification of the required output format (`ApiResponse` structure, noting that `chatResponse` is for streaming text and `editorUpdates` will be generated for appending if needed).
    *   Instruction for graceful failure: If the AI cannot confidently fulfill a modification request (e.g., ambiguous target, cannot generate valid operations), it should explain the issue clearly in the `chatResponse` and *not* generate an `editorUpdates` field.
*   **Few-Shot Examples (Optional but Recommended):** Include examples demonstrating requests related to selection ("bold the selected text"), cursor position ("insert below this block"), and content description ("find the heading 'Conclusion' and add..."), showing the expected `editorUpdates` structure using block IDs. Also include examples of failure messages.

### 3.4. Handling Streaming and Editor Updates

*   **Challenge:** The AI SDK's `streamText` function primarily streams text tokens. We need to deliver the structured `editorUpdates` JSON after the AI has finished processing, without sacrificing chat stream responsiveness.
*   **Solution:** Utilize the AI SDK's data stream capabilities (`DataStream` and utilities like `experimental_appendData`).
    *   **Backend:** Initiate the response using `streamText`. After the AI finishes generating its full response (including determining any necessary `editorUpdates`), use the SDK's tools to append the `editorUpdates` JSON array as a distinct data object to the end of the stream before finalizing the response.
    *   **Frontend:** Use the `ai/react` hook (`useChat`) which handles both streamed text and appended data. Display streamed text as it arrives. After the stream completes, check the hook's `data` property (or equivalent) for the appended `editorUpdates` array. If present, parse and apply the updates to the BlockNote editor.

### 3.5. Basic Error Handling (V1)

*   **Goal:** Provide basic resilience against common issues without implementing complex recovery mechanisms initially.
*   **Backend Responsibilities:**
    *   Perform basic validation on AI-generated `editorUpdates` before appending (e.g., check if it's an array if expected).
    *   If validation fails or `editorUpdates` are missing when expected, do not append data.
    *   Rely on the AI's prompted graceful failure message in the `chatResponse` to inform the user.
    *   Log backend errors (e.g., AI output parsing issues) for debugging.
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

1.  **User:** Types a query (e.g., "What's the title?").
2.  **Frontend:** Captures `editor.document`.
3.  **Frontend:** Sends `{ messages: [...], editorDocument: [...] }` to `/api/chat`. (Cursor/selection context usually not needed for reads).
4.  **Backend:** Constructs prompt with messages and `editorDocument`.
5.  **Backend:** Sends prompt to AI model.
6.  **AI Model:** Analyzes and generates text response.
7.  **Backend:** Receives response.
8.  **Backend:** Sends `{ chatResponse: "..." }` to frontend.
9.  **Frontend:** Displays `chatResponse`.

### 4.2. Modify Scenario

1.  **User:** Types instruction (e.g., "Bold the selection", "Insert 'Hello' here").
2.  **Frontend:** Captures `editor.document`, `currentBlockId`, `selectedBlockIds`.
3.  **Frontend:** Sends `{ messages: [...], editorDocument: [...], currentBlockId: '...', selectedBlockIds: [...] }` to `/api/chat`.
4.  **Backend:** Constructs prompt including messages, document, cursor/selection context, and instructions for modification output format.
5.  **Backend:** Sends prompt to AI model.
6.  **AI Model:** Analyzes context, determines target block(s) using ID/context/inference, generates `chatResponse` (streamed), and generates structured `editorUpdates` (if needed).
7.  **Backend:** Receives full response from AI.
8.  **Backend:** Sends `chatResponse` via stream. If `editorUpdates` exists, appends it as JSON data at the end of the stream.
9.  **Frontend:** Displays streamed `chatResponse`. On stream completion, checks for appended `data` containing `editorUpdates`.
10. **Frontend:** If `editorUpdates` is present, parses it and executes `editor[update.operation](...update.args);` for each operation.
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
    *   What happens if the AI generates invalid update instructions or invalid block IDs? (V1 handles via try/catch & logs).
    *   Implementing more robust error handling (e.g., partial success feedback, potential rollbacks).
*   Cursor positioning: Can/should the AI control the cursor position after modifications (using `setTextCursorPosition`)?
*   Improving reliability of content-based block identification beyond V1.
*   Performance: Impact of sending full `editor.document`. Consider diffing or partial updates if needed.
*   Security implications of allowing AI to modify document content.

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
