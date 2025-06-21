import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/collaboration/presence
 * Retrieves current user presence for a document
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

    // Get all user presence for the document (active within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: presenceData, error: presenceError } = await supabase
      .from('collaborative_presence')
      .select('user_id, presence_data, last_updated')
      .eq('document_id', documentId)
      .gte('last_updated', fiveMinutesAgo)
      .order('last_updated', { ascending: false });

    if (presenceError) {
      console.error('Error fetching presence data:', presenceError);
      return NextResponse.json(
        { error: 'Failed to fetch presence data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      documentId,
      presence: presenceData || [],
      count: presenceData?.length || 0,
    });

  } catch (error) {
    console.error('Error in GET /api/collaboration/presence:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/collaboration/presence
 * Update current user's presence data for a document
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, presenceData } = body;

    if (!documentId || !presenceData) {
      return NextResponse.json(
        { error: 'Document ID and presence data are required' },
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

    // Use the database function to upsert presence data
    const { error: presenceError } = await supabase
      .rpc('upsert_user_presence', {
        presence_document_id: documentId,
        presence_user_id: user.id,
        presence_data: presenceData,
      });

    if (presenceError) {
      console.error('Error updating presence data:', presenceError);
      return NextResponse.json(
        { error: 'Failed to update presence data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Presence data updated',
    });

  } catch (error) {
    console.error('Error in POST /api/collaboration/presence:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/collaboration/presence
 * Remove current user's presence from a document
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

    // Delete the user's presence data for this document
    const { error: deleteError } = await supabase
      .from('collaborative_presence')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting presence data:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete presence data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Presence data removed',
    });

  } catch (error) {
    console.error('Error in DELETE /api/collaboration/presence:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 