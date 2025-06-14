import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import * as Y from 'yjs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/collaboration/yjs-updates
 * Retrieves all Yjs updates for a document to restore document state
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

    // Retrieve all Yjs updates for the document
    const { data: updates, error: updatesError } = await supabase
      .from('yjs_updates')
      .select('update_data, created_at, user_id')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });

    if (updatesError) {
      console.error('Error fetching Yjs updates:', updatesError);
      return NextResponse.json(
        { error: 'Failed to fetch document updates' },
        { status: 500 }
      );
    }

    // Convert binary data back to Uint8Array for client processing
    const formattedUpdates = updates?.map(update => ({
      data: Array.from(update.update_data), // Convert BYTEA to array
      createdAt: update.created_at,
      userId: update.user_id,
    })) || [];

    return NextResponse.json({
      documentId,
      updates: formattedUpdates,
      count: formattedUpdates.length,
    });

  } catch (error) {
    console.error('Error in GET /api/collaboration/yjs-updates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/collaboration/yjs-updates
 * Stores a new Yjs update for a document
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentId, updateData } = body;

    if (!documentId || !updateData) {
      return NextResponse.json(
        { error: 'Document ID and update data are required' },
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

    // Convert update data array back to Uint8Array then to Buffer for storage
    const updateBuffer = Buffer.from(new Uint8Array(updateData));

    // Store the Yjs update
    const { data: insertedUpdate, error: insertError } = await supabase
      .from('yjs_updates')
      .insert({
        document_id: documentId,
        update_data: updateBuffer,
        user_id: user.id,
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      console.error('Error storing Yjs update:', insertError);
      return NextResponse.json(
        { error: 'Failed to store document update' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updateId: insertedUpdate.id,
      createdAt: insertedUpdate.created_at,
    });

  } catch (error) {
    console.error('Error in POST /api/collaboration/yjs-updates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/collaboration/yjs-updates
 * Cleanup old Yjs updates (optional optimization)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const olderThan = searchParams.get('olderThan'); // ISO date string

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

    let query = supabase
      .from('yjs_updates')
      .delete()
      .eq('document_id', documentId);

    // If olderThan is provided, only delete updates older than that date
    if (olderThan) {
      query = query.lt('created_at', olderThan);
    }

    const { error: deleteError, count } = await query;

    if (deleteError) {
      console.error('Error deleting Yjs updates:', deleteError);
      return NextResponse.json(
        { error: 'Failed to cleanup document updates' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: count || 0,
    });

  } catch (error) {
    console.error('Error in DELETE /api/collaboration/yjs-updates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 