-- Migration: Enhance Username System with Random Generation and Constraints (FIXED)
-- This migration adds constraints, validation, and random username generation
-- to the existing username column in the profiles table
-- FIXED: Data cleanup happens BEFORE constraint addition

-- 1. First, create a function to generate random usernames
CREATE OR REPLACE FUNCTION generate_unique_username()
RETURNS TEXT AS $$
DECLARE
    adjectives TEXT[] := ARRAY[
        'swift', 'bright', 'calm', 'clever', 'bold', 'gentle', 'quick', 'wise',
        'happy', 'brave', 'keen', 'sharp', 'cool', 'warm', 'kind', 'smart',
        'fleet', 'sage', 'noble', 'loyal', 'true', 'pure', 'fair', 'good'
    ];
    animals TEXT[] := ARRAY[
        'fox', 'eagle', 'wolf', 'bear', 'deer', 'owl', 'hawk', 'lion',
        'tiger', 'panda', 'koala', 'dolphin', 'whale', 'seal', 'otter',
        'rabbit', 'squirrel', 'badger', 'lynx', 'falcon', 'raven', 'swan'
    ];
    adjective TEXT;
    animal TEXT;
    random_num INTEGER;
    candidate_username TEXT;
    max_attempts INTEGER := 50;
    attempt INTEGER := 0;
BEGIN
    LOOP
        -- Generate random components
        adjective := adjectives[1 + (random() * array_length(adjectives, 1))::INTEGER];
        animal := animals[1 + (random() * array_length(animals, 1))::INTEGER];
        random_num := 100 + (random() * 900)::INTEGER; -- 3-digit number (100-999)
        
        -- Combine into username format
        candidate_username := 'user_' || adjective || '_' || animal || '_' || random_num;
        
        -- Check if username already exists
        IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.username = candidate_username) THEN
            RETURN candidate_username;
        END IF;
        
        -- Increment attempt counter to prevent infinite loops
        attempt := attempt + 1;
        IF attempt >= max_attempts THEN
            -- Fallback: use timestamp-based username
            candidate_username := 'user_' || extract(epoch from now())::INTEGER;
            EXIT;
        END IF;
    END LOOP;
    
    RETURN candidate_username;
END;
$$ LANGUAGE plpgsql;

-- 2. Create a helper function to validate username format (for API use)
CREATE OR REPLACE FUNCTION is_valid_username(input_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN input_username IS NOT NULL AND
           length(input_username) >= 3 AND 
           length(input_username) <= 30 AND
           input_username ~ '^[a-zA-Z0-9_-]+$';
END;
$$ LANGUAGE plpgsql;

-- 3. CLEAN UP EXISTING DATA FIRST (before adding constraints)

-- Update existing profiles that have NULL or empty usernames
UPDATE profiles 
SET username = generate_unique_username()
WHERE username IS NULL OR username = '' OR NOT is_valid_username(username);

-- Handle potential duplicate usernames from the existing data
DO $$
DECLARE
    duplicate_record RECORD;
    new_username TEXT;
BEGIN
    -- Find and fix duplicate usernames
    FOR duplicate_record IN 
        SELECT username, array_agg(id) as user_ids
        FROM profiles 
        WHERE username IS NOT NULL
        GROUP BY username 
        HAVING count(*) > 1
    LOOP
        -- Keep the first user with the username, update the rest
        FOR i IN 2..array_length(duplicate_record.user_ids, 1) LOOP
            new_username := generate_unique_username();
            UPDATE profiles 
            SET username = new_username 
            WHERE id = duplicate_record.user_ids[i];
            
            RAISE NOTICE 'Updated duplicate username % to % for user %', 
                duplicate_record.username, new_username, duplicate_record.user_ids[i];
        END LOOP;
    END LOOP;
END $$;

-- 4. NOW ADD CONSTRAINTS (after data is cleaned up)

-- Add the unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_username_unique'
    ) THEN
        ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
    END IF;
END $$;

-- Add a check constraint for username format and length
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_username_check'
    ) THEN
        ALTER TABLE profiles ADD CONSTRAINT profiles_username_check 
        CHECK (
            username IS NOT NULL AND
            length(username) >= 3 AND 
            length(username) <= 30 AND
            username ~ '^[a-zA-Z0-9_-]+$'  -- Only alphanumeric, underscore, and hyphen
        );
    END IF;
END $$;

-- 5. Create a function to handle new user profiles with random usernames
CREATE OR REPLACE FUNCTION assign_random_username()
RETURNS TRIGGER AS $$
BEGIN
    -- Only assign a username if one isn't already provided
    IF NEW.username IS NULL OR NEW.username = '' THEN
        NEW.username := generate_unique_username();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for automatic username assignment on new profiles
DROP TRIGGER IF EXISTS assign_username_trigger ON profiles;
CREATE TRIGGER assign_username_trigger
    BEFORE INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION assign_random_username();

-- 7. Create an index for better performance on username lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_profiles_username_performance ON profiles(username);

-- 8. Add comments for documentation
COMMENT ON FUNCTION generate_unique_username() IS 'Generates a unique random username in the format user_[adjective]_[animal]_[number]';
COMMENT ON FUNCTION assign_random_username() IS 'Trigger function to automatically assign random usernames to new profiles';
COMMENT ON FUNCTION is_valid_username(TEXT) IS 'Validates if a username meets the format and length requirements';
COMMENT ON COLUMN profiles.username IS 'Unique username for the user, automatically generated if not provided'; 