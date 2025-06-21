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
 * POST /api/documents/[documentId]/threads/[threadId]/unresolve
 * Unresolve a thread
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { documentId: string; threadId: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const { userId, errorResponse } = await getUserOrError(supabase);
    
    if (errorResponse) {
      return errorResponse;
    }

    const { documentId, threadId } = params;

    // Check if user has access to the document
    const userPermission = await checkDocumentAccess(supabase, documentId, userId!);
    if (!userPermission) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Document not found or access denied' } },
        { status: 404 }
      );
    }
    
    // Get Y.js document and create thread store
    const yjsDoc = await getYjsDocument(documentId);
    const threadsMap = yjsDoc.getMap('threads');
    
    // Create thread store auth based on user permission
    const role = userPermission === 'owner' || userPermission === 'editor' ? 'editor' : 'comment';
    const threadStoreAuth = new DefaultThreadStoreAuth(userId!, role);
    
    // Create YjsThreadStore instance
    const threadStore = new YjsThreadStore(userId!, threadsMap, threadStoreAuth);
    
    // Unresolve the thread
    await threadStore.unresolveThread({
      threadId
    });
    
    // Persist the Y.js document changes to Supabase
    await persistYjsDocument(yjsDoc, documentId);
    
    return NextResponse.json({ message: 'Thread un-resolved' });
  } catch (error) {
    console.error('[unresolveThread] Error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to unresolve thread' } },
      { status: 500 }
    );
  }
} 