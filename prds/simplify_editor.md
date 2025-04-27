# Refactoring Plan: `app/editor/[documentId]/page.tsx`

## Goal

Break down the large `EditorPage` component in `app/editor/[documentId]/page.tsx` into smaller, more manageable custom hooks and UI components. This aims to improve code readability, maintainability, and testability **without altering existing functionality**.

## Analysis

The current `page.tsx` handles a wide range of responsibilities:

1.  **State Management:** Numerous `useState` and `useRef` hooks manage component state (document data, messages, editor content, UI states like collapsed chat, resizing, editing title, file uploads, autosave status, etc.). Includes interactions with Zustand stores (`useFollowUpStore`, `usePreferenceStore`).
2.  **Data Fetching:** Logic for fetching the document details and associated chat messages via API calls. Relies on Next.js router (`useParams`) for `documentId`.
3.  **Editor Logic:** Interacting with the BlockNote editor instance, including getting content, handling changes, and executing tool calls (`addContent`, `modifyContent`, `deleteContent`).
4.  **Chat Logic:** Managing the `useChat` hook, handling input changes, submissions (including `initialMsg` query param logic), file uploads/previews, drag & drop, paste, scrolling, and processing tool calls from assistant responses. Relies on `useFollowUpStore` and `usePreferenceStore`.
5.  **Feature Logic:** Implementing specific features like Autosave, Infer Title, Pane Resizing, Title Editing, and Navigation/Unload handling (using `usePathname`, `useRouter`).
6.  **Rendering:** Rendering the entire page structure, including the title bar, editor pane, chat pane (and its collapsed state), status indicators, and various buttons.

## Proposed Structure

We will extract logic into:

1.  **Custom Hooks:** To encapsulate specific functionalities and related state management. Hooks needing access to router info (`params`, `searchParams`, `pathname`, `router`) should use the Next.js hooks internally.
2.  **UI Components:** To represent distinct parts of the user interface. Existing shared components (`ChatInputUI`, `ModelSelector`, etc.) will be composed within these new editor-specific components.

### Potential Hooks

*   `useDocument(documentId)`: Manages fetching document data (`documentData`), initial editor content (`initialEditorContent`), loading state (`isLoadingDocument`), and errors. Gets `documentId` as an argument (originally from `useParams`).
*   `useChatMessages(documentId)`: Manages fetching chat messages (`chatMessages`), loading state (`isLoadingMessages`), display count (`displayedMessagesCount`), and message setting (`setChatMessages`). Gets `documentId` as an argument.
*   `useAutosave(editorRef, documentId)`: Encapsulates all autosave logic (timers, status, content refs, triggering saves via API, status updates). Requires the editor instance ref and document ID. Returns the current `autosaveStatus` and the `handleEditorChange` callback to pass to the editor component.
*   `useTitleManagement(documentId, initialName, editorRef)`: Handles fetching/updating the document title via API, editing state (`isEditingTitle`, `newTitleValue`), and the "Infer Title" functionality (requires editor instance for content).
*   `useChatPane(initialWidthPercent, minWidthPx, maxWidthPercent)`: Manages chat pane visibility (`isChatCollapsed`), width (`chatPaneWidth`), and resizing logic (`isResizing`, handlers). Purely client-side UI state.
*   `useFileUpload(documentId)`: Manages file state (`files`), upload status (`isUploading`, `uploadError`), initiating uploads (`handleStartUpload` via API), and storing the uploaded path (`uploadedImagePath`).
*   `useChatInteractions(documentId, model, editorRef)`: Combines `useChat` hook logic, submission logic (`handleSubmitWithContext`), tool processing, and input state management (`input`, `handleInputChange`). **Crucially, this hook will handle the `initialMsg` query param logic (using `useSearchParams`, `useRouter`, `setInput` internally) and access the `useFollowUpStore` for context.** It will also likely need access to the `usePreferenceStore` to determine the initial/default model if `model` prop isn't sufficient. Requires access to `fileUploadState` (from `useFileUpload`) and `chatMessageState` (from `useChatMessages`) or their relevant parts passed as props/arguments.
*   `useNavigationSave(documentId, autosaveStatus, editorContentRef)`: Handles the `beforeunload` and navigation listeners (using `usePathname`, `useRouter`) to trigger saves if needed, based on `autosaveStatus` (from `useAutosave`) and latest `editorContentRef` (from `useAutosave` or managed separately).

