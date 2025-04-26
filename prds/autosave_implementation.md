# Document Autosave Implementation Plan

This document outlines the plan for implementing an autosave feature for the main document editor (BlockNote) within the `EditorPage`.

## Goals

- Automatically save document changes to the backend database after a period of inactivity.
- Provide visual feedback to the user about the saving status (unsaved changes, saving, saved, error).
- Minimize disruption to the user experience, particularly avoiding editor focus loss.
- Ensure the implementation doesn't interfere with existing editor functionality (loading, AI interactions, manual saves).

## Implementation Steps

This plan outlines the specific steps to implement the autosave feature in `app/editor/[documentId]/page.tsx`.

1.  **Read `EditorPage`:** Read the contents of `app/editor/[documentId]/page.tsx` to understand its current structure before modification.
2.  **Add State & Refs:**
    *   Introduce `useState` for `autosaveTimerId`:
        ```typescript
        const [autosaveTimerId, setAutosaveTimerId] = useState<NodeJS.Timeout | null>(null);
        ```
    *   Introduce `useState` for `autosaveStatus`:
        ```typescript
        const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle');
        ```
    *   Introduce `useRef` for `latestEditorContentRef`:
        ```typescript
        const latestEditorContentRef = useRef<string | null>(null);
        ```
    *   Introduce `useRef` for `latestEditorBlocksRef` (assuming `BlockNoteEditor` type is available):
        ```typescript
        const latestEditorBlocksRef = useRef<BlockNoteEditor['document'] | null>(null);
        ```
3.  **Implement `triggerSaveDocument` Function:**
    *   Create an `async function triggerSaveDocument(content: string, docId: string)`.
    *   Use `fetch` to make a `PUT` request to `/api/documents/${docId}/content`.
    *   Set the request body to `JSON.stringify({ content })`.
    *   Include necessary headers (e.g., `Content-Type: application/json`).
    *   Check `response.ok` and throw an error if the save fails.
4.  **Implement `handleEditorChange` Function:**
    *   Create `handleEditorChange = useCallback((editorContent: BlockNoteEditor['document']) => { ... }, [dependencies])`.
    *   Inside the `useCallback`:
        *   Update `latestEditorBlocksRef.current = editorContent;`.
        *   Update `latestEditorContentRef.current = JSON.stringify(editorContent);` (or the appropriate stringification method for BlockNote).
        *   Set `setAutosaveStatus('unsaved');`.
        *   Clear existing timer: `if (autosaveTimerId) clearTimeout(autosaveTimerId);`.
        *   Set a new timer:
            ```typescript
            const newTimerId = setTimeout(async () => {
              if (!editorRef.current || !documentId || !latestEditorContentRef.current) {
                 setAutosaveTimerId(null); // Clear timer if refs/id are missing
                 return;
              }
              setAutosaveStatus('saving');
              try {
                await triggerSaveDocument(latestEditorContentRef.current, documentId);
                setAutosaveStatus('saved');
                // Set another timer to revert to 'idle'
                const revertTimerId = setTimeout(() => setAutosaveStatus('idle'), 1500);
                // Need a way to track and clear this revertTimerId too! (See step 9)
              } catch (error) {
                console.error("Autosave failed:", error);
                setAutosaveStatus('error');
                // Consider making error sticky until next edit or successful save
              } finally {
                 setAutosaveTimerId(null); // Clear the main timer ID state
              }
            }, 3000); // 3-second debounce
            setAutosaveTimerId(newTimerId);
            ```
    *   Ensure correct `useCallback` dependencies (e.g., `documentId`, `triggerSaveDocument`, `autosaveTimerId`). *Correction: `autosaveTimerId` should NOT be a dependency here, as it would cause the function to change too often.* Dependencies likely: `documentId`, `triggerSaveDocument`.
5.  **Integrate with `BlockNoteEditorComponent`:**
    *   Find `<BlockNoteEditorComponent ... />`.
    *   Pass the handler: `onEditorContentChange={handleEditorChange}` (confirm exact prop name). Requires the editor component to pass its content/document state to this callback.
