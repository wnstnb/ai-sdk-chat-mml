# **Document Versioning Requirements (Updated)**

## **1. Overview**

Implement a version control system for the note-taking app to track and manage document changes. The system will maintain a history of the last 15 autosaves and 5 manual saves per document, using separate tables for each.

## **2. Data Structure**

* **Documents Table**: Stores the current version of each document.

  * `document_id` (Primary Key)
  * `user_id`
  * `content` (latest content)
  * `last_modified`

* **Autosaves Table**: Stores the last 15 autosaved versions per document.

  * `autosave_id` (Primary Key)
  * `document_id` (Foreign Key)
  * `content`
  * `autosave_timestamp`

* **Manual Saves Table**: Stores the last 5 manually saved versions per document.

  * `manual_save_id` (Primary Key)
  * `document_id` (Foreign Key)
  * `content`
  * `manual_save_timestamp`

## **3. Autosave Logic**

* Autosave triggers after a user stops typing for a set period (e.g., 5 seconds).
* The new content is saved into the **Autosaves Table**.
* If there are more than 15 autosaves for a document, the oldest entry is deleted to maintain a maximum of 15.

## **4. Manual Save Logic**

* Manual saves occur when a user explicitly chooses to save.
* The new content is saved into the **Manual Saves Table**.
* If there are more than 5 manual saves for a document, the oldest entry is deleted to maintain a maximum of 5.

## **5. UI/UX Integration**

* Provide an interface that allows users to view and restore from the list of autosaved and manual versions.
* Clearly differentiate between autosave and manual save entries in the UI.
* Allow users to access a unified view of all versions using a union of the two tables.

## **6. Implementation Steps**

This section outlines the detailed steps to implement the document versioning system.

### **6.1. Database Schema (Supabase - PostgreSQL DDL)**

Ensure you have the `uuid-ossp` extension enabled in Supabase if it's not already (for `uuid_generate_v4()`). Run the following SQL commands in your Supabase SQL editor:

```sql
-- Autosaves Table: Stores the last 15 autosaved versions per document.
CREATE TABLE public.document_autosaves (
    autosave_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    content JSONB, -- Assuming content can be rich text/JSON, like in the main documents table. Adjust to TEXT if plain text.
    autosave_timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- To ensure RLS can be applied effectively

    CONSTRAINT fk_document
        FOREIGN KEY(document_id)
        REFERENCES public.documents(id)
        ON DELETE CASCADE, -- If a document is deleted, its autosaves are also deleted.

    CONSTRAINT fk_user
        FOREIGN KEY(user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE
);

-- Indexes for Autosaves Table
CREATE INDEX idx_document_autosaves_document_id_timestamp ON public.document_autosaves(document_id, autosave_timestamp DESC);
CREATE INDEX idx_document_autosaves_user_id ON public.document_autosaves(user_id);

-- RLS for Autosaves Table
ALTER TABLE public.document_autosaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to manage their own document autosaves"
ON public.document_autosaves
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- Manual Saves Table: Stores the last 5 manually saved versions per document.
CREATE TABLE public.document_manual_saves (
    manual_save_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    content JSONB, -- Assuming content can be rich text/JSON. Adjust to TEXT if plain text.
    manual_save_timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- To ensure RLS can be applied effectively

    CONSTRAINT fk_document
        FOREIGN KEY(document_id)
        REFERENCES public.documents(id)
        ON DELETE CASCADE, -- If a document is deleted, its manual saves are also deleted.

    CONSTRAINT fk_user
        FOREIGN KEY(user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE
);

-- Indexes for Manual Saves Table
CREATE INDEX idx_document_manual_saves_document_id_timestamp ON public.document_manual_saves(document_id, manual_save_timestamp DESC);
CREATE INDEX idx_document_manual_saves_user_id ON public.document_manual_saves(user_id);

-- RLS for Manual Saves Table
ALTER TABLE public.document_manual_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to manage their own document manual saves"
ON public.document_manual_saves
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Function to delete oldest autosaves for a document (maintaining max 15)
CREATE OR REPLACE FUNCTION delete_old_autosaves()
RETURNS TRIGGER AS $$
DECLARE
  max_autosaves INTEGER := 15;
  current_autosaves INTEGER;
  oldest_autosave_id UUID;
BEGIN
  SELECT count(*) INTO current_autosaves FROM public.document_autosaves WHERE document_id = NEW.document_id;

  IF current_autosaves > max_autosaves THEN
    SELECT autosave_id INTO oldest_autosave_id
    FROM public.document_autosaves
    WHERE document_id = NEW.document_id
    ORDER BY autosave_timestamp ASC
    LIMIT 1;

    DELETE FROM public.document_autosaves WHERE autosave_id = oldest_autosave_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call delete_old_autosaves after an insert on document_autosaves
CREATE TRIGGER trigger_delete_old_autosaves
AFTER INSERT ON public.document_autosaves
FOR EACH ROW EXECUTE FUNCTION delete_old_autosaves();


-- Function to delete oldest manual saves for a document (maintaining max 5)
CREATE OR REPLACE FUNCTION delete_old_manual_saves()
RETURNS TRIGGER AS $$
DECLARE
  max_manual_saves INTEGER := 5;
  current_manual_saves INTEGER;
  oldest_manual_save_id UUID;
BEGIN
  SELECT count(*) INTO current_manual_saves FROM public.document_manual_saves WHERE document_id = NEW.document_id;

  IF current_manual_saves > max_manual_saves THEN
    SELECT manual_save_id INTO oldest_manual_save_id
    FROM public.document_manual_saves
    WHERE document_id = NEW.document_id
    ORDER BY manual_save_timestamp ASC
    LIMIT 1;

    DELETE FROM public.document_manual_saves WHERE manual_save_id = oldest_manual_save_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call delete_old_manual_saves after an insert on document_manual_saves
CREATE TRIGGER trigger_delete_old_manual_saves
AFTER INSERT ON public.document_manual_saves
FOR EACH ROW EXECUTE FUNCTION delete_old_manual_saves();

```

