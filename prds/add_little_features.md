# Plan for "Little Features" Implementation

This document outlines the planning and scoping for several new features.

## 1. File Browser Modal

### Purpose
To provide users with a quick way to browse and open existing documents without navigating to the main `/launch` page. This modal will be visually similar to `SearchModal.tsx` and `VersionHistoryModal.tsx`.

### Trigger & UI Changes
-   **New Button in `Header.tsx`**:
    -   A new icon button will be added to `Header.tsx` to trigger this modal.
    -   The icon for this button should be distinct and clearly represent file browsing (e.g., a folder with a magnifying glass, or a more abstract "browse" icon).
-   **Icon Change for "Go To Launch Pad"**:
    -   The existing "Go To Launch Pad" link in `Header.tsx` (currently a `FolderIcon`) will be changed to a "Home" icon to better represent its function as a link to the main launch/dashboard page.
    -   This helps differentiate it from the new file browser modal button.

### Modal Content & Functionality
-   The modal will house the file browser component, similar to the one currently displayed on the `/launch` page.
-   It should allow users to:
    -   View their file and folder structure.
    -   Navigate through folders.
    -   Open a document by clicking on it.
    -   Selecting a document should close the modal and navigate the user to the editor for that document.
-   Consideration: How search within the file browser modal will be handled (if different from the global search). For now, assume it uses the existing file browsing capabilities.

### Visual Design
-   Consistent look and feel with `SearchModal.tsx` and `VersionHistoryModal.tsx`:
    -   Overlay with backdrop blur.
    -   Close button (X icon) in the top right.
    -   Clear title.
    -   Responsive design for different screen sizes.
-   **Should use the same file browser component from /launch. Our new modal essentially enables users to use this functionality without having to navigate to /launch every time.**

### Affected Files
-   `components/header.tsx`: Add new button, change existing "Launch Pad" icon.
-   New component: `components/modals/FileBrowserModal.tsx` (or similar).
-   Potentially `app/launch/page.tsx` or related file browser components if we can reuse/refactor parts of the existing file browser.
-   State management for modal visibility (e.g., Zustand store or local state in a layout component).

### Scope Notes
-   Initial version will focus on read-only browsing and opening files.
-   File/folder management operations (create, delete, rename, move) within this modal are out of scope for the initial implementation but can be considered for future enhancements.

### Implementation Steps

**Phase 1: State Management & Modal Shell**

1.  **Set up State Management for Modals (if not already centralized):**
    *   Create or use an existing Zustand store (e.g., `useModalStore.ts`) to manage the visibility of various modals.
    *   Add state: `isFileBrowserModalOpen: boolean` (default: `false`).
    *   Add actions: `openFileBrowserModal: () => void` (sets `isFileBrowserModalOpen` to `true`), `closeFileBrowserModal: () => void` (sets `isFileBrowserModalOpen` to `false`).

2.  **Create the Basic `FileBrowserModal.tsx` Component:**
    *   Create file: `components/modals/FileBrowserModal.tsx`.
    *   **Props**: `isOpen: boolean`, `onClose: () => void`.
    *   **Structure**: Mimic `SearchModal.tsx` or `VersionHistoryModal.tsx` for the basic layout:
        *   Fixed position overlay with backdrop blur.
        *   Main modal container (`bg-[--bg-color]`, rounded, shadow, etc.).
        *   Header section with a title (e.g., "Browse Files") and a close button (`X` icon) that calls `onClose`.
        *   Placeholder for file browser content.
    *   Basic styling to ensure it's visually consistent.

3.  **Integrate Modal into Application Layout:**
    *   In a global layout component (e.g., `app/layout.tsx` or a client component wrapper used in the layout), import and render `<FileBrowserModal />`.
    *   Connect its `isOpen` prop to `useModalStore(state => state.isFileBrowserModalOpen)`.
    *   Connect its `onClose` prop to `useModalStore(state => state.closeFileBrowserModal)`.

