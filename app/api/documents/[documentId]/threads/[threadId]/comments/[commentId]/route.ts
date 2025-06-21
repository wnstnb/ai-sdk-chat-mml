import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { YjsThreadStore, DefaultThreadStoreAuth } from '@blocknote/core/comments';
import { getYjsDocument, persistYjsDocument } from '@/lib/comments/yjsDocumentUtils';

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
    return null;
  }

  return permission.permission_level;
}

/**
 * PUT /api/documents/[documentId]/threads/[threadId]/comments/[commentId]
 * Update a comment
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { documentId: string; threadId: string; commentId: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const { userId, errorResponse } = await getUserOrError(supabase);
    
    if (errorResponse) {
      return errorResponse;
    }

    const { documentId, threadId, commentId } = params;

    // Check if user has access to the document
    const userPermission = await checkDocumentAccess(supabase, documentId, userId!);
    if (!userPermission) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Document not found or access denied' } },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    console.log('[updateComment] Request body:', body);
    
    // Get Y.js document and create thread store
    const yjsDoc = await getYjsDocument(documentId);
    const threadsMap = yjsDoc.getMap('threads');
    
    // Create thread store auth based on user permission
    const role = userPermission === 'owner' || userPermission === 'editor' ? 'editor' : 'comment';
    const threadStoreAuth = new DefaultThreadStoreAuth(userId!, role);
    
    // Create YjsThreadStore instance
    const threadStore = new YjsThreadStore(userId!, threadsMap, threadStoreAuth);
    
    // Update the comment
    await threadStore.updateComment({
      threadId,
      commentId,
      ...body
    });
    
    // Persist the Y.js document changes to Supabase
    await persistYjsDocument(yjsDoc, documentId);
    
    return NextResponse.json({ message: 'Comment updated' });
  } catch (error) {
    console.error('[updateComment] Error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update comment' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/documents/[documentId]/threads/[threadId]/comments/[commentId]
 * Delete a comment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { documentId: string; threadId: string; commentId: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const { userId, errorResponse } = await getUserOrError(supabase);
    
    if (errorResponse) {
      return errorResponse;
    }

    const { documentId, threadId, commentId } = params;

    // Check if user has access to the document
    const userPermission = await checkDocumentAccess(supabase, documentId, userId!);
    if (!userPermission) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Document not found or access denied' } },
        { status: 404 }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const softDelete = url.searchParams.get('softDelete') === 'true';
    
    // Get Y.js document and create thread store
    const yjsDoc = await getYjsDocument(documentId);
    const threadsMap = yjsDoc.getMap('threads');
    
    // Create thread store auth based on user permission
    const role = userPermission === 'owner' || userPermission === 'editor' ? 'editor' : 'comment';
    const threadStoreAuth = new DefaultThreadStoreAuth(userId!, role);
    
    // Create YjsThreadStore instance
    const threadStore = new YjsThreadStore(userId!, threadsMap, threadStoreAuth);
    
    // Delete the comment
    await threadStore.deleteComment({
      threadId,
      commentId,
      softDelete
    });
    
    // Persist the Y.js document changes to Supabase
    await persistYjsDocument(yjsDoc, documentId);
    
    return NextResponse.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('[deleteComment] Error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to delete comment' } },
      { status: 500 }
    );
  }
} 