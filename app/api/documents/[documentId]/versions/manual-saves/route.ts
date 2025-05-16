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

    const { data: manualSaves, error: fetchError } = await supabase
      .from('document_manual_saves')
      .select('manual_save_id, content, manual_save_timestamp')
      .eq('document_id', documentId)
      .eq('user_id', userId) // RLS will also enforce this
      .order('manual_save_timestamp', { ascending: false });

    if (fetchError) {
      console.error('Fetch Manual Saves Error:', fetchError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch manual saves: ${fetchError.message}` } }, { status: 500 });
    }

    return NextResponse.json({ data: manualSaves || [] }, { status: 200 });

  } catch (error: any) {
    console.error('List Manual Saves GET Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
} 