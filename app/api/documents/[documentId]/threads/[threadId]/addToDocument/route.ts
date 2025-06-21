import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getYjsDocument } from '@/lib/comments/yjsDocumentUtils';
import * as Y from 'yjs';

// Helper function to get authenticated user
async function getUserOrError(supabase: any) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    };
  }
  return { userId: user.id, errorResponse: null };
}

// Helper function to check if user has document access and permission level
async function checkDocumentAccess(supabase: ReturnType<typeof createSupabaseServerClient>, documentId: string, userId: string) {
  const { data: permission, error } = await supabase
    .from('document_permissions')
    .select('permission_level')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .single();

  if (error || !permission) {
    return {
      hasAccess: false,
      errorResponse: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Document not found or access denied' } },
        { status: 404 }
      )
    };
  }

  return { hasAccess: true, errorResponse: null };
}

// Helper function to get thread from Supabase
async function getThreadFromSupabase(supabase: ReturnType<typeof createSupabaseServerClient>, documentId: string, threadId: string) {
  const { data: thread, error } = await supabase
    .from('comment_threads')
    .select(`
      id,
      document_id,
      created_at,
      updated_at,
      selection_data,
      comments (
        id,
        thread_id,
        author_id,
        content,
        created_at,
        updated_at,
        mentioned_users
      )
    `)
    .eq('thread_id', threadId)
    .eq('document_id', documentId)
    .single();

  if (error || !thread) {
    console.error('[addToDocument] Error fetching thread:', error);
    return null;
  }

  return thread;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { documentId: string; threadId: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const { documentId, threadId } = params;

    // Get authenticated user
    const { userId, errorResponse: authError } = await getUserOrError(supabase);
    if (authError) return authError;

    // Check document access
    const { hasAccess, errorResponse: accessError } = await checkDocumentAccess(supabase, documentId, userId!);
    if (accessError) return accessError;

    // Parse request body
    const body = await request.json();
    console.log('[addToDocument] Request body:', body);

    // Get the thread from Supabase
    const thread = await getThreadFromSupabase(supabase, documentId, threadId);
    if (!thread) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Thread not found' } },
        { status: 404 }
      );
    }

    // Load the Y.js document for this document
    console.log('[addToDocument] Loading Y.js document for', documentId);
    const yjsDoc = await getYjsDocument(documentId);
    
    // Get the threads map from the Y.js document
    const threadsMap = yjsDoc.getMap('threads');
    
    // Convert thread data to BlockNote format
    const blockNoteThread = {
      id: thread.id,
      metadata: thread.selection_data || {},
      comments: thread.comments.map((comment: any) => ({
        id: comment.id,
        body: comment.content,
        author: {
          id: comment.author_id,
          name: 'User' // You might want to fetch actual user name
        },
        createdAt: comment.created_at,
        metadata: comment.mentioned_users || {}
      }))
    };

    console.log('[addToDocument] Adding thread to Y.js document:', blockNoteThread);
    
    // Add the thread to the Y.js threads map
    threadsMap.set(threadId, blockNoteThread);
    
    console.log('[addToDocument] Thread successfully added to Y.js document');
    console.log('[addToDocument] Current threads in Y.js:', Array.from(threadsMap.keys()));

    // Note: We're not calling persistYjsDocument here because it's disabled
    // The client-side PartyKit integration should pick up this change automatically
    
    return NextResponse.json({ 
      message: 'Thread added to document',
      threadId,
      documentId,
      addedToYjs: true
    });

  } catch (error) {
    console.error('[addToDocument] Error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
} 