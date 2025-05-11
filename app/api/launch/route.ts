import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Document, Message } from '@/types/supabase'; // Import types

export async function POST(request: Request) {
  const cookieStore = cookies();
  // Use the admin client here IF RLS prevents inserting a document and its first message
  // within the same transaction/scope for the user.
  // However, let's try with the standard server client first, assuming RLS allows inserting
  // a document and then a message linked to it if user_id matches auth.uid().
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
    const { initialContent, taggedDocumentIds } = body;

    if (!initialContent || typeof initialContent !== 'string' || initialContent.trim().length === 0) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'initialContent is required and must be a non-empty string.' } }, { status: 400 });
    }

    // TODO: Determine document name from initial content?
    // For now, use default 'Untitled Document' as per schema
    const documentName = 'Untitled Document'; // Or derive from initialContent.substring(0, 50) etc.

    // 3. Create New Document
    const { data: newDocument, error: docInsertError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        name: documentName,
        content: null, // Start with empty content
        folder_id: null, // Place in root initially
      })
      .select('id') // Only need the ID
      .single();

    if (docInsertError) {
        console.error('Launch - Document Insert Error:', docInsertError.message);
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to create document: ${docInsertError.message}` } }, { status: 500 });
    }

    if (!newDocument?.id) {
        console.error('Launch - Document Insert Error: No ID returned');
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create document (no ID returned).' } }, { status: 500 });
    }
    const newDocumentId = newDocument.id;

    // 4. Create Initial Message linked to the new document
    console.log(`Creating initial message for document ${newDocumentId}`);
    const initialMessageParts = [{ type: 'text', text: initialContent.trim() }];
    const { data: newMessage, error: msgInsertError } = await supabase
      .from('messages')
      .insert({
        document_id: newDocumentId,
        user_id: userId, // Associate message with user
        role: 'user',
        content: initialMessageParts,
        metadata: { input_method: 'text' },
      })
      .select('id') // Optionally return message ID if needed
      .single();

      if (msgInsertError) {
          console.error('Launch - Message Insert Error:', msgInsertError.message);
          // Attempt to clean up the created document if the message fails? Difficult without transactions.
          // Log the issue for now. The user might end up with an empty document.
          // Alternatively, could try deleting the document here, but that might also fail.
          return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to create initial message: ${msgInsertError.message}. Document created but message failed.` } }, { status: 500 });
      }
      console.log(`Initial message created with ID: ${newMessage?.id}`);

    // 5. Return New Document ID (and tagged IDs if present)
    const responsePayload: { documentId: string; taggedDocumentIds?: string[] } = {
        documentId: newDocumentId,
    };
    if (Array.isArray(taggedDocumentIds) && taggedDocumentIds.length > 0) {
        responsePayload.taggedDocumentIds = taggedDocumentIds.filter(id => typeof id === 'string');
    }
    return NextResponse.json({ data: responsePayload }, { status: 201 });

  } catch (error: any) {
    console.error('Launch POST Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 