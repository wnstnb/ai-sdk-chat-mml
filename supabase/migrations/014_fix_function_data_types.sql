-- Fix data type mismatch in check_shared_document_access function
-- The issue is that permission_level column is varchar but function returns text

DROP FUNCTION IF EXISTS check_shared_document_access(uuid, uuid);

CREATE OR REPLACE FUNCTION check_shared_document_access(doc_id uuid, user_uuid uuid)
RETURNS TABLE(has_access boolean, permission_level text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- First check if user is the document owner
  IF EXISTS (SELECT 1 FROM documents WHERE id = doc_id AND user_id = user_uuid) THEN
    RETURN QUERY SELECT TRUE, 'owner'::text;
    RETURN;
  END IF;
  
  -- Then check for explicit permissions
  RETURN QUERY 
  SELECT 
    CASE WHEN dp.permission_level IS NOT NULL THEN TRUE ELSE FALSE END,
    COALESCE(dp.permission_level::text, 'none'::text)  -- Cast varchar to text
  FROM document_permissions dp
  WHERE dp.document_id = doc_id AND dp.user_id = user_uuid
  LIMIT 1;
  
  -- If no permissions found, return no access
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'none'::text;
  END IF;
END;
$$; 