import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Re-use helper function
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

// PUT handler for updating document content
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
    const { content, searchable_content } = body;

    // Validate input - content can be null, text, or jsonb, allow it for now.
    // searchable_content should be text or null.
    if (content === undefined) {
       return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`content` field is required for update.' } }, { status: 400 });
    }
    // Add validation for searchable_content type if desired (optional)
    if (searchable_content !== undefined && typeof searchable_content !== 'string' && searchable_content !== null) {
         return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`searchable_content` must be a string or null.' } }, { status: 400 });
    }

    // 1. Insert into document_autosaves
    const { error: autosaveError } = await supabase
      .from('document_autosaves')
      .insert({
        document_id: documentId,
        content: content, // Assuming content is JSONB as per PRD
        user_id: userId,
        // autosave_timestamp will default to now() in the database
      });

    if (autosaveError) {
      console.error('Autosave Insert Error:', autosaveError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to create autosave: ${autosaveError.message}` } }, { status: 500 });
    }

    // 2. Proceed to update the main documents table
    const updateData: { content: any; searchable_content?: string | null; updated_at: string } = {
        content: content,
        updated_at: new Date().toISOString() // Always update timestamp
    };

    // Only include searchable_content in the update if it was provided in the request
    if (searchable_content !== undefined) {
        updateData.searchable_content = searchable_content;
    }

    // Update document content - RLS ensures user owns the document
    const { data: updatedDocInfo, error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .eq('user_id', userId) // Explicit user_id check
      .select('updated_at') // Only return the new timestamp as per plan
      .single();

    if (updateError) {
      console.error('Document Content Update Error:', updateError.message);
       if (updateError.code === 'PGRST116') { // Not found
         return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found or you do not have permission to update it.' } }, { status: 404 });
       }
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to update document content: ${updateError.message}` } }, { status: 500 });
    }

     if (!updatedDocInfo) {
         return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found after content update attempt.' } }, { status: 404 });
     }

    // Return only the updated_at timestamp as specified in the plan
    return NextResponse.json({ data: { updated_at: updatedDocInfo.updated_at } }, { status: 200 });

  } catch (error: any) {
    console.error('Document Content PUT Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 