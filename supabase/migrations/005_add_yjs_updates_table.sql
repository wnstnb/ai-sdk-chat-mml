-- Create yjs_updates table for storing Y.js document state
-- This table stores binary Y.js updates that include both document content and comment threads
CREATE TABLE yjs_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  update_data BYTEA NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_yjs_updates_document_id ON yjs_updates(document_id);
CREATE INDEX idx_yjs_updates_user_id ON yjs_updates(user_id);
CREATE INDEX idx_yjs_updates_created_at ON yjs_updates(created_at);

-- Enable RLS
ALTER TABLE yjs_updates ENABLE ROW LEVEL SECURITY;

-- RLS policies for yjs_updates
-- Users can view Y.js updates for documents they have access to
CREATE POLICY "Users can view Y.js updates for accessible documents" ON yjs_updates
  FOR SELECT USING (
    document_id IN (
      SELECT dp.document_id FROM document_permissions dp
      WHERE dp.user_id = auth.uid()
    ) OR 
    document_id IN (
      SELECT d.id FROM documents d
      WHERE d.user_id = auth.uid()
    )
  );

-- Users with editor permissions can create Y.js updates
CREATE POLICY "Users with editor permissions can create Y.js updates" ON yjs_updates
  FOR INSERT WITH CHECK (
    document_id IN (
      SELECT dp.document_id FROM document_permissions dp
      WHERE dp.user_id = auth.uid() 
      AND dp.permission_level IN ('owner', 'editor')
    ) OR 
    document_id IN (
      SELECT d.id FROM documents d
      WHERE d.user_id = auth.uid()
    )
  );

-- Users can only update their own Y.js updates (though updates are typically append-only)
CREATE POLICY "Users can only update their own Y.js updates" ON yjs_updates
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own Y.js updates or document owners can delete any
CREATE POLICY "Users can delete their own Y.js updates or document owners can delete any" ON yjs_updates
  FOR DELETE USING (
    user_id = auth.uid() OR
    document_id IN (
      SELECT dp.document_id FROM document_permissions dp
      WHERE dp.user_id = auth.uid() AND dp.permission_level = 'owner'
    ) OR 
    document_id IN (
      SELECT d.id FROM documents d
      WHERE d.user_id = auth.uid()
    )
  );

-- Add comment to table
COMMENT ON TABLE yjs_updates IS 'Stores Y.js binary updates for collaborative document editing and comment persistence';
COMMENT ON COLUMN yjs_updates.update_data IS 'Binary Y.js update data containing document content and comment thread changes';
COMMENT ON COLUMN yjs_updates.document_id IS 'Reference to the document this update belongs to';
COMMENT ON COLUMN yjs_updates.user_id IS 'User who created this update'; 