**Note on existing `documents` table:**
The PRD refers to `last_modified` in the `Documents Table`. Your existing `documents` table has `updated_at`. We will use `updated_at` for this purpose. The `content` field in the `documents` table will continue to store the latest/current version of the document.

### **6.2. Backend API Modifications (Next.js API Routes)**

You will need to modify existing API routes and potentially create new ones.

1.  **Modify `PUT /api/documents/[documentId]/content` (Current Autosave Endpoint)**:
    *   This endpoint is currently called by the frontend's existing autosave logic (`handleEditorChange` in `app/editor/[documentId]/page.tsx`).
    *   **Modification:**
        1.  Before updating the main `documents` table, first insert a new record into `public.document_autosaves`:
            *   `document_id`: from the route parameter.
            *   `content`: the new `content` (JSONB) received in the request body.
            *   `user_id`: the authenticated user's ID.
            *   `autosave_timestamp`: can be `DEFAULT now()`.
        2.  The database trigger `trigger_delete_old_autosaves` will automatically handle pruning if the count exceeds 15.
        3.  Then, proceed to update the `documents` table's `content`, `searchable_content` (if provided), and `updated_at` fields as it currently does. This ensures the main document table always has the absolute latest version.
    *   The response can remain the same (e.g., `{ data: { updated_at: updatedDocInfo.updated_at } }`).

2.  **New Endpoint for Manual Save: `POST /api/documents/[documentId]/manual-save`**:
    *   **Request Body:** `{ "content": "...", "searchable_content": "..." }` (JSONB for `content`, TEXT for `searchable_content`).
    *   **Logic:**
        1.  Get `documentId` from path and `userId` from session.
        2.  Get `content` and `searchable_content` from request body.
        3.  Insert a new record into `public.document_manual_saves`:
            *   `document_id`: `documentId`.
            *   `content`: `content` from request body.
            *   `user_id`: `userId`.
            *   `manual_save_timestamp`: `DEFAULT now()`.
        4.  The database trigger `trigger_delete_old_manual_saves` will handle pruning if count exceeds 5.
        5.  Update the `content`, `searchable_content`, and `updated_at` fields in the main `public.documents` table with the new `content` and `searchable_content`. This is crucial because a manual save also updates the "current" version of the document.
    *   **Response (201 Created):** `{ data: { manual_save_id: string, manual_save_timestamp: string, updated_at: string } }` (or similar, confirming the save and the update to the main document).

