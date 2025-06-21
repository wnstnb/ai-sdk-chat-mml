-- =====================================================================================
-- Alternative fix: Remove circular dependency from document_permissions side
-- =====================================================================================

-- Remove the policy that creates circular dependency
DROP POLICY IF EXISTS "Document owners can view all permissions" ON document_permissions;

-- Keep the new policy that allows users to see documents they have permissions for
-- This is safe because document_permissions now only has policies that don't reference documents

-- Add the new policy for viewing shared documents (if not already exists)
CREATE POLICY IF NOT EXISTS "Users can view documents they have permissions for" ON documents
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

-- This approach fixes the circular dependency by:
-- 1. Removing "Document owners can view all permissions" policy from document_permissions
-- 2. Keeping the ability for users to see shared documents
-- 3. Document owners can still manage permissions via "Document owners can manage permissions"
-- 4. Application layer can handle permission viewing when needed
--
-- What still works:
-- - ✅ Users see their own documents
-- - ✅ Users see shared documents  
-- - ✅ Users see their own permission records
-- - ✅ Document owners can manage (create/update/delete) permissions
-- - ❌ Document owners can't view all permissions via direct RLS (use app layer instead)
--
-- No circular dependency:
-- - documents policies can reference document_permissions (one-way)
-- - document_permissions policies only reference user_id checks (no documents table) 