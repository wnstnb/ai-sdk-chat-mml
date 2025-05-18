# Feature: Copy Content to Clipboard

## 1. Overview

This document outlines the implementation of a "Copy Content" button within the `EditorTitleBar.tsx` component. This feature will allow users to easily copy the entire content of the BlockNote editor to their clipboard, formatted as Markdown.

## 2. User Story

*   **As a user, I want a button to copy the editor's content so that I can easily paste it into other applications or documents.**

## 3. Acceptance Criteria

*   A "Copy Content" button is visible in the editor's title bar.
*   The button utilizes a clear and intuitive icon (e.g., a copy or clipboard icon).
*   Clicking the button retrieves the current content from the BlockNote editor.
*   The retrieved content is converted to Markdown format.
*   The Markdown content is copied to the user's clipboard.
*   A visual confirmation (e.g., button icon/text change, tooltip) is displayed upon successful copy.
*   The copy action is disabled if the editor is empty or if the editor instance is not available.
*   If the copy operation fails (e.g., browser permission issues), an error is logged to the console, and optionally, the user is notified.

## 4. Proposed Implementation

### 4.1. Component: `components/editor/EditorTitleBar.tsx`

#### 4.1.1. State Management

*   Add a new state variable to manage the visual feedback for the copy action:
    ```typescript
    const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied' | 'error'>('idle');
    ```

#### 4.1.2. Handler Function: `handleCopyContent`

*   This asynchronous function will be responsible for the copy logic.
    ```typescript
    const handleCopyContent = async () => {
        if (!editorRef.current || editorRef.current.document.length === 0) {
            console.warn('Editor is empty or not available.');
            // Optionally set an error status or provide user feedback
            return;
        }

        try {
            const editor = editorRef.current;
            const markdown = await editor.blocksToMarkdownLossy(editor.document);

            if (markdown.trim() === '') {
                console.warn('Editor content is effectively empty after Markdown conversion.');
                // Optionally notify user that there's nothing to copy
                setCopyStatus('idle'); // Or a specific 'empty' status if needed
                return;
            }

            await navigator.clipboard.writeText(markdown);
            setCopyStatus('copied');
            // Revert status after a short delay
            setTimeout(() => setCopyStatus('idle'), 2000);
        } catch (err) {
            console.error('Failed to copy content to clipboard:', err);
            setCopyStatus('error');
            // Optionally, show a toast notification for the error
            setTimeout(() => setCopyStatus('idle'), 2000); // Reset error status
        }
    };
    ```

#### 4.1.3. New Props

*   The `EditorTitleBarProps` interface will not require new props for this specific functionality as `editorRef` is already available.

#### 4.1.4. JSX Changes

*   Add a new button to the title bar, likely positioned near other action buttons like "Save Document Manually" or "Create New Document".
*   Use an icon from `lucide-react`, for example, `ClipboardCopy` or `Copy`.
*   The button's appearance or icon can change based on the `copyStatus`.

```tsx
// Example placement within the button group:
// ... (existing buttons)
<button
    onClick={handleCopyContent}
    disabled={!editorRef.current || editorRef.current.document.length === 0 || copyStatus === 'copied'}
    className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed"
    title={copyStatus === 'copied' ? "Content Copied!" : "Copy Document Content to Clipboard"}
>
    {copyStatus === 'copied' ? (
        <CheckCircle size={20} className="text-green-500" />
    ) : (
        <ClipboardCopy size={20} />
    )}
</button>
// ... (existing buttons like Version History)
```
*   Ensure `ClipboardCopy` and `CheckCircle` (or chosen icons) are imported from `lucide-react`.

```typescript
import { Edit, Save, X, Sparkles, Clock, ClipboardCopy, CheckCircle } from 'lucide-react'; // Add ClipboardCopy, CheckCircle
```

### 4.2. Iconography

*   **Primary Icon:** `ClipboardCopy` from `lucide-react`.
*   **Success Icon:** `CheckCircle` from `lucide-react` (or similar) to indicate successful copy.

### 4.3. Error Handling

*   Clipboard API errors (`navigator.clipboard.writeText`) will be caught.
*   Errors will be logged to the console.
*   The `copyStatus` state will be updated to 'error'.
*   User-facing feedback for copy errors will primarily be a visual cue on the button itself (e.g., changing the icon to an error icon and updating the tooltip/title), driven by the `copyStatus` state. This aligns with the proposed JSX changes in section 4.1.4.

## 5. Dependencies

*   `lucide-react`: Already a dependency, ensure the chosen icons are imported.
*   `@blocknote/core`: The `editorRef.current.blocksToMarkdownLossy` method is provided by this.

## 6. Open Questions & Considerations

*   **Markdown Flavor:** `blocksToMarkdownLossy` is used. Confirm if this specific flavor and its "lossy" nature are acceptable for all use cases of copied content. For general pasting, it's likely fine.
*   **Image Handling:** The current approach copies images as Markdown links (e.g., `![alt text](image_url)`). The actual image data is not copied directly to the clipboard. Pasting will depend on the destination application's ability to render Markdown and access the image URL. This behavior should be confirmed and documented if it's a key concern.
*   **Browser Compatibility/Permissions:** The `navigator.clipboard.writeText()` API is widely supported in modern browsers but requires user permission (often granted automatically for user-initiated events in a secure context) or for the page to be in focus. Test across target browsers.
*   **Empty Editor State:** The button should ideally be disabled if `editorRef.current.document.length === 0`. This is included in the `disabled` condition.
*   **Large Content:** Performance of `blocksToMarkdownLossy` and clipboard write for very large documents. Generally, this should be performant enough for typical document sizes.
*   **User Feedback for Errors:** Decide on the final user-facing feedback for copy errors (e.g., only console, or a toast message). The current proposal includes setting `copyStatus` to 'error', which can be tied to a visual cue on the button itself.

