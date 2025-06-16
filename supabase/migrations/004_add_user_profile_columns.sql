-- Add username and avatar_url columns to profiles table for comment threading
ALTER TABLE public.profiles 
ADD COLUMN username TEXT,
ADD COLUMN avatar_url TEXT;

-- Create index for username lookups
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- Update existing profiles with data from auth.users metadata if available
-- This is a one-time data migration
UPDATE public.profiles 
SET 
  username = COALESCE(
    (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE auth.users.id = profiles.id),
    (SELECT email FROM auth.users WHERE auth.users.id = profiles.id)
  ),
  avatar_url = COALESCE(
    (SELECT raw_user_meta_data->>'avatar_url' FROM auth.users WHERE auth.users.id = profiles.id),
    ''
  )
WHERE username IS NULL; 