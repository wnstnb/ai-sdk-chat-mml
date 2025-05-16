import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Helper function to get user or return error response
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

export async function GET(
  request: Request, // request is not used but required by Next.js
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    const query = `
      SELECT
          autosave_id AS version_id,
          content,
          autosave_timestamp AS timestamp,
          'autosave' AS save_type,
          user_id
      FROM document_autosaves
      WHERE document_id = $1 AND user_id = $2
      UNION ALL
      SELECT
          manual_save_id AS version_id,
          content,
          manual_save_timestamp AS timestamp,
          'manual_save' AS save_type,
          user_id
      FROM document_manual_saves
      WHERE document_id = $1 AND user_id = $2
      ORDER BY timestamp DESC;
    `;

    // Note: Supabase client's .rpc() or a direct query execution might be needed if .from().select() doesn't support UNION ALL directly for complex cases.
    // For this specific query, using .rpc to call a PostgreSQL function that executes this query would be robust.
    // Alternatively, if your Supabase setup allows raw queries (less common for client libraries for security), that's an option.
    // Let's assume a hypothetical .sql() method or .rpc() for this complex query.
    // If direct .sql() is not available, this query should be encapsulated in a Postgres function and called via .rpc().
    // For now, this illustrates the intent. The actual execution might need adjustment based on Supabase client capabilities.

    // Let's use a generic query function if available, or make two separate queries and merge/sort them in JS if UNION ALL is tricky with the client library.
    // Given the constraints and focusing on the SQL, we'll assume a way to run this.
    // A common approach is to create a SQL function in Supabase and call it via rpc.
    // For demonstration, let's try constructing it as if a generic query function exists.
    // If not, two queries + JS merge is the fallback.

    // Option 1: Create a SQL function in your DB `get_unified_versions(doc_id UUID, usr_id UUID)` with the query above.
    // Then call: const { data, error } = await supabase.rpc('get_unified_versions', { doc_id: documentId, usr_id: userId });

    // Option 2: Perform two queries and merge in application code (more verbose, less efficient DB-wise but works if direct UNION is hard)
    const { data: autosaves, error: autosavesError } = await supabase
        .from('document_autosaves')
        .select('autosave_id, content, autosave_timestamp, user_id')
        .eq('document_id', documentId)
        .eq('user_id', userId);

    if (autosavesError) {
        console.error('Fetch Unified Autosaves Error:', autosavesError.message);
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch autosaves for unified view: ${autosavesError.message}` } }, { status: 500 });
    }

    const { data: manualSaves, error: manualSavesError } = await supabase
        .from('document_manual_saves')
        .select('manual_save_id, content, manual_save_timestamp, user_id')
        .eq('document_id', documentId)
        .eq('user_id', userId);

    if (manualSavesError) {
        console.error('Fetch Unified Manual Saves Error:', manualSavesError.message);
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch manual saves for unified view: ${manualSavesError.message}` } }, { status: 500 });
    }

    const unifiedVersions = [
      ...(autosaves || []).map(a => ({ version_id: a.autosave_id, content: a.content, timestamp: a.autosave_timestamp, save_type: 'autosave', user_id: a.user_id })),
      ...(manualSaves || []).map(m => ({ version_id: m.manual_save_id, content: m.content, timestamp: m.manual_save_timestamp, save_type: 'manual_save', user_id: m.user_id }))
    ];

    unifiedVersions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    // The user_id is selected for completeness with the SQL but might not be needed in the final returned array if RLS guarantees ownership.
    // The PRD example SQL does not explicitly return user_id in the final select list for the API response (though it uses it in WHERE).
    // We will return it for now, can be stripped if not needed by client.

    return NextResponse.json({ data: unifiedVersions }, { status: 200 });

  } catch (error: any) {
    console.error('List Unified Versions GET Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 