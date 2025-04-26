# Prompt: Design and Implement a Custom File Manager Page

## Goal
Create a sleek, modern, and intuitive user interface component for managing documents and folders within the application. This component should integrate seamlessly with the existing Supabase backend and potentially the BlockNote editor.

## Context
- **Backend:** Supabase (PostgreSQL)
- **Likely Frontend:** React/Next.js (based on common usage with Supabase/BlockNote)
- **Potential Editor:** BlockNote (Document content management might be handled separately, but the file manager needs to list documents).
- **Authentication:** User-specific data management relies on `auth.users(id)`.

## Core Functionality

1.  **Folder Management:**
    *   **Create:** Allow users to create new folders. Folders can be created at the root level (`parent_folder_id` is NULL) or within existing folders.
    *   **View:** Display folders in a hierarchical structure (e.g., tree view or nested lists).
    *   **Rename:** Allow users to rename folders.
    *   **Delete:** Allow users to delete folders. Consider handling of nested content (e.g., prompt user if deleting a non-empty folder, cascade delete, or move contents). The DDL currently sets `parent_folder_id` to NULL on delete; confirm if this is the desired behavior or if nested folders/documents should also be deleted or moved.
    *   **Move (Drag & Drop):** Allow users to drag and drop folders into other folders to change their `parent_folder_id`.

2.  **Document Management:**
    *   **View:** Display documents within their respective folders. Show the document `name`.
    *   **Create:** While full document creation might happen in the editor view, provide a way to create a new, empty document record (`name: 'Untitled Document'`, `content: null`) within a selected folder via the file manager UI.
    *   **Rename:** Allow users to rename documents.
    *   **Delete:** Allow users to delete documents.
    *   **Move (Drag & Drop):** Allow users to drag and drop documents into folders (including the root level if `folder_id` can be NULL).

3.  **Interaction:**
    *   **Navigation:** Users should be able to navigate into folders to see their contents. Breadcrumbs or a clear visual hierarchy should indicate the current location.
    *   **Selection:** Allow selection of single or potentially multiple items (folders/documents) for actions like delete or move.
    *   **Context Menus:** Right-clicking on a folder or document could open a context menu with relevant actions (Rename, Delete, Move, Create New Folder/Document here).

## UI/UX Requirements
- **Layout:** Design a clean, intuitive layout. Consider common file manager patterns (e.g., sidebar for folder tree, main area for contents).
- **Appearance:** Must be sleek and modern. Use appropriate spacing, typography, and iconography.
- **Responsiveness:** Ensure the layout adapts reasonably to different screen sizes.
- **Feedback:** Provide clear visual feedback for actions like drag & drop (e.g., highlighting drop targets), loading states, and success/error messages.

## Database Integration (Supabase)
- Utilize the provided DDL for `folders` and `documents` tables.
- All operations must be scoped to the logged-in user (`user_id`).
- Implement Supabase client calls for:
    - Fetching folders and documents (likely hierarchical fetching for folders).
    - Creating new folders and documents (`INSERT`).
    - Updating names or parent folders/folder IDs (`UPDATE`).
    - Deleting folders and documents (`DELETE`).
- Ensure proper error handling for database operations.
- Consider real-time updates using Supabase subscriptions if necessary, although initial polling/refetching might suffice.

## Technical Implementation Suggestions
- **Frontend Framework:** Assume React/Next.js unless specified otherwise.
- **State Management:** Use a suitable state management solution (e.g., Zustand, Context API, Jotai) to handle the file/folder structure, loading states, and UI interactions.
- **Drag & Drop Library:** If using React, consider libraries like `react-beautiful-dnd` or `dnd-kit` for robust drag-and-drop functionality.
- **API Layer:** Create dedicated functions or hooks to encapsulate Supabase client calls for fetching and mutating data.
- **Component Structure:** Break down the UI into reusable components (e.g., `FolderTree`, `FileItem`, `FolderItem`, `ContextMenu`, `Breadcrumbs`).

## Deliverables
- React component(s) implementing the file manager UI.
- Functions/hooks for interacting with the Supabase backend for folder and document CRUD operations.
- Styling (e.g., CSS Modules, Tailwind CSS) for the sleek and modern look.
- Documentation/comments explaining the component usage and logic.

## Considerations
- **Performance:** Optimize data fetching, especially for large numbers of folders/documents. Consider pagination or virtual scrolling if necessary.
- **Error Handling:** Implement robust error handling for both UI interactions and backend operations.
- **Empty States:** Design clear states for when a folder is empty or when the user has no folders/documents yet.
- **Scalability:** Design the components and data fetching logic with potential future growth in mind. 