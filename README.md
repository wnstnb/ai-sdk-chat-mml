# AI SDK Chat MML

This project is a chat interface combined with a document editor, leveraging AI capabilities.

## Features

### User-Facing Features

*   **Authentication:** Secure user login and session management via Supabase Auth.
*   **Document & Folder Management:** Create, view, organize, rename, and delete documents and folders via the launch page.
*   **Rich Text Document Editor (BlockNote):** 
    *   Edit documents with standard formatting options.
    *   **Autosave:** Changes are automatically saved after a brief period of inactivity.
    *   **Manual Save:** Option to save explicitly.
    *   Visual save status indicator (unsaved, saving, saved, error).
    *   **Follow-up Suggestions:** Add specific parts of content for AI followup.
*   **Document Search:** RAG system powered by Gemini embeddings + models for inroads to assistant creation.
*   **AI Title Generation:** Automatically suggest titles for documents based on content.
*   **AI-Powered Chat:** 
    *   Interact with an AI assistant within the context of the current document.
    *   Uses Vercel AI SDK.
    *   Supports selecting different AI models.
*   **Image Uploads:** Attach images to messages (uploads handled via Supabase Storage, accessed with signed URLs).
*   **User Preferences:** 
    *   Select UI theme (light/dark).
    *   Set default AI model for new chats.
*   **Omnibar:** A command palette for quick actions and potentially search.
*   **Custom File Management:** (As indicated by `custom_file_manager.md` PRD) Specific handling for files/assets, likely beyond basic document storage (details might need further clarification).

### Development & Infrastructure Features

*   **Framework:** Built with Next.js 14+ (App Router).
*   **Backend:** Leverages Supabase for:
    *   **Database:** PostgreSQL for storing application data (users, folders, documents, messages, tool calls, preferences).
    *   **Authentication:** Manages user accounts and sessions.
    *   **Storage:** Securely stores user-uploaded images (`message-images` bucket).
    *   **Embeddings/Search:** Likely uses Supabase pgvector for document search.
*   **API Layer (Next.js API Routes in `app/api/`):**
    *   `chat/`: Handles streaming chat responses and interactions.
    *   `documents/`: CRUD for document metadata and content (including autosave).
    *   `folders/`: CRUD for folders.
    *   `generate-embedding/`: Creates text embeddings for searchable content.
    *   `generate-title/`: AI-powered title suggestion endpoint.
    *   `launch/`: Endpoints supporting the launch page actions.
    *   `preferences/`: GET/PUT operations for user preferences.
    *   `search-documents/`: Executes content-based search queries.
    *   `storage/`: Manages interactions with Supabase storage (e.g., generating signed URLs).
    *   `file-manager/`, `files/`: Endpoints related to the Custom File Management feature.
*   **State Management:** Zustand (`usePreferenceStore`, `useFollowUpStore`) for managing global state like preferences and potential follow-up actions.
*   **UI Components:** Reusable React components (`components/`), including specific editor components (`components/editor/`).
*   **Styling:** Tailwind CSS with CSS variables for theming (`globals.css`).
*   **Routing & Middleware:** App Router for navigation and `middleware.ts` for route protection (authentication checks).
*   **Utilities:** Shared functions (`lib/`) including Supabase client setup.
*   **Notifications:** Uses `sonner` for toast notifications.
*   **Animations:** Uses `framer-motion` for UI animations.

## Project Structure (Overview)

*   `app/`: Next.js App Router directory.
    *   `api/`: Backend API routes for data fetching/mutation.
    *   `editor/[documentId]/`: Editor page component.
    *   `launch/`: Document/folder management launch page.
    *   `login/`: Authentication page.
    *   `layout.tsx`: Root layout.
    *   `globals.css`: Global styles.
*   `components/`: Reusable React components.
*   `lib/`: Utility functions, Supabase client setup.
*   `prds/`: Product Requirement Documents.
*   `public/`: Static assets.
*   `middleware.ts`: Next.js middleware for route protection.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd ai-sdk-chat-mml
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Environment Variables:**
    *   Create a `.env.local` file in the root directory.
    *   Add the following Supabase credentials (obtain these from your Supabase project settings):
        ```env
        NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
        NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
        SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
        ```

4.  **Set up Supabase Database:**
    *   Go to your Supabase project dashboard.
    *   Navigate to the "SQL Editor".
    *   Create a "New query".
    *   Copy and paste the SQL DDL statements found in `prds/supabase_implementation.md` under the "Database Schema (SQL DDL)" section.
    *   Run the query to create the necessary tables (`folders`, `documents`, `messages`, `tool_calls`), indexes, and Row Level Security policies.

5.  **Set up Supabase Storage:**
    *   In your Supabase project dashboard, navigate to "Storage".
    *   Click "Create Bucket".
    *   Name the bucket `message-images`.
    *   **Ensure the "Public bucket" option is UNCHECKED.**
    *   Go to Bucket Settings -> Policies.
    *   Create a new policy (or edit existing) to allow authenticated users to perform the `insert` operation. Example (adjust as needed):
        *   Policy Name: `Allow Authenticated Uploads`
        *   Allowed operations: `insert`
        *   Target roles: `authenticated`
    *   *Note: Access for reading images will be handled via signed URLs generated by your application's backend.* 

6.  **Run the development server:**
    ```bash
    npm run dev
    ```

7.  Open [http://localhost:3000](http://localhost:3000) with your browser.

