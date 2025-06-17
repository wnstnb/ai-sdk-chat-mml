-- =====================================================================================
-- Final fix: Use unified permission-based document viewing
-- =====================================================================================

-- Drop the old restrictive policy that only allows owners to see their documents
DROP POLICY IF EXISTS "Users can view their own documents" ON documents;

-- Add the unified policy that covers both owned and shared documents
-- This works because:
-- 1. Every document owner has a permission record in document_permissions  
-- 2. Every shared user has a permission record in document_permissions
-- 3. So this single policy covers all legitimate access
CREATE POLICY "Users can view documents they have permissions for" ON documents
  FOR SELECT 
  USING (
    id IN (
      SELECT document_id 
      FROM document_permissions 
      WHERE user_id = auth.uid()
    )
  );

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This approach works because:
-- 1. Document owners always have permission records (created when document is shared/created)
-- 2. Shared users have permission records (created when access is granted)
-- 3. One unified policy covers both cases
-- 4. No circular dependency (only documents → document_permissions)
--
-- What works:
-- - ✅ Owners see their documents (via their permission records)
-- - ✅ Viewers see shared documents (via their permission records)  
-- - ✅ No infinite recursion
-- - ✅ Simpler policy structure
-- - ✅ All existing functionality maintained
--
-- This replaces the need for separate "own" vs "shared" policies with a unified approach 