### Potential Components

*   `EditorTitleBar`: Renders the top bar including title display/editing (state/handlers from `useTitleManagement`), Infer Title button (handler from `useTitleManagement`), autosave status indicator (component below), and action buttons (New doc handler from page, Manual Save handler). Receives necessary data and handlers as props.
*   `AutosaveStatusIndicator`: A small, focused component to display the current autosave status icon and text. Receives `autosaveStatus` (from `useAutosave`) as a prop.
*   `EditorPaneWrapper`: Contains the `BlockNoteEditorComponent` and potentially the `CollapsedChatInput`. Receives initial content (from `useDocument`), editor ref, and `onEditorContentChange` handler (from `useAutosave`).
*   `ChatPaneWrapper`: The main container for the chat interface. Uses `useChatPane` internally or receives state/handlers from it. Includes the resize handle and conditionally renders its children.
*   `ChatMessagesList`: Renders the list of messages, the "Load More" button, and loading indicators. Receives messages/state from `useChatMessages` and potentially handlers from `useChatInteractions` (like `handleSendToEditor`).
*   `ChatMessageItem`: Renders a single message bubble (user or assistant), including content, tool calls, attachments, and "Send to Editor" button (handler from `useChatInteractions`).
*   `ChatInputArea`: Renders the form, `ChatInputUI`, model selector, attachment button/preview (state/handlers from `useFileUpload`), submit button. Uses state/handlers from `useChatInteractions` (input, handleInputChange, handleSubmit, isLoading, model, setModel, stop) and `useFollowUpStore` (to display context).
*   `CollapsedChatInput`: The specific input component shown within the editor pane when the main chat pane is collapsed. Likely similar props to `ChatInputArea`.

## Refactoring Steps (Incremental)

