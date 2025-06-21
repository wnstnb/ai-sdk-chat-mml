-- =====================================================================================
-- URGENT: Rollback the circular dependency that's causing infinite recursion
-- =====================================================================================

-- Remove the policy that's causing the circular reference between documents and document_permissions
DROP POLICY IF EXISTS "Users can view documents they have permissions for" ON documents;

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This rollback fixes the infinite recursion error by:
-- 1. Removing the policy that creates a circular dependency
-- 2. Restoring the system to a stable state
-- 
-- The circular dependency was:
-- - documents table policy references document_permissions table
-- - document_permissions table policy references documents table  
-- - This creates infinite recursion when Postgres tries to evaluate policies
--
-- We need to find an alternative solution that doesn't create circular references 