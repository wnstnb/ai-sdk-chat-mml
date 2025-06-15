-- Fix infinite recursion in document_permissions RLS policies
-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view permissions for documents they have access to" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can manage permissions" ON document_permissions;

-- Create new policies that don't cause infinite recursion
-- Allow users to see permissions for documents they own (based on documents table)
CREATE POLICY "Users can view permissions for their documents" ON document_permissions
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    ) OR user_id = auth.uid()
  );

-- Allow document owners to manage permissions (based on documents table)
CREATE POLICY "Document owners can manage all permissions" ON document_permissions
  FOR ALL USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- Allow users to insert permissions if they are the document owner
CREATE POLICY "Document owners can grant permissions" ON document_permissions
  FOR INSERT WITH CHECK (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- Allow users to update permissions if they are the document owner
CREATE POLICY "Document owners can update permissions" ON document_permissions
  FOR UPDATE USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- Allow users to delete permissions if they are the document owner
CREATE POLICY "Document owners can delete permissions" ON document_permissions
  FOR DELETE USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  ); 