**Phase 2: Adapt and Integrate `NewFileManager.tsx`**

4.  **Adapt `components/file-manager/NewFileManager.tsx` for Modal Usage:**
    *   **Goal**: Allow `NewFileManager.tsx` to output a selection event instead of navigating directly when used in the modal.
    *   Modify `NewFileManager.tsx` (and/or its child components like `DocumentItem.tsx` where file click/selection is handled) to accept a new optional prop: `onFileSelect?: (documentId: string, documentName?: string) => void`.
    *   **Conditional Logic**: 
        *   When a file item is clicked/selected within `NewFileManager.tsx`:
            *   If the `onFileSelect` prop **is** provided (i.e., when used in the modal), call `onFileSelect(document.id, document.name)`.
            *   If the `onFileSelect` prop **is not** provided (i.e., when used in `app/launch/page.tsx`), maintain its current behavior (which is likely internal navigation via `Link` or `router.push`).
    *   This approach ensures `NewFileManager.tsx` remains backward compatible with its current usage on the `/launch` page, which does not need to output a selection event.
    *   `NewFileManager.tsx` already handles fetching its data via `/api/file-manager`, so that part remains unchanged.

5.  **Integrate `NewFileManager.tsx` into `FileBrowserModal.tsx`:**
    *   In `components/modals/FileBrowserModal.tsx`:
        *   Import `NewFileManager` from `@/components/file-manager/NewFileManager`.
        *   Import and use `useRouter` from `next/navigation`.
        *   Import and use the modal store (e.g., `useModalStore`).
        *   Render the `<NewFileManager />` component within the modal's content area.
        *   Define a handler function, for example `handleFileSelection`:
            ```typescript
            const router = useRouter();
            const closeModal = useModalStore(state => state.closeFileBrowserModal);

            const handleFileSelection = (documentId: string, documentName?: string) => {
                closeModal();
                router.push(`/editor/${documentId}`);
                // Optionally, you could toast `documentName` being opened.
            };
            ```
        *   Pass this `handleFileSelection` function as the `onFileSelect` prop to `<NewFileManager onFileSelect={handleFileSelection} />`.

**Phase 3: Update Header and Trigger**

6.  **Modify `components/header.tsx`:**
    *   **Import Icons**: Import `Home` and `FolderOpen` (or a similar suitable icon like `FolderKanban`, `Files`) from `lucide-react`.
    *   **Change Launch Pad Icon**: Locate the `Link` component for "Go to Launch Pad" (currently using `FolderIcon` from Heroicons). Replace it with the `Home` icon from `lucide-react`.
    *   **Add New File Browser Button**:
        *   Add a new `button` element next to other header actions (e.g., near the search icon or theme toggle).
        *   Use the chosen `FolderOpen` icon (or similar from `lucide-react`) for this button.
        *   Set `aria-label` for accessibility (e.g., "Open file browser").
        *   The `onClick` handler for this button should call `useModalStore(state => state.openFileBrowserModal)`.

**Phase 4: Styling, Testing, and Refinement**

7.  **Styling and Theming:**
    *   Ensure the `FileBrowserModal.tsx` and the embedded `FileBrowser.tsx` (if its styling was affected by refactoring) adhere to the application's theme (light/dark modes) and styling conventions.
    *   Pay attention to scrollability within the modal if the file list is long.

8.  **Testing:**
    *   Test opening the modal from the new header button.
    *   Test closing the modal using the 'X' button and by clicking the backdrop (if implemented like `SearchModal`).
    *   Test browsing folders within the modal.
    *   Test selecting a file and verify it closes the modal and navigates to the correct editor page.
    *   Verify the "Go to Launch Pad" link still works and now has the `HomeIcon`.
    *   Verify the file browser on the `/launch` page still functions correctly after refactoring.
    *   Check for any console errors or warnings.