6.  **Add UI Status Indicator:**
    *   Locate the target element (e.g., near `lucide-square-pen`).
    *   Add conditional JSX:
        ```tsx
        <span aria-live="polite" aria-atomic="true" style={{ marginLeft: '8px' }}>
          {autosaveStatus === 'unsaved' && 'Unsaved changes'}
          {autosaveStatus === 'saving' && 'Saving...'}
          {autosaveStatus === 'saved' && 'Saved'}
          {autosaveStatus === 'error' && <span style={{ color: 'red' }}>Error saving</span> /* Consider aria-live="assertive" for error */}
        </span>
        ```
7.  **Implement `beforeunload` Hook:**
    *   Add `useEffect(() => { ... }, [dependencies])`.
    *   Define `handleBeforeUnload = (event) => { ... }`.
    *   Inside `handleBeforeUnload`:
        *   Check: `if (autosaveStatus === 'unsaved' || autosaveTimerId) { ... }`.
        *   If true:
            *   `if (autosaveTimerId) clearTimeout(autosaveTimerId);`
            *   `if (latestEditorContentRef.current && documentId) { fetch(...) }` using `PUT /api/documents/${documentId}/content`, `body: JSON.stringify({ content: latestEditorContentRef.current })`, and `keepalive: true`. Handle potential errors silently (it's best-effort).
    *   `window.addEventListener('beforeunload', handleBeforeUnload);`
    *   Return cleanup: `() => window.removeEventListener('beforeunload', handleBeforeUnload);`.
    *   Dependencies: `autosaveStatus`, `autosaveTimerId`, `documentId` (and potentially `latestEditorContentRef` if its identity matters, though refs usually don't trigger effects).
8.  **Implement Navigation Handling (Next.js Example):**
    *   Import `useRouter` from `next/navigation` and `useEffect`, `useRef`.
    *   Track current path: `const pathname = usePathname(); const previousPathnameRef = useRef(pathname);`
    *   Add `useEffect(() => { ... }, [pathname, other dependencies])`.
    *   Inside the effect:
        *   Check if navigating *away*: `if (previousPathnameRef.current.startsWith('/editor/') && !pathname.startsWith('/editor/')) { ... }`.
        *   If navigating away and unsaved (`autosaveStatus === 'unsaved' || autosaveTimerId`):
            *   `if (autosaveTimerId) clearTimeout(autosaveTimerId);`
            *   `if (latestEditorContentRef.current && documentId) { triggerSaveDocument(latestEditorContentRef.current, documentId).catch(err => console.error("Save on navigate failed:", err)); }` (Fire-and-forget).
        *   Update ref at the end: `previousPathnameRef.current = pathname;`
    *   Dependencies: `pathname`, `autosaveStatus`, `autosaveTimerId`, `documentId`, `triggerSaveDocument`.
9.  **Implement Unmount Cleanup & Secondary Timer Handling:**
    *   Modify Step 4: The `revertTimerId` needs tracking. Consider adding another state `const [revertTimerId, setRevertTimerId] = useState<NodeJS.Timeout | null>(null);`. Clear it before setting a new one.
    *   Add a main unmount effect:
        ```typescript
        useEffect(() => {
          // Return cleanup function
          return () => {
            if (autosaveTimerId) clearTimeout(autosaveTimerId);
            if (revertTimerId) clearTimeout(revertTimerId); // Clear the revert timer too
          };
        }, [autosaveTimerId, revertTimerId]); // Run cleanup if timers change
        ```
    *   Ensure the `beforeunload` handler also clears the `revertTimerId` if it's active.

## Considerations & Potential Issues

*   **BlockNote API:** Confirm the exact method BlockNote provides for detecting changes (`onEditorContentChange` or equivalent) and accessing content (`editor.document` or equivalent).
*   **Focus Loss:** While the asynchronous/debounced approach minimizes the risk, state changes (`autosaveStatus`) will cause `EditorPage` re-renders. If `BlockNoteEditorComponent` isn't sufficiently memoized or handles re-renders poorly, focus loss *could* still occur. Test thoroughly. If focus loss occurs, investigate `React.memo` for `BlockNoteEditorComponent`, ensuring callbacks are stable (`useCallback`) and refs remain valid.
*   **Memoization Complexity:** Previous attempts at memoizing the editor led to issues (AI interaction, saving, loading). Implement autosave *first* without memoization. Only add memoization if necessary to solve focus loss, and test all editor functionalities rigorously afterward. The root cause of memoization issues needs to be addressed separately if it persists.
*   **API Load:** Saving every 3 seconds (after inactivity) might increase backend load. Monitor performance.
*   **Offline Handling:** This plan assumes an online connection. Saves will fail offline, and the status will show 'Error'. True offline support would require a more complex solution (e.g., saving to IndexedDB + background sync).
*   **Conflict Resolution:** This simple autosave doesn't handle simultaneous edits by multiple users. It follows a "last write wins" model for the backend data.
*   **Initial Load Triggering Save:** Programmatic content loading might trigger `onEditorContentChange`. Mitigation: Use an `isContentLoaded` flag or check BlockNote's API for differentiating change sources to prevent immediate save after load.
*   **Manual Save vs. Autosave Race Condition:** Clicking a manual save button near the end of the debounce period could cause two concurrent saves. Mitigation: Manual save should clear the autosave timer; autosave callback should check if a manual save is in progress; potentially disable manual save button during autosave.
*   **Error State Persistence:** The `'error'` status might be cleared too quickly on subsequent edits. Mitigation: Make the error state "sticky" until the next *successful* save, consider a manual retry option, or implement a simple auto-retry in the save function.
*   **Data Loss within Debounce Window:** Edits made within the 3-second window before navigating away or closing the tab won't be saved. Mitigation: **Addressed by new Steps 7 & 8 (save on navigation/unload).** Note that `beforeunload` with `keepalive` is best-effort and not guaranteed.
*   **Cleanup of All Timers:** Ensure *all* `setTimeout` calls (including secondary ones like reverting 'saved' to 'idle') are tracked and cleared in the component unmount cleanup.
*   **Stable `useCallback` Dependencies:** Incorrect dependency arrays for `useCallback` can cause issues, especially if memoization is added later. Ensure dependencies (like API call functions) are stable references.
*   **Infinite Loop via Save-Triggered Change:** If status updates inadvertently trigger `onEditorContentChange` again, a loop could occur. Mitigation: Test carefully; ensure editor handles parent re-renders gracefully.
*   **Stale Data During Debounce:** If other processes (e.g., AI insertion) modify content *during* the debounce delay, the autosave might save slightly stale data. Mitigation: Less likely without other async editors; could re-fetch content right before save if necessary.
*   **Incorrect Timer Management:** Bugs in clearing/setting the `autosaveTimerId` could prevent saves. Mitigation: Careful state management and testing.
*   **"Stuck" Saving State:** Slow networks could leave the UI showing "Saving..." for extended periods. Mitigation: Implement request timeouts on `fetch`; potentially prevent new autosaves if one is already pending long.
*   **Interaction with Undo/Redo:** Autosaving complicates the expected behavior of undo/redo history, as the backend state might not match the user's perceived history after undoing a saved change. Mitigation: Accept limitation for V1 or implement more complex versioning.
*   **Environment-Specific API Issues:** Reliance on client-side APIs like `setTimeout` means code won't work server-side (unlikely for this component, but a general point).
*   **`keepalive` Limitations:** The `fetch` with `keepalive` used in `beforeunload` is a best-effort attempt and not guaranteed delivery by the browser, especially on mobile.

## Alternatives Considered

*   **IndexedDB:** Using IndexedDB (e.g., via `localForage`) was considered.
    *   **Pros:** Better offline capability, asynchronous storage, larger capacity.
    *   **Cons:** Significantly increases implementation complexity (sync logic, conflict resolution).
    *   **Decision:** Deferred in favor of the simpler direct backend save approach for the initial implementation. Can be revisited if offline support becomes a primary requirement or API load is problematic.
*   **Chat Input Autosave:** The initial request was misinterpreted as autosaving the chat input. This was clarified to be for the main document editor.

## Next Steps

1.  Implement the changes outlined in `app/editor/[documentId]/page.tsx`.
2.  Verify the correct BlockNote API usage for change detection and content access.
3.  Test autosave functionality thoroughly.
4.  Test for focus loss during status updates.
5.  If necessary, investigate and carefully apply memoization to `BlockNoteEditorComponent`.
6.  Test all related editor functionalities (loading, AI interaction, manual save) after implementation. 