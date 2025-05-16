import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Helper function to get user or return error response (can be refactored into a shared utility)
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

export async function POST(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 });
    }
    const { content, searchable_content } = body;

    if (content === undefined) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`content` field is required.' } }, { status: 400 });
    }
    // Optional: Validate searchable_content type
    if (searchable_content !== undefined && typeof searchable_content !== 'string' && searchable_content !== null) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`searchable_content` must be a string or null.' } }, { status: 400 });
    }

    // 1. Insert into document_manual_saves
    const { data: manualSaveData, error: manualSaveError } = await supabase
      .from('document_manual_saves')
      .insert({
        document_id: documentId,
        content: content, // Assuming content is JSONB
        user_id: userId,
        // manual_save_timestamp will default to now() in the database
      })
      .select('manual_save_id, manual_save_timestamp') // Select required fields for the response
      .single();

    if (manualSaveError) {
      console.error('Manual Save Insert Error:', manualSaveError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to create manual save: ${manualSaveError.message}` } }, { status: 500 });
    }
    if (!manualSaveData) {
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create manual save record or retrieve its data.' } }, { status: 500 });
    }

    // 2. Update the main documents table
    const updateDocumentData: { content: any; searchable_content?: string | null; updated_at: string } = {
      content: content,
      updated_at: new Date().toISOString(),
    };
    if (searchable_content !== undefined) {
      updateDocumentData.searchable_content = searchable_content;
    }

    const { data: updatedDocInfo, error: updateError } = await supabase
      .from('documents')
      .update(updateDocumentData)
      .eq('id', documentId)
      .eq('user_id', userId) // Ensure user owns the document
      .select('updated_at')
      .single();

    if (updateError) {
      console.error('Document Update Error after Manual Save:', updateError.message);
      // Note: Consider how to handle this failure. Should the manual save be rolled back? 
      // For now, we proceed as per PRD, but this is a potential area for enhancement.
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to update document after manual save: ${updateError.message}` } }, { status: 500 });
    }
    if (!updatedDocInfo) {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found for update after manual save.' } }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        manual_save_id: manualSaveData.manual_save_id,
        manual_save_timestamp: manualSaveData.manual_save_timestamp,
        updated_at: updatedDocInfo.updated_at,
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Manual Save POST Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 