-- Fix auto-save permissions for invited editors
-- The issue: documents table only allows owners to edit, not invited editors

-- Add policy to allow users with editor permissions to update documents
CREATE POLICY "Users with editor permissions can edit documents" ON documents
FOR UPDATE
USING (
  id IN (
    SELECT dp.document_id 
    FROM document_permissions dp 
    WHERE dp.user_id = auth.uid() 
    AND dp.permission_level IN ('owner', 'editor')
  )
);

-- Also allow access to document_autosaves for invited editors
CREATE POLICY "Users with editor permissions can create autosaves" ON document_autosaves
FOR INSERT
WITH CHECK (
  document_id IN (
    SELECT dp.document_id 
    FROM document_permissions dp 
    WHERE dp.user_id = auth.uid() 
    AND dp.permission_level IN ('owner', 'editor')
  )
); 