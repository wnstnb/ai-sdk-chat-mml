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
 * GET /api/documents/[documentId]/comment-threads
 * Retrieves all comment threads for a document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const { documentId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Check if user has access to the document
    const userPermission = await checkDocumentAccess(supabase, documentId, userId);
    if (!userPermission) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Document not found or access denied' } },
        { status: 404 }
      );
    }

    // Get all comment threads for the document
    const { data: threads, error } = await supabase
      .from('comment_threads')
      .select(`
        id,
        thread_id,
        status,
        created_by,
        created_at,
        resolved_by,
        resolved_at,
        selection_data,
        updated_at
      `)
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comment threads:', error);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch comment threads' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: threads || [],
      count: threads?.length || 0
    });

  } catch (error) {
    console.error('Error in GET /api/documents/[documentId]/comment-threads:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents/[documentId]/comment-threads
 * Creates a new comment thread for a document
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const { documentId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Check if user has permission to create comments (commenter, editor, or owner)
    const userPermission = await checkDocumentAccess(supabase, documentId, userId);
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

    const { thread_id, selection_data } = body;

    // Validate input
    if (!thread_id || typeof thread_id !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'thread_id is required and must be a string' } },
        { status: 400 }
      );
    }

    // Create the comment thread
    const { data: thread, error } = await supabase
      .from('comment_threads')
      .insert({
        document_id: documentId,
        thread_id,
        selection_data: selection_data || null,
        created_by: userId,
        status: 'open'
      })
      .select(`
        id,
        thread_id,
        status,
        created_by,
        created_at,
        resolved_by,
        resolved_at,
        selection_data,
        updated_at
      `)
      .single();

    if (error) {
      console.error('Error creating comment thread:', error);
      
      // Handle unique constraint violation (thread_id already exists)
      if (error.code === '23505') {
        return NextResponse.json(
          { error: { code: 'CONFLICT', message: 'A thread with this ID already exists' } },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to create comment thread' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: thread
    }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/documents/[documentId]/comment-threads:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
} 