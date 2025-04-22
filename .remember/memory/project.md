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
