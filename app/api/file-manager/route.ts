import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server'; // Use the service role client for server-side logic
import { Folder, Document } from '@/types/supabase'; // Import types

export async function GET(request: Request) {
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient(); // Service role client

  const { searchParams } = new URL(request.url);
  const getStarred = searchParams.get('starred') === 'true';
  const getRecent = searchParams.get('recent') === 'true';
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : (getRecent ? 10 : undefined); // Default limit 10 for recent

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
    let documentsQuery = supabase
      .from('documents')
      .select('*') // Select all columns, including is_starred
      .eq('user_id', userId);

    if (getStarred) {
      documentsQuery = documentsQuery.eq('is_starred', true);
    }

    // Always order by updated_at for general file manager use and for recents
    documentsQuery = documentsQuery.order('updated_at', { ascending: false });

    if (getRecent && limit) {
      documentsQuery = documentsQuery.limit(limit);
    } else if (getStarred && limit) { // Also allow limiting starred results if ?limit is passed with ?starred=true
      documentsQuery = documentsQuery.limit(limit);
    }

    const { data: documents, error: documentsError } = await documentsQuery;

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