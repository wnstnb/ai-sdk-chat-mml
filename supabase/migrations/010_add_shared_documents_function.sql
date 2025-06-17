-- Migration: Add function to get shared document IDs
-- This function implements the logic: documents with more than one permission record are considered shared

-- Function to get document IDs that have been shared (more than one permission record)
CREATE OR REPLACE FUNCTION get_shared_document_ids()
RETURNS TABLE(document_id UUID, permission_count BIGINT)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  WITH doc_counts AS (
    SELECT document_permissions.document_id, count(permission_level) as permission_count
    FROM document_permissions
    GROUP BY document_permissions.document_id
    HAVING count(permission_level) > 1 -- if a document shows up more than once, it means permission was granted to someone else other than the owner
  )
  SELECT c.document_id, c.permission_count
  FROM doc_counts c;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_shared_document_ids() TO authenticated; 