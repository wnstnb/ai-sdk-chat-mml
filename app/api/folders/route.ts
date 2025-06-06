import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Folder } from '@/types/supabase';
import { getFileBrowserRateLimiter, getIP } from '@/lib/rate-limit'; // Import rate limiting utilities

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

// GET handler for retrieving all user folders
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
    // console.warn('Could not determine IP for rate limiting. Proceeding without rate limit check for this request.');
  }

  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();
  const { searchParams } = new URL(request.url);
  const hierarchical = searchParams.get('hierarchical') === 'true';
  const parentId = searchParams.get('parentId');

  try {
    // 1. Get User Session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: { code: sessionError ? 'SERVER_ERROR' : 'UNAUTHENTICATED', message: sessionError?.message || 'User not authenticated.' } }, { status: sessionError ? 500 : 401 });
    }
    const userId = session.user.id;

    // 2. Build query based on parameters
    let query = supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId);

    // If parentId is specified, filter by parent
    if (parentId !== null) {
      if (parentId === 'root') {
        query = query.is('parent_folder_id', null);
      } else {
        query = query.eq('parent_folder_id', parentId);
      }
    }

    query = query.order('name', { ascending: true });

    const { data: folders, error: foldersError } = await query;

    if (foldersError) {
      console.error('Folders Fetch Error:', foldersError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch folders: ${foldersError.message}` } }, { status: 500 });
    }

    // 3. If hierarchical structure is requested, build tree
    if (hierarchical && parentId === null) {
      const folderTree = buildFolderTree(folders as Folder[]);
      return NextResponse.json({ data: { folders: folderTree, hierarchical: true } }, { status: 200 });
    }

    // 4. Return flat list of folders
    return NextResponse.json({ data: { folders: (folders as Folder[]) || [] } }, { status: 200 });

  } catch (error: any) {
    console.error('Folders GET Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
}

// Helper function to build hierarchical folder tree
function buildFolderTree(folders: Folder[]): (Folder & { children: Folder[] })[] {
  const folderMap = new Map<string, Folder & { children: Folder[] }>();
  const rootFolders: (Folder & { children: Folder[] })[] = [];

  // First pass: create map of all folders with children array
  folders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });

  // Second pass: build tree structure
  folders.forEach(folder => {
    const folderWithChildren = folderMap.get(folder.id)!;
    
    if (folder.parent_folder_id === null) {
      // Root level folder
      rootFolders.push(folderWithChildren);
    } else {
      // Child folder - add to parent's children
      const parent = folderMap.get(folder.parent_folder_id);
      if (parent) {
        parent.children.push(folderWithChildren);
      } else {
        // Parent not found (orphaned folder) - treat as root
        rootFolders.push(folderWithChildren);
      }
    }
  });

  return rootFolders;
} 