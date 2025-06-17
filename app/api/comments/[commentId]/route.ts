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
 * PUT /api/comments/[commentId]
 * Updates a comment's content
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const { commentId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Get the comment and its thread to check permissions
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .select(`
        id,
        author_id,
        thread_id,
        comment_threads!inner(document_id)
      `)
      .eq('id', commentId)
      .single();

    if (commentError) {
      if (commentError.code === 'PGRST116') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Comment not found' } },
          { status: 404 }
        );
      }
      console.error('Error fetching comment:', commentError);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch comment' } },
        { status: 500 }
      );
    }

         // Check if user has access to the document
    const userPermission = await checkDocumentAccess(supabase, (comment as any).comment_threads.document_id, userId);
    if (!userPermission) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Document not found or access denied' } },
        { status: 404 }
      );
    }

    // Check if user can edit the comment (only comment author can edit)
    if (comment.author_id !== userId) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You can only edit your own comments' } },
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

    // Build update payload
    const updatePayload: any = { content };
    if (mentioned_users !== undefined) {
      updatePayload.mentioned_users = mentioned_users;
    }

    // Update the comment
    const { data: updatedComment, error: updateError } = await supabase
      .from('comments')
      .update(updatePayload)
      .eq('id', commentId)
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

    if (updateError) {
      console.error('Error updating comment:', updateError);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to update comment' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedComment
    });

  } catch (error) {
    console.error('Error in PUT /api/comments/[commentId]:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comments/[commentId]
 * Deletes a comment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const { commentId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Get the comment and its thread to check permissions
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .select(`
        id,
        author_id,
        thread_id,
        comment_threads!inner(document_id)
      `)
      .eq('id', commentId)
      .single();

    if (commentError) {
      if (commentError.code === 'PGRST116') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Comment not found' } },
          { status: 404 }
        );
      }
      console.error('Error fetching comment:', commentError);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch comment' } },
        { status: 500 }
      );
    }

    // Check if user has access to the document
    const userPermission = await checkDocumentAccess(supabase, (comment as any).comment_threads.document_id, userId);
    if (!userPermission) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Document not found or access denied' } },
        { status: 404 }
      );
    }

    // Check if user can delete the comment (comment author or document owner)
    const canDelete = comment.author_id === userId || userPermission.permission_level === 'owner';
    if (!canDelete) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You can only delete your own comments or if you are the document owner' } },
        { status: 403 }
      );
    }

    // Delete the comment
    const { error: deleteError } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (deleteError) {
      console.error('Error deleting comment:', deleteError);
      return NextResponse.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to delete comment' } },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error('Error in DELETE /api/comments/[commentId]:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
} 