9.  **Accessibility & UX Refinements:**
    *   Ensure proper ARIA attributes are used for modal dialogs and interactive elements.
    *   Ensure keyboard navigation works within the modal and the file browser.
    *   Consider adding a loading state within the modal if the file browser itself has an internal loading state for fetching files.
    *   Ensure the modal is responsive on different screen sizes.

## 2. New Document Modal

### Purpose
To allow users to quickly create a new document using a chat-based input (similar to the current functionality in `/launch`) without leaving their current context (e.g., while viewing another document or on a different page).

### Trigger & UI Changes
-   **Existing Button in `EditorTitleBar.tsx`**:
    -   The existing "New Document" button (currently `DocumentPlusIcon`) in `EditorTitleBar.tsx` will be repurposed to trigger this modal.
    -   The icon might remain the same, or be updated if a more suitable "create via chat" icon is available.

### Modal Content & Functionality
-   The modal will house the chat input component currently found on the `/launch` page, which is used for creating new documents from a prompt.
-   Functionality:
    -   User types a prompt or idea for a new document.
    -   Upon submission, the system processes the input (presumably calling an API to create the document content).
    -   On successful document creation:
        -   The modal should close.
        -   The user should be navigated to the editor for the newly created document.
    -   Error handling for failed document creation should be displayed within the modal.

### Visual Design
-   Consistent look and feel with `SearchModal.tsx`, `VersionHistoryModal.tsx`, and the new `FileBrowserModal.tsx`.
    -   Overlay with backdrop blur.
    -   Close button (X icon) in the top right.
    -   Clear title (e.g., "Create New Document").
-   **Should use the same chat input component from /launch. Our new modal essentially enables users to use this functionality without having to navigate to /launch every time.**

### Affected Files
-   `components/editor/EditorTitleBar.tsx`: Modify `handleNewDocument` to open the modal instead of navigating directly.
-   New component: `components/modals/NewDocumentModal.tsx` (or similar).
-   Re-use or refactor the chat input component from `app/launch/page.tsx` or its child components to be embeddable in the modal.
-   Logic for handling document creation API calls and subsequent navigation.
-   State management for modal visibility.

### Scope Notes
-   Focus is on replicating the existing document creation flow from `/launch` but within a modal.
-   Advanced features like template selection or pre-filling content beyond the chat prompt are out of scope for this initial version.

### Implementation Steps

**Phase 1: State Management & Modal Shell**

1.  **Update State Management for Modals (`useModalStore.ts` or equivalent):**
    *   Add state: `isNewDocumentModalOpen: boolean` (default: `false`).
    *   Add actions: `openNewDocumentModal: () => void` (sets `isNewDocumentModalOpen` to `true`), `closeNewDocumentModal: () => void` (sets `isNewDocumentModalOpen` to `false`).

2.  **Create the Basic `NewDocumentModal.tsx` Component:**
    *   Create file: `components/modals/NewDocumentModal.tsx`.
    *   **Props**: `isOpen: boolean`, `onClose: () => void`.
    *   **Structure**: Mimic other modals (`SearchModal.tsx`, `FileBrowserModal.tsx` plan) for the basic layout:
        *   Fixed position overlay with backdrop blur.
        *   Main modal container (`bg-[--bg-color]`, rounded, shadow, etc.).
        *   Header section with a title (e.g., "Create New Document") and a close button (`X` icon from `lucide-react`) that calls `onClose`.
        *   Placeholder for the chat input component.
    *   Basic styling for visual consistency.

3.  **Integrate Modal into Application Layout:**
    *   In the global layout component where other modals are managed, import and render `<NewDocumentModal />`.
    *   Connect its `isOpen` prop to `useModalStore(state => state.isNewDocumentModalOpen)`.
    *   Connect its `onClose` prop to `useModalStore(state => state.closeNewDocumentModal)`.

**Phase 2: Integrate `ChatInputUI.tsx` for Document Creation**

