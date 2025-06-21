import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
// import { Database } from '@/types/supabase'; // Assuming this is your Supabase types path. Removing this as Database is not exported.

// Helper function to check if user has document access and permission level
async function checkDocumentAccess(supabase: ReturnType<typeof createSupabaseServerClient>, documentId: string, userId: string) {
  try {
    // Use the new database function to check access without causing RLS recursion
    const { data, error } = await supabase
      .rpc('check_shared_document_access', {
        doc_id: documentId,
        user_uuid: userId
      });

    if (error) {
      throw new Error(`Database error checking document access: ${error.message}`);
    }

    if (!data || data.length === 0 || !data[0]?.has_access) {
      return null;
    }

    return { permission_level: data[0].permission_level };
  } catch (error: any) {
    throw new Error(`Database error checking document ownership: ${error.message}`);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const supabase = createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { documentId } = params;

  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    // Check if user has access to this document
    const userPermission = await checkDocumentAccess(supabase, documentId, session.user.id);
    if (!userPermission) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 });
    }

    // 1. Fetch the current document to get its is_starred status
    // Use service role to bypass RLS since we've already verified access
    const { data: currentDocument, error: fetchError } = await supabase
      .from('documents')
      .select('is_starred, user_id')
      .eq('id', documentId)
      .single();

    if (fetchError || !currentDocument) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 2. Toggle the is_starred status
    const newIsStarredStatus = !currentDocument.is_starred;

    // 3. Update the document (service role can update any document)
    const { data: updatedDocument, error: updateError } = await supabase
      .from('documents')
      .update({ is_starred: newIsStarredStatus })
      .eq('id', documentId)
      .select('id, is_starred')
      .single();

    if (updateError) {
      console.error('Error updating document star status:', updateError);
      return NextResponse.json({ error: 'Failed to update star status' }, { status: 500 });
    }

    return NextResponse.json({ success: true, is_starred: updatedDocument.is_starred }, { status: 200 });

  } catch (error) {
    console.error('Error in PATCH /api/documents/[documentId]/star:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 