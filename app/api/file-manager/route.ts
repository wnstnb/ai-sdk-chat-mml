import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server'; // Use the service role client for server-side logic
import { Folder, Document } from '@/types/supabase'; // Import types

export async function GET(request: Request) {
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient(); // Service role client

  try {
    // 1. Get User Session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session Error:', sessionError.message);
      return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Failed to get session.' } }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'User is not authenticated.' } }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Fetch Folders for the User
    // RLS policy ensures only user's folders are returned
    const { data: folders, error: foldersError } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (foldersError) {
        console.error('Folders Fetch Error:', foldersError.message);
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch folders: ${foldersError.message}` } }, { status: 500 });
    }

    // 3. Fetch Documents for the User
    // RLS policy ensures only user's documents are returned
    const { data: documents, error: documentsError } = await supabase
      .from('documents')
      .select('*') // Select all columns for now
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }); // Order by most recently updated

    if (documentsError) {
        console.error('Documents Fetch Error:', documentsError.message);
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch documents: ${documentsError.message}` } }, { status: 500 });
    }

    // 4. Return Data
    return NextResponse.json({ data: { documents: (documents as Document[] || []), folders: (folders as Folder[] || []) } }, { status: 200 });

  } catch (error: any) {
    console.error('File Manager GET Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 