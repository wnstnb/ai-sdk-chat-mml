import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Folder, Document } from '@/types/supabase';
import { getFileBrowserRateLimiter, getIP } from '@/lib/rate-limit'; // Import rate limiting utilities

// Helper function to check session and return user ID or error response
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

// GET handler for fetching folder details and contents
export async function GET(
  request: Request,
  { params }: { params: { folderId: string } }
) {
  const ip = getIP(request);
  if (ip) {
    const limiter = getFileBrowserRateLimiter();
    if (limiter) { // Check if limiter is available (Redis configured)
      const { success, limit, remaining, reset } = await limiter.limit(ip);
      // console.log(`Rate limit for ${ip}: success=${success}, limit=${limit}, remaining=${remaining}, reset=${new Date(reset).toISOString()}`);
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
    // console.warn('Could not determine IP for rate limiting. Proceeding without rate limit check for this request.');
    // Decide if you want to block requests without IP or allow them (potentially risky)
  }

  const folderId = params.folderId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Fetch folder details
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('*')
      .eq('id', folderId)
      .eq('user_id', userId)
      .single();

    if (folderError) {
      console.error('Folder Fetch Error:', folderError.message);
      if (folderError.code === 'PGRST116') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Folder not found or you do not have permission to access it.' } }, { status: 404 });
      }
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch folder: ${folderError.message}` } }, { status: 500 });
    }

    // Fetch subfolders
    const { data: subfolders, error: subfoldersError } = await supabase
      .from('folders')
      .select('*')
      .eq('parent_folder_id', folderId)
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (subfoldersError) {
      console.error('Subfolders Fetch Error:', subfoldersError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch subfolders: ${subfoldersError.message}` } }, { status: 500 });
    }

    // Fetch documents in this folder
    const { data: documents, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .eq('folder_id', folderId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (documentsError) {
      console.error('Documents Fetch Error:', documentsError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch documents: ${documentsError.message}` } }, { status: 500 });
    }

    // Return folder with its contents
    return NextResponse.json({ 
      data: {
        folder: folder as Folder,
        subfolders: (subfolders as Folder[]) || [],
        documents: (documents as Document[]) || [],
        totalItems: ((subfolders as Folder[]) || []).length + ((documents as Document[]) || []).length
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error('Folder GET Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
}

// PUT handler for updating folder name or parent
export async function PUT(
  request: Request,
  { params }: { params: { folderId: string } }
) {
  const folderId = params.folderId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Parse Request Body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 });
    }
    const { name, parentFolderId } = body;

    // Validate input: at least one field must be provided
    if (name === undefined && parentFolderId === undefined) {
       return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'At least one field (name or parentFolderId) must be provided for update.' } }, { status: 400 });
    }

    const updateData: Partial<Folder> = { updated_at: new Date().toISOString() }; // Always update timestamp
    if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Folder name must be a non-empty string.' } }, { status: 400 });
        }
        updateData.name = name.trim();
    }
    if (parentFolderId !== undefined) {
        if (typeof parentFolderId !== 'string' && parentFolderId !== null) {
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'parentFolderId must be a string or null.' } }, { status: 400 });
        }
        // Prevent moving a folder into itself (basic check)
        if (parentFolderId === folderId) {
             return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot move a folder into itself.' } }, { status: 400 });
        }
        updateData.parent_folder_id = parentFolderId;
    }


    // Update folder - RLS ensures user owns the folder being updated
    const { data: updatedFolder, error: updateError } = await supabase
      .from('folders')
      .update(updateData)
      .eq('id', folderId)
      .eq('user_id', userId) // Explicit user_id check for safety, though RLS covers it
      .select()
      .single();

    if (updateError) {
      console.error('Folder Update Error:', updateError.message);
       if (updateError.code === 'PGRST116') { // PostgREST error for no rows found/affected
         return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Folder not found or you do not have permission to update it.' } }, { status: 404 });
       }
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to update folder: ${updateError.message}` } }, { status: 500 });
    }

     if (!updatedFolder) { // Should be caught by PGRST116, but belt-and-suspenders
         return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Folder not found after update attempt.' } }, { status: 404 });
     }

    return NextResponse.json({ data: updatedFolder as Folder }, { status: 200 });

  } catch (error: any) {
    console.error('Folder PUT Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
}

// DELETE handler for deleting a folder
export async function DELETE(
  request: Request,
  { params }: { params: { folderId: string } }
) {
  const folderId = params.folderId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Delete folder - RLS ensures user owns the folder
    // Note: ON DELETE SET NULL constraints handle child folders/documents
    const { error: deleteError, count } = await supabase
      .from('folders')
      .delete({ count: 'exact' }) // Request count to check if deletion happened
      .eq('id', folderId)
      .eq('user_id', userId); // Explicit user_id check

    if (deleteError) {
      console.error('Folder Delete Error:', deleteError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to delete folder: ${deleteError.message}` } }, { status: 500 });
    }

    if (count === 0) {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Folder not found or you do not have permission to delete it.' } }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 }); // No Content

  } catch (error: any) {
    console.error('Folder DELETE Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 