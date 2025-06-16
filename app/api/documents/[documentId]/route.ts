import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Document } from '@/types/supabase'; // Import Document type

// Re-use or adapt the helper function from folders route
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

// GET handler for fetching specific document details (including content)
export async function GET(
  request: Request,
  { params }: { params: { documentId: string } }
) {
    const documentId = params.documentId;
    const cookieStore = cookies();
    const supabase = createSupabaseServerClient();

    try {
        const { userId, errorResponse } = await getUserOrError(supabase);
        if (errorResponse) return errorResponse;

        // Check if user has access to this document (owner or shared)
        const userPermission = await checkDocumentAccess(supabase, documentId, userId);
        if (!userPermission) {
            return NextResponse.json({ 
                error: { code: 'FORBIDDEN', message: 'Document not found or you do not have permission to view it.' } 
            }, { status: 403 });
        }

        // Fetch document details - user has verified access
        const { data: document, error: fetchError } = await supabase
            .from('documents')
            .select('*') // Select all columns, including content
            .eq('id', documentId)
            .single(); // Expecting only one document

        if (fetchError) {
            console.error('Document GET Error:', fetchError.message);
            if (fetchError.code === 'PGRST116') { // Not found
                return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } }, { status: 404 });
            }
            return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch document: ${fetchError.message}` } }, { status: 500 });
        }

        if (!document) {
             return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } }, { status: 404 });
        }

        return NextResponse.json({ data: document as Document }, { status: 200 });

    } catch (error: any) {
        console.error('Document GET Error:', error.message);
        return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
    }
}

// PUT handler for updating document metadata (name, folderId)
export async function PUT(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Parse Request Body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 });
    }
    const { name, folderId } = body;

    // Validate input: at least one field must be provided
    if (name === undefined && folderId === undefined) {
       return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'At least one field (name or folderId) must be provided for update.' } }, { status: 400 });
    }

    const updateData: Partial<Omit<Document, 'content'>> = { updated_at: new Date().toISOString() }; // Exclude content, always update timestamp
    if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Document name must be a non-empty string.' } }, { status: 400 });
        }
        updateData.name = name.trim();
    }
    if (folderId !== undefined) {
        // Allow null to move to root
        if (typeof folderId !== 'string' && folderId !== null) {
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'folderId must be a string or null.' } }, { status: 400 });
        }
         // Optional: Add check to ensure the target folderId exists and belongs to the user? Requires another query.
        updateData.folder_id = folderId;
    }

    // Check if user has permission to edit this document
    const userPermission = await checkDocumentAccess(supabase, documentId, userId);
    if (!userPermission || !['owner', 'editor'].includes(userPermission.permission_level)) {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this document.' } 
      }, { status: 403 });
    }

    // Update document - user has verified edit access
    const { data: updatedDocument, error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .select('id, user_id, folder_id, name, created_at, updated_at') // Exclude content
      .single();

    if (updateError) {
      console.error('Document Update Error:', updateError.message);
       if (updateError.code === 'PGRST116') { // Not found
         return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found or you do not have permission to update it.' } }, { status: 404 });
       }
      // Handle foreign key constraint violation if folderId is invalid? (Needs specific error code check)
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to update document: ${updateError.message}` } }, { status: 500 });
    }

     if (!updatedDocument) {
         return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found after update attempt.' } }, { status: 404 });
     }

    return NextResponse.json({ data: updatedDocument as Omit<Document, 'content'> }, { status: 200 });

  } catch (error: any) {
    console.error('Document PUT Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
}

// DELETE handler for deleting a document
export async function DELETE(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Check if user has permission to delete this document (only owners)
    const userPermission = await checkDocumentAccess(supabase, documentId, userId);
    if (!userPermission || userPermission.permission_level !== 'owner') {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'Only document owners can delete documents.' } 
      }, { status: 403 });
    }

    // Delete document - user has verified owner access
    // ON DELETE CASCADE handles associated messages/tool_calls
    const { error: deleteError, count } = await supabase
      .from('documents')
      .delete({ count: 'exact' })
      .eq('id', documentId);

    if (deleteError) {
      console.error('Document Delete Error:', deleteError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to delete document: ${deleteError.message}` } }, { status: 500 });
    }

    if (count === 0) {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found or you do not have permission to delete it.' } }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 }); // No Content

  } catch (error: any) {
    console.error('Document DELETE Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 