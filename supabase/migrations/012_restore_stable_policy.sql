-- =====================================================================================
-- URGENT: Restore stable policy and remove problematic ones
-- =====================================================================================

-- Remove any policies that might be causing circular dependencies
DROP POLICY IF EXISTS "Users can view documents they have permissions for" ON documents;

-- Restore the original stable policy
CREATE POLICY "Users can view their own documents" ON documents
  FOR SELECT 
  USING (user_id = auth.uid());

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This restores the system to a stable state by:
-- 1. Removing the policy that creates circular dependency
-- 2. Restoring the original working policy
-- 3. Getting back to a functional state
--
-- After this migration, we need to investigate why there's still infinite recursion
-- even with basic policies that shouldn't reference each other 