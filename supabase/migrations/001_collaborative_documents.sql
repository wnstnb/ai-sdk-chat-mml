-- Create document_permissions table
CREATE TABLE document_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_level VARCHAR(20) NOT NULL CHECK (permission_level IN ('owner', 'editor', 'commenter', 'viewer')),
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

-- Create indexes for performance
CREATE INDEX idx_document_permissions_document_id ON document_permissions(document_id);
CREATE INDEX idx_document_permissions_user_id ON document_permissions(user_id);
CREATE INDEX idx_document_permissions_permission_level ON document_permissions(permission_level);

-- Enable RLS
ALTER TABLE document_permissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_permissions
CREATE POLICY "Users can view permissions for documents they have access to" ON document_permissions
  FOR SELECT USING (
    user_id = auth.uid() OR 
    document_id IN (
      SELECT document_id FROM document_permissions 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Document owners can manage permissions" ON document_permissions
  FOR ALL USING (
    document_id IN (
      SELECT document_id FROM document_permissions 
      WHERE user_id = auth.uid() AND permission_level = 'owner'
    )
  );

  -- Create comment_threads table
CREATE TABLE comment_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  thread_id VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  -- Store the text selection/position data for the comment
  selection_data JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_comment_threads_document_id ON comment_threads(document_id);
CREATE INDEX idx_comment_threads_thread_id ON comment_threads(thread_id);
CREATE INDEX idx_comment_threads_status ON comment_threads(status);
CREATE INDEX idx_comment_threads_created_at ON comment_threads(created_at);

-- Enable RLS
ALTER TABLE comment_threads ENABLE ROW LEVEL SECURITY;

-- RLS policies for comment_threads
CREATE POLICY "Users can view comment threads for documents they have access to" ON comment_threads
  FOR SELECT USING (
    document_id IN (
      SELECT document_id FROM document_permissions 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users with comment/edit permissions can create threads" ON comment_threads
  FOR INSERT WITH CHECK (
    document_id IN (
      SELECT document_id FROM document_permissions 
      WHERE user_id = auth.uid() 
      AND permission_level IN ('owner', 'editor', 'commenter')
    )
  );

CREATE POLICY "Thread creators and document owners can update threads" ON comment_threads
  FOR UPDATE USING (
    created_by = auth.uid() OR
    document_id IN (
      SELECT document_id FROM document_permissions 
      WHERE user_id = auth.uid() AND permission_level = 'owner'
    )
  );

  -- Create comments table
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- For tracking mentions
  mentioned_users UUID[] DEFAULT '{}'
);

-- Create indexes
CREATE INDEX idx_comments_thread_id ON comments(thread_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);
CREATE INDEX idx_comments_mentioned_users ON comments USING GIN(mentioned_users);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for comments
CREATE POLICY "Users can view comments for accessible documents" ON comments
  FOR SELECT USING (
    thread_id IN (
      SELECT ct.id FROM comment_threads ct
      JOIN document_permissions dp ON ct.document_id = dp.document_id
      WHERE dp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users with comment/edit permissions can create comments" ON comments
  FOR INSERT WITH CHECK (
    thread_id IN (
      SELECT ct.id FROM comment_threads ct
      JOIN document_permissions dp ON ct.document_id = dp.document_id
      WHERE dp.user_id = auth.uid() 
      AND dp.permission_level IN ('owner', 'editor', 'commenter')
    )
  );

CREATE POLICY "Comment authors can update their own comments" ON comments
  FOR UPDATE USING (author_id = auth.uid());

-- Create notifications table for collaboration events
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('mention', 'comment', 'document_shared', 'permission_changed', 'user_joined')),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_document_id ON notifications(document_id);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policy for notifications
CREATE POLICY "Users can only see their own notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_document_permissions_updated_at 
  BEFORE UPDATE ON document_permissions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comment_threads_updated_at 
  BEFORE UPDATE ON comment_threads 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at 
  BEFORE UPDATE ON comments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();