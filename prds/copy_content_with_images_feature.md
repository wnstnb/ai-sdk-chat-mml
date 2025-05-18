# Feature: Copy Content with Embedded Images to Clipboard

## 1. Overview

This document outlines the implementation of a "Copy Content with Embedded Images" button. This feature aims to allow users to copy the editor's content, including text and actual image data (not just links), to the system clipboard. This enables pasting rich content into other applications like word processors or email clients with images preserved.

This is an advanced alternative or enhancement to the simpler "Copy Content as Markdown" feature.

## 2. User Story

*   **As a user, I want a button to copy the editor's content, including embedded images, so that I can easily paste it into other applications with full fidelity.**

## 3. Acceptance Criteria

*   A "Copy Content with Images" button is available in the editor's title bar (or as an option alongside the Markdown copy).
*   Clicking the button retrieves the current content from the BlockNote editor.
*   The content is converted into an HTML representation.
*   Images within the content are fetched (if they are URLs) and converted into `data:` URIs.
*   These `data:` URIs are embedded into the `<img>` tags' `src` attributes within the HTML.
*   The resulting HTML (with embedded images) is copied to the user's clipboard using `navigator.clipboard.write()`.
*   Users can successfully paste the content, including visible images, into rich text editors (e.g., Google Docs, Microsoft Word, email clients).
*   A visual confirmation is displayed upon successful copy.
*   The button is appropriately disabled if the editor is empty or the operation is in progress.
*   Appropriate error handling and user feedback are provided for failures (e.g., image fetch errors, clipboard API errors).

## 4. Challenges and Complexities

*   **Image Data Fetching:** Images referenced by URLs need to be fetched asynchronously. This can involve network latency and potential CORS (Cross-Origin Resource Sharing) issues if images are hosted on different domains without permissive headers.
*   **Data URI Conversion:** Fetched images must be converted to `Blob`s and then to base64 `data:` URIs. This adds processing overhead.
*   **HTML Generation:** BlockNote's `blocksToHTMLLossy()` or `blocksToFullHTML()` will be used. The "lossy" version might be simpler but could lose some BlockNote-specific formatting. `blocksToFullHTML` might require careful handling of styles if the intent is purely for clipboard data.
*   **DOM Manipulation (Potentially):** Modifying the HTML string to replace `src` attributes with `data:` URIs needs to be done carefully. Using the browser's DOM parser (`DOMParser`) and `XMLSerializer` is safer than regex for this.
*   **Clipboard API (`navigator.clipboard.write`):** Requires creating a `ClipboardItem` with a `Blob` of type `text/html`.
*   **Performance:** Fetching and converting multiple large images can be slow and memory-intensive.
*   **Security:** Embedding external content as `data:` URIs has some security implications, though generally manageable for a copy-paste operation initiated by the user.
*   **Fallback:** Consider what happens if an image fails to fetch or convert.

## 5. Proposed Implementation

### 5.1. Component: `components/editor/EditorTitleBar.tsx` (or a new component/menu)

#### 5.1.1. State Management
    ```typescript
    const [richCopyStatus, setRichCopyStatus] = React.useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
    const [richCopyError, setRichCopyError] = React.useState<string | null>(null);
    ```

#### 5.1.2. Helper Function: `imageToDataURI`
    ```typescript
    const imageToDataURI = async (url: string): Promise<string> => {
        const response = await fetch(url); // Consider CORS: may need `mode: 'cors'` or server-side proxy for external images
        if (!response.ok) {
            throw new Error(`Failed to fetch image ${url}: ${response.statusText}`);
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };
    ```

#### 5.1.3. Handler Function: `handleRichCopyContent`
    ```typescript
    const handleRichCopyContent = async () => {
        if (!editorRef.current || editorRef.current.document.length === 0) {
            console.warn('Editor is empty or not available.');
            return;
        }

        setRichCopyStatus('copying');
        setRichCopyError(null);

        try {
            const editor = editorRef.current;
            // Option 1: Lossy HTML (simpler, might lose some formatting)
            let htmlContent = await editor.blocksToHTMLLossy(editor.document);
            // Option 2: Full HTML (more fidelity, but includes all BlockNote styles - may or may not be desired for clipboard)
            // let htmlContent = await editor.blocksToFullHTML(editor.document);

            // Parse the HTML to manipulate it safely
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            const images = Array.from(doc.getElementsByTagName('img'));
            const imagePromises = [];

            for (const img of images) {
                const originalSrc = img.getAttribute('src');
                if (originalSrc && !originalSrc.startsWith('data:')) {
                    imagePromises.push(
                        imageToDataURI(originalSrc)
                            .then(dataURI => {
                                img.setAttribute('src', dataURI);
                            })
                            .catch(err => {
                                console.warn(`Failed to convert image ${originalSrc} to data URI:`, err);
                                // Optionally, leave the original src, or remove the image, or use a placeholder
                                // For now, we'll leave the original src on error
                            })
                    );
                }
            }

            await Promise.all(imagePromises); // Wait for all images to be processed

            const serializer = new XMLSerializer();
            const finalHtml = serializer.serializeToString(doc.body); // Or doc.documentElement.outerHTML if full structure needed

            const htmlBlob = new Blob([finalHtml], { type: 'text/html' });
            const clipboardItem = new ClipboardItem({ 'text/html': htmlBlob });

            await navigator.clipboard.write([clipboardItem]);
            
            setRichCopyStatus('copied');
            setTimeout(() => setRichCopyStatus('idle'), 2500);

        } catch (err: any) {
            console.error('Failed to copy rich content to clipboard:', err);
            setRichCopyError(err.message || 'An unknown error occurred.');
            setRichCopyStatus('error');
            setTimeout(() => setRichCopyStatus('idle'), 3000);
        }
    };
    ```

