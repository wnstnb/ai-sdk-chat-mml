-- Migration: Fix document permissions policies
-- The issue is that document_permissions table only has a SELECT policy
-- but no INSERT/UPDATE/DELETE policies, so the trigger can't create owner permissions

-- Add missing policies for document_permissions table

-- Policy: Allow document owners to manage permissions for their documents
CREATE POLICY "Document owners can manage permissions" ON document_permissions
  FOR ALL 
  USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- Policy: Allow users to insert permissions for documents they own
CREATE POLICY "Document owners can grant permissions" ON document_permissions
  FOR INSERT 
  WITH CHECK (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- Add comment explaining the security model
COMMENT ON POLICY "Document owners can manage permissions" ON document_permissions IS 
'Allows document owners to view, update, and delete permissions for their documents. Safe because it only references the documents table.';

COMMENT ON POLICY "Document owners can grant permissions" ON document_permissions IS 
'Allows document owners to grant permissions to other users for their documents. Safe because it only references the documents table.'; 