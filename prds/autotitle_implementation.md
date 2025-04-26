# Auto-Titling Feature Implementation

## 1. Goal

To provide users with a convenient way to automatically generate a title for their document based **solely on its initial editor content**. This enhances user experience by saving time and effort in titling new documents.

## 2. User Interface

-   A new button, labeled "Infer Title" (or similar, maybe an icon button?), will be placed adjacent to the existing "Edit Title" button/input area.

## 3. Workflow

1.  **User Action:** The user clicks the "Infer Title" button.
2.  **Content Extraction:**
    *   The frontend retrieves the current blocks **from the BlockNote editor**.
    *   It uses `blocknote.blocksToMarkdownLossy(blocks)` to convert the blocks into a Markdown string. **No other context (e.g., chat messages) is included.**
    *   The first N characters (e.g., N=500, needs tuning) of the resulting Markdown string are extracted.
    *   Minimal cleaning is applied: remove excessive newlines, maybe basic Markdown syntax like `#`, `*`, etc., if they interfere with title generation. We need just the core text content.
3.  **Agent Interaction:**
    *   The extracted **editor content snippet** is sent to a dedicated "Title Generation" agent/endpoint.
    *   The agent processes the text and returns a suggested title (e.g., a concise string of 5-15 words).
4.  **Title Update:**
    *   The frontend receives the suggested title from the agent.
    *   It updates the document's title state (e.g., in the Zustand store or component state).
    *   This update should automatically reflect in the UI where the title is displayed.
5.  **Autosave Integration:**
    *   The change in the document's title must be treated as a content modification.
    *   This modification should trigger the existing autosave mechanism, ensuring the new title is persisted alongside other document changes.

## 4. Agent Design (Option 1: Dedicated Agent)

-   **Input:** A string containing the first N characters of the **document's editor content (Markdown format)**.
-   **Processing:**
    *   Utilize a language model (e.g., via the AI SDK) prompted specifically for title generation based *only* on the provided text snippet.
    *   Prompt Example: "Generate a concise and relevant title (max 15 words) for a document starting with the following text: [TEXT SNIPPET]"
-   **Output:** A string containing the generated title.
-   **Endpoint:** A new API route (e.g., `/api/generate-title`) will host this agent logic.

## 5. Implementation Details & Code Changes

*(Note: Specific file paths and component names are placeholders and need verification)*

### Frontend (`app/editor/[documentId]/page.tsx`)

1.  **Add Button:**
    *   Introduce a new `<button>` (likely using an icon like `Sparkles` or similar) next to the `<Edit size={16} />` button within the `Title Bar` section (around line 1348).
    *   Attach an `onClick` handler (`handleInferTitle`).
    *   Consider adding `isLoading` state for this button.
2.  **`handleInferTitle` Function:**
    *   Get editor instance: `const editor = editorRef.current;`
    *   Check if editor exists: `if (!editor) { toast.error("Editor not ready."); return; }`
    *   Get blocks: `const blocks = editor.document;`
    *   Convert to Markdown: `const markdown = await editor.blocksToMarkdownLossy(blocks);`
    *   Extract snippet: `const snippet = markdown.substring(0, 500);` // Adjust length as needed
    *   **(Optional) Clean snippet:** Implement basic regex or string replacements if necessary.
    *   **(Add Loading State):** `setIsInferringTitle(true);`
    *   Call API: `const response = await fetch('/api/generate-title', { method: 'POST', body: JSON.stringify({ content: snippet }) });`
    *   Handle response: Check `response.ok`. `const { title } = await response.json();`
    *   **Update State:** Call `handleSaveTitle(title)` directly to reuse existing title save logic and UI updates. This function handles the API call to update the name and updates the `documentData` state.
    *   **(Handle Errors/Loading):** Add `try...catch...finally` block. `setIsInferringTitle(false)` in `finally`. Show toasts on error.

### Backend (`app/api/generate-title/route.ts`)

1.  **Create API Route:** Set up a new Next.js API route.
2.  **Handler Logic:**
    *   Parse the `content` snippet from the request body.
    *   Instantiate the AI SDK core or necessary model client.
    *   Use `generateText` or similar function with the appropriate model and prompt (see Agent Design).
    *   Return the generated title in the JSON response.

### State Management (`app/editor/[documentId]/page.tsx`)

1.  **Title State:** The document title is managed within the `documentData` state variable in the `EditorPage` component. The `handleSaveTitle` function already handles updating this state optimistically and via API call.
2.  **Ensure Title Update Triggers Autosave:**
    *   **Problem:** The current autosave logic in `handleEditorChange` is *only* triggered by changes within the BlockNote editor content itself. Calling `handleSaveTitle` (which updates `documentData.name` via API) will *not* trigger the existing content autosave mechanism.
    *   **Solution:** Since changing the title *is* saving the title (via `handleSaveTitle`), we don't need to trigger the *content* autosave mechanism for this specific action. The title change is persisted independently by `handleSaveTitle` calling the `/api/documents/[documentId]` endpoint.
    *   **Verification:** Confirm that no separate "unsaved changes" indication specific to the *title* is needed beyond the standard editor content autosave status, as the title save happens immediately upon confirmation. The "Infer Title" action followed by the user confirming the save (implicitly handled by `handleSaveTitle`) completes the title update persistence. We *do not* need to modify the `handleEditorChange` or `triggerSaveDocument` functions for this feature.

## 6. Considerations

-   **Character Limit (N):** Experiment to find the optimal number of characters (e.g., 300, 500, 1000) to send to the agent for good results without excessive payload.
-   **Snippet Cleaning:** Determine if cleaning the Markdown snippet is necessary or if the LLM handles raw Markdown well enough. Consider removing frontmatter or excessive newlines.
-   **Agent Performance:** Ensure the title generation agent is reasonably fast (< 2-3 seconds) to avoid noticeable delay for the user. Implement a loading state on the button.
-   **Error Handling:** Implement robust handling for the `/api/generate-title` fetch call (network issues, agent failures). Display a user-friendly toast message if title generation fails.
-   **Button State:** Add `isInferringTitle` state to manage the loading indicator on the "Infer Title" button.
-   **Autosave Interaction:** Confirmed: Title saving is separate from content autosave. The `handleSaveTitle` function handles persisting the title update. No changes needed to the content autosave logic (`handleEditorChange`).
-   **Alternative to Agent:** Could potentially use a simpler client-side library or a less complex model if a full agent feels like overkill, but the agent approach offers more flexibility and power.

## 7. Open Questions

-   Exact UI placement and **Icon** for the "Infer Title" button? (Suggest `Sparkles` or similar).
-   Final character limit (N) for the snippet? (Start with 500).
-   Specific cleaning rules for the snippet? (Start with none, see if needed).
-   ~~Confirm the exact state management logic needed to trigger autosave upon title change.~~ (Resolved: Title save is independent of content autosave). 