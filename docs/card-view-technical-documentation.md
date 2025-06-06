# Card-Based File Browser: Technical Documentation

## 1. Introduction

This document provides a technical overview of the card-based file browser feature, including its architecture, API interfaces, and key implementation details. It is intended for developers and technical staff involved in maintaining and extending the feature.

## 2. System Architecture

### 2.1. Overview

The card-based file browser is a frontend-centric feature built with Next.js and React, utilizing Supabase for backend services and data storage. It provides a visual way to interact with documents and folders, offering features like drag-and-drop, sorting, searching, and hierarchical folder navigation.

### 2.2. Key Frontend Components

*   **`DocumentCardGrid.tsx`**: The main container component responsible for rendering the grid of document and folder cards. It manages state for search, sorting, selection, and drag-and-drop operations. It orchestrates data fetching and updates.
*   **`DocumentCard.tsx`**: A presentational component that displays individual document information (title, snippet, last updated, star status) in a card format. It handles its own hover, selection, and star toggle UI interactions.
*   **`FolderCard.tsx`**: A component that represents a folder. It displays folder information, a preview of its contents (document titles), and handles interactions like navigation into the folder, renaming, and deletion. It also acts as a drop target for documents and other folders.
*   **`FolderBreadcrumbs.tsx`**: Displays the current navigation path within the folder hierarchy and allows users to navigate to parent folders or the root. It also serves as a drop target for moving items.
*   **Hooks (`useFolders.ts`, `useAllDocuments.ts`, `useFileMediaStore.ts`, `useFolderNavigation.ts`)**: Custom React hooks abstracting logic for data fetching (documents, folders), state management (Zustand for file/folder data, selection, expansion), and navigation.
*   **API Service Functions**: Utility functions for making API calls to the backend (e.g., fetching documents, updating folder structures, toggling star status).

### 2.3. Backend Integration

*   **Supabase**: Used as the primary backend for:
    *   **Database**: Storing document metadata, folder structures, user information, and starred statuses.
    *   **Authentication**: Managing user sign-up, login, and session handling.
    *   **Realtime**: Providing real-time updates for document and folder changes.
*   **Next.js API Routes (`app/api/...`)**:
    *   `/api/file-manager`: Fetches documents and folders for the current user.
    *   `/api/search-documents`: Provides search functionality across document content and metadata.
    *   `/api/folders/*`: Handles CRUD operations for folders.
    *   `/api/documents/[documentId]/star`: Toggles the starred status of a document.
    *   `/api/documents/[documentId]/move`: Moves a document to a different folder.

### 2.4. State Management

*   **Local Component State**: Used for UI-specific states within components (e.g., hover states, modal visibility).
*   **Zustand (`useFileMediaStore`)**: Used for global client-side state management, including:
    *   Storing fetched documents and folders.
    *   Managing the selection state of cards.
    *   Tracking active drag operations.
    *   Caching user preferences (e.g., sort order - if implemented).
*   **Custom Hooks**: Encapsulate complex stateful logic related to data fetching, folder navigation, and expansion states.

### 2.5. Key Features and Their Implementation Overview

*   **Card Display**: `DocumentCard.tsx` and `FolderCard.tsx` render data based on props.
*   **Grid Layout**: `DocumentCardGrid.tsx` uses CSS Grid (Tailwind CSS utilities) for responsive layout.
*   **Drag and Drop**: Implemented using `@dnd-kit/core` and `@dnd-kit/sortable`.
    *   `DndContext` wraps the main grid.
    *   `useSortable` hook for draggable items (documents, folders).
    *   `useDroppable` hook for drop targets (folders, breadcrumbs).
*   **Folder Navigation**: `useFolderNavigation` hook manages the current folder view and breadcrumbs. Clicking a folder card updates the navigation state.
*   **Search**: UI in `DocumentCardGrid.tsx` calls `/api/search-documents`. Results update the displayed items. Folders are hidden during search.
*   **Sorting**: UI controls in `DocumentCardGrid.tsx` trigger client-side sorting functions.
*   **Star/Favorite**: `DocumentCard.tsx` handles UI toggle, updates Zustand store, and calls API to persist.
*   **Performance Optimizations**:
    *   **Virtualization**: `@tanstack/react-virtual` is used in `DocumentCardGrid.tsx` to render only visible items.
    *   **Lazy Loading**: Folders load their content (subfolders/documents) on demand when navigated into.
    *   **Memoization**: `React.memo`, `useMemo`, `useCallback` are used to prevent unnecessary re-renders.

## 3. API Interfaces

This section details the key backend API endpoints used by the card-based file browser. All endpoints require user authentication unless otherwise specified.

### 3.1. `/api/file-manager`

*   **Method:** `GET`
*   **Description:** Fetches all documents and folders for the authenticated user. Can be filtered to retrieve only starred documents or a specified number of recent documents.
*   **Authentication:** Required (valid user session).
*   **Query Parameters:**
    *   `starred` (boolean, optional): If set to `true`, only starred documents are returned.
    *   `recent` (boolean, optional): If set to `true`, returns the most recently updated documents. Defaults to a limit of 10 if `limit` is not also specified.
    *   `limit` (number, optional): Limits the number of documents returned. Primarily used with `recent=true` or `starred=true`.
*   **Response (Success - `200 OK`):**
    ```json
    {
      "data": {
        "documents": [
          {
            "id": "string (uuid)",
            "user_id": "string (uuid)",
            "folder_id": "string (uuid) | null",
            "name": "string",
            "searchable_content": "string | null",
            "is_starred": "boolean",
            "created_at": "string (timestampz)",
            "updated_at": "string (timestampz)"
            // ... any other document fields
          }
        ],
        "folders": [
          {
            "id": "string (uuid)",
            "user_id": "string (uuid)",
            "parent_folder_id": "string (uuid) | null",
            "name": "string",
            "created_at": "string (timestampz)",
            "updated_at": "string (timestampz)"
            // ... any other folder fields
          }
        ]
      }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: User is not authenticated.
    *   `429 Too Many Requests`: Rate limit exceeded.
    *   `500 Internal Server Error`: Backend error (e.g., failed to get session, database error).

### 3.2. `/api/search-documents`

*   **Method:** `POST`
*   **Description:** Performs a comprehensive search across document titles, content (BM25), and semantic embeddings. Results are combined and ranked. Intended for rich search experiences like the card-based file browser.
*   **Authentication:** Required (valid user session).
*   **Request Body:**
    ```json
    {
      "query": "string (non-empty)"
    }
    ```
*   **Response (Success - `200 OK`):**
    ```json
    [
      {
        "id": "string (uuid)",
        "name": "string", // Document title
        "similarity": "number", // Combined and ranked score
        "folder_id": null, // Currently always null from this endpoint
        "summary": "string | null",
        "lastUpdated": "string (timestampz)",
        "is_starred": "boolean"
      }
      // ... other matching documents
    ]
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Invalid request body or missing/empty `query`.
    *   `401 Unauthorized`: User is not authenticated.
    *   `500 Internal Server Error`: Backend search processing error.

### 3.3. `/api/folders`

#### `POST /api/folders`

*   **Description:** Creates a new folder for the authenticated user.
*   **Authentication:** Required.
*   **Request Body:**
    ```json
    {
      "name": "string (non-empty)",
      "parentFolderId": "string (uuid) | null | undefined" 
    }
    ```
    *   `name`: The name for the new folder.
    *   `parentFolderId`: The ID of the parent folder. Send `null` or omit for a root-level folder.
*   **Response (Success - `201 Created`):**
    ```json
    {
      "data": {
        "id": "string (uuid)",
        "user_id": "string (uuid)",
        "name": "string",
        "parent_folder_id": "string (uuid) | null",
        "created_at": "string (timestampz)",
        "updated_at": "string (timestampz)"
      }
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Invalid JSON, missing/invalid `name`, or invalid `parentFolderId`.
    *   `401 Unauthorized`: User not authenticated.
    *   `500 Internal Server Error`: Database or unexpected server error.

#### `GET /api/folders`

*   **Description:** Fetches folders for the authenticated user. Can return a flat list, a hierarchical tree, or children of a specific parent. Includes a `document_count` for each folder.
*   **Authentication:** Required.
*   **Query Parameters:**
    *   `hierarchical` (boolean, optional): If `true` and no `parentId` (or `parentId=root`) is specified, returns all folders as a nested tree.
    *   `parentId` (string, optional): Filters folders to return direct children of this `parentId`. Use `parentId=root` for root-level folders. If omitted, all user folders are considered.
*   **Response (Success - `200 OK`):**
    *   **Hierarchical View (e.g., `?hierarchical=true`):**
        ```json
        {
          "data": {
            "folders": [
              {
                "id": "string (uuid)",
                "name": "string",
                "parent_folder_id": "string (uuid) | null",
                "document_count": "number",
                "children": [ /* nested folder objects */ ]
                // ... other folder fields
              }
            ],
            "hierarchical": true
          }
        }
        ```
    *   **Flat List / Children View (e.g., `?parentId=some-uuid` or no params):**
        ```json
        {
          "data": {
            "folders": [
              {
                "id": "string (uuid)",
                "name": "string",
                "parent_folder_id": "string (uuid) | null",
                "document_count": "number"
                // ... other folder fields
              }
            ]
          }
        }
        ```
*   **Error Responses:**
    *   `401 Unauthorized`: User not authenticated.
    *   `429 Too Many Requests`: Rate limit exceeded.
    *   `500 Internal Server Error`: Database or unexpected server error.

### 3.4. `/api/folders/{folderId}`

This endpoint manages operations on a specific folder, identified by `{folderId}` in the path.

#### `GET /api/folders/{folderId}`

*   **Description:** Fetches details of a specific folder, including its direct subfolders and documents.
*   **Authentication:** Required.
*   **Path Parameters:**
    *   `folderId` (string, required): ID of the folder.
*   **Response (Success - `200 OK`):**
    ```json
    {
      "data": {
        "folder": { /* Folder object for {folderId} */ },
        "subfolders": [ /* Array of direct child Folder objects */ ],
        "documents": [ /* Array of direct child Document objects */ ],
        "totalItems": "number" // Sum of subfolders and documents
      }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`
    *   `404 Not Found`
    *   `429 Too Many Requests`
    *   `500 Internal Server Error`

#### `PUT /api/folders/{folderId}`

*   **Description:** Updates the name and/or parent folder of a specific folder.
*   **Authentication:** Required.
*   **Path Parameters:**
    *   `folderId` (string, required): ID of the folder to update.
*   **Request Body:**
    ```json
    {
      "name": "string (optional, non-empty)",
      "parentFolderId": "string (uuid) | null | undefined (optional)"
    }
    ```
    *   At least `name` or `parentFolderId` must be provided.
*   **Response (Success - `200 OK`):**
    ```json
    {
      "data": { /* Updated Folder object */ }
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Invalid input (e.g., no fields, invalid name/parentFolderId, move into self).
    *   `401 Unauthorized`
    *   `404 Not Found`
    *   `500 Internal Server Error`

#### `DELETE /api/folders/{folderId}`

*   **Description:** Deletes a specific folder. Child items (documents/subfolders) typically have their parent reference set to null by database constraints.
*   **Authentication:** Required.
*   **Path Parameters:**
    *   `folderId` (string, required): ID of the folder to delete.
*   **Response (Success - `204 No Content`):**
    *   Empty response body.
*   **Error Responses:**
    *   `401 Unauthorized`
    *   `404 Not Found`
    *   `500 Internal Server Error`

### 3.5. `/api/documents/{documentId}/star`

*   **Method:** `PATCH`
*   **Description:** Toggles the `is_starred` status of a specific document.
*   **Authentication:** Required.
*   **Path Parameters:**
    *   `documentId` (string, required): ID of the document.
*   **Request Body:** None.
*   **Response (Success - `200 OK`):**
    ```json
    {
      "success": true,
      "is_starred": "boolean" // The new starred status
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: `documentId` missing.
    *   `401 Unauthorized`.
    *   `404 Not Found`: Document not found or access denied.
    *   `500 Internal Server Error`: Failed to update status.

### 3.6. `/api/documents/{documentId}/move`

*   **Method:** `PUT`
*   **Description:** Moves a document to a different folder or to the root.
*   **Authentication:** Required.
*   **Path Parameters:**
    *   `documentId` (string, required): ID of the document to move.
*   **Request Body:**
    ```json
    {
      "folderId": "string (uuid) | null | undefined"
    }
    ```
    *   `folderId`: Target folder ID. Use `null` or omit to move to root.
*   **Response (Success - `200 OK`):**
    ```json
    {
      "data": { /* Partial Document object (id, user_id, folder_id, name, created_at, updated_at) */ },
      "message": "string" // Confirmation message
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Invalid JSON or invalid `folderId` type.
    *   `401 Unauthorized`.
    *   `404 Not Found`: Document or target folder not found/accessible.
    *   `500 Internal Server Error`: Database error or unexpected error.

### 3.7. `/api/documents/{documentId}` (General CRUD)

This endpoint manages general CRUD operations for a specific document.

#### `GET /api/documents/{documentId}`

*   **Description:** Fetches the full details of a specific document, including its content.
*   **Authentication:** Required.
*   **Path Parameters:**
    *   `documentId` (string, required): ID of the document.
*   **Response (Success - `200 OK`):**
    ```json
    {
      "data": { /* Full Document object, including content */ }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`.
    *   `404 Not Found`.
    *   `500 Internal Server Error`.

#### `PUT /api/documents/{documentId}`

*   **Description:** Updates document metadata (e.g., name, folderId). Does not update content.
*   **Authentication:** Required.
*   **Path Parameters:**
    *   `documentId` (string, required): ID of the document to update.
*   **Request Body:**
    ```json
    {
      "name": "string (optional, non-empty)",
      "folderId": "string (uuid) | null | undefined (optional)" // Target folder ID, null for root
    }
    ```
    *   At least `name` or `folderId` must be provided.
*   **Response (Success - `200 OK`):**
    ```json
    {
      "data": { /* Updated Document object (excluding content) */ }
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Invalid input.
    *   `401 Unauthorized`.
    *   `404 Not Found`.
    *   `500 Internal Server Error`.

#### `DELETE /api/documents/{documentId}`

*   **Description:** Deletes a specific document.
*   **Authentication:** Required.
*   **Path Parameters:**
    *   `documentId` (string, required): ID of the document to delete.
*   **Response (Success - `204 No Content`):**
    *   Empty response body.
*   **Error Responses:**
    *   `401 Unauthorized`.
    *   `404 Not Found`.
    *   `500 Internal Server Error`.

## 4. Data Structures

This section defines the primary data structures used within the card-based file browser system, primarily reflecting the Supabase table structures and API response payloads.

### 4.1. `Document`

Represents a user document.

```typescript
interface Document {
  id: string; // UUID, primary key
  user_id: string; // UUID, foreign key to users.id
  folder_id: string | null; // UUID, foreign key to folders.id, nullable
  name: string; // Title or name of the document
  searchable_content?: string | null; // Full text content for searching, may be omitted in some list responses
  // content?: any; // TipTap JSON content structure, typically fetched on demand for editor, not in list views.
  // ^^^ Commented out as `searchable_content` is more relevant for file browser context outside editor.
  // Actual content structure can be detailed if needed for editor-related documentation.
  is_starred: boolean; // True if the document is favorited by the user
  created_at: string; // Timestamp with time zone (ISO 8601 format)
  updated_at: string; // Timestamp with time zone (ISO 8601 format)
  // Additional fields from search results or specific views:
  similarity?: number; // Search relevance score (from /api/search-documents)
  summary?: string | null; // AI-generated summary (from /api/search-documents)
  // Fields from Supabase storage (if applicable, not directly on documents table but related)
  // storage_path?: string;
  // mime_type?: string;
  // file_size?: number;
}
```

### 4.2. `Folder`

Represents a user-created folder to organize documents.

```typescript
interface Folder {
  id: string; // UUID, primary key
  user_id: string; // UUID, foreign key to users.id
  parent_folder_id: string | null; // UUID, foreign key to folders.id (self-referential), nullable for root folders
  name: string; // Name of the folder
  created_at: string; // Timestamp with time zone
  updated_at: string; // Timestamp with time zone
  // Optional fields from specific API responses:
  children?: Folder[]; // Used in hierarchical GET /api/folders response
  document_count?: number; // Count of documents directly within this folder (from GET /api/folders)
}
```

### 4.3. `User` (Simplified)

Represents an authenticated user. Only essential fields for context are shown.

```typescript
interface User {
  id: string; // UUID, primary key from auth.users
  email?: string;
  // ... other user-related fields from your users table or auth.users
}
```

## 5. Implementation Details

This section provides a more in-depth look at the implementation of key complex features within the card-based file browser.

### 5.1. Drag and Drop

*   **Library Used:** `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` are the primary libraries for enabling drag and drop functionality.
*   **Context Provider:** A `DndContext` provider is set up at a high level in the component tree (likely within `DocumentCardGrid.tsx` or a parent component) to manage the overall drag and drop state, sensors, and collision detection algorithms.
    *   **Sensors:** Pointer and Keyboard sensors (`useSensors`, `PointerSensor`, `KeyboardSensor`) are configured to allow interactions via mouse, touch, and keyboard.
*   **Draggable Items (`useDraggable` / `useSortable`):
    *   Both `DocumentCard.tsx` and `FolderCard.tsx` are made draggable. They use the `useSortable` hook from `@dnd-kit/sortable` if reordering within the current view is supported, or `useDraggable` for more general drag operations.
    *   Each draggable item is assigned a unique ID (document ID or folder ID).
    *   The `attributes` and `listeners` provided by the hook are spread onto the card's main element to enable dragging.
    *   A `DragOverlay` component is likely used to render a custom preview of the item being dragged, providing better visual feedback than the default browser behavior.
*   **Droppable Areas (`useDroppable`):
    *   `FolderCard.tsx` components act as droppable targets. When an item is dragged over a folder, visual cues (e.g., highlighting) are shown.
    *   The `FolderBreadcrumbs.tsx` (or individual breadcrumb items) can also act as droppable targets, allowing users to move items to parent folders or the root.
    *   `useDroppable` hook is used to register these components as drop zones.
*   **Event Handling (`onDragEnd`, `onDragOver`):
    *   `onDragEnd`: This is the most critical event handler. When a drag operation finishes, this function determines if the drop was valid (i.e., over a droppable target).
        *   If an item is dropped onto a folder card or a breadcrumb, an API call is made to move the document or folder to the target folder (`PUT /api/documents/{documentId}/move` or `PUT /api/folders/{folderId}` with new `parentFolderId`).
        *   The local state (Zustand store via `useFileMediaStore`) is updated optimistically or upon successful API response to reflect the change immediately in the UI.
    *   `onDragOver`: This event can be used to provide immediate visual feedback as an item is dragged over a potential drop target (e.g., highlighting the target folder).
*   **State Management:** The `useFileMediaStore` (Zustand) likely tracks the currently dragged item, active drop target, and updates the local representation of documents and folders post-drag.

### 5.2. Folder Navigation & Hierarchy Management

*   **Core Hook (`useFolderNavigation.ts`):** This custom hook is central to managing the folder navigation state.
    *   It likely maintains the ID of the currently active/viewed folder.
    *   It provides functions to navigate to a specific folder (e.g., `navigateToFolder(folderId)`) and to navigate up the hierarchy (`navigateUp()`).
*   **Breadcrumbs (`FolderBreadcrumbs.tsx`):
    *   Displays the path to the current folder (e.g., "Root > Folder A > Subfolder B").
    *   Each breadcrumb segment is clickable, allowing users to quickly jump to any parent folder in the current path. This is achieved by calling `navigateToFolder` from the `useFolderNavigation` hook.
*   **Displaying Folder Contents:**
    *   When the current folder changes (via `useFolderNavigation`), `DocumentCardGrid.tsx` (or a similar component) re-fetches or filters its data to display only the documents and subfolders contained within the active folder.
    *   API calls (`GET /api/folders/{folderId}` or filtering data from `GET /api/file-manager` / `GET /api/folders?parentId=...`) are used to retrieve the contents of the selected folder.
*   **Lazy Loading:** To improve performance, especially with deeply nested structures, folder contents (subfolders and documents) might be lazy-loaded. When a user clicks to enter a folder, an API request is made to fetch its specific contents, rather than loading the entire folder tree upfront.
*   **Root Folder Handling:** A special representation or `null` `folderId` signifies the root directory.

### 5.3. Search Integration

*   **Search Input:** A search bar UI element (likely within `DocumentCardGrid.tsx` or a dedicated header component) allows users to type their search queries.
*   **API Endpoint:** The `POST /api/search-documents` endpoint is used for executing searches.
    *   As described in the API Interfaces section, this endpoint combines title, content (BM25), and semantic (embedding-based) search methods, returning a ranked list of documents.
*   **Triggering Search:** Search can be triggered on input change (with debouncing) or on explicit submission (e.g., pressing Enter).
*   **Displaying Results:**
    *   When search results are received, `DocumentCardGrid.tsx` updates to display only the matching documents. Folders are typically hidden or de-emphasized during an active search.
    *   The `similarity` score or ranking from the API response can be used to order the results.
    *   A visual indicator (e.g., "Search results for 'query'") informs the user that they are viewing search results.
*   **Clearing Search:** A mechanism (e.g., a clear button in the search bar or an empty query) restores the view to the regular folder navigation mode, displaying contents of the currently selected folder.
*   **No Folder Search in Card View (Current Impl. Focus):** The current focus for card view search is on documents. While the backend might support broader search, the UI integration in the card view seems to primarily display document results when a search is active. Folders are generally navigated, not searched within this specific UI paradigm.

## 6. Known Limitations and Future Enhancements

### 6.1. Known Limitations

*   **Performance with Extremely Large Number of Items:** While virtualization is implemented, displaying folders or search results with tens of thousands of items simultaneously in a single view might still experience some UI lag during initial load or rapid scrolling. The backend is generally performant, but frontend rendering of many complex cards can be a bottleneck.
*   **Limited Offline Support:** The file browser currently relies heavily on active internet connectivity and real-time Supabase updates. True offline mode with local caching and synchronization is not yet implemented.
*   **No Advanced Sorting/Filtering for Folders:** While documents can be sorted by various criteria (if implemented in UI), folders are typically sorted by name. Advanced filtering or sorting options for folders themselves are not present.
*   **Single File Operations for Drag/Drop:** The current drag and drop implementation likely focuses on single item (document or folder) drag operations. Multi-select and drag for batch operations might be limited or not fully supported.
*   **Search Scope:** Search is primarily document-focused. Searching for folders by name within the main search bar is not a primary feature of the document search API used.
*   **Real-time Conflict Resolution (Advanced):** For highly collaborative scenarios, advanced real-time conflict resolution (e.g., if two users move the same file simultaneously to different locations) might have basic handling (last write wins) but lacks sophisticated merging or notification strategies.

### 6.2. Future Enhancements

*   **Multi-Select & Batch Operations:** Implement the ability to select multiple cards (documents and/or folders) and perform batch actions like move, delete, or star.
*   **Enhanced Folder Previews:** Provide more detailed previews on folder cards, such as icons for the types of documents within or a configurable number of item names.
*   **Advanced Sorting and Filtering Options:** Introduce more comprehensive sorting (e.g., by size, type for documents within folders) and filtering capabilities directly within the card grid view, for both documents and potentially folders.
*   **Context Menus:** Implement right-click context menus on cards for quick access to common actions (Rename, Delete, Move, Star, Get Info, etc.).
*   **Improved Mobile/Touch Responsiveness:** Further optimize the card layout and drag-and-drop interactions for smaller screens and touch-based devices.
*   **Offline Mode Capabilities:** Explore strategies for basic offline viewing of cached document metadata and potentially content, with synchronization upon reconnection.
*   **Folder Sharing/Permissions (If Applicable):** If the broader application supports sharing, integrate folder-level sharing and permission indicators.
*   **Integration with Version History:** Provide visual cues or quick access to a document's version history directly from its card.
*   **Customizable Grid/List View Toggle:** Allow users to switch between the current card grid view and a more compact list view for displaying items.

## 7. Troubleshooting

### 7.1. Common Issues & Solutions

*   **Issue: Cards not loading or showing errors.**
    *   **Solution:** Check internet connectivity. Verify user authentication status (try logging out and back in). Open browser developer tools (Network tab) to inspect API calls for errors (e.g., 401, 404, 500). Check console for JavaScript errors.
*   **Issue: Drag and drop not working as expected.**
    *   **Solution:** Ensure no browser extensions are interfering. Try a hard refresh (Ctrl/Cmd + Shift + R). Check console for errors related to `@dnd-kit`.
*   **Issue: Search results are not accurate or incomplete.**
    *   **Solution:** Ensure the search query is specific enough. Allow some time for new documents to be indexed if recently added. Check the `/api/search-documents` call in the Network tab for any errors or unexpected responses.
*   **Issue: Folder navigation is slow or unresponsive.**
    *   **Solution:** If dealing with folders containing a very large number of items, some delay might be expected. Check API response times for `GET /api/folders/{folderId}`. Report persistent slowness as a performance bug.
*   **Issue: Star/favorite status not updating.**
    *   **Solution:** Check the `PATCH /api/documents/{documentId}/star` API call in the Network tab. Ensure it returns a 200 OK and the correct new status. UI might be out of sync if the API call fails silently.

### 7.2. Debugging Tips

*   **Browser Developer Tools:** Extensively use the Console, Network, and Application (for local storage/cookies) tabs.
*   **React Developer Tools:** Inspect component props and state, especially for `DocumentCardGrid`, `DocumentCard`, `FolderCard`, and relevant hooks like `useFileMediaStore` and `useFolderNavigation`.
*   **Supabase Dashboard:** Check Supabase logs for API errors, database query issues, or RLS policy problems.
*   **API Testing Tools (e.g., Postman, Insomnia):** Directly test the backend API endpoints (as documented in Section 3) to isolate frontend vs. backend issues.
*   **Rate Limiting:** If requests are failing with 429 errors, it indicates rate limiting is being hit. Wait for the reset period or investigate the cause of high request volume. 