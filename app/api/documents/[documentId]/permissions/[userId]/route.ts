import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Re-use the helper function from the documents route
async function getUserOrError(supabase: ReturnType<typeof createSupabaseServerClient>) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('Session Error:', sessionError.message);
    return { errorResponse: NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Failed to get session.' } }, { status: 500 }) };
  }
  if (!session) {
    return { errorResponse: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'User not authenticated.' } }, { status: 401 }) };
  }
  return { userId: session.user.id };
}

// Helper function to check if user has document access and permission level
async function checkDocumentAccess(supabase: ReturnType<typeof createSupabaseServerClient>, documentId: string, userId: string) {
  // Use the database function that safely checks access without circular dependencies
  const { data: accessResult, error } = await supabase.rpc('check_shared_document_access', {
    doc_id: documentId,
    user_uuid: userId
  });

  if (error) {
    throw new Error(`Database error checking document access: ${error.message}`);
  }

  // The function returns an array with one row: { has_access: boolean, permission_level: string }
  if (accessResult && accessResult.length > 0 && accessResult[0].has_access) {
    return { permission_level: accessResult[0].permission_level };
  }

  return null; // No access
}

// PUT handler - Update user permission level
export async function PUT(
  request: Request,
  { params }: { params: { documentId: string; userId: string } }
) {
  const { documentId, userId: targetUserId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId: currentUserId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Check if current user has permission to modify permissions (must be owner)
    const userPermission = await checkDocumentAccess(supabase, documentId, currentUserId);
    if (!userPermission || userPermission.permission_level !== 'owner') {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'Only document owners can modify permissions.' } 
      }, { status: 403 });
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ 
        error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } 
      }, { status: 400 });
    }

    const { permission_level } = body;

    // Validate input
    if (!permission_level || !['owner', 'editor', 'commenter', 'viewer'].includes(permission_level)) {
      return NextResponse.json({ 
        error: { code: 'VALIDATION_ERROR', message: 'Valid permission_level is required.' } 
      }, { status: 400 });
    }

    // Prevent user from modifying their own owner permissions
    if (currentUserId === targetUserId && userPermission.permission_level === 'owner' && permission_level !== 'owner') {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'You cannot change your own owner permissions.' } 
      }, { status: 403 });
    }

    // Check if target user has access to the document
    const targetPermission = await checkDocumentAccess(supabase, documentId, targetUserId);
    if (!targetPermission) {
      return NextResponse.json({ 
        error: { code: 'NOT_FOUND', message: 'User does not have access to this document.' } 
      }, { status: 404 });
    }

    // Update permission
    const { data: updatedPermission, error: updateError } = await supabase
      .from('document_permissions')
      .update({ 
        permission_level: permission_level,
        updated_at: new Date().toISOString()
      })
      .eq('document_id', documentId)
      .eq('user_id', targetUserId)
      .select()
      .single();

    if (updateError) {
      console.error('Permission update error:', updateError.message);
      return NextResponse.json({ 
        error: { code: 'DATABASE_ERROR', message: `Failed to update permission: ${updateError.message}` } 
      }, { status: 500 });
    }

    if (!updatedPermission) {
      return NextResponse.json({ 
        error: { code: 'NOT_FOUND', message: 'Permission not found.' } 
      }, { status: 404 });
    }

    // Create notification for the user whose permission was changed
    await supabase
      .from('notifications')
      .insert({
        user_id: targetUserId,
        type: 'permission_changed',
        title: 'Document permission updated',
        message: `Your permission level has been changed to ${permission_level}`,
        document_id: documentId,
        created_by: currentUserId,
        data: {
          new_permission_level: permission_level,
          previous_permission_level: targetPermission.permission_level
        }
      });

    return NextResponse.json({ 
      message: 'Permission updated successfully',
      permission: updatedPermission
    }, { status: 200 });

  } catch (error: any) {
    console.error('Permission PUT Error:', error.message);
    return NextResponse.json({ 
      error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } 
    }, { status: 500 });
  }
}

// DELETE handler - Remove user from document
export async function DELETE(
  request: Request,
  { params }: { params: { documentId: string; userId: string } }
) {
  const { documentId, userId: targetUserId } = params;
  const supabase = createSupabaseServerClient();

  try {
    const { userId: currentUserId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Check if current user has permission to remove users (must be owner)
    const userPermission = await checkDocumentAccess(supabase, documentId, currentUserId);
    if (!userPermission || userPermission.permission_level !== 'owner') {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'Only document owners can remove users.' } 
      }, { status: 403 });
    }

    // Prevent user from removing themselves
    if (currentUserId === targetUserId) {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'You cannot remove yourself from the document.' } 
      }, { status: 403 });
    }

    // Get target user's current permission for notification
    const targetPermission = await checkDocumentAccess(supabase, documentId, targetUserId);
    if (!targetPermission) {
      return NextResponse.json({ 
        error: { code: 'NOT_FOUND', message: 'User does not have access to this document.' } 
      }, { status: 404 });
    }

    // Remove permission
    const { error: deleteError, count } = await supabase
      .from('document_permissions')
      .delete({ count: 'exact' })
      .eq('document_id', documentId)
      .eq('user_id', targetUserId);

    if (deleteError) {
      console.error('Permission delete error:', deleteError.message);
      return NextResponse.json({ 
        error: { code: 'DATABASE_ERROR', message: `Failed to remove user: ${deleteError.message}` } 
      }, { status: 500 });
    }

    if (count === 0) {
      return NextResponse.json({ 
        error: { code: 'NOT_FOUND', message: 'Permission not found.' } 
      }, { status: 404 });
    }

    // Create notification for the removed user
    await supabase
      .from('notifications')
      .insert({
        user_id: targetUserId,
        type: 'access_revoked',
        title: 'Document access removed',
        message: 'Your access to a document has been revoked',
        document_id: documentId,
        created_by: currentUserId,
        data: {
          previous_permission_level: targetPermission.permission_level
        }
      });

    return new NextResponse(null, { status: 204 }); // No Content

  } catch (error: any) {
    console.error('Permission DELETE Error:', error.message);
    return NextResponse.json({ 
      error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } 
    }, { status: 500 });
  }
} 