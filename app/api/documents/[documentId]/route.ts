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

        // Fetch document details - RLS ensures user owns the document
        const { data: document, error: fetchError } = await supabase
            .from('documents')
            .select('*') // Select all columns, including content
            .eq('id', documentId)
            .eq('user_id', userId) // Explicit user_id check
            .single(); // Expecting only one document

        if (fetchError) {
            console.error('Document GET Error:', fetchError.message);
            if (fetchError.code === 'PGRST116') { // Not found
                return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found or you do not have permission to view it.' } }, { status: 404 });
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

    // Update document - RLS ensures user owns the document
    const { data: updatedDocument, error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .eq('user_id', userId) // Explicit user_id check
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

    // Delete document - RLS ensures user owns the document
    // ON DELETE CASCADE handles associated messages/tool_calls
    const { error: deleteError, count } = await supabase
      .from('documents')
      .delete({ count: 'exact' })
      .eq('id', documentId)
      .eq('user_id', userId);

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