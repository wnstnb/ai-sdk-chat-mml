import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
// import { Database } from '@/types/supabase'; // Assuming this is your Supabase types path. Removing this as Database is not exported.

export async function PATCH(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const supabase = createSupabaseServerClient(); // Use server client (service role but still respects user session)

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
    // 1. Fetch the current document to get its is_starred status
    const { data: currentDocument, error: fetchError } = await supabase
      .from('documents')
      .select('is_starred')
      .eq('id', documentId)
      .eq('user_id', session.user.id)
      .single();

    if (fetchError || !currentDocument) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 });
    }

    // 2. Toggle the is_starred status
    const newIsStarredStatus = !currentDocument.is_starred;

    // 3. Update the document
    const { data: updatedDocument, error: updateError } = await supabase
      .from('documents')
      .update({ is_starred: newIsStarredStatus })
      .eq('id', documentId)
      .eq('user_id', session.user.id)
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