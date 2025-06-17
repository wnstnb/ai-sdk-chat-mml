-- Migration: Final fix for RLS infinite recursion and messages table setup
-- This migration completely resolves the circular dependency issues

-- =====================================================================================
-- COMPLETELY REBUILD DOCUMENTS POLICIES (Eliminate all circular references)
-- =====================================================================================

-- Drop ALL existing policies on documents table
DROP POLICY IF EXISTS "Users can view their own documents" ON documents;
DROP POLICY IF EXISTS "Users can view shared documents" ON documents;
DROP POLICY IF EXISTS "Users can edit their own documents" ON documents;
DROP POLICY IF EXISTS "Users can edit shared documents with editor permission" ON documents;
DROP POLICY IF EXISTS "Document owners can delete documents" ON documents;
DROP POLICY IF EXISTS "Users can create their own documents" ON documents;
DROP POLICY IF EXISTS "Users can view owned and shared documents" ON documents;
DROP POLICY IF EXISTS "Users can edit owned documents and shared with editor access" ON documents;
DROP POLICY IF EXISTS "Only owners can delete documents" ON documents;

-- Create simple, non-recursive policies for documents
-- These policies NEVER reference document_permissions to avoid recursion

-- 1. Users can always view documents they own
CREATE POLICY "Users can view their own documents" ON documents
  FOR SELECT 
  USING (user_id = auth.uid());

-- 2. Users can always edit documents they own
CREATE POLICY "Users can edit their own documents" ON documents
  FOR UPDATE 
  USING (user_id = auth.uid());

-- 3. Users can only delete documents they own
CREATE POLICY "Users can delete their own documents" ON documents
  FOR DELETE 
  USING (user_id = auth.uid());

-- 4. Users can create new documents
CREATE POLICY "Users can create documents" ON documents
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- =====================================================================================
-- REBUILD DOCUMENT_PERMISSIONS POLICIES (No circular references)
-- =====================================================================================

-- Drop ALL existing policies on document_permissions table
DROP POLICY IF EXISTS "Users can view their own permissions" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can view all permissions for their documents" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can manage permissions" ON document_permissions;
DROP POLICY IF EXISTS "Users can view permissions for their documents" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can manage all permissions" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can grant permissions" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can update permissions" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can delete permissions" ON document_permissions;
DROP POLICY IF EXISTS "Users can view relevant document permissions" ON document_permissions;
DROP POLICY IF EXISTS "Only document owners can manage permissions" ON document_permissions;

-- Create non-recursive policies for document_permissions
-- These policies reference documents table directly, but documents policies don't reference back

-- 1. Users can view their own permission records
CREATE POLICY "Users can view their own permissions" ON document_permissions
  FOR SELECT 
  USING (user_id = auth.uid());

-- 2. Document owners can view all permissions for documents they own
CREATE POLICY "Document owners can view all permissions" ON document_permissions
  FOR SELECT 
  USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- 3. Document owners can manage (insert/update/delete) permissions
CREATE POLICY "Document owners can manage permissions" ON document_permissions
  FOR ALL 
  USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- =====================================================================================
-- SETUP MESSAGES TABLE WITH PROPER RLS
-- =====================================================================================

-- Enable RLS on messages table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies on messages
DROP POLICY IF EXISTS "Users can view their own messages" ON messages;
DROP POLICY IF EXISTS "Users can create their own messages" ON messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON messages;

-- Create policies that ensure users only see their own messages per document
-- This maintains separation: each user has their own AI conversation per document

-- 1. Users can view only their own messages
CREATE POLICY "Users can view their own messages" ON messages
  FOR SELECT 
  USING (user_id = auth.uid());

-- 2. Users can create their own messages (document access is verified in application layer)
CREATE POLICY "Users can create their own messages" ON messages
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- 3. Users can update their own messages
CREATE POLICY "Users can update their own messages" ON messages
  FOR UPDATE 
  USING (user_id = auth.uid());

-- 4. Users can delete their own messages
CREATE POLICY "Users can delete their own messages" ON messages
  FOR DELETE 
  USING (user_id = auth.uid());

-- =====================================================================================
-- SETUP TOOL_CALLS TABLE WITH PROPER RLS (follows messages)
-- =====================================================================================

-- Enable RLS on tool_calls table
ALTER TABLE tool_calls ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies on tool_calls
DROP POLICY IF EXISTS "Users can view their own tool calls" ON tool_calls;
DROP POLICY IF EXISTS "Users can create their own tool calls" ON tool_calls;
DROP POLICY IF EXISTS "Users can update their own tool calls" ON tool_calls;
DROP POLICY IF EXISTS "Users can delete their own tool calls" ON tool_calls;

-- Create policies that ensure users only see their own tool calls
-- 1. Users can view only their own tool calls
CREATE POLICY "Users can view their own tool calls" ON tool_calls
  FOR SELECT 
  USING (user_id = auth.uid());

-- 2. Users can create their own tool calls
CREATE POLICY "Users can create their own tool calls" ON tool_calls
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- 3. Users can update their own tool calls
CREATE POLICY "Users can update their own tool calls" ON tool_calls
  FOR UPDATE 
  USING (user_id = auth.uid());

-- 4. Users can delete their own tool calls
CREATE POLICY "Users can delete their own tool calls" ON tool_calls
  FOR DELETE 
  USING (user_id = auth.uid());

-- =====================================================================================
-- CREATE A SHARED DOCUMENT ACCESS FUNCTION (For application use)
-- =====================================================================================

-- Create a function that the application can use to check shared document access
-- This eliminates the need for complex RLS policies that cause recursion
CREATE OR REPLACE FUNCTION check_shared_document_access(doc_id UUID, user_uuid UUID)
RETURNS TABLE(has_access BOOLEAN, permission_level TEXT) AS $$
BEGIN
  -- First check if user is the document owner
  IF EXISTS (SELECT 1 FROM documents WHERE id = doc_id AND user_id = user_uuid) THEN
    RETURN QUERY SELECT TRUE, 'owner'::TEXT;
    RETURN;
  END IF;
  
  -- Then check for explicit permissions
  RETURN QUERY 
  SELECT 
    CASE WHEN dp.permission_level IS NOT NULL THEN TRUE ELSE FALSE END,
    COALESCE(dp.permission_level, 'none'::TEXT)
  FROM document_permissions dp
  WHERE dp.document_id = doc_id AND dp.user_id = user_uuid
  LIMIT 1;
  
  -- If no permissions found, return no access
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'none'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This migration completely eliminates infinite recursion by:
-- 1. Making documents policies only reference user ownership (no document_permissions)
-- 2. Making document_permissions policies only reference documents (one-way dependency)
-- 3. Adding proper RLS to messages table for private conversations per user per document
-- 4. Adding proper RLS to tool_calls table following the same pattern
-- 5. Creating a helper function for shared document access checks
--
-- The application layer will:
-- - Use the helper function for shared document access checks
-- - Rely on RLS for data security (users only see their own messages/tool_calls)
-- - Check permissions in application code rather than complex RLS queries

-- Performance notes:
-- - All policies use simple user_id = auth.uid() checks where possible
-- - Document ownership checks use straightforward queries
-- - The helper function provides efficient shared access checking
-- - No more circular dependencies or infinite recursion 