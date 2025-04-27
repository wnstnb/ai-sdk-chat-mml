# PRD: User Preferences Implementation

## 1. Overview

This document outlines the implementation plan for a user preferences feature. This feature will allow users to customize their experience by setting defaults for various settings, starting with theme (Light/Dark mode) and default AI model.

## 2. Goals

-   Allow users to set and persist their preferred application theme (Light/Dark).
-   Allow users to set and persist their preferred default AI model for new conversations.
-   Apply these preferences automatically upon user login.
-   Provide a user-friendly interface for managing these preferences.
-   Design the storage mechanism to be easily extensible for future preferences.

## 3. Requirements

### 3.1 User Interface (UI)

-   **Access Point:** A user profile icon (e.g., `UserIcon` or `CogIcon` from Heroicons, styled similar to existing icons) will be added to the right side of the main navigation bar (`components/header.tsx`), positioned to the right of the "Logout" button.
-   **Interaction:** Clicking the profile icon will open a dropdown menu/popover (using shadcn/ui components if available, otherwise custom).
-   **Content:** The dropdown will display the available preference settings:
    -   Theme: Options for "Light" and "Dark".
    -   Default Model: A dropdown using the models defined in `components/ModelSelector.tsx`.
-   **Saving:** Changes made in the dropdown should trigger an update to the backend immediately (debounced if necessary for performance).

### 3.2 Backend/Data Storage

-   **Database:** A new table named `preferences` will be created in the Supabase database.
-   **Table Schema:**
    -   `id`: Primary Key (e.g., UUID, auto-incrementing integer).
    -   `user_id`: Foreign Key referencing the `auth.users` table (UUID), unique constraint.
    -   `preferences`: JSONB column to store the actual preference key-value pairs.
        -   Example: `{ "theme": "dark", "default_model": "gemini-2.5-flash-preview-04-17" }`
    -   `created_at`: Timestamp with timezone (default: `now()`).
    -   `updated_at`: Timestamp with timezone (default: `now()`, auto-updating).
-   **API Endpoints:**
    -   An endpoint to fetch the current user's preferences.
    -   An endpoint to update/create the current user's preferences.

### 3.3 Functionality

-   **Loading Preferences:** When a user logs in or loads the application while authenticated, fetch their preferences from the `preferences` table. If no preferences record exists for the user, apply the application defaults.
-   **Application Defaults:**
    -   Theme: `light`
    -   Default Model: `gemini-2.0-flash`
-   **Applying Preferences:**
    -   **Theme:** Apply the stored theme preference to the UI.
    -   **Default Model:** Use the stored model preference as the default selection when starting a new conversation or in relevant UI components.
-   **Updating Preferences:** When a user changes a setting in the preferences drawer, update the corresponding value in the `preferences` JSONB object in the database for their `user_id`. If no record exists for the user, create one.

## 4. Implementation Plan (High-Level)

1.  **Database:** Create the `preferences` table in Supabase.
2.  **API/Functions:** Implement server-side logic (API routes or Supabase functions) for preference management.
3.  **UI (Header & Preferences Dropdown):** Update the header and create the preferences dropdown component.
4.  **State Management:** Integrate preferences into the global state.
5.  **Apply Preferences:** Connect UI components (theme, model selector) to use the stored/default preferences.

## 5. Implementation Steps

1.  **Database Setup:**
    *   Create the `preferences` table in Supabase via SQL migration or the Supabase Studio UI.
        ```sql
        CREATE TABLE public.preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
            preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
        );

        -- Function to update updated_at timestamp
        CREATE OR REPLACE FUNCTION public.handle_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        -- Trigger to update updated_at on row update
        CREATE TRIGGER on_preferences_update
        BEFORE UPDATE ON public.preferences
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();

        -- RLS Policies (Enable RLS on the table first)
        ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Allow individual read access" ON public.preferences
        FOR SELECT USING (auth.uid() = user_id);

        CREATE POLICY "Allow individual insert access" ON public.preferences
        FOR INSERT WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Allow individual update access" ON public.preferences
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

        -- Optional: Allow delete access if needed, otherwise omit
        -- CREATE POLICY "Allow individual delete access" ON public.preferences
        -- FOR DELETE USING (auth.uid() = user_id);
        ```
    *   Ensure RLS is enabled and appropriate policies are set for user access.

2.  **API/Server Logic:**
    *   Create API routes (e.g., `app/api/preferences/route.ts`) or Supabase Edge Functions.
    *   `GET /api/preferences`: Fetches preferences for the authenticated user. Returns defaults (`{ "theme": "light", "default_model": "gemini-2.0-flash" }`) if no record exists.
    *   `POST` or `PUT /api/preferences`: Updates (or creates) preferences for the authenticated user using `upsert`. Takes the `preferences` JSONB object in the request body.

3.  **State Management:**
    *   Introduce state (e.g., in a Zustand store or React Context) to hold user preferences (`theme`, `defaultModel`).
    *   Create actions/functions to:
        *   Fetch preferences on initial load/login and populate the state.
        *   Update a specific preference (e.g., `updateTheme`, `updateDefaultModel`), which updates the local state and calls the backend API to persist the change.

4.  **UI - Header (`components/header.tsx`):**
    *   Add a new button next to "Logout" using an appropriate icon (e.g., `UserCircleIcon` or `Cog6ToothIcon` from `@heroicons/react/24/outline`).
    *   Use a dropdown/popover library (e.g., `@radix-ui/react-dropdown-menu` or `headlessui/react`) to show the `PreferencesDropdown` component when the icon is clicked.
    *   Manage the open/closed state of the dropdown.

5.  **UI - Preferences Dropdown (`components/PreferencesDropdown.tsx` - New File):**
    *   Create a new component to render the content of the dropdown.
    *   Include a theme selector (e.g., buttons for "Light", "Dark") that reads the current theme from the global state and calls the update function on change.
    *   Include a model selector (`components/ModelSelector.tsx`? Or a simplified version?) that reads the current default model from the global state and calls the update function on change. Ensure the options match those in `ModelSelector.tsx`.

6.  **Apply Theme Preference:**
    *   Modify the theme toggling logic (likely in `app/layout.tsx` or a theme provider) to read the initial theme from the global preferences state instead of just local storage or system preference.
    *   Ensure the `onToggleTheme` function in `Header` updates the preference state/backend as well.

7.  **Apply Model Preference:**
    *   Update the component where a new chat is initiated (likely `app/chat/[[...chatId]]/page.tsx` or a related component) to use the `defaultModel` from the global preferences state when setting the initial model for a *new* conversation.
    *   Existing conversations should continue to use the model they were started with (likely stored with the chat data).

## 6. Future Considerations

-   Add more preference options (e.g., language, notification settings, specific feature toggles).
-   Consider how preferences might apply across different devices/sessions.
-   Error handling for failed preference loading/saving.

## 7. Open Questions/Discussion Points

-   Confirm specific icon choice (`UserIcon`, `CogIcon`, `UserCircleIcon`, `Cog6ToothIcon`, etc.).
-   Finalize UI library for the dropdown (Radix, Headless UI, custom).
-   Decide if the existing `ModelSelector.tsx` can be reused directly in the dropdown or if a simpler version is needed.