-- Migration: Add optimized indexes and RLS policies for shared documents visibility
-- This migration supports Task 23.1: Backend Query Logic for Shared and Owned Documents

-- =====================================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================================================

-- Index for efficient document permission queries (user_id + document_id + permission_level)
CREATE INDEX IF NOT EXISTS idx_document_permissions_user_doc_level 
ON document_permissions (user_id, document_id, permission_level);

-- Index for efficient owned documents queries (user_id + updated_at for sorting)
CREATE INDEX IF NOT EXISTS idx_documents_user_updated 
ON documents (user_id, updated_at DESC);

-- Index for documents by updated_at (for global sorting across owned/shared)
CREATE INDEX IF NOT EXISTS idx_documents_updated_at 
ON documents (updated_at DESC);

-- Index for document permissions by granted_at (for chronological shared document ordering)
CREATE INDEX IF NOT EXISTS idx_document_permissions_granted_at 
ON document_permissions (granted_at DESC);

-- Composite index for efficient permission checking
CREATE INDEX IF NOT EXISTS idx_document_permissions_doc_user 
ON document_permissions (document_id, user_id);

-- =====================================================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================================================

-- Enable RLS on documents table (if not already enabled)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Enable RLS on document_permissions table (if not already enabled)
ALTER TABLE document_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view documents they own OR have permissions for
DROP POLICY IF EXISTS "Users can view owned and shared documents" ON documents;
CREATE POLICY "Users can view owned and shared documents" ON documents
  FOR SELECT 
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM document_permissions 
      WHERE document_permissions.document_id = documents.id 
      AND document_permissions.user_id = auth.uid()
    )
  );

-- Policy: Users can edit documents they own OR have editor permissions for
DROP POLICY IF EXISTS "Users can edit owned documents and shared with editor access" ON documents;
CREATE POLICY "Users can edit owned documents and shared with editor access" ON documents
  FOR UPDATE 
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM document_permissions 
      WHERE document_permissions.document_id = documents.id 
      AND document_permissions.user_id = auth.uid()
      AND document_permissions.permission_level IN ('editor')
    )
  );

-- Policy: Only document owners can delete documents
DROP POLICY IF EXISTS "Only owners can delete documents" ON documents;
CREATE POLICY "Only owners can delete documents" ON documents
  FOR DELETE 
  USING (user_id = auth.uid());

-- Policy: Users can view their own permission records and permissions for documents they own
DROP POLICY IF EXISTS "Users can view relevant document permissions" ON document_permissions;
CREATE POLICY "Users can view relevant document permissions" ON document_permissions
  FOR SELECT 
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM documents 
      WHERE documents.id = document_permissions.document_id 
      AND documents.user_id = auth.uid()
    )
  );

-- Policy: Only document owners can manage permissions
DROP POLICY IF EXISTS "Only document owners can manage permissions" ON document_permissions;
CREATE POLICY "Only document owners can manage permissions" ON document_permissions
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM documents 
      WHERE documents.id = document_permissions.document_id 
      AND documents.user_id = auth.uid()
    )
  );

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This migration optimizes the database for:
-- 1. Fast retrieval of documents owned by a user
-- 2. Fast retrieval of documents shared with a user
-- 3. Efficient permission checking for document access
-- 4. Proper security enforcement via RLS policies
-- 
-- The indexes support the query patterns in /api/documents endpoint:
-- - Finding owned documents: WHERE user_id = ? ORDER BY updated_at
-- - Finding shared documents: JOIN with document_permissions WHERE user_id = ?
-- - Permission verification: WHERE document_id = ? AND user_id = ?
--
-- Performance considerations:
-- - Composite indexes reduce I/O for multi-column queries
-- - DESC ordering indexes support ORDER BY updated_at DESC queries
-- - RLS policies ensure security without application-level checks 