3.  **New Endpoints to List Versions:**
    *   **`GET /api/documents/[documentId]/versions/autosaves`**:
        *   Fetches all autosaves for the given `documentId` and authenticated `userId`.
        *   Orders by `autosave_timestamp DESC`.
        *   Returns an array of autosave records (`autosave_id`, `content`, `autosave_timestamp`).
    *   **`GET /api/documents/[documentId]/versions/manual-saves`**:
        *   Fetches all manual saves for the given `documentId` and authenticated `userId`.
        *   Orders by `manual_save_timestamp DESC`.
        *   Returns an array of manual save records (`manual_save_id`, `content`, `manual_save_timestamp`).
    *   **`GET /api/documents/[documentId]/versions` (Unified View)**:
        *   This endpoint will perform a `UNION ALL` query on `document_autosaves` and `document_manual_saves` for the given `documentId` and `userId`.
        *   It should select common fields and add a `save_type` field ('autosave' or 'manual_save').
        *   Example SQL (to be executed via Supabase client):
            ```sql
            SELECT
                autosave_id AS version_id,
                content,
                autosave_timestamp AS timestamp,
                'autosave' AS save_type,
                user_id
            FROM document_autosaves
            WHERE document_id = $1 AND user_id = $2
            UNION ALL
            SELECT
                manual_save_id AS version_id,
                content,
                manual_save_timestamp AS timestamp,
                'manual_save' AS save_type,
                user_id
            FROM document_manual_saves
            WHERE document_id = $1 AND user_id = $2
            ORDER BY timestamp DESC;
            ```
        *   Replace `$1` with `documentId` and `$2` with `userId`.
        *   Returns an array of version records.

4.  **New Endpoint to Restore a Version (e.g., `POST /api/documents/[documentId]/versions/restore`)**:
    *   **Request Body:** `{ "version_id": "...", "save_type": "autosave" | "manual_save" }`
    *   **Logic:**
        1.  Get `documentId` from path, `userId` from session.
        2.  Get `version_id` and `save_type` from request body.
        3.  Based on `save_type`:
            *   If 'autosave', fetch the content from `document_autosaves` where `autosave_id = version_id`.
            *   If 'manual_save', fetch the content from `document_manual_saves` where `manual_save_id = version_id`.
        4.  Ensure the fetched version belongs to the `documentId` and `userId` (RLS should mostly cover this, but an explicit check is good).
        5.  If the version is found:
            *   Fetch the `content` (JSONB) of the selected version.
            *   **Crucially:** Generate `searchable_content` (TEXT) from this restored `content` (e.g., by using a server-side Markdown conversion if possible, or the client sends it if simpler, though less ideal for a pure restore endpoint).
            *   Update the `content`, `searchable_content`, and `updated_at` in the main `public.documents` table with the fetched/generated content.
            *   **Recommended:** Create a new *autosave* of the content that was current *before* this restoration. This new autosave should be created *before* overwriting `documents.content` with the restored version. This provides a way to revert the restore action.
        6.  Respond with success (e.g., the updated `documents.updated_at` timestamp) or failure.

### **6.3. Frontend Implementation (`app/editor/[documentId]/page.tsx` and related components)**

1.  **Autosave Trigger (Leverage Existing):**
    *   The existing `handleEditorChange` function in `app/editor/[documentId]/page.tsx` (lines ~240-310) which debounces and calls `PUT /api/documents/[documentId]/content` will continue to function.
    *   Ensure it still passes both `content` (JSON from editor) and `searchable_content` (Markdown from editor) to the (now modified) backend endpoint.

2.  **Manual Save Button (Modify Existing):**
    *   The existing `handleSaveContent` function in `app/editor/[documentId]/page.tsx` (lines ~317-350) and its corresponding UI button in `EditorTitleBar` will be modified.
    *   Instead of its current implementation (which effectively calls `PUT /api/documents/[documentId]/content`), `handleSaveContent` should:
        1.  Get current editor content (JSON) and generate `searchable_content` (Markdown) from it.
        2.  Call the new `POST /api/documents/[documentId]/manual-save` endpoint with this `content` and `searchable_content`.
        3.  Update UI state (e.g., `autosaveStatus`, toasts) based on the response.