## 7. Future Enhancements (Optional)

*   Allow copying content in different formats (e.g., plain text, HTML).
*   Provide more detailed feedback via toast notifications for success and failure.

## 8. Detailed Implementation Steps

This section provides a precise, step-by-step guide for a developer to implement the "Copy Content to Clipboard (Markdown)" feature within the `components/editor/EditorTitleBar.tsx` file.

**File to Modify:** `components/editor/EditorTitleBar.tsx`

**Step 1: Import Necessary Icons and React Hook**

1.  Locate the import statement for `lucide-react` at the top of the file.
2.  Add `ClipboardCopy` and `CheckCircle` to the list of imported icons.
    *   **Current:** `import { Edit, Save, X, Sparkles, Clock } from 'lucide-react';`
    *   **Change to:** `import { Edit, Save, X, Sparkles, Clock, ClipboardCopy, CheckCircle } from 'lucide-react';`
3.  Ensure `React` is imported if not already, specifically for `useState`.
    *   **If not present, add:** `import React, { useState } from 'react';` (or add `useState` if `React` is already default imported).

**Step 2: Add State for Copy Status**

1.  Inside the `EditorTitleBar` functional component, before the `return` statement, add a new state variable to manage the copy button's status.
    ```typescript
    const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied' | 'error'>('idle');
    ```

**Step 3: Implement the `handleCopyContent` Function**

1.  Still inside the `EditorTitleBar` component, define the asynchronous `handleCopyContent` function. This function will contain the logic for getting editor content as Markdown and copying it to the clipboard.
    ```typescript
    const handleCopyContent = async () => {
        if (!editorRef.current || editorRef.current.document.length === 0) {
            console.warn('Editor is empty or not available for copy.');
            setCopyStatus('error'); // Briefly show error if trying to copy empty
            setTimeout(() => setCopyStatus('idle'), 2000);
            return;
        }

        try {
            const editor = editorRef.current;
            const markdown = await editor.blocksToMarkdownLossy(editor.document);

            if (markdown.trim() === '') {
                console.warn('Editor content is effectively empty after Markdown conversion.');
                setCopyStatus('error'); // Treat as an error or neutral if preferred
                setTimeout(() => setCopyStatus('idle'), 2000);
                return;
            }

            await navigator.clipboard.writeText(markdown);
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000); // Revert to idle after 2 seconds
        } catch (err) {
            console.error('Failed to copy content to clipboard:', err);
            setCopyStatus('error');
            setTimeout(() => setCopyStatus('idle'), 2000); // Revert to idle after 2 seconds
        }
    };
    ```

**Step 4: Add the "Copy Content" Button to the JSX**

1.  Locate the `div` with `className="flex items-center space-x-2 flex-shrink-0"`. This is where the action buttons like "Save Document Manually" and "Version History" reside.
2.  Insert the new button within this `div`. A good placement would be before the "Version History" button or after the "Save Document Manually" button. For this example, let's place it before the "Version History" button.
    ```tsx
    // ... (other buttons like AutosaveStatusIndicator, New Document, Save Document Manually)

    <button 
        onClick={handleSaveContent} 
        disabled={isSaving || autosaveStatus === 'saving'} 
        className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed" 
        title="Save Document Manually"
    >
       {isSaving ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ArrowDownTrayIcon className="h-5 w-5" />}
    </button>

    {/* NEW "COPY CONTENT" BUTTON - START */}
    <button
        onClick={handleCopyContent}
        disabled={!editorRef.current || editorRef.current.document.length === 0 || copyStatus === 'copied' || copyStatus === 'error'}
        className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed"
        title={
            copyStatus === 'copied' ? "Content Copied to Clipboard!" :
            copyStatus === 'error' ? "Failed to copy content" :
            "Copy Document Content (Markdown)"
        }
    >
        {copyStatus === 'copied' ? (
            <CheckCircle size={20} className="text-green-500" />
        ) : copyStatus === 'error' ? (
            <X size={20} className="text-red-500" /> // Assuming X is already imported for title cancel, or use another error icon like AlertTriangle
        ) : (
            <ClipboardCopy size={20} />
        )}
    </button>
    {/* NEW "COPY CONTENT" BUTTON - END */}

    <button onClick={onOpenHistory} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded" title="Version History">
        <Clock size={20} />
    </button>
    ```
3.  **Note on Error Icon:** The example above uses `<X size={20} className="text-red-500" />` for the error state, assuming `X` is already imported (it is, for the title editing). If you prefer a different error icon (e.g., `AlertTriangle` from `lucide-react`), ensure it's imported in Step 1 and used here instead.

**Step 5: Verify Props**

1.  The `editorRef` prop is already part of `EditorTitleBarProps` and is used by this feature. No new props need to be added to the interface for this specific functionality.

**Step 6: Testing Considerations (Reminder from Section 6)**

*   Test with an empty editor (button should be disabled or show an error briefly if clicked).
*   Test with content in the editor (successful copy, icon changes to `CheckCircle`, then back).
*   Simulate a clipboard write error if possible (though hard to do reliably) or check console for errors from `navigator.clipboard.writeText`.
*   Verify Markdown output by pasting into a text editor or Markdown previewer.
*   Confirm behavior across different browsers if feasible.
*   Check image representation in the copied Markdown (should be `![alt](url)`).

This concludes the detailed steps for implementing the Markdown copy feature.
``` 