#### 5.1.4. JSX Changes
*   A new button, potentially with a different icon (e.g., `ClipboardSignature` or `CopyCheck`) to differentiate from plain text/Markdown copy.
*   Tooltip indicating "Copy with Images".
*   Visual feedback for `richCopyStatus` (loading, success, error).

```tsx
// Example button
import { ClipboardSignature, CheckCircle, AlertTriangle } from 'lucide-react'; // Example icons

// In the component:
<button
    onClick={handleRichCopyContent}
    disabled={!editorRef.current || editorRef.current.document.length === 0 || richCopyStatus === 'copying' || richCopyStatus === 'copied'}
    className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed relative"
    title={
        richCopyStatus === 'copied' ? "Content & Images Copied!" :
        richCopyStatus === 'error' ? `Error: ${richCopyError}` :
        "Copy Content with Images"
    }
>
    {richCopyStatus === 'copying' && <svg className="animate-spin h-5 w-5 absolute inset-0 m-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
    {richCopyStatus === 'copied' && <CheckCircle size={20} className="text-green-500" />}
    {richCopyStatus === 'error' && <AlertTriangle size={20} className="text-red-500" />}
    {(richCopyStatus === 'idle' || richCopyStatus === 'copying') && <ClipboardSignature size={20} className={richCopyStatus === 'copying' ? 'opacity-0' : ''} />}
</button>
```

### 5.2. Dependencies
*   Relies on browser APIs: `fetch`, `DOMParser`, `XMLSerializer`, `FileReader`, `Blob`, `ClipboardItem`, `navigator.clipboard.write`. No new external libraries are strictly needed for the core logic.

## 6. Key Considerations & Open Questions

*   **Choice of HTML Conversion:** `blocksToHTMLLossy()` vs `blocksToFullHTML()`. `blocksToHTMLLossy` is likely better for clipboard interoperability as `blocksToFullHTML` includes BlockNote-specific classes and structure for rendering, which might not be ideal for pasting into other apps. This needs testing.
*   **CORS for Images:** Fetching images from external domains will fail if CORS headers are not permissive. A server-side proxy might be needed as a workaround for arbitrary image URLs, which significantly increases complexity. For images uploaded to the application's own storage, this should be fine.
*   **Error Handling for Individual Images:** What if one image fails to load/convert? The current proposal logs a warning and leaves the original `src`. Alternative: skip the image, use a placeholder, or fail the whole copy operation.
*   **Performance and UI:** For documents with many large images, the process could be slow. UI should indicate "copying" state. Consider a timeout or cancellation mechanism for very long operations (advanced).
*   **Max Clipboard Size / Data URI Length:** Browsers might have limits on the total size of data that can be put on the clipboard or the length of `data:` URIs. This could be an issue for documents with extremely large or numerous images.
*   **Security of `data:` URIs:** While generally safe for user-initiated copy-paste from a trusted source (the editor itself), be mindful that `data:` URIs can execute JavaScript in some contexts if the HTML is improperly sanitized *by the pasting application*. This is more of a concern for the application *receiving* the paste.
*   **Local/Non-Uploaded Images:** How are images handled that are dragged into the editor but not yet uploaded (i.e., their `src` might be a local blob URL like `blob:http://...`)? `fetch` might work for these blob URLs within the same origin, but this needs verification.
*   **User Experience:** A separate button or an option (e.g., in a dropdown menu for "Copy") would be needed to distinguish this from the Markdown copy.

## 7. Future Enhancements (Optional)

*   Option to copy images as linked (original URLs) vs. embedded.
*   Progress indicator for multiple image processing.
*   User notification for images that could not be embedded.
*   Server-side image fetching proxy to bypass CORS issues for external images. 