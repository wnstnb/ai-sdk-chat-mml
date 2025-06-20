import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import * as Y from 'yjs';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Create a Supabase client that respects the Authorization header
 * This is critical for Y.js collaboration where the auth token is passed in headers
 */
function createSupabaseClientFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  console.log('[YJS Updates] createSupabaseClientFromRequest:', {
    hasAuthHeader: !!authHeader,
    authHeaderValue: authHeader ? `${authHeader.substring(0, 20)}...` : null,
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken?.length || 0
  });

  if (accessToken) {
    // Create client with anon key and set the access token for this request
    const supabase = createClient(
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
    console.log('[YJS Updates] Created client with access token from Authorization header');
    return supabase;
  }

  // Fallback: create client with anon key for cookie-based auth
  console.log('[YJS Updates] No access token found, creating anon client for cookie-based auth');
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
 * Helper function to check document access permissions
 * @param supabase - Supabase client
 * @param documentId - Document ID to check
 * @param userId - User ID to check
 * @param requiredLevel - Required permission level ('read' | 'write')
 * @returns Promise<{hasAccess: boolean, permissionLevel?: string, error?: NextResponse}>
 */
async function checkDocumentAccess(supabase: any, documentId: string, userId: string, requiredLevel: 'read' | 'write' = 'read') {
  console.log('[YJS Updates] checkDocumentAccess starting:', {
    documentId,
    userId,
    requiredLevel
  });

  // Check document permissions table first
  const { data: permission, error: permissionError } = await supabase
    .from('document_permissions')
    .select('permission_level')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .single();

  console.log('[YJS Updates] document_permissions query result:', {
    permission,
    permissionError: permissionError?.message,
    permissionErrorCode: permissionError?.code
  });

  // Additional debugging: let's also check if ANY permissions exist for this document
  const { data: allPermissions, error: allPermError } = await supabase
    .from('document_permissions')
    .select('user_id, permission_level')
    .eq('document_id', documentId);
    
  console.log('[YJS Updates] All permissions for this document:', {
    allPermissions,
    allPermError: allPermError?.message,
    totalPermissions: allPermissions?.length || 0
  });

  if (permissionError && permissionError.code !== 'PGRST116') {
    console.error('Error checking document permissions:', permissionError);
    return { 
      hasAccess: false, 
      error: NextResponse.json(
        { error: 'Failed to verify document access' },
        { status: 500 }
      )
    };
  }

  if (permission) {
    // User has explicit permissions - check if sufficient for required level
    const level = permission.permission_level;
    
    if (requiredLevel === 'read') {
      // Any permission level allows reading
      return { hasAccess: true, permissionLevel: level };
    } else if (requiredLevel === 'write') {
      // Only editor and owner can write
      const canWrite = level === 'editor' || level === 'owner';
      if (!canWrite) {
        return {
          hasAccess: false,
          error: NextResponse.json(
            { error: 'Insufficient permissions to edit document. Editor access required.' },
            { status: 403 }
          )
        };
      }
      return { hasAccess: true, permissionLevel: level };
    }
  }

  // Fallback: check if user owns the document
  console.log('[YJS Updates] Checking document ownership fallback');
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, user_id')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  console.log('[YJS Updates] Document ownership query result:', {
    document,
    docError: docError?.message,
    docErrorCode: docError?.code
  });

  const isOwner = !docError && !!document;
  if (!isOwner) {
    console.log('[YJS Updates] Access denied - not owner and no explicit permissions');
    return {
      hasAccess: false,
      error: NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      )
    };
  }

  console.log('[YJS Updates] Access granted via document ownership');
  return { hasAccess: true, permissionLevel: 'owner' };
}

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

    const supabase = createSupabaseClientFromRequest(request);

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    console.log('[YJS Updates] POST - Auth check result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message,
      timestamp: new Date().toISOString()
    });
    
    if (authError || !user) {
      console.error('[YJS Updates] POST - Authentication failed:', {
        authError: authError?.message,
        hasUser: !!user
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check document access permission (read access)
    const accessCheck = await checkDocumentAccess(supabase, documentId, user.id, 'read');
    if (!accessCheck.hasAccess) {
      return accessCheck.error!;
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
    const formattedUpdates = updates?.map(update => {
      // Handle the case where Supabase returns BYTEA as {type: "Buffer", data: [...]}
      let dataArray;
      if (update.update_data && typeof update.update_data === 'object' && update.update_data.type === 'Buffer') {
        dataArray = update.update_data.data;
      } else if (Array.isArray(update.update_data)) {
        dataArray = update.update_data;
      } else {
        // Fallback: try to convert to array
        dataArray = Array.from(update.update_data);
      }
      
      return {
        data: dataArray,
        createdAt: update.created_at,
        userId: update.user_id,
      };
    }) || [];

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

    const supabase = createSupabaseClientFromRequest(request);

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Debug logging for permission checking
    console.log('[YJS Updates] POST - Permission check for user:', {
      userId: user.id,
      documentId,
      userEmail: user.email,
      timestamp: new Date().toISOString()
    });

    // Check document access permission (write access required for POST)
    const accessCheck = await checkDocumentAccess(supabase, documentId, user.id, 'write');
    if (!accessCheck.hasAccess) {
      console.error('[YJS Updates] POST - Access denied:', {
        userId: user.id,
        documentId,
        userEmail: user.email,
        accessCheck
      });
      return accessCheck.error!;
    }

    console.log('[YJS Updates] POST - Access granted:', {
      userId: user.id,
      documentId,
      permissionLevel: accessCheck.permissionLevel
    });

    // Handle different formats of updateData
    let updateBuffer: Buffer;
    
    if (Array.isArray(updateData)) {
      // Client sent plain array [1, 2, 3, ...]
      updateBuffer = Buffer.from(updateData);
    } else if (updateData && typeof updateData === 'object' && updateData.type === 'Buffer' && Array.isArray(updateData.data)) {
      // Client sent Buffer object {type: "Buffer", data: [1, 2, 3, ...]}
      updateBuffer = Buffer.from(updateData.data);
    } else if (updateData instanceof Uint8Array) {
      // Client sent Uint8Array directly
      updateBuffer = Buffer.from(updateData);
    } else {
      // Fallback: try to convert whatever we got
      updateBuffer = Buffer.from(new Uint8Array(updateData));
    }

    // Convert Buffer to Uint8Array for proper BYTEA storage
    const updateUint8Array = new Uint8Array(updateBuffer);

    // Store the Yjs update
    const { data: insertedUpdate, error: insertError } = await supabase
      .from('yjs_updates')
      .insert({
        document_id: documentId,
        update_data: updateUint8Array,
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

    const supabase = createSupabaseClientFromRequest(request);

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check document access permission (write access required for DELETE)
    const accessCheck = await checkDocumentAccess(supabase, documentId, user.id, 'write');
    if (!accessCheck.hasAccess) {
      return accessCheck.error!;
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