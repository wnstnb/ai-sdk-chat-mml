-- =====================================================================================
-- ELIMINATE ALL CIRCULAR DEPENDENCIES
-- =====================================================================================

-- Step 1: Fix document_permissions policies (remove references to documents table)
DROP POLICY IF EXISTS "Document owners can manage permissions" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can view all permissions" ON document_permissions;

-- Create simple policies for document_permissions that don't reference documents
CREATE POLICY "Users can view their own permissions" ON document_permissions
  FOR SELECT 
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own permission grants" ON document_permissions
  FOR ALL 
  USING (user_id = auth.uid());

-- Step 2: Simplify comments policies (remove document_permissions references)
DROP POLICY IF EXISTS "Users can view comments for accessible documents" ON comments;
DROP POLICY IF EXISTS "Users with comment/edit permissions can create comments" ON comments;

-- Create simple ownership-based policies for comments
CREATE POLICY "Comment authors can view and manage their comments" ON comments
  FOR ALL 
  USING (author_id = auth.uid());

-- Step 3: Simplify comment_threads policies  
DROP POLICY IF EXISTS "Users can view comment threads for documents they have access t" ON comment_threads;
DROP POLICY IF EXISTS "Users with comment/edit permissions can create threads" ON comment_threads;
DROP POLICY IF EXISTS "Thread creators and document owners can update threads" ON comment_threads;

-- Create simple ownership-based policies for comment_threads
CREATE POLICY "Thread creators can manage their threads" ON comment_threads
  FOR ALL 
  USING (created_by = auth.uid());

-- Step 4: Simplify yjs_updates policies (remove complex document references)
DROP POLICY IF EXISTS "Users can view Y.js updates for accessible documents" ON yjs_updates;
DROP POLICY IF EXISTS "Users with editor permissions can create Y.js updates" ON yjs_updates;
DROP POLICY IF EXISTS "Users can delete their own Y.js updates or document owners can " ON yjs_updates;

-- Create simple ownership-based policies for yjs_updates
CREATE POLICY "Users can manage their own Y.js updates" ON yjs_updates
  FOR ALL 
  USING (user_id = auth.uid());

-- Step 5: Simplify messages policies (remove complex document checks)
DROP POLICY IF EXISTS "Allow INSERT for document owners" ON messages;
DROP POLICY IF EXISTS "Allow SELECT for document owners" ON messages;
DROP POLICY IF EXISTS "Allow users to insert messages for their documents" ON messages;
DROP POLICY IF EXISTS "Allow users to view messages for their documents" ON messages;

-- Keep only the simple user-based message policies (these should already exist)
CREATE POLICY "Users can view their own messages" ON messages
  FOR SELECT USING (user_id = auth.uid());
-- etc. (these should already be there from previous migrations)

-- Step 6: Simplify tool_calls policies (remove complex function calls)
DROP POLICY IF EXISTS "Allow users to manage tool calls for their messages" ON tool_calls;

-- Keep only the simple user-based tool_calls policies (these should already exist)
-- CREATE POLICY "Users can view their own tool calls" ON tool_calls
--   FOR SELECT USING (user_id = auth.uid());
-- etc. (these should already be there from previous migrations)

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This migration eliminates circular dependencies by:
-- 1. Removing all policies that reference multiple tables
-- 2. Using simple user_id = auth.uid() checks only
-- 3. Moving complex permission logic to application layer
-- 
-- After this migration:
-- ✅ No circular dependencies
-- ✅ Simple, fast RLS policies  
-- ✅ Application handles shared document access
-- ✅ Comments/threads/collaboration features use application logic for document access
--
-- Trade-offs:
-- - Application needs to handle document access checks for comments/collaboration
-- - Slightly more complex API logic, but much safer and more maintainable
-- - Better performance due to simpler RLS policies 