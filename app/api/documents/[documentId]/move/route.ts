import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Document } from '@/types/supabase';

// PUT handler for moving document to a different folder
export async function PUT(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    // 1. Get User Session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('Session Error:', sessionError.message);
      return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Failed to get session.' } }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'User not authenticated.' } }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Parse Request Body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 });
    }

    const { folderId } = body;

    // Validate input
    if (folderId !== undefined && folderId !== null && typeof folderId !== 'string') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'folderId must be a string or null.' } }, { status: 400 });
    }

    // 3. If folderId is provided, verify the folder exists and belongs to user
    if (folderId) {
      const { data: folder, error: folderError } = await supabase
        .from('folders')
        .select('id')
        .eq('id', folderId)
        .eq('user_id', userId)
        .single();

      if (folderError) {
        console.error('Folder Validation Error:', folderError.message);
        if (folderError.code === 'PGRST116') {
          return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Target folder not found or you do not have permission to access it.' } }, { status: 404 });
        }
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to validate folder: ${folderError.message}` } }, { status: 500 });
      }
    }

    // 4. Update document's folder_id
    const { data: updatedDocument, error: updateError } = await supabase
      .from('documents')
      .update({ 
        folder_id: folderId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .eq('user_id', userId) // Ensure user owns the document
      .select('id, user_id, folder_id, name, created_at, updated_at') // Exclude content for response
      .single();

    if (updateError) {
      console.error('Document Move Error:', updateError.message);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found or you do not have permission to move it.' } }, { status: 404 });
      }
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to move document: ${updateError.message}` } }, { status: 500 });
    }

    if (!updatedDocument) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found after move attempt.' } }, { status: 404 });
    }

    // 5. Return updated document info
    return NextResponse.json({ 
      data: updatedDocument as Partial<Document>,
      message: folderId ? 'Document moved to folder successfully.' : 'Document moved to root successfully.'
    }, { status: 200 });

  } catch (error: any) {
    console.error('Document Move Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 