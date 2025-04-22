Theme toggling (light/dark mode) is handled in `components/header.tsx` and requires `onToggleTheme` and `currentTheme` props.

Components within `app/editor/page.tsx` (like chat input, message bubbles, file previews, right panel) use CSS variables (e.g., `--input-bg`, `--message-bg`, `--bg-secondary`, `--text-color`) defined in `app/globals.css` for theme consistency.

The main layout containers in `app/editor/page.tsx` (overall page, editor panel, chat panel) use `bg-[--bg-color]`, `border-[--border-color]`, `bg-[--editor-bg]`, `bg-[--bg-secondary]` variables for theming.

The pinned chat input (when chat panel is collapsed) and the collapse/expand button in `app/editor/page.tsx` also use theme variables (`--editor-bg`, `--toggle-button-bg`, `--border-color`, etc.).

The message list container within the chat panel (`app/editor/page.tsx`) uses `flex-1` to ensure it takes available space without overlapping the chat input area below it.

Placeholder 'New' and 'Save' buttons (using `DocumentPlusIcon` and `ArrowDownTrayIcon` from Heroicons) are located in the editor panel's title bar in `app/editor/page.tsx`. They are styled using theme variables (`--text-color`, `--hover-bg`) for light/dark mode.

The plan for integrating Supabase (Auth, DB, Storage, RLS) is detailed in `prds/supabase_implementation.md`.

The `messages` table schema in the Supabase plan (`prds/supabase_implementation.md`) includes a `metadata` (JSONB) column to store details like token usage, cost, and AI tool calls.

The Supabase plan (`prds/supabase_implementation.md`) specifies:
* A `/launch` page will serve as the document dashboard.
* `@cubone/react-file-manager` will be used on `/launch` to list documents.
* The `documents` table uses a `name` field (instead of `title`).
* Submitting the input field on `/launch` creates a new document and redirects to the editor.
* Clicking a document in the file manager loads it in the editor.

The database schema includes a `folders` table (`id`, `user_id`, `name`, `parent_folder_id`) to manage hierarchy.
The `documents` table has a nullable `folder_id` foreign key.
RLS policies are defined for the `folders` table based on `user_id`.
The file manager on `/launch` will handle fetching/displaying folders and documents, and allow folder operations (create, rename, delete, move documents).
* Implementation will use Next.js API routes (`app/api/...`) to securely interact with Supabase on the server-side for all data operations (CRUD), rather than direct client-side calls (except potentially for Auth state).
* A `tool_calls` table (`id`, `message_id`, `user_id`, `tool_name`, `tool_input`, `tool_output`) stores details of AI tool interactions, linked to the `messages` table.
* The `message_images` storage bucket is private; access requires server-generated signed URLs.
* Route protection for `/launch` and `/editor/*` will be handled by Next.js middleware checking Supabase sessions.
* Raw SQL DDL for the schema is provided in `prds/supabase_implementation.md` for manual application.
* A `README.md` file includes initial setup instructions.

API routes defined in `prds/supabase_implementation.md` include:
*   `GET /api/file-manager` (fetches user's documents & folders).
*   CRUD endpoints for `/api/folders` and `/api/documents` (metadata updates).
*   `POST /api/launch` (creates new doc + first message).
*   `GET /api/documents/[documentId]` (fetches doc details).
*   `PUT /api/documents/[documentId]/content` (updates doc content).
*   `GET /api/documents/[documentId]/messages` (fetches messages, includes signed image download URLs).
*   `POST /api/documents/[documentId]/messages` (creates user message).
*   `POST /api/storage/signed-url/upload` (generates image upload URL).
Tool call creation is handled server-side during AI response processing.

The editor page (`app/editor/[documentId]`) will be modified to:
*   Fetch document details (`GET /api/documents/[documentId]`) and messages (`GET /api/documents/[documentId]/messages`) on load.
*   Use fetched data to populate the editor title, content, and chat display (including images via signed URLs).
*   Implement the 'Save' button to call `PUT /api/documents/[documentId]/content`.
*   Handle chat input submission via `POST /api/documents/[documentId]/messages`, including image upload flow (get signed URL, upload file, then post message with image path).
*   The 'New Document' button will navigate to `/launch`.
*   Requires state management for document data, messages, editor content, loading, and errors.

A `middleware.ts` file has been created at the project root to handle route protection:
*   Uses `@supabase/ssr`'s `createMiddlewareClient`.
*   Checks for a valid session using `supabase.auth.getSession()`.
*   Redirects unauthenticated users from protected routes (`/launch`, `/editor/*`) to `/login`.
*   Redirects authenticated users from `/login` to `/launch`.
*   Refreshes session cookies automatically.
*   Uses a matcher config to exclude API routes and static assets.

API route error handling follows a standard format:
*   Errors return appropriate HTTP status codes (4xx/5xx).
*   The JSON response body is `{ error: { code: string, message: string, details?: any } }`.
*   Common codes include `INVALID_INPUT`, `UNAUTHENTICATED`, `UNAUTHORIZED_ACCESS`, `NOT_FOUND`, `SERVER_ERROR`.
*   Details are documented in `prds/supabase_implementation.md`.
