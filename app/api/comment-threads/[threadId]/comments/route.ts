import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  // First check if user is the document owner
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single();

  if (docError && docError.code !== 'PGRST116') {
    throw new Error(`Database error checking document ownership: ${docError.message}`);
  }

  // If user is the document owner, return owner permission
  if (document && document.user_id === userId) {
    return { permission_level: 'owner' };
  }

  // Otherwise, check for explicit permission record
  const { data: permission, error } = await supabase
    .from('document_permissions')
    .select('permission_level')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Database error checking permissions: ${error.message}`);
  }

  return permission;
}

/**
 * GET /api/comment-threads/[threadId]/comments
 * Retrieves all comments for a specific thread
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const { threadId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // First, get the thread to check document access
    const { data: thread, error: threadError } = await supabase
      .from('comment_threads')
      .select('document_id')
      .eq('id', threadId)
      .single();

    if (threadError) {
      if (threadError.code === 'PGRST116') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Comment thread not found' } },
          { status: 404 }
        );
      }
      console.error('Error fetching comment thread:', threadError);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch comment thread' } },
        { status: 500 }
      );
    }

    // Check if user has access to the document
    const userPermission = await checkDocumentAccess(supabase, thread.document_id, userId);
    if (!userPermission) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Document not found or access denied' } },
        { status: 404 }
      );
    }

    // Get all comments for the thread
    const { data: comments, error } = await supabase
      .from('comments')
      .select(`
        id,
        thread_id,
        content,
        author_id,
        created_at,
        updated_at,
        mentioned_users
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comments:', error);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch comments' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: comments || [],
      count: comments?.length || 0
    });

  } catch (error) {
    console.error('Error in GET /api/comment-threads/[threadId]/comments:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comment-threads/[threadId]/comments
 * Creates a new comment in a thread
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const { threadId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // First, get the thread to check document access
    const { data: thread, error: threadError } = await supabase
      .from('comment_threads')
      .select('document_id')
      .eq('id', threadId)
      .single();

    if (threadError) {
      if (threadError.code === 'PGRST116') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Comment thread not found' } },
          { status: 404 }
        );
      }
      console.error('Error fetching comment thread:', threadError);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch comment thread' } },
        { status: 500 }
      );
    }

    // Check if user has permission to create comments (commenter, editor, or owner)
    const userPermission = await checkDocumentAccess(supabase, thread.document_id, userId);
    if (!userPermission || !['owner', 'editor', 'commenter'].includes(userPermission.permission_level)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You do not have permission to create comments on this document' } },
        { status: 403 }
      );
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } },
        { status: 400 }
      );
    }

    const { content, mentioned_users } = body;

    // Validate input
    if (!content) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Content is required' } },
        { status: 400 }
      );
    }

    // Create the comment
    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        thread_id: threadId,
        content,
        author_id: userId,
        mentioned_users: mentioned_users || []
      })
      .select(`
        id,
        thread_id,
        content,
        author_id,
        created_at,
        updated_at,
        mentioned_users
      `)
      .single();

    if (error) {
      console.error('Error creating comment:', error);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to create comment' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: comment
    }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/comment-threads/[threadId]/comments:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
} 