import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/collaboration/sessions
 * Retrieves active collaborative sessions for a document
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user has access to the document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // Get active collaborative sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('collaborative_sessions')
      .select(`
        id,
        user_id,
        session_data,
        is_active,
        last_seen,
        created_at
      `)
      .eq('document_id', documentId)
      .eq('is_active', true)
      .order('last_seen', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching collaborative sessions:', sessionsError);
      return NextResponse.json(
        { error: 'Failed to fetch collaborative sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      documentId,
      sessions: sessions || [],
      count: sessions?.length || 0,
    });

  } catch (error) {
    console.error('Error in GET /api/collaboration/sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/collaboration/sessions
 * Create or update a collaborative session for current user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, sessionData = {} } = body;

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user has access to the document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // Use the database function to update session activity
    const { error: sessionError } = await supabase
      .rpc('update_session_activity', {
        session_document_id: documentId,
        session_user_id: user.id,
      });

    if (sessionError) {
      console.error('Error updating session activity:', sessionError);
      return NextResponse.json(
        { error: 'Failed to update session activity' },
        { status: 500 }
      );
    }

    // If sessionData is provided, update it separately
    if (Object.keys(sessionData).length > 0) {
      const { error: updateError } = await supabase
        .from('collaborative_sessions')
        .update({ 
          session_data: sessionData,
          updated_at: new Date().toISOString(),
        })
        .eq('document_id', documentId)
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (updateError) {
        console.error('Error updating session data:', updateError);
        return NextResponse.json(
          { error: 'Failed to update session data' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Session activity updated',
    });

  } catch (error) {
    console.error('Error in POST /api/collaboration/sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/collaboration/sessions
 * End the current user's collaborative session
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // End the user's active session
    const { error: deleteError } = await supabase
      .from('collaborative_sessions')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (deleteError) {
      console.error('Error ending collaborative session:', deleteError);
      return NextResponse.json(
        { error: 'Failed to end collaborative session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Collaborative session ended',
    });

  } catch (error) {
    console.error('Error in DELETE /api/collaboration/sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 