4.  **Review `ChatInputUI.tsx` and its Usage in `app/launch/page.tsx`:**
    *   `ChatInputUI.tsx` is already a fairly reusable component for capturing user input, model selection, and potentially handling audio/attachments/tagging.
    *   In `app/launch/page.tsx`, `ChatInputUI.tsx` is wrapped in a `<form>` element, and the submission logic (`handleLaunchSubmit`) is tied to this form's `onSubmit` event.
    *   `app/launch/page.tsx` manages state for `input`, `model`, `isSubmitting` (passed as `isLoading` to `ChatInputUI`), `taggedDocuments`, and various handlers.

5.  **Prepare `NewDocumentModal.tsx` to Host `ChatInputUI.tsx`:**
    *   The `NewDocumentModal.tsx` component will need to manage its own state similar to `app/launch/page.tsx` for the aspects relevant to document creation via the modal:
        *   `input: string` (for the user's prompt)
        *   `model: string` (selected model for creation)
        *   `isCreating: boolean` (loading state for the creation API call, to be passed as `isLoading` to `ChatInputUI`)
        *   `creationError: string | null` (to display errors within the modal)
        *   `taggedDocuments: TaggedDocument[]` (if document tagging is to be supported in the modal)
    *   It will require its own handlers:
        *   `handleInputChange`, `handleSetModel`.
        *   `handleAddTaggedDocument`, `handleRemoveTaggedDocument` (if supporting tagging).
        *   A core submission handler, e.g., `handleCreateDocumentInModal(event: React.FormEvent<HTMLFormElement>)`.

6.  **Implement Submission Logic in `NewDocumentModal.tsx`:**
    *   The `handleCreateDocumentInModal` function will:
        *   Prevent default form submission.
        *   Set `isCreating` to `true` and clear `creationError`.
        *   Make an API call (e.g., to `/api/launch` or a similar endpoint, sending `input`, `model`, `taggedDocuments`).
        *   **On successful API response (new document created):**
            *   Call `onClose` prop (or `closeNewDocumentModal()` from the store) to close the modal.
            *   Use `router.push()` to navigate to the new document's editor page (e.g., `/editor/${newDocumentId}`).
            *   Optionally, display a success toast.
        *   **On API error:**
            *   Set `creationError` with the error message to be displayed within the modal.
            *   Set `isCreating` to `false`.

7.  **Integrate `ChatInputUI.tsx` into `NewDocumentModal.tsx`:**
    *   Inside `NewDocumentModal.tsx`'s render method, wrap `<ChatInputUI />` with a `<form onSubmit={handleCreateDocumentInModal}>`.
    *   Pass the relevant state and handlers from `NewDocumentModal.tsx` as props to `<ChatInputUI />`:
        *   `input={modalInputState}`
        *   `handleInputChange={modalHandleInputChange}`
        *   `model={modalModelState}`
        *   `setModel={modalSetModel}`
        *   `isLoading={isCreating}` (modal's creating state)
        *   `taggedDocuments`, `onAddTaggedDocument`, `onRemoveTaggedDocument` (if implemented).
        *   **Audio/File Attachments**: For the initial modal version, file attachment and audio recording props (`files`, `fileInputRef`, `handleFileChange`, `startRecording`, `stopRecording`, etc.) can be omitted or passed as undefined/null if `ChatInputUI.tsx` handles their absence gracefully. The goal is a *quick* new document. If these features are desired in the modal, the modal component will also need to manage their state and handlers.
        *   `clearPreview` can be a simple no-op or a basic state reset if attachments are minimally supported.
    *   `ChatInputUI.tsx` itself should not require significant modifications, as it primarily serves as the UI layer. The specific behavior upon submission is dictated by the parent form and its submit handler (`handleCreateDocumentInModal`).

**Phase 3: Update `EditorTitleBar.tsx` Trigger**

8.  **Modify `components/editor/EditorTitleBar.tsx`:**
    *   Import `useModalStore` (or the relevant modal control functions/hooks).
    *   Locate the `handleNewDocument` function or the `onClick` handler associated with the "New Document" button (`DocumentPlusIcon`).
    *   Change its implementation to call `useModalStore.getState().openNewDocumentModal()` (or the equivalent action from your store).

**Phase 4: Styling, Testing, and Refinement**

9.  **Styling and Theming:**
    *   Ensure `NewDocumentModal.tsx` and the embedded `CreateDocumentInput.tsx` (especially if its styling was tightly coupled with `/launch` initially) adhere to the application's theme and styling conventions.
    *   The chat input should be the primary focus within the modal.

10. **Error Handling and Loading States:**
    *   Ensure the `CreateDocumentInput.tsx` clearly indicates loading/processing states (e.g., disabling submit button, showing a spinner).
    *   Error messages within the modal should be clear and user-friendly.

11. **Testing:**
    *   Test opening the modal from the `EditorTitleBar.tsx` button.
    *   Test closing the modal using the 'X' button.
    *   Test the document creation flow: input prompt, submit.
        *   On success: verify modal closes, navigation to new document occurs, and (optional) success toast appears.
        *   On failure: verify modal stays open and an error message is displayed within the modal.
    *   Verify the document creation functionality on the `/launch` page still works correctly after refactoring its chat input component.
    *   Check for console errors or warnings during all flows.

12. **Accessibility & UX Refinements:**
    *   Ensure proper ARIA attributes for the modal and interactive elements within.
    *   The input field in `CreateDocumentInput.tsx` should ideally auto-focus when the modal opens.
    *   Ensure keyboard navigation is smooth.
    *   Consider the overall user flow – it should feel quick and seamless.

## 3. Mini Folder Management in `EditorTitleBar.tsx`

### Purpose
To provide a quick way for users to organize the currently open document by moving it into an existing folder or a new folder, directly from the editor interface.

### Trigger & UI Changes
-   **New Icon Button in `EditorTitleBar.tsx`**:
    -   A small folder icon button will be added to the left of the document title in `EditorTitleBar.tsx`.
    -   Clicking this icon will trigger a dropdown or a small popover for folder management options.

### Popover/Dropdown Content & Functionality
-   **Display Current Folder**: If the document is already in a folder, display its current path (e.g., using breadcrumbs for subfolders).
-   **Move to Folder**:
    -   An input field to type/search for an existing folder.
    -   A list of existing folders, possibly with a simple tree view for subfolders.
    -   Ability to select a folder and confirm the move.
-   **Create New Folder**:
    -   An option to create a new folder (either at the root or within an existing selected folder).
    -   Input field for the new folder name.
-   **Move to Root**: If the document is in a folder, an option to move it to the root (i.e., remove from its current folder).

### UI/UX Considerations
-   **Subfolder Representation**: How to best represent and navigate subfolders in the dropdown/popover. Breadcrumbs are a good candidate for displaying the current path. A simple indented list or a more interactive tree view could be used for selecting folders.
-   **Simplicity**: The interface should be kept simple and not overly complex, as it's meant for quick organization.
-   **Feedback**: Clear feedback on successful move operations or any errors.

### Visual Design
-   The popover/dropdown should be styled consistently with other UI elements.
-   Clear visual distinction between actions (e.g., moving to existing vs. creating new).

### Affected Files
-   `components/editor/EditorTitleBar.tsx`: Add the new folder icon button and logic to trigger the popover/dropdown.
-   New component: `components/editor/FolderManagementPopover.tsx` (or similar) to house the folder management UI.
-   API integration for moving documents and creating folders (these might already exist in `file-manager` related APIs).
-   State updates to reflect the document's new location if moved.

### Scope Notes
-   Initial focus is on moving the current document and creating new folders.
-   More advanced folder management features (renaming folders, deleting folders, moving multiple documents) are out of scope for this mini-feature and should be handled in the main file browser.
-   The complexity of subfolder navigation and creation within this small popover needs careful consideration to keep it user-friendly. 

### TODO: Implementation Steps