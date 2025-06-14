-- Migration: 001_collaborative_documents.sql
-- Purpose: Add collaborative document support with Yjs persistence and real-time presence
-- Date: 2025-06-13

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create collaborative_sessions table for managing active collaboration sessions
CREATE TABLE IF NOT EXISTS public.collaborative_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate active sessions per user/document
    UNIQUE(document_id, user_id, is_active)
);

-- Create yjs_updates table for persisting Yjs document state
CREATE TABLE IF NOT EXISTS public.yjs_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    update_data BYTEA NOT NULL, -- Raw Yjs update binary data
    version_vector JSONB, -- Optional: for version tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL -- Track who made the update
);

-- Create collaborative_presence table for real-time user awareness
CREATE TABLE IF NOT EXISTS public.collaborative_presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    presence_data JSONB NOT NULL DEFAULT '{}', -- User awareness data (cursor, selection, etc.)
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint for user presence per document
    UNIQUE(document_id, user_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_collaborative_sessions_document_id ON public.collaborative_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_collaborative_sessions_user_id ON public.collaborative_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_collaborative_sessions_active ON public.collaborative_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_collaborative_sessions_last_seen ON public.collaborative_sessions(last_seen);

CREATE INDEX IF NOT EXISTS idx_yjs_updates_document_id ON public.yjs_updates(document_id);
CREATE INDEX IF NOT EXISTS idx_yjs_updates_created_at ON public.yjs_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_collaborative_presence_document_id ON public.collaborative_presence(document_id);
CREATE INDEX IF NOT EXISTS idx_collaborative_presence_user_id ON public.collaborative_presence(user_id);
CREATE INDEX IF NOT EXISTS idx_collaborative_presence_last_updated ON public.collaborative_presence(last_updated);

-- Add RLS (Row Level Security) policies
ALTER TABLE public.collaborative_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yjs_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborative_presence ENABLE ROW LEVEL SECURITY;

-- Collaborative sessions policies
CREATE POLICY "Users can view collaborative sessions for documents they have access to" 
ON public.collaborative_sessions FOR SELECT 
USING (
    document_id IN (
        SELECT id FROM public.documents 
        WHERE user_id = auth.uid()
        -- TODO: Add sharing permissions check here when document sharing is implemented
    )
);

CREATE POLICY "Users can insert their own collaborative sessions" 
ON public.collaborative_sessions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collaborative sessions" 
ON public.collaborative_sessions FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collaborative sessions" 
ON public.collaborative_sessions FOR DELETE 
USING (auth.uid() = user_id);

-- Yjs updates policies
CREATE POLICY "Users can view yjs updates for documents they have access to" 
ON public.yjs_updates FOR SELECT 
USING (
    document_id IN (
        SELECT id FROM public.documents 
        WHERE user_id = auth.uid()
        -- TODO: Add sharing permissions check here when document sharing is implemented
    )
);

CREATE POLICY "Users can insert yjs updates for documents they have access to" 
ON public.yjs_updates FOR INSERT 
WITH CHECK (
    document_id IN (
        SELECT id FROM public.documents 
        WHERE user_id = auth.uid()
        -- TODO: Add sharing permissions check here when document sharing is implemented
    )
);

-- Collaborative presence policies
CREATE POLICY "Users can view presence for documents they have access to" 
ON public.collaborative_presence FOR SELECT 
USING (
    document_id IN (
        SELECT id FROM public.documents 
        WHERE user_id = auth.uid()
        -- TODO: Add sharing permissions check here when document sharing is implemented
    )
);

CREATE POLICY "Users can manage their own presence" 
ON public.collaborative_presence FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Functions for managing collaborative state

-- Function to clean up inactive sessions
CREATE OR REPLACE FUNCTION cleanup_inactive_sessions(inactive_threshold INTERVAL DEFAULT INTERVAL '30 minutes')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Mark sessions as inactive if last_seen is older than threshold
    UPDATE public.collaborative_sessions 
    SET is_active = false, updated_at = NOW()
    WHERE is_active = true 
    AND last_seen < (NOW() - inactive_threshold);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- Function to update session activity
CREATE OR REPLACE FUNCTION update_session_activity(session_document_id UUID, session_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.collaborative_sessions (document_id, user_id, last_seen, is_active)
    VALUES (session_document_id, session_user_id, NOW(), true)
    ON CONFLICT (document_id, user_id, is_active) 
    DO UPDATE SET 
        last_seen = NOW(),
        updated_at = NOW();
END;
$$;

-- Function to upsert presence data
CREATE OR REPLACE FUNCTION upsert_user_presence(
    presence_document_id UUID, 
    presence_user_id UUID, 
    presence_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.collaborative_presence (document_id, user_id, presence_data, last_updated)
    VALUES (presence_document_id, presence_user_id, presence_data, NOW())
    ON CONFLICT (document_id, user_id) 
    DO UPDATE SET 
        presence_data = EXCLUDED.presence_data,
        last_updated = NOW();
END;
$$;

-- Trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Apply the trigger to collaborative_sessions
CREATE TRIGGER update_collaborative_sessions_updated_at 
    BEFORE UPDATE ON public.collaborative_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create realtime subscriptions for collaboration features
-- Note: This enables real-time subscriptions via Supabase's realtime feature
ALTER PUBLICATION supabase_realtime ADD TABLE public.collaborative_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collaborative_presence;
-- Note: We typically don't want to subscribe to yjs_updates in realtime as they're handled by Yjs providers

-- Comments for documentation
COMMENT ON TABLE public.collaborative_sessions IS 'Tracks active collaborative editing sessions for documents';
COMMENT ON TABLE public.yjs_updates IS 'Stores Yjs document updates for persistence and synchronization';
COMMENT ON TABLE public.collaborative_presence IS 'Manages real-time user presence and awareness data for collaborative editing';

COMMENT ON COLUMN public.collaborative_sessions.session_data IS 'Additional session metadata (user preferences, editor state, etc.)';
COMMENT ON COLUMN public.yjs_updates.update_data IS 'Binary Yjs update data for document synchronization';
COMMENT ON COLUMN public.yjs_updates.version_vector IS 'Optional version tracking for conflict resolution';
COMMENT ON COLUMN public.collaborative_presence.presence_data IS 'User awareness data including cursor position, selection, user info, etc.'; 