✅ 1.  **Setup:** Create necessary directories (`lib/hooks/editor`, `components/editor`) if they don't exist. Adjust imports as needed.
✅ 2.  **Extract `useDocument` Hook:** Migrate document fetching logic (`fetchDocument`) and related state (`documentData`, `initialEditorContent`, `isLoadingDocument`, `error`) into `lib/hooks/editor/useDocument.ts`. Update `page.tsx` to use the hook, passing `documentId`.
✅ 3.  **Extract `useChatMessages` Hook:** Migrate message fetching logic (`fetchChatMessages`) and related state (`chatMessages`, `isLoadingMessages`, `displayedMessagesCount`, `setChatMessages`) into `lib/hooks/editor/useChatMessages.ts`. Update `page.tsx` to use the hook, passing `documentId`.
✅ 4.  **Extract `AutosaveStatusIndicator` Component:** Create `components/editor/AutosaveStatusIndicator.tsx`. Pass `autosaveStatus` as a prop (sourced directly from `page.tsx` state). Replace the inline JSX in `page.tsx`.
🚧 5.  **(SKIPPED) Extract `useAutosave` Hook:** Autosave logic (`autosaveStatus`, `handleEditorChange`, timers, API calls) will remain in `page.tsx` for now due to complexity.
🚧 6.  **(SKIPPED) Extract `useNavigationSave` Hook:** Navigation/unload save logic will remain in `page.tsx` for now.
✅ 7.  **Extract `useTitleManagement` Hook:** Consolidate title editing state (`isEditingTitle`, `newTitleValue`), save/cancel/edit handlers, and the `handleInferTitle` logic (API call) into `lib/hooks/editor/useTitleManagement.ts`. Update `page.tsx` to use the hook, passing `documentId`, `initialName`, and `editorRef`.
✅ 8.  **Extract `EditorTitleBar` Component:** Create `components/editor/EditorTitleBar.tsx`. Move the title bar JSX. Pass props from `useTitleManagement` (state and handlers), `autosaveStatus` (from `page.tsx` state), manual save handler (defined in `page.tsx`), `isSaving` state (from `page.tsx`), new doc handler, etc. Use the `AutosaveStatusIndicator` component inside.
✅ 9.  **Extract `useChatPane` Hook:** Move chat pane state (`isChatCollapsed`, `chatPaneWidth`, `isResizing`) and the resize handlers (`handleMouseMoveResize`, `handleMouseUpResize`, `handleMouseDownResize`) into `lib/hooks/editor/useChatPane.ts`. Update `page.tsx` to use this hook.
✅ 10. **Extract `useFileUpload` Hook:** Move file state (`files`, `isUploading`, `uploadError`, `uploadedImagePath`), `handleStartUpload` (API calls), and related UI handlers (`handleUploadClick`, `handleFileChange`, drag/drop/paste handlers *for files*) into `lib/hooks/editor/useFileUpload.ts`. Update `page.tsx` to use this hook.
11. **Extract `useChatInteractions` Hook:** Integrate `useChat`, wrap `handleSubmit`, manage `input` state (`input`, `handleInputChange`), handle follow-up context (`useFollowUpStore`), process tool calls (`useEffect` for `toolInvocations`), handle `initialMsg` (`useSearchParams` etc.), and potentially `handleSendToEditor`. Needs `documentId`, `model`, `editorRef`, `uploadedImagePath` (from `useFileUpload`), `setMessages` (from `useChatMessages`), `setInput`. Update `page.tsx` to use this hook.
12. **Extract `ChatInputArea` Component:** Create `components/editor/ChatInputArea.tsx`. Move the form and `ChatInputUI`. Pass props from `useChatInteractions` (input, handlers, isLoading, model, etc.), `useFileUpload` (file state/handlers), and `useFollowUpStore`.
13. **Extract `ChatMessagesList` Component:** Create `components/editor/ChatMessagesList.tsx`. Move the message rendering loop, "Load More" button, and loading states. Needs message state from `useChatMessages` and `handleSendToEditor` from `useChatInteractions`.
14. **Extract `ChatMessageItem` Component:** Create `components/editor/ChatMessageItem.tsx` for rendering individual messages. Needs message data and `handleSendToEditor`.
15. **Extract `ChatPaneWrapper` Component:** Create `components/editor/ChatPaneWrapper.tsx`. Use state from `useChatPane`. Render resize handle, `ChatMessagesList`, and `ChatInputArea`.
16. **Extract `EditorPaneWrapper` Component:** Create `components/editor/EditorPaneWrapper.tsx`. Move the editor container div and the `BlockNoteEditorComponent`. Needs initial content (from `useDocument`), `editorRef`, `onEditorContentChange` (the `handleEditorChange` function defined in `page.tsx`). May also include `CollapsedChatInput`.
17. **Refine `page.tsx`:** The main component should now primarily compose the extracted hooks and components, passing props between them. State like `model`, `autosaveStatus`, and handlers like `handleEditorChange`, `handleSaveContent`, and the navigation/unload save logic will remain here. It orchestrates the hooks and renders the main layout (`EditorPaneWrapper`, `ChatPaneWrapper`).

## Considerations

*   **Prop Drilling vs. Context/Zustand:** While hooks encapsulate logic, passing state/handlers down multiple component levels can still occur. Evaluate if Zustand or React Context is needed for state shared very deeply, but prefer hook composition initially. Explicitly note that hooks like `useChatInteractions` will need access to specific Zustand stores (`useFollowUpStore`, `usePreferenceStore`).
*   **Dependencies:** Ensure hooks have correct dependencies (React hooks, other custom hooks, refs, state). Hooks needing router info (`useParams`, `useSearchParams`, `usePathname`, `useRouter`) must call them internally.
*   **API Interaction:** This refactoring focuses on client-side structure. **It should not change the signatures of API calls** (endpoints, request methods, body/response structure). API calls will simply be located within the relevant hook (e.g., fetch doc in `useDocument`) or remain in `page.tsx` (e.g., save document content).
*   **Testing:** Smaller hooks and components are easier to test individually.
*   **Incremental Commits:** Each step should result in a working state and be committed separately. **Test thoroughly after each step** to confirm no functionality is broken before proceeding.

This plan provides a structured approach to refactoring `page.tsx` methodically, accounting for external interactions like routing and shared state stores.