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
 * GET /api/comment-threads/[threadId]
 * Retrieves a specific comment thread
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

    // Get the comment thread
    const { data: thread, error } = await supabase
      .from('comment_threads')
      .select(`
        id,
        document_id,
        thread_id,
        status,
        created_by,
        created_at,
        resolved_by,
        resolved_at,
        selection_data,
        updated_at
      `)
      .eq('id', threadId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Comment thread not found' } },
          { status: 404 }
        );
      }
      console.error('Error fetching comment thread:', error);
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

    return NextResponse.json({
      success: true,
      data: thread
    });

  } catch (error) {
    console.error('Error in GET /api/comment-threads/[threadId]:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/comment-threads/[threadId]
 * Updates a comment thread (status, selection_data)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const { threadId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Get the comment thread to check document access
    const { data: thread, error: threadError } = await supabase
      .from('comment_threads')
      .select('document_id, created_by')
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

    const { status, selection_data } = body;

    // Validate input
    if (status && !['open', 'resolved'].includes(status)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Status must be either "open" or "resolved"' } },
        { status: 400 }
      );
    }

    // Build update payload
    const updatePayload: any = {};
    
    if (status !== undefined) {
      updatePayload.status = status;
      if (status === 'resolved') {
        updatePayload.resolved_by = userId;
        updatePayload.resolved_at = new Date().toISOString();
      } else if (status === 'open') {
        updatePayload.resolved_by = null;
        updatePayload.resolved_at = null;
      }
    }
    
    if (selection_data !== undefined) {
      updatePayload.selection_data = selection_data;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } },
        { status: 400 }
      );
    }

    // Update the comment thread
    const { data: updatedThread, error: updateError } = await supabase
      .from('comment_threads')
      .update(updatePayload)
      .eq('id', threadId)
      .select(`
        id,
        document_id,
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

    if (updateError) {
      console.error('Error updating comment thread:', updateError);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to update comment thread' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedThread
    });

  } catch (error) {
    console.error('Error in PUT /api/comment-threads/[threadId]:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comment-threads/[threadId]
 * Deletes a comment thread and all its comments
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const { threadId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Get the comment thread to check document access and ownership
    const { data: thread, error: threadError } = await supabase
      .from('comment_threads')
      .select('document_id, created_by')
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

    // Check if user can delete the thread (thread creator or document owner)
    const canDelete = thread.created_by === userId || userPermission.permission_level === 'owner';
    if (!canDelete) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You can only delete threads you created or if you are the document owner' } },
        { status: 403 }
      );
    }

    // Delete the comment thread (comments will be deleted via CASCADE)
    const { error: deleteError } = await supabase
      .from('comment_threads')
      .delete()
      .eq('id', threadId);

    if (deleteError) {
      console.error('Error deleting comment thread:', deleteError);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to delete comment thread' } },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error('Error in DELETE /api/comment-threads/[threadId]:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
} 