-- =====================================================================================
-- MINIMAL FIX: Only remove the specific circular dependency causing infinite recursion
-- =====================================================================================

-- The root cause is these two policies creating a circular reference:
-- 1. document_permissions policies reference documents table
-- 2. documents table is queried, which triggers other policies that reference document_permissions

-- MINIMAL APPROACH: Remove only the problematic document_permissions policies
-- and handle document owner permission management in application layer

-- Remove the policies that create circular dependency
DROP POLICY IF EXISTS "Document owners can manage permissions" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can view all permissions" ON document_permissions;

-- Keep the simple user-based policy that doesn't reference other tables
-- CREATE POLICY "Users can view their own permissions" ON document_permissions
--   FOR SELECT USING (user_id = auth.uid());
-- (This should already exist)

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This minimal fix:
-- ✅ Removes the circular dependency (documents ↔ document_permissions)
-- ✅ Keeps all other functionality intact (comments, collaboration, etc.)
-- ✅ Only requires document permission management to be handled in app layer
-- 
-- What breaks:
-- ❌ Document owners can't view/manage permissions via direct RLS queries
-- 
-- What still works:
-- ✅ All document viewing/editing
-- ✅ Comments and comment threads
-- ✅ Collaborative editing (Y.js)
-- ✅ Messages and tool calls
-- ✅ All other features
--
-- The application layer will need to handle:
-- - Document permission viewing (using service role queries)
-- - Document permission management (using service role for cross-user operations) 