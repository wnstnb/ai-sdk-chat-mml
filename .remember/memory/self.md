Implemented the theme toggle button functionality in the Header component.

Applied theme CSS variables to components within `app/editor/page.tsx` (chat input, messages, right panel placeholder) to ensure consistent dark/light mode appearance.

Updated main layout containers in `app/editor/page.tsx` to use CSS theme variables instead of hardcoded Tailwind light/dark classes.

Applied theme variables to the pinned chat input container and collapse/expand button in `app/editor/page.tsx`.

Adjusted flex properties in the chat panel (`app/editor/page.tsx`) to fix the chat input being cut off due to height issues.

Moved placeholder 'New' (DocumentPlusIcon) and 'Save' (ArrowDownTrayIcon) buttons from `components/header.tsx` to the editor panel's title bar within `app/editor/page.tsx`.

Created `prds/supabase_implementation.md` outlining the plan for Auth, DB, Storage, and RLS.

Added a `metadata` JSONB column to the `messages` table schema in `prds/supabase_implementation.md` to store token counts, cost, and tool call information.

Added details to `prds/supabase_implementation.md` for the `/launch` page, including using `@cubone/react-file-manager`, refining the `documents` table schema (`title` -> `name`), and specifying the user flows for creating/loading documents.

Revised the implementation approach in `prds/supabase_implementation.md` to prioritize using Next.js API routes for secure server-side data handling with Supabase, rather than direct client-side database calls.

Updated `prds/supabase_implementation.md`: added `tool_calls` table, raw SQL DDL, specified signed URLs for storage, proposed middleware for route protection, and added placeholders for error handling.
Created initial `README.md` with setup instructions (env vars, DB schema, storage bucket).
