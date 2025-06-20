import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server'; // Use the service role client for server-side logic
import { Folder, Document } from '@/types/supabase'; // Import types
import { getFileBrowserRateLimiter, getIP } from '@/lib/rate-limit'; // Import rate limiting utilities

export async function GET(request: Request) {
  const ip = getIP(request);
  if (ip) {
    const limiter = getFileBrowserRateLimiter();
    if (limiter) { // Check if limiter is available (Redis configured)
      const { success, limit, remaining, reset } = await limiter.limit(ip);
      if (!success) {
        return NextResponse.json(
          { error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please try again later.' } }, 
          { 
            status: 429, 
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': new Date(reset).toISOString(),
            }
          }
        );
      }
    }
  } else {
    // console.warn('Could not determine IP for rate limiting in /api/file-manager. Proceeding without rate limit check for this request.');
  }

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

    // 3.5. Get sharing information for owned documents
    let documentsWithSharingInfo = documents as Document[] || [];
    if (documents && documents.length > 0) {
      try {
        // Get sharing info using the same function as shared documents API
        const { data: sharedDocIds, error: sharedIdsError } = await supabase
          .rpc('get_shared_document_ids');

        if (!sharedIdsError && sharedDocIds) {
          // Create a map of document IDs to permission counts
          const sharingMap = new Map<string, number>();
          sharedDocIds.forEach((row: any) => {
            sharingMap.set(row.document_id, row.permission_count);
          });

          // Add sharing info to documents
          documentsWithSharingInfo = documents.map(doc => ({
            ...doc,
            sharing_info: sharingMap.has(doc.id) ? { permission_count: sharingMap.get(doc.id)! } : null
          }));
        }
      } catch (error) {
        console.warn('Failed to fetch sharing info, proceeding without it:', error);
        // Continue without sharing info rather than failing completely
      }
    }

    // 4. Return Data
    return NextResponse.json({ data: { documents: documentsWithSharingInfo, folders: (folders as Folder[] || []) } }, { status: 200 });

  } catch (error: any) {
    console.error('File Manager GET Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 