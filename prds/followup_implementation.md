# Follow Up Feature Implementation

## Overview

This document outlines the implementation details for the "Add for Follow Up" feature. This feature allows users to highlight text within the editor and attach it to the chat input as context for their next query.

## Feature Requirements

1.  **Highlight Trigger:** When a user selects text within the editor interface.
2.  **Formatting Toolbar:** A formatting toolbar should appear upon text selection.
3.  **Custom Button:** The toolbar must include a button labeled "Add for Follow Up".
4.  **Text Extraction:** Clicking the button extracts the currently highlighted text content.
5.  **Chat Input Attachment:** The extracted text is visually attached to the chat input field, indicating it will be used as context.
6.  **Contextual Query:** When the user sends their message, the attached text is included as contextual information alongside the user's typed query.

## Implementation Details

### Frontend (Editor Integration)

1.  **Text Selection Listener:** Implement using the editor's `onSelectionChange` callback. This callback can be used to determine *if* a selection exists to potentially show/hide the toolbar, but the text itself will be fetched on button click.
    *   Alternatively, the toolbar could always be visible when the editor has focus, and the button is simply enabled when `editor.getSelectedText()` returns a non-empty string.
2.  **Formatting Toolbar:**
    *   Modify the existing formatting toolbar logic or create a new one that appears near the selected text. Consider using BlockNote's `FormattingToolbar` component if applicable, or building a custom one.
3.  **"Add for Follow Up" Button:**
    *   Add a new button component to the formatting toolbar.
    *   Style the button appropriately.
    *   Attach an `onClick` event handler to this button.
4.  **Button Action:**
    *   The `onClick` handler should:
        *   Retrieve the currently selected text string using `editor.getSelectedText()`. ([Ref: BlockNote Docs](https://www.blocknotejs.org/docs/editor-api/manipulating-inline-content#accessing-selected-text))
        *   If the returned text is not empty, call a function (likely from a shared state management context) to pass this text to the chat input component.
        *   Optionally, provide visual feedback (e.g., briefly highlight the button, close the toolbar).

### Frontend (Chat Input Integration)

1.  **State Management:** Introduce a state variable (e.g., `followUpContext`) in a shared state management store (e.g., Zustand, React Context) accessible by both the editor and chat components to hold the text attached for follow-up.
2.  **Attach Mechanism:**
    *   Create a function (e.g., `attachFollowUpContext(text: string)`) that updates the `followUpContext` state with the text received from the editor button click.
3.  **UI Display:**
    *   Modify the chat input component's UI.
    *   When `followUpContext` is not empty, display a visual element (similar to the quote display in the screenshot) above or adjacent to the input field, showing the attached text.
    *   **Truncation:** If the attached text is long, truncate it visually to a maximum of 2 lines, potentially with an indicator that more text is included.
    *   Include a way to remove/clear the attached context (e.g., an 'X' button).
4.  **Message Sending:**
    *   Modify the message sending logic (`handleSend` or similar).
    *   When a message is sent, check if `followUpContext` has content.
    *   If it does, **prepend** the *full* `followUpContext` text to the user's typed message before sending it to the backend/LLM API.
    *   Clear the `followUpContext` state after the message is successfully sent.

### Backend/Orchestration (If Applicable)

1.  **API Modification:** If the context needs to be explicitly passed to the backend or LLM API, modify the API request structure to include an optional `followUpContext` field.
2.  **Context Handling:** Ensure the backend/orchestrator correctly receives and utilizes this context when processing the user's query, potentially prepending it to the main prompt or handling it as metadata.

## Considerations

*   **Editor Compatibility:** Ensure the implementation is compatible with BlockNote. Using `editor.getSelectedText()` simplifies retrieving the selected content.
*   **UI/UX:** Design the toolbar and the attached context display clearly. Handle the specified 2-line truncation gracefully.
*   **State Management:** Given the likely separation of Editor and Chat components (based on `app/` structure), implementing a shared state solution (Context API, Zustand, etc.) is recommended over prop drilling.
*   **Multiple Selections:** Decide on the behavior if the user highlights new text and clicks the button again while context is already attached (replace, append, disallow?). Replacing seems most intuitive.

## Implementation Steps

1.  **Setup Shared State:**
    *   Choose and set up a state management solution (e.g., Zustand or React Context) accessible by both the Editor component (`app/editor/...`) and the Chat Input component (wherever it resides, possibly `app/page.tsx` or a child component).
    *   Define a state slice or context value to hold the `followUpContext: string | null` and an action/function `setFollowUpContext(text: string | null)`.

2.  **Editor Component Modifications:**
    *   Identify the BlockNote editor instance.
    *   **Add "Add for Follow Up" Button:**
        *   Integrate a new button ("Add for Follow Up") into the editor's UI. This might involve modifying an existing formatting toolbar or creating a custom floating toolbar triggered by selection.
        *   The button's visibility/enabled state could be linked to `editor.getSelectedText().length > 0` or an `onSelectionChange` listener.
    *   **Implement Button Logic:**
        *   Attach an `onClick` handler to the new button.
        *   Inside the handler, call `const selectedText = editor.getSelectedText();`.
        *   If `selectedText` is not empty, call the shared state function `setFollowUpContext(selectedText)`.
        *   Optionally, add visual feedback (e.g., close toolbar, brief button highlight).

3.  **Chat Input Component Modifications:**
    *   Connect the component to the shared state to access `followUpContext` and `setFollowUpContext`.
    *   **Display Attached Context:**
        *   Conditionally render a UI element (e.g., a styled `div` or similar) when `followUpContext` is not `null`.
        *   Display the `followUpContext` text within this element, applying CSS for 2-line truncation (e.g., using `-webkit-line-clamp`).
        *   Add an 'X' button within or next to this element.
    *   **Implement Clear Context Logic:**
        *   Add an `onClick` handler to the 'X' button that calls `setFollowUpContext(null)`.
    *   **Modify Message Sending Logic:**
        *   Locate the function responsible for sending messages (e.g., `handleSend`).
        *   Before sending, check if `followUpContext` is not `null`.
        *   If it exists, construct the final message payload as `followUpContext + "\n\n" + userTypedMessage` (or similar formatting).
        *   After the message is successfully sent (or prepared for sending), call `setFollowUpContext(null)` to clear the context.

4.  **Styling:**
    *   Apply appropriate CSS styles to the new button, the context display element, and the truncation effect.

5.  **Testing:**
    *   Test text selection and button clicking.
    *   Verify context attachment and display in the chat input.
    *   Test context clearing using the 'X' button.
    *   Confirm context is correctly prepended to sent messages.
    *   Test edge cases (empty selection, long text for truncation, sending messages without context). 