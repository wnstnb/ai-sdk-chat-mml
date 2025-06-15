-- Migration: Ensure all document owners have explicit permission records
-- This fixes the issue where document owners don't have permission records in document_permissions

-- Step 1: Insert owner permission records for all existing documents that don't have them
INSERT INTO document_permissions (document_id, user_id, permission_level, granted_by, granted_at)
SELECT 
    d.id as document_id,
    d.user_id,
    'owner' as permission_level,
    d.user_id as granted_by,
    d.created_at as granted_at  -- Use document creation time as grant time
FROM documents d
LEFT JOIN document_permissions dp ON d.id = dp.document_id AND d.user_id = dp.user_id
WHERE dp.id IS NULL  -- Only insert where no permission record exists
AND d.user_id IS NOT NULL;  -- Only for documents that have an owner

-- Step 2: Create a function to automatically create owner permission when a document is created
CREATE OR REPLACE FUNCTION create_owner_permission()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create permission if the document has an owner
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO document_permissions (document_id, user_id, permission_level, granted_by, granted_at)
    VALUES (NEW.id, NEW.user_id, 'owner', NEW.user_id, NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger to automatically create owner permission for new documents
DROP TRIGGER IF EXISTS create_document_owner_permission ON documents;
CREATE TRIGGER create_document_owner_permission
  AFTER INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION create_owner_permission();

-- Step 4: Add a comment to document the new behavior
COMMENT ON TRIGGER create_document_owner_permission ON documents IS 
'Automatically creates an owner permission record in document_permissions when a new document is created';

COMMENT ON FUNCTION create_owner_permission() IS 
'Function to create owner permission record for new documents. Called by create_document_owner_permission trigger.'; 