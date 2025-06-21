import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Simple test handler to verify route is working
export async function GET() {
  console.log('[Content API] GET request received - route is working!');
  return NextResponse.json({ message: 'Content API route is working' }, { status: 200 });
}

/**
 * Create a Supabase client for JWT token authentication (for user validation)
 */
function createSupabaseClientForAuth(request: Request) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (accessToken) {
    // Create client with anon key and set the access token for this request
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  // Fallback: create client with anon key for cookie-based auth
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/**
 * Create a Supabase client with service role key (bypasses RLS)
 */
function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

// Re-use or adapt the helper function from folders route
async function getUserOrError(supabase: any) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error('[Content API] Auth error:', authError.message);
    return { errorResponse: NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Failed to get user.' } }, { status: 500 }) };
  }
  if (!user) {
    return { errorResponse: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'User not authenticated.' } }, { status: 401 }) };
  }
  return { userId: user.id };
}

// Helper function to check if user has document access and permission level
async function checkDocumentAccess(supabase: ReturnType<typeof createSupabaseServerClient>, documentId: string, userId: string) {
  // Use the database function that safely checks access without circular dependencies
  const { data: accessResult, error } = await supabase.rpc('check_shared_document_access', {
    doc_id: documentId,
    user_uuid: userId
  });

  if (error) {
    throw new Error(`Database error checking document access: ${error.message}`);
  }

  // The function returns an array with one row: { has_access: boolean, permission_level: string }
  if (accessResult && accessResult.length > 0 && accessResult[0].has_access) {
    return { permission_level: accessResult[0].permission_level };
  }

  return null; // No access
}

// PUT handler for updating document content
export async function PUT(
  request: Request,
  { params }: { params: { documentId: string } }
) {

  try {
    const documentId = params.documentId;
    
    // Create auth client for user validation
    const authSupabase = createSupabaseClientForAuth(request);
    const { userId, errorResponse } = await getUserOrError(authSupabase);
    if (errorResponse) return errorResponse;

    // Create service client for database operations (bypasses RLS)
    const supabase = createSupabaseServiceClient();

    // Parse Request Body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 });
    }
    const { content, searchable_content } = body;

    // Validate input - content can be null, text, or jsonb, allow it for now.
    // searchable_content should be text or null.
    if (content === undefined) {
       return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`content` field is required for update.' } }, { status: 400 });
    }
    // Add validation for searchable_content type if desired (optional)
    if (searchable_content !== undefined && typeof searchable_content !== 'string' && searchable_content !== null) {
         return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '`searchable_content` must be a string or null.' } }, { status: 400 });
    }

    // 1. Insert into document_autosaves
    const { error: autosaveError } = await supabase
      .from('document_autosaves')
      .insert({
        document_id: documentId,
        content: content, // Assuming content is JSONB as per PRD
        user_id: userId,
        // autosave_timestamp will default to now() in the database
      });

    if (autosaveError) {
      console.error('[Content API] Autosave failed:', autosaveError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to create autosave: ${autosaveError.message}` } }, { status: 500 });
    }

    // 2. Proceed to update the main documents table
    const updateData: { content: any; searchable_content?: string | null; updated_at: string } = {
        content: content,
        updated_at: new Date().toISOString() // Always update timestamp
    };

    // Only include searchable_content in the update if it was provided in the request
    if (searchable_content !== undefined) {
        updateData.searchable_content = searchable_content;
    }

    // Check if user has permission to edit this document
    const userPermission = await checkDocumentAccess(authSupabase, documentId, userId);

    if (!userPermission || !['owner', 'editor'].includes(userPermission.permission_level)) {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'You do not have permission to edit this document.' } 
      }, { status: 403 });
    }

    // Update document content - user has verified edit access
    const { data: updatedDocInfo, error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .select('updated_at');

    if (updateError) {
      console.error('[Content API] Document update failed:', updateError.message);
      if (updateError.code === 'PGRST116') { // Not found
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found or you do not have permission to update it.' } }, { status: 404 });
      }
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to update document content: ${updateError.message}` } }, { status: 500 });
    }

     if (!updatedDocInfo || updatedDocInfo.length === 0) {
         return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found after content update attempt.' } }, { status: 404 });
     }

    // Return only the updated_at timestamp as specified in the plan
    console.log('[Content API] Document auto-save successful:', { documentId, userId });
    return NextResponse.json({ data: { updated_at: updatedDocInfo[0].updated_at } }, { status: 200 });

  } catch (error: any) {
    console.error('[Content API] PUT Error:', error.message, error.stack);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 