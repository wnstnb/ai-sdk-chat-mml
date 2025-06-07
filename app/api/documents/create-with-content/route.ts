import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid'; // For generating a unique ID if needed for content

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    // 1. Get User Session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: { code: sessionError ? 'SERVER_ERROR' : 'UNAUTHENTICATED', message: sessionError?.message || 'User not authenticated.' } }, { status: sessionError ? 500 : 401 });
    }
    const userId = session.user.id;

    // 2. Parse Request Body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 });
    }
    const { title, content, folder_id: folderId } = body; // content here is BlockNote-compatible JSON

    if (!content) { // Content is essential
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Content is required.' } }, { status: 400 });
    }

    const documentName = title || `Voice Note - ${new Date().toLocaleDateString()}`;

    // 3. Create New Document with content
    // Assuming 'content' field in 'documents' table can store BlockNote-compatible JSON directly
    const { data: newDocument, error: docInsertError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        name: documentName,
        content: content, // Directly use the provided content
        folder_id: folderId || null, // Optional folder_id
        // Other fields like 'format_version' might be needed depending on schema
      })
      .select('id')
      .single();

    if (docInsertError) {
        console.error('Create With Content - Document Insert Error:', docInsertError.message);
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to create document: ${docInsertError.message}` } }, { status: 500 });
    }

    if (!newDocument?.id) {
        console.error('Create With Content - Document Insert Error: No ID returned');
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create document (no ID returned).' } }, { status: 500 });
    }
    const newDocumentId = newDocument.id;

    // 4. Return New Document ID
    return NextResponse.json({ data: { documentId: newDocumentId } }, { status: 201 });

  } catch (error: any) {
    console.error('Create With Content POST Error:', error.message, error.stack);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 