3.  **Version History UI & Logic (New):**

    *   **Button in `EditorTitleBar`:**
        *   Add a new button (e.g., "History" or an icon like `Clock`) to the `EditorTitleBar` component.
        *   Clicking this button will toggle the visibility of a new Version History Modal.

    *   **Version History Modal Component (e.g., `VersionHistoryModal.tsx`):**
        *   **State:**
            *   `isOpen`: boolean to control modal visibility.
            *   `versions`: array to store fetched versions (unified list from `GET /api/documents/[documentId]/versions`).
            *   `selectedVersionContent`: BlockNote `PartialBlock[]` or `Block[]` to display in the preview editor.
            *   `selectedVersionId`: string, the ID of the currently selected version in the dropdown.
            *   `selectedVersionType`: 'autosave' | 'manual_save'.
            *   `isLoadingVersions`: boolean.
            *   `isRestoring`: boolean.
        *   **Appearance:**
            *   Modal/Overlay styling that blurs or de-emphasizes the main editor and chat pane.
            *   Respects existing dark/light mode themes.
        *   **On Open:**
            *   Fetch all versions by calling `GET /api/documents/[documentId]/versions`.
            *   Populate a dropdown menu with these versions. Each item should display the version type (Autosave/Manual Save) and timestamp. Format timestamp to be user-friendly.
            *   Initially, select the most recent version from the fetched list and display its content in the preview editor.
        *   **Version Preview Editor:**
            *   Instance of `<BlockNoteEditorComponent />` (or a wrapper around it). Using BlockNote for the preview ensures that the stored JSONB content (native BlockNote format) from `document_autosaves.content` or `document_manual_saves.content` is rendered accurately, consistently with the main editor, and loads cleanly.
            *   **Uneditable:** Set `editable={false}`.
            *   The `initialContent` (or a similar prop to set content dynamically) should be bound to `selectedVersionContent`.
            *   Should also adapt to dark/light mode.
        *   **Dropdown/Version Selector:**
            *   Allows users to choose a version from the `versions` list.
            *   On selection change:
                *   Update `selectedVersionId` and `selectedVersionType`.
                *   Update `selectedVersionContent` with the content of the newly selected version. This will re-render the preview editor.
        *   **"Restore this Version" Button:**
            *   Enabled only if a version is selected.
            *   On click:
                1.  Set `isRestoring` to true.
                2.  Call `POST /api/documents/[documentId]/versions/restore` with `version_id: selectedVersionId` and `save_type: selectedVersionType`.
                3.  On success:
                    *   Close the modal.
                    *   The main editor in `app/editor/[documentId]/page.tsx` needs to be refreshed/updated to show the restored content. This might involve the main page re-fetching the document or the restore endpoint returning the full document content. The simplest might be to have the `EditorPage` listen for a custom event or have a callback prop passed to the modal that triggers a re-fetch of the document content upon successful restoration.
                    *   Show a success toast.
                4.  On failure: Show an error toast.
                5.  Set `isRestoring` to false.
        *   **"Close" Button:** To close the modal.

4.  **Main Editor Page (`app/editor/[documentId]/page.tsx`) Integration:**
    *   Manage the `isVersionHistoryModalOpen` state.
    *   Pass this state and a toggle function to `EditorTitleBar`.
    *   Render the `VersionHistoryModal` component conditionally based on `isVersionHistoryModalOpen`.
    *   Provide a callback function to `VersionHistoryModal` that can be called upon successful restoration to trigger a refresh of the main editor's content (e.g., by re-fetching document data via `useDocument` or directly updating editor state if the restore API returns the content).

### **6.4. Testing**

1.  **Database:**
    *   Test the triggers `trigger_delete_old_autosaves` and `trigger_delete_old_manual_saves` by inserting more than the allowed number of records for a single document and verifying that the oldest ones are deleted.
    *   Test `ON DELETE CASCADE` by deleting a document and verifying its associated autosaves and manual saves are also deleted.
    *   Test RLS policies.
2.  **Backend API:**
    *   Write unit/integration tests for all new and modified API endpoints:
        *   Autosave creation and pruning.
        *   Manual save creation and pruning.
        *   Listing autosaves, manual saves, and unified versions.
        *   Restoring a version (ensure `documents.content` is updated).
        *   Authentication and authorization checks.
3.  **Frontend:**
    *   Test autosave triggering after typing stops.
    *   Test manual save button.
    *   Test display of version history (autosaves, manual saves, unified).
    *   Test restoring different versions.
    *   Test UI feedback and error handling.

This provides a comprehensive plan. Remember to handle errors gracefully at each step (API responses, frontend display).
