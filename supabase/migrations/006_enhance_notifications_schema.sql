-- Migration: Enhance Notifications Schema and Add User Preferences

-- A) Enhancements to existing public.notifications table

-- Add new columns to notifications table
ALTER TABLE public.notifications
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  ADD COLUMN action_url TEXT,
  ADD COLUMN thread_id UUID REFERENCES public.comment_threads(id) ON DELETE SET NULL,
  ADD COLUMN comment_id UUID REFERENCES public.comments(id) ON DELETE SET NULL,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Convert 'read' boolean to 'status' enum
-- Step 1: Add the new status column (nullable for now)
ALTER TABLE public.notifications
  ADD COLUMN status TEXT;

-- Step 2: Populate the new status column based on the old 'read' column
UPDATE public.notifications
  SET status = CASE WHEN read = TRUE THEN 'read' ELSE 'unread' END;

-- Step 3: Make the new status column NOT NULL, set default, and add check constraint
ALTER TABLE public.notifications
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'unread',
  ADD CONSTRAINT notifications_status_check CHECK (status IN ('unread', 'read', 'archived'));

-- Step 4: Drop the old 'read' column
ALTER TABLE public.notifications
  DROP COLUMN read;

-- Add/ensure indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_status ON public.notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_document_id ON public.notifications(document_id);
CREATE INDEX IF NOT EXISTS idx_notifications_thread_id ON public.notifications(thread_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id ON public.notifications(comment_id);


-- B) New user_notification_preferences table
CREATE TABLE public.user_notification_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- Corresponds to values in notifications.type or defined categories
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_type)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_user_id ON public.user_notification_preferences(user_id);


-- C) Triggers for updated_at timestamps
-- Create or reuse a trigger function for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to notifications table (if not already managed by existing triggers for other tables)
DO $$
BEGIN
   IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'set_notifications_updated_at' AND tgrelid = 'public.notifications'::regclass
   ) THEN
      CREATE TRIGGER set_notifications_updated_at
      BEFORE UPDATE ON public.notifications
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_updated_at();
   END IF;
END
$$;

-- Add trigger to user_notification_preferences table
CREATE TRIGGER set_user_notification_preferences_updated_at
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();


-- D) RLS Policies

-- RLS for notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they conflict before creating new ones. Be specific.
-- Example: DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update status of their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id); -- Can only update their own


-- RLS for user_notification_preferences table
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notification preferences"
  ON public.user_notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- E) Enable Realtime (This is typically done in Supabase Dashboard, but good to note)
-- Ensure Supabase Realtime is enabled for the public.notifications table.

COMMENT ON COLUMN public.notifications.type IS 'Type of notification, e.g., mention, comment, document_shared, permission_changed, user_joined';
COMMENT ON COLUMN public.notifications.priority IS 'Priority of the notification';
COMMENT ON COLUMN public.notifications.action_url IS 'URL to navigate to when notification is clicked';
COMMENT ON COLUMN public.notifications.thread_id IS 'Reference to the comment thread, if applicable';
COMMENT ON COLUMN public.notifications.comment_id IS 'Reference to the specific comment, if applicable';
COMMENT ON COLUMN public.notifications.status IS 'Read status of the notification';

COMMENT ON TABLE public.user_notification_preferences IS 'Stores user-specific preferences for different notification types';
COMMENT ON COLUMN public.user_notification_preferences.notification_type IS 'The type of notification this preference applies to (matches notifications.type or a category)';
COMMENT ON COLUMN public.user_notification_preferences.email_enabled IS 'Is email notification enabled for this type and user?';
COMMENT ON COLUMN public.user_notification_preferences.in_app_enabled IS 'Is in-app notification enabled for this type and user?'; 