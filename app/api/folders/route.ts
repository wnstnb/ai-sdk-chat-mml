import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Folder } from '@/types/supabase';

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

    const { name, parentFolderId } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Folder name is required and must be a non-empty string.' } }, { status: 400 });
    }
     if (parentFolderId !== undefined && typeof parentFolderId !== 'string' && parentFolderId !== null) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'parentFolderId must be a string or null.' } }, { status: 400 });
    }

    // 3. Insert new folder
    // RLS policy ensures user_id is correctly set and validated
    const { data: newFolder, error: insertError } = await supabase
      .from('folders')
      .insert({
        user_id: userId,
        name: name.trim(),
        parent_folder_id: parentFolderId || null, // Handle undefined/null
      })
      .select()
      .single(); // Return the newly created folder

    if (insertError) {
      console.error('Folder Insert Error:', insertError.message);
      // TODO: Check for specific errors like duplicate name within parent?
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to create folder: ${insertError.message}` } }, { status: 500 });
    }

    // 4. Return new folder data
    return NextResponse.json({ data: newFolder as Folder }, { status: 201 });

  } catch (error: any) {
    console.error('Folder POST Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 