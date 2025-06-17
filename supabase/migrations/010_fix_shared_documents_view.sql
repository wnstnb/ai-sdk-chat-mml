-- =====================================================================================
-- Fix shared documents view by allowing users to see documents they have permissions for
-- =====================================================================================

-- Add a NEW policy to documents table to allow users to view documents they have been granted access to
-- This enables the join query in the API to work for viewers of shared documents
-- We keep all existing policies and just add this one

CREATE POLICY "Users can view documents they have permissions for" ON documents
  FOR SELECT 
  USING (
    -- User has been granted permissions to this document
    id IN (
      SELECT document_id 
      FROM document_permissions 
      WHERE user_id = auth.uid()
    )
  );

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This migration fixes the shared documents view issue by:
-- 1. Adding a NEW policy that allows users to view documents they have permissions for
-- 2. Keeping all existing policies intact (no policies are dropped)
-- 3. This enables the JOIN query in the API to work properly for viewers
-- 4. Viewers can now see documents that have been shared with them
-- 
-- The new policy is safe because:
-- - Users can only see documents they have explicit permissions for
-- - The document_permissions table RLS ensures users only see their own permission records
-- - This creates a one-way reference that doesn't cause circular dependencies
-- - All existing functionality remains unchanged
--
-- Combined effect of policies:
-- - "Users can view their own documents" - Users see documents they own
-- - "Users can view documents they have permissions for" - Users see documents shared with them
-- - Together these provide complete access to owned + shared documents 