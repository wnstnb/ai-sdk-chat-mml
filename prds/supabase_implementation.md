# Supabase Implementation Plan

This document outlines the plan for integrating Supabase for Authentication, Database Storage, Row Level Security (RLS), and File Storage (S3) into the AI SDK Chat MML application.

**Credentials:**

The following environment variables are assumed to be configured:

*   `NEXT_PUBLIC_SUPABASE_URL`
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`
*   `SUPABASE_SERVICE_ROLE_KEY` (Required for server-side operations in API routes)
*   `NEXT_PUBLIC_S3_REGION` (Potentially needed for custom S3, but Supabase Storage abstracts this)
*   `NEXT_PUBLIC_S3_ENDPOINT` (Potentially needed for custom S3, but Supabase Storage abstracts this)

**High-Level Goals:**

1.  **Authentication:** Secure user login and registration.
2.  **Database:** Persist document content and associated chat messages.
3.  **Storage:** Store images uploaded within chat messages.
4.  **Security:** Implement RLS to ensure users can only access their own data.

**Expected User Outcomes:**

*   Users can log in/sign up via the existing login page (`@app/login`).
*   After login, users have the option to start a new document or load an existing one (requires a new dashboard/selection page).
*   Users can load previous documents and their corresponding chat messages into the editor view.
*   Images uploaded in chat messages are stored and displayed correctly.
*   The existing 'Save' button persists the current document content.
*   The existing 'New Document' button creates a new, blank document record and navigates the user to it.

**Initial Technical Plan:**

*   **Authentication:**
    *   Use Supabase Auth.
    *   Integrate with `app/login/page.tsx`.
    *   Manage sessions using the Supabase client library (`@supabase/supabase-js`).
*   **Database:**
    *   **`documents` Table:** (Refined for File Manager compatibility)
        *   `id` (uuid, primary key, default: `gen_random_uuid()`)
        *   `user_id` (uuid, foreign key to `auth.users.id`)
        *   `name` (text, not null, default: 'Untitled Document') // Changed from title for file manager
        *   `content` (jsonb or text, depending on editor format)
        *   `folder_id` (uuid, foreign key to `folders.id`, nullable) // Link to parent folder
        *   `created_at` (timestamp with time zone, default: `now()`)
        *   `updated_at` (timestamp with time zone, default: `now()`)
        *   // Add index on user_id and updated_at for efficient querying
        *   // Add index on folder_id
    *   **`folders` Table:** (New table for hierarchy)
        *   `id` (uuid, primary key, default: `gen_random_uuid()`)
        *   `user_id` (uuid, foreign key to `auth.users.id`)
        *   `name` (text, not null)
        *   `parent_folder_id` (uuid, foreign key to `folders.id`, nullable) // For nested folders
        *   `created_at` (timestamp with time zone, default: `now()`)
        *   `updated_at` (timestamp with time zone, default: `now()`)
        *   // Add index on user_id
        *   // Add index on parent_folder_id
    *   **`messages` Table:**
        *   `id` (uuid, primary key, default: `gen_random_uuid()`)
        *   `document_id` (uuid, foreign key to `documents.id`, cascade delete)
        *   `user_id` (uuid, foreign key to `auth.users.id`) // Tracks who sent the message (user or potentially AI later)
        *   `role` (text, e.g., 'user', 'assistant')
        *   `content` (text)
        *   `image_url` (text, nullable) // URL to image stored in Supabase Storage
        *   `created_at` (timestamp with time zone, default: `now()`)
        *   `metadata` (jsonb, nullable) // Store additional data like token count, cost, model used, etc.
    *   **`tool_calls` Table:** (New table for AI tool interactions)
        *   `id` (uuid, primary key, default: `gen_random_uuid()`)
        *   `message_id` (uuid, foreign key to `messages.id`, cascade delete)
        *   `user_id` (uuid, foreign key to `auth.users.id`) // Denormalized for easier RLS
        *   `tool_name` (text, not null)
        *   `tool_input` (jsonb, nullable)
        *   `tool_output` (jsonb, nullable)
        *   `created_at` (timestamp with time zone, default: `now()`)
        *   // Add index on message_id
        *   // Add index on user_id
*   **Storage:**
    *   Use Supabase Storage.
    *   Create a **private** bucket named `message_images`.
    *   Store uploaded images associated with messages.
    *   Access images via **server-generated signed URLs** requested through an API route.
*   **Row Level Security (RLS):**
    *   Enable RLS on `documents`, `messages`, `folders`, and `tool_calls` tables.
    *   **`documents` Policies:**
        *   `SELECT`: Users can select their own documents (`auth.uid() = user_id`).
        *   `INSERT`: Users can insert documents for themselves (`auth.uid() = user_id`).
        *   `UPDATE`: Users can update their own documents (`auth.uid() = user_id`).
        *   `DELETE`: Users can delete their own documents (`auth.uid() = user_id`).
    *   **`folders` Policies:** (New)
        *   `SELECT`: Users can select their own folders (`auth.uid() = user_id`).
        *   `INSERT`: Users can insert folders for themselves (`auth.uid() = user_id`).
        *   `UPDATE`: Users can update their own folders (`auth.uid() = user_id`).
        *   `DELETE`: Users can delete their own folders (`auth.uid() = user_id`).
    *   **`messages` Policies:**
        *   `SELECT`: Users can select messages belonging to documents they own (`auth.uid() = user_id` AND `document_id` is owned by `auth.uid()`). Need to check ownership via join or function.
        *   `INSERT`: Users can insert messages for documents they own (`auth.uid() = user_id` AND `document_id` is owned by `auth.uid()`).
    *   **`tool_calls` Policies:** (New)
        *   `SELECT`: Users can select tool calls associated with messages they can access (`auth.uid() = user_id` AND `message_id` is linked to a message they can access - requires check).
        *   `INSERT`: Users can insert tool calls for messages they own (`auth.uid() = user_id` AND `message_id` is linked to a message they own).
    *   **Storage Policies:**
        *   Bucket `message_images` should be **private**.
        *   `INSERT`: Authenticated users can upload to `message_images` (via API route).
        *   `SELECT`: No direct select policy needed; access is granted via signed URLs generated server-side.
*   **Implementation Approach:** (Revised for Security)
    *   Create a Supabase client helper (`lib/supabase/client.ts` for client-side use, e.g., Auth state) and potentially a server-side client (`lib/supabase/server.ts` for API routes).
    *   **API Routes:** Implement Next.js API routes (`app/api/...`) to handle all database and storage interactions (CRUD operations for documents, folders, messages, image uploads).
        *   API routes will use the Supabase server-side client.
        *   API routes will perform necessary authentication/authorization checks (verifying user session) before interacting with Supabase.
        *   This adds a layer of security beyond RLS, ensuring data access logic resides on the server.
    *   **Client-Side:** Frontend components will call these internal API routes, not interact with Supabase DB/Storage directly (except potentially for Auth state listeners).
    *   **Dependencies:** Add `@supabase/supabase-js`, `@cubone/react-file-manager`.
    *   **UI Components:**
        *   Modify `app/login/page.tsx` for Supabase Auth.
        *   Create `app/launch/page.tsx` (New):
            *   Displays a large chat input ("What do you want to focus on?").
            *   Uses `@cubone/react-file-manager` below the input to list user's documents **and folders**.
            *   File manager fetches documents and folders where `user_id = auth.uid()`, handling hierarchy via `parent_folder_id`.
            *   Input Submission Flow:
                *   On submit, insert a new row into the `documents` table (user_id = `auth.uid()`, default `name`, empty `content`).
                *   *(Clarification:* Decide if the input text should populate the initial name, content, or first message). Assume creates blank doc for now.
                *   Redirect user smoothly to `/editor/[new_document_id]`.
            *   Document Click Flow:
                *   Clicking a document in the file manager redirects the user to `/editor/[selected_document_id]`.
            *   **(New)** Folder Management:
                *   File manager UI should allow creating, renaming, deleting folders.
                *   File manager UI should allow moving documents between folders (updates `documents.folder_id`).
        *   Modify `app/editor/page.tsx`:
            *   Load document `content` based on the `[document_id]` route parameter.
            *   Load associated `messages` for the current document.
            *   Implement 'Save' button functionality (update `documents` table).
            *   Implement 'New Document' button functionality (insert new document, redirect to `/editor/[new_id]` or maybe back to `/launch`?). Let's redirect to the new document editor page.
    *   **Authentication & Route Protection:** (New Section)
        *   Utilize Next.js Middleware (`middleware.ts`) to protect routes requiring authentication (`/launch`, `/editor/*`).
        *   Middleware checks for a valid Supabase session.
        *   If no session, redirect unauthenticated users to the login page (`/login`).
        *   Store user session information securely (e.g., in httpOnly cookies managed by Supabase helpers).
    *   **API Route Error Handling:** (New Section)
        *   Define standardized error response formats for API routes (e.g., `{ error: { code: '...', message: '...' } }`).
        *   Implement consistent error handling and logging within API routes.
    *   **Database Schema (SQL DDL):** (New Section)
        *   **Instructions:** Apply the following SQL statements in the Supabase Studio SQL Editor or via `psql` connected to your database.
        ```sql
        -- Enable UUID extension if not already enabled
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        -- Folders Table
        CREATE TABLE public.folders (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES auth.users(id) NOT NULL,
          name TEXT NOT NULL,
          parent_folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL, -- Allow null for root folders, set null if parent deleted
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
        );
        -- Indexes for Folders
        CREATE INDEX idx_folders_user_id ON public.folders(user_id);
        CREATE INDEX idx_folders_parent_folder_id ON public.folders(parent_folder_id);
        -- RLS for Folders
        ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow users to manage their own folders" ON public.folders
          FOR ALL
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);

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
        -- Indexes for Documents
        CREATE INDEX idx_documents_user_id_updated_at ON public.documents(user_id, updated_at DESC);
        CREATE INDEX idx_documents_folder_id ON public.documents(folder_id);
        -- RLS for Documents
        ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow users to manage their own documents" ON public.documents
          FOR ALL
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);

        -- Messages Table
        CREATE TABLE public.messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL, -- Cascade delete messages if document deleted
          user_id UUID REFERENCES auth.users(id) NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), -- Example roles
          content TEXT,
          image_url TEXT, -- Stores the path within the bucket, not the full URL
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL
        );
        -- Indexes for Messages
        CREATE INDEX idx_messages_document_id_created_at ON public.messages(document_id, created_at ASC);
        CREATE INDEX idx_messages_user_id ON public.messages(user_id);
        -- RLS for Messages
        ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
        -- Helper function to check document ownership (needed for complex RLS)
        CREATE OR REPLACE FUNCTION public.is_document_owner(doc_id UUID) RETURNS BOOLEAN AS $$
          SELECT EXISTS (
            SELECT 1 FROM public.documents WHERE id = doc_id AND user_id = auth.uid()
          );
        $$ LANGUAGE sql SECURITY DEFINER;
        -- RLS Policies for Messages (Using Helper Function)
        CREATE POLICY "Allow users to view messages for their documents" ON public.messages
          FOR SELECT
          USING (auth.uid() = user_id AND public.is_document_owner(document_id));
        CREATE POLICY "Allow users to insert messages for their documents" ON public.messages
          FOR INSERT
          WITH CHECK (auth.uid() = user_id AND public.is_document_owner(document_id));
        -- Note: UPDATE/DELETE policies might be needed depending on functionality

        -- Tool Calls Table
        CREATE TABLE public.tool_calls (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
          user_id UUID REFERENCES auth.users(id) NOT NULL, -- Denormalized user_id
          tool_name TEXT NOT NULL,
          tool_input JSONB,
          tool_output JSONB,
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL
        );
        -- Indexes for Tool Calls
        CREATE INDEX idx_tool_calls_message_id ON public.tool_calls(message_id);
        CREATE INDEX idx_tool_calls_user_id ON public.tool_calls(user_id);
        -- RLS for Tool Calls
        ALTER TABLE public.tool_calls ENABLE ROW LEVEL SECURITY;
        -- Helper function to check message ownership (indirectly via document)
        CREATE OR REPLACE FUNCTION public.is_message_owner(msg_id UUID) RETURNS BOOLEAN AS $$
          SELECT EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.documents d ON m.document_id = d.id
            WHERE m.id = msg_id AND d.user_id = auth.uid()
          );
        $$ LANGUAGE sql SECURITY DEFINER;
        -- RLS Policies for Tool Calls (Using Helper Function)
        CREATE POLICY "Allow users to manage tool calls for their messages" ON public.tool_calls
          FOR ALL
          USING (auth.uid() = user_id AND public.is_message_owner(message_id))
          WITH CHECK (auth.uid() = user_id AND public.is_message_owner(message_id));

        -- Storage Bucket Setup (Manual Step in Supabase Dashboard)
        -- 1. Go to Storage -> Buckets -> Create Bucket
        -- 2. Name: `message_images`
        -- 3. **IMPORTANT:** Ensure 'Public bucket' is **unchecked**.
        -- 4. (Optional) Add file size limits, allowed MIME types in bucket settings.
        -- 5. Define Storage Access Policies (recommended via Dashboard UI for simplicity initially):
        --    - Allow authenticated users INSERT access (`insert` operation).
        --    - No explicit SELECT policy (access is via signed URLs).
        ```

**Next Steps:**

1.  ~~Refine database schema~~ (Addressed with DDL and `tool_calls` table).
2.  ~~Refine RLS policies~~ (Addressed with DDL, including helper functions).
3.  Detail the implementation steps for Auth integration (Client-side setup, login form handler).
4.  ~~Plan the dashboard page UI/UX.~~ (Covered by `/launch` page details).
5.  Plan the editor page modifications for data loading/saving and image handling (API calls, state management).
6.  Clarify the exact behavior of the input field on the `/launch` page upon submission.
7.  Define specific API route contracts (endpoints, request/response shapes) for documents, folders, messages, tool calls, and signed URLs.
8.  Implement Next.js Middleware for route protection.
9.  Flesh out API Route Error Handling standards.
10. Refine database indexes based on query patterns during development.


