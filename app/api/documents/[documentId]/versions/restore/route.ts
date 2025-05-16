import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Helper function to get user or return error response
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
    const { version_id, save_type, restored_searchable_content } = body; // `restored_searchable_content` is optional

    if (!version_id || !save_type) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`version_id` and `save_type` are required.' } }, { status: 400 });
    }
    if (save_type !== 'autosave' && save_type !== 'manual_save') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`save_type` must be either \'autosave\' or \'manual_save\'.' } }, { status: 400 });
    }

    // 1. Fetch the current document content (to create a pre-restore autosave)
    const { data: currentDocument, error: currentDocError } = await supabase
      .from('documents')
      .select('content')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (currentDocError || !currentDocument) {
      console.error('Error fetching current document for pre-restore autosave:', currentDocError?.message);
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Original document not found or could not be fetched before restoration.' } }, { status: 404 });
    }

    // 2. Fetch the version to restore
    let versionContent: any = null;
    if (save_type === 'autosave') {
      const { data: autosaveVersion, error: fetchAutosaveError } = await supabase
        .from('document_autosaves')
        .select('content')
        .eq('autosave_id', version_id)
        .eq('document_id', documentId) // Ensure it belongs to the correct document
        .eq('user_id', userId)      // And user
        .single();
      if (fetchAutosaveError || !autosaveVersion) {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Autosave version not found or access denied.' } }, { status: 404 });
      }
      versionContent = autosaveVersion.content;
    } else { // save_type === 'manual_save'
      const { data: manualSaveVersion, error: fetchManualSaveError } = await supabase
        .from('document_manual_saves')
        .select('content')
        .eq('manual_save_id', version_id)
        .eq('document_id', documentId) // Ensure it belongs to the correct document
        .eq('user_id', userId)      // And user
        .single();
      if (fetchManualSaveError || !manualSaveVersion) {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Manual save version not found or access denied.' } }, { status: 404 });
      }
      versionContent = manualSaveVersion.content;
    }

    // 3. Create a new autosave of the content *before* restoration (as recommended by PRD)
    if (currentDocument.content) { // Only if there was previous content
        const { error: preRestoreAutosaveError } = await supabase
            .from('document_autosaves')
            .insert({
                document_id: documentId,
                content: currentDocument.content,
                user_id: userId,
            });
        if (preRestoreAutosaveError) {
            console.warn('Failed to create pre-restore autosave:', preRestoreAutosaveError.message);
            // Not returning an error here, as restoration is the primary goal.
        }
    }

    // 4. Update the main document with the restored content
    const updateData: { content: any; updated_at: string; searchable_content?: string | null } = {
      content: versionContent,
      updated_at: new Date().toISOString(),
    };

    if (restored_searchable_content !== undefined) {
      updateData.searchable_content = restored_searchable_content;
    } else {
      // If not provided, and if you wanted to clear it or set to null explicitly:
      // updateData.searchable_content = null; 
      // For now, it will just not be included in the update if not provided in request.
      // The PRD states "Generate searchable_content". If not passed, it might become stale.
      // This needs to be handled consistently with how searchable_content is managed elsewhere.
      // A more robust solution for server-side generation would require BlockNote or similar.
      // For now, we rely on the client or it is omitted.
    }

    const { data: updatedDocInfo, error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .eq('user_id', userId)
      .select('updated_at')
      .single();

    if (updateError || !updatedDocInfo) {
      console.error('Document Update Error during Restore:', updateError?.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to restore document: ${updateError?.message}` } }, { status: 500 });
    }

    return NextResponse.json({ data: { updated_at: updatedDocInfo.updated_at } }, { status: 200 });

  } catch (error: any) {
    console.error('Restore Version POST Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
}
