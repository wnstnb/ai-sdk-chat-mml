import { supabase } from '@/lib/supabase/client';
import type { PostgrestSingleResponse, PostgrestResponse, PostgrestError } from '@supabase/supabase-js';

// ---- Types ----
// Based on supabase/migrations/001_collaborative_documents.sql

export interface CommentThread {
  id: string; // UUID (PK)
  document_id: string; // UUID
  thread_id: string; // VARCHAR (BlockNote's ID)
  status: 'open' | 'resolved';
  created_by: string; // User UUID
  created_at: string; // ISO Timestamp
  resolved_by?: string | null; // User UUID
  resolved_at?: string | null; // ISO Timestamp
  selection_data?: any | null; // JSONB
  updated_at: string; // ISO Timestamp
}

export interface Comment {
  id: string; // UUID (PK)
  thread_id: string; // UUID (FK to comment_threads.id)
  content: any; // JSONB (BlockNote content)
  author_id: string; // User UUID
  created_at: string; // ISO Timestamp
  updated_at: string; // ISO Timestamp
  mentioned_users?: string[] | null; // Array of User UUIDs
}

// ---- Helper to get current user ----
async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// Helper to create a consistent authentication error response
function createAuthErrorResponse<T>(): PostgrestSingleResponse<T> {
    const error: PostgrestError = {
        name: 'AuthError',
        message: 'User not authenticated',
        details: 'User session not found or invalid.',
        hint: 'Please log in again.',
        code: '401'
    };
    return { data: null, error, status: 401, statusText: 'Unauthorized', count: null };
}

// ---- Comment Thread Functions ----

export async function createCommentThread(
  documentId: string,
  bnThreadId: string, // BlockNote's string thread ID
  selectionData: any | null
): Promise<PostgrestSingleResponse<CommentThread>> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return createAuthErrorResponse<CommentThread>();
  }
  return supabase
    .from('comment_threads')
    .insert({
      document_id: documentId,
      thread_id: bnThreadId,
      selection_data: selectionData,
      created_by: userId,
      status: 'open',
    })
    .select()
    .single();
}

export async function getCommentThreadByBnId(bnThreadId: string): Promise<PostgrestSingleResponse<CommentThread>> {
  return supabase
    .from('comment_threads')
    .select('*')
    .eq('thread_id', bnThreadId)
    .single();
}

export async function getCommentThreadsByDocument(documentId: string): Promise<PostgrestResponse<CommentThread>> {
  return supabase
    .from('comment_threads')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });
}

export async function updateCommentThreadStatus(
  threadUuid: string,
  status: 'open' | 'resolved'
): Promise<PostgrestSingleResponse<CommentThread>> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return createAuthErrorResponse<CommentThread>();
  }
  const updatePayload: Partial<CommentThread> & { resolved_by?: string | null, resolved_at?: string | null } = { status };
  if (status === 'resolved') {
    updatePayload.resolved_by = userId;
    updatePayload.resolved_at = new Date().toISOString();
  } else {
    // If reopening, clear resolved fields
    updatePayload.resolved_by = null;
    updatePayload.resolved_at = null;
  }
  return supabase
    .from('comment_threads')
    .update(updatePayload)
    .eq('id', threadUuid)
    .select()
    .single();
}

export async function updateCommentThreadSelection(
  threadUuid: string,
  selectionData: any | null
): Promise<PostgrestSingleResponse<CommentThread>> {
   return supabase
    .from('comment_threads')
    .update({ selection_data: selectionData })
    .eq('id', threadUuid)
    .select()
    .single();
}

export async function deleteCommentThread(threadUuid: string): Promise<PostgrestSingleResponse<CommentThread>> {
  return supabase
    .from('comment_threads')
    .delete()
    .eq('id', threadUuid)
    .select()
    .single();
}


// ---- Comment Functions ----

export async function createComment(
  threadUuid: string, // Parent comment_threads.id (UUID)
  content: any
): Promise<PostgrestSingleResponse<Comment>> {
  const userId = await getCurrentUserId();
  if (!userId) {
     return createAuthErrorResponse<Comment>();
  }
  return supabase
    .from('comments')
    .insert({
      thread_id: threadUuid,
      content: content,
      author_id: userId,
    })
    .select()
    .single();
}

export async function getCommentsByThread(threadUuid: string): Promise<PostgrestResponse<Comment>> {
  return supabase
    .from('comments')
    .select('*')
    .eq('thread_id', threadUuid)
    .order('created_at', { ascending: true });
}

export async function updateCommentContent(
  commentUuid: string,
  content: any
): Promise<PostgrestSingleResponse<Comment>> {
  return supabase
    .from('comments')
    .update({ content: content })
    .eq('id', commentUuid)
    .select()
    .single();
}

export async function deleteComment(commentUuid: string): Promise<PostgrestSingleResponse<Comment>> {
  return supabase
    .from('comments')
    .delete()
    .eq('id', commentUuid)
    .select()
    .single();
} 