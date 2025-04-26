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

```sql
-- Folders Table
CREATE TABLE public.folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  parent_folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL, -- Allow null for root folders, set null if parent deleted
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Documents Table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL, -- Set null if folder deleted
  name TEXT NOT NULL DEFAULT 'Untitled Document',
  content JSONB, -- Or TEXT depending on final editor choice
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

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
- **CSS Isolation:** Implement styling for the new file manager without modifying existing global CSS or styles used by other components/pages. Add new CSS rules scoped specifically to the new file manager components.
- **Coexistence:** The new file manager is a prototype and should be implemented such that the existing file manager (`react-cubone` based, shown under the "Browse Files" tab) remains fully functional and unmodified.

## Implementation Steps

This outlines a phased approach to building the custom file manager.

**Phase 1: Setup & Basic Structure**

1.  **Modify `/launch` Page:**
    *   In `app/launch/page.tsx`, update the `activeView` state type to include `'newFileManager'`.
    *   Add a third button labeled "New File Manager" alongside "Start with Text" and "Browse Files". Make it set `activeView` to `'newFileManager'`.
    *   Add a conditional rendering block for `activeView === 'newFileManager'` to render the main file manager component.
2.  **Create Main Component:**
    *   Create a new component file (e.g., `components/file-manager/NewFileManager.tsx`).
    *   Implement the basic layout structure (e.g., sidebar/main content area) using divs or existing layout components (like `<ResizablePanelGroup>`).
3.  **State Management:**
    *   Choose and set up a state management solution (e.g., Zustand if not already used, or integrate with existing Context/Jotai).
    *   Define initial state structure for folders, documents, loading status, errors, current path/folder, etc. (Can use mock data initially).

**Phase 2: Data Fetching & Display**

1.  **API Hooks/Functions:**
    *   Create reusable functions or hooks (e.g., `hooks/useFileData.ts`) to interact with the Supabase API endpoints (`/api/file-manager`, `/api/folders`, `/api/documents`).
    *   Implement a function to fetch initial data (root folders and documents) for the logged-in user.
2.  **Display Data:**
    *   Fetch data in `NewFileManager.tsx` using the hook/function created above.
    *   Render folders and documents in the main content area based on the fetched data. Create simple `FolderItem.tsx` and `DocumentItem.tsx` components for rendering.
    *   Handle loading and error states visually.
3.  **Hierarchical View (Sidebar/Tree - Optional First Pass):**
    *   If using a sidebar layout, implement a basic folder tree/list component (`FolderTree.tsx`).
    *   Fetch and display top-level folders in the tree.
4.  **Navigation:**
    *   Implement logic to navigate into folders (e.g., clicking a folder updates the current path state and refetches data for that folder).
    *   Add a `Breadcrumbs.tsx` component to display the current navigation path.

**Phase 3: Folder Management CRUD**

1.  **Create Folder:**
    *   Add a "Create Folder" button/UI element.
    *   Implement a modal or inline input for the folder name.
    *   Call the `POST /api/folders` endpoint via the API hook/function on submission.
    *   Refetch data or update state optimistically upon success.
2.  **Rename Folder:**
    *   Add a "Rename" option (e.g., in a context menu or inline edit icon).
    *   Implement the UI for renaming.
    *   Call the `PUT /api/folders/[folderId]` endpoint.
    *   Refetch/update state.
3.  **Delete Folder:**
    *   Add a "Delete" option.
    *   Implement confirmation prompt, especially for non-empty folders (check PRD for desired behavior - cascade vs. set null).
    *   Call the `DELETE /api/folders/[folderId]` endpoint.
    *   Refetch/update state.

**Phase 4: Document Management CRUD**

1.  **Create Document (DO NOT IMPLEMENT YET):**
    *   Add a "Create Document" button/UI element.
    *   Call the relevant API (might need a new one like `POST /api/documents` if `/api/launch` isn't suitable) to create a basic document record ('Untitled Document') within the current folder.
    *   Refetch/update state.
2.  **Rename Document:**
    *   Add a "Rename" option.
    *   Implement UI.
    *   Call the `PUT /api/documents/[documentId]` endpoint.
    *   Refetch/update state.
3.  **Delete Document:**
    *   Add a "Delete" option.
    *   Implement confirmation.
    *   Call the `DELETE /api/documents/[documentId]` endpoint.
    *   Refetch/update state.
4.  **Open Document:**
    *   Implement clicking/double-clicking a document item to navigate to the editor page (`/editor/[documentId]`).

**Phase 5: Drag & Drop**

1.  **Integrate Library:** Add and configure `dnd-kit` (or alternative).
2.  **Implement Draggable Items:** Make `FolderItem` and `DocumentItem` draggable.
3.  **Implement Drop Zones:** Make `FolderItem` and the main content area (for root) drop zones.
4.  **Handle Drop Logic:**
    *   On drop, determine the source item(s) and the target folder.
    *   Call the appropriate `PUT` endpoint (`/api/folders/[folderId]` or `/api/documents/[documentId]`) to update the `parent_folder_id` or `folder_id`.
    *   Provide visual feedback (highlighting drop targets, etc.).
    *   Refetch/update state.

**Phase 6: UI Polishing & Refinements**

1.  **Context Menus:** Implement right-click context menus (`ContextMenu.tsx`) for folder/document actions.
2.  **Styling:** Refine component styles using Tailwind CSS (or chosen system) to match the "sleek and modern" requirement. Pay attention to spacing, typography, iconography.
3.  **Feedback:** Enhance loading states, add success/error notifications (e.g., using `react-hot-toast` if available).
4.  **Empty States:** Implement clear visual states for when a folder is empty or the user has no items.
5.  **Responsiveness:** Test and adjust layout for different screen sizes.
6.  **Accessibility:** Review keyboard navigation, focus management, and ARIA attributes.
7.  **Code Quality:** Add comments, documentation, and potentially unit/integration tests.
8.  **Performance:** Review data fetching logic. Consider optimizations like virtual scrolling if performance issues arise with many items. 