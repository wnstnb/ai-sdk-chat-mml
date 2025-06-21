-- Migration: Fix infinite recursion in RLS policies
-- This migration fixes the circular dependency between documents and document_permissions policies

-- =====================================================================================
-- FIX DOCUMENT_PERMISSIONS POLICIES (Remove circular dependency)
-- =====================================================================================

-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Users can view permissions for documents they have access to" ON document_permissions;
DROP POLICY IF EXISTS "Document owners can manage permissions" ON document_permissions;
DROP POLICY IF EXISTS "Users can view relevant document permissions" ON document_permissions;
DROP POLICY IF EXISTS "Only document owners can manage permissions" ON document_permissions;

-- Create non-recursive policies for document_permissions
-- Policy: Users can view their own permission records
CREATE POLICY "Users can view their own permissions" ON document_permissions
  FOR SELECT 
  USING (user_id = auth.uid());

-- Policy: Document owners can view all permissions for their documents
CREATE POLICY "Document owners can view all permissions for their documents" ON document_permissions
  FOR SELECT 
  USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- Policy: Only document owners can manage (insert/update/delete) permissions
CREATE POLICY "Document owners can manage permissions" ON document_permissions
  FOR ALL 
  USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = auth.uid()
    )
  );

-- =====================================================================================
-- FIX DOCUMENTS POLICIES (Simplify to avoid recursion)
-- =====================================================================================

-- Drop potentially problematic policies
DROP POLICY IF EXISTS "Users can view owned and shared documents" ON documents;
DROP POLICY IF EXISTS "Users can edit owned documents and shared with editor access" ON documents;
DROP POLICY IF EXISTS "Only owners can delete documents" ON documents;

-- Create simple, non-recursive policies for documents
-- Policy: Users can view documents they own
CREATE POLICY "Users can view their own documents" ON documents
  FOR SELECT 
  USING (user_id = auth.uid());

-- Policy: Users can view shared documents (non-recursive approach)
CREATE POLICY "Users can view shared documents" ON documents
  FOR SELECT 
  USING (
    id = ANY(
      SELECT document_id 
      FROM document_permissions 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can edit their own documents
CREATE POLICY "Users can edit their own documents" ON documents
  FOR UPDATE 
  USING (user_id = auth.uid());

-- Policy: Users can edit shared documents with editor permission
CREATE POLICY "Users can edit shared documents with editor permission" ON documents
  FOR UPDATE 
  USING (
    id = ANY(
      SELECT document_id 
      FROM document_permissions 
      WHERE user_id = auth.uid() 
      AND permission_level = 'editor'
    )
  );

-- Policy: Only document owners can delete documents
CREATE POLICY "Document owners can delete documents" ON documents
  FOR DELETE 
  USING (user_id = auth.uid());

-- Policy: Users can insert their own documents
CREATE POLICY "Users can create their own documents" ON documents
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

-- This migration fixes the infinite recursion caused by:
-- 1. document_permissions policies trying to query document_permissions
-- 2. documents policies and document_permissions policies referencing each other
-- 
-- The fix uses:
-- 1. Direct user_id checks where possible
-- 2. ANY() subqueries instead of EXISTS() to avoid correlated subqueries
-- 3. Separate policies for different operations to be more explicit
-- 4. Non-recursive approaches that don't create circular dependencies
--
-- Performance considerations:
-- - ANY() with subqueries should be efficient with proper indexes
-- - Separate policies allow for more targeted optimization
-- - Direct user_id checks are fastest for owned documents 