# Inline AI Feature Implementation Plan

This document outlines the steps required to implement an "Ask AI" button within the BlockNote editor, allowing users to leverage AI for content generation based on selected text. The implementation will follow the approach described in the [BlockNote AI Button article](https://dev.to/mrsupercraft/extending-the-blocknote-editor-a-custom-formatting-bar-with-ai-powered-features-fh5).

## API Design Rationale

A dedicated API endpoint (`/api/ai`) is used for this feature instead of the existing chat API (`/api/chat`) for the following reasons:

*   **Different Purpose:** The inline AI button focuses on direct *text transformation* (summarize, expand, etc.) of the selected content, expecting raw, formatted output (like Markdown) suitable for immediate replacement in the editor. The chat API is designed for *conversation*, returning structured chat messages.
*   **Direct Manipulation UX:** The desired user experience is a seamless "select -> click -> replace" workflow within the editor. A dedicated API allows the frontend component (`AIButton.tsx`) to directly receive the transformed text and update the editor without intermediate steps in the chat UI.
*   **API Specialization:** The `/api/ai` endpoint can be optimized specifically for text manipulation tasks, potentially using different prompting strategies than the conversational `/api/chat` endpoint.

## Core Steps

1.  **Create the AI Button Component (`AIButton.tsx`):**
    *   Create a new React component file at `app/editor/components/AIButton.tsx` (create the `components` directory if it doesn't exist).
    *   Use `useBlockNoteEditor` hook to get access to the editor instance.
    *   Use `useComponentsContext` to access BlockNote's built-in UI components (like `FormattingToolbar.Button`).
    *   Implement state management for loading indicators (`isLoading`).
    *   Define the main function (`callAI`) triggered on button click:
        *   Set `isLoading` to true.
        *   Get the selected text using `editor.getSelectedText()`.
        *   **Get the full document content using `editor.document`.**
        *   If text is selected, make a POST request to the dedicated AI API endpoint (`/api/ai`). Send:
            *   `prompt`: The selected text.
            *   `documentContext`: The full editor content (`editor.document`, likely serialized to JSON).
        *   Handle potential errors during the API call.
        *   Call `handleAIResponse` with the received content.
        *   Set `isLoading` to false in a `finally` block.
    *   Define the response handler function (`handleAIResponse`):
        *   Accept the AI-generated content (string, likely Markdown).
        *   Get the currently selected blocks using `editor.getSelection()?.blocks`.
        *   Parse the AI-generated Markdown content into BlockNote blocks using `editor.tryParseMarkdownToBlocks(content)`.
        *   Replace the original selected blocks with the newly parsed blocks using `editor.replaceBlocks(originalBlocks, newBlocks)`.
        *   **After successful replacement, trigger the chat logging mechanism (see Step 4).**
    *   Render the button using `Components.FormattingToolbar.Button`, including:
        *   A tooltip (e.g., "AI Assistant" when idle, "Processing..." when loading).
        *   The `onClick` handler pointing to `callAI`.
        *   The `isDisabled` prop set to `isLoading`. (Button is disabled while processing).
        *   An AI/Sparkles icon inside the button.

2.  **Integrate the `AIButton` into the Formatting Toolbar:**
    *   Modify the `Editor` component located in `app/editor/[documentId]/page.tsx`.
    *   Ensure the `formattingToolbar` prop on `BlockNoteView` is set to `false`.
    *   Wrap `BlockNoteView` with `FormattingToolbarController`.
    *   Pass a function to the `formattingToolbar` prop of `FormattingToolbarController`.
    *   Inside this function, render the `<FormattingToolbar>` component.
    *   Import the `AIButton` component (e.g., `import { AIButton } from '../components/AIButton';`).
    *   Include the custom `<AIButton key={"aiButton"} />` alongside other desired toolbar buttons (e.g., `BlockTypeSelect`, `BasicTextStyleButton`, etc.).
    *   Conditionally render the `AIButton` based on whether the editor is editable (`editable && <AIButton ... />`).

3.  **Create the Backend API Endpoint (`/api/ai/route.ts`):**
    *   Set up a Next.js API route by creating the file `app/api/ai/route.ts` (or `.js`).
    *   This endpoint should accept POST requests.
    *   Parse the incoming JSON body to extract:
        *   `prompt`: The selected text.
        *   `documentContext`: The full editor content (array of `Block` objects or JSON representation).
    *   Implement the logic to call the chosen AI/ML service. **Construct the prompt for the AI model using both the `prompt` (selected text) and the `documentContext` to provide context.**
    *   Receive the response from the AI service.
    *   Format the response into a JSON object containing the generated content, e.g., `{ "content": "Generated text..." }`.
    *   Return this JSON response to the frontend.

4.  **Log Interaction to Chat and Database:**
    *   Implement a mechanism (e.g., a function called from `handleAIResponse` in `AIButton.tsx`) to log the successful inline AI interaction.
    *   This mechanism should:
        *   Construct a chat message indicating that an inline edit occurred (e.g., "AI modified the selected text."). Consider including the original prompt or a reference.
        *   Send this message data to the backend (likely via the existing `/api/chat` endpoint or a dedicated logging endpoint if preferred).
        *   The backend service responsible for handling this log request must:
            *   Store the new message and its associated metadata (user ID, document ID, timestamp, type='inline-ai-edit', etc.) in the `messages` database table.
            *   Broadcast the new message to connected clients so it appears in the chat UI.

## Potential Enhancements (Future Considerations)

*   **Streaming Responses:** For longer generations from `/api/ai`, stream the response back to the editor for a better UX.
*   **Error Handling:** Provide more specific user feedback on `/api/ai` errors, potentially logging errors to the chat as well.
*   **Model Selection:** Allow users to choose different AI models or modes (e.g., summarize, expand, fix grammar) via the AI Button or context menu.
*   **Confirmation/Diffing:** Before replacing text, show a diff view and require user confirmation. Add options to accept, reject, or retry. Log the user's choice (accept/reject) in the chat/DB.
*   **UI/UX:**
    *   Highlight the AI-generated content temporarily after insertion.
    *   Provide clearer visual cues during the loading state (e.g., a subtle spinner *next* to the button, or changing the button's appearance slightly without changing the icon).
*   **Chat Log Content:** Enhance the logged chat message with more details, like the specific AI action taken (summarize, expand) or a diff view link. 