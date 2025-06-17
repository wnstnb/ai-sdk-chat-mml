import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Create service role client for cross-user queries
const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Re-use the helper function from the documents route
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

// GET handler - Fetch document permissions/collaborators
export async function GET(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Check if user has access to this document
    const userPermission = await checkDocumentAccess(supabase, documentId, userId);
    if (!userPermission) {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'You do not have access to this document.' } 
      }, { status: 403 });
    }

    // Fetch all permissions for this document using service role client
    // (User access has been verified above)
    const { data: permissions, error: fetchError } = await supabaseServiceRole
      .from('document_permissions')
      .select(`
        id,
        user_id,
        permission_level,
        granted_at,
        granted_by
      `)
      .eq('document_id', documentId)
      .order('granted_at', { ascending: true });

    if (fetchError) {
      console.error('Permissions fetch error:', fetchError.message);
      return NextResponse.json({ 
        error: { code: 'DATABASE_ERROR', message: `Failed to fetch permissions: ${fetchError.message}` } 
      }, { status: 500 });
    }

    // Also get the document owner information
    const { data: documentOwner, error: ownerError } = await supabaseServiceRole
      .from('documents')
      .select('user_id, created_at')
      .eq('id', documentId)
      .single();

    if (ownerError) {
      console.error('Document owner fetch error:', ownerError.message);
      return NextResponse.json({ 
        error: { code: 'DATABASE_ERROR', message: `Failed to fetch document owner: ${ownerError.message}` } 
      }, { status: 500 });
    }

    // Fetch user details for each permission using service role client
    const transformedPermissions = [];
    
    // First, add the document owner if they don't have an explicit permission record
    if (documentOwner) {
      const ownerHasExplicitPermission = permissions?.some(p => p.user_id === documentOwner.user_id);
      
      if (!ownerHasExplicitPermission) {
        const { data: ownerUserData } = await supabaseServiceRole.auth.admin.getUserById(documentOwner.user_id);
        
        transformedPermissions.push({
          id: 'owner', // Special ID for owner
          user_id: documentOwner.user_id,
          user_email: ownerUserData?.user?.email || 'Unknown',
          user_name: ownerUserData?.user?.user_metadata?.full_name || null,
          permission_level: 'owner',
          granted_at: documentOwner.created_at, // Use document creation date
          granted_by: documentOwner.user_id, // Owner granted to themselves
        });
      }
    }
    
    // Then add all explicit permissions
    if (permissions) {
      for (const p of permissions) {
        // Get user details from auth.users using service role client
        const { data: userData } = await supabaseServiceRole.auth.admin.getUserById(p.user_id);
        
        transformedPermissions.push({
          id: p.id,
          user_id: p.user_id,
          user_email: userData?.user?.email || 'Unknown',
          user_name: userData?.user?.user_metadata?.full_name || null,
          permission_level: p.permission_level,
          granted_at: p.granted_at,
          granted_by: p.granted_by,
        });
      }
    }

    return NextResponse.json({ 
      permissions: transformedPermissions,
      currentUserId: userId
    }, { status: 200 });

  } catch (error: any) {
    console.error('Permissions GET Error:', error.message);
    return NextResponse.json({ 
      error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } 
    }, { status: 500 });
  }
}

// POST handler - Add new collaborator by email
export async function POST(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Check if user has permission to share (owner or editor)
    const userPermission = await checkDocumentAccess(supabase, documentId, userId);
    if (!userPermission || !['owner', 'editor'].includes(userPermission.permission_level)) {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'You do not have permission to share this document.' } 
      }, { status: 403 });
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ 
        error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } 
      }, { status: 400 });
    }

    const { email, permission_level, skipNotification = false } = body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ 
        error: { code: 'VALIDATION_ERROR', message: 'Email is required and must be a string.' } 
      }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ 
        error: { code: 'VALIDATION_ERROR', message: 'Invalid email format.' } 
      }, { status: 400 });
    }

    if (!permission_level || !['owner', 'editor', 'commenter', 'viewer'].includes(permission_level)) {
      return NextResponse.json({ 
        error: { code: 'VALIDATION_ERROR', message: 'Valid permission_level is required.' } 
      }, { status: 400 });
    }

    // Only owners can grant owner permissions
    if (permission_level === 'owner' && userPermission.permission_level !== 'owner') {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'Only document owners can grant owner permissions.' } 
      }, { status: 403 });
    }

    // Find user by email using auth admin API with service role client
    let targetUser = null;
    try {
      // List all users and find by email (Supabase doesn't have a direct getUserByEmail method)
      const { data: users, error: listError } = await supabaseServiceRole.auth.admin.listUsers();
      
      if (listError) {
        console.error('User list error:', listError.message);
        return NextResponse.json({ 
          error: { code: 'DATABASE_ERROR', message: 'Failed to lookup user.' } 
        }, { status: 500 });
      }

      // Find user with matching email
      const foundUser = users.users.find(user => 
        user.email?.toLowerCase() === email.toLowerCase()
      );

      if (!foundUser) {
        return NextResponse.json({ 
          error: { code: 'NOT_FOUND', message: 'User with this email address not found. They need to create an account first.' } 
        }, { status: 404 });
      }

      targetUser = { id: foundUser.id };
    } catch (error: any) {
      console.error('User lookup error:', error.message);
      return NextResponse.json({ 
        error: { code: 'DATABASE_ERROR', message: 'Failed to lookup user.' } 
      }, { status: 500 });
    }

    // Check if user already has permission
    const { data: existingPermission, error: existingError } = await supabase
      .from('document_permissions')
      .select('id')
      .eq('document_id', documentId)
      .eq('user_id', targetUser.id)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('Existing permission check error:', existingError.message);
      return NextResponse.json({ 
        error: { code: 'DATABASE_ERROR', message: 'Failed to check existing permissions.' } 
      }, { status: 500 });
    }

    if (existingPermission) {
      return NextResponse.json({ 
        error: { code: 'CONFLICT', message: 'User already has access to this document.' } 
      }, { status: 409 });
    }

    // Insert new permission
    const { data: newPermission, error: insertError } = await supabase
      .from('document_permissions')
      .insert({
        document_id: documentId,
        user_id: targetUser.id,
        permission_level: permission_level,
        granted_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Permission insert error:', insertError.message);
      return NextResponse.json({ 
        error: { code: 'DATABASE_ERROR', message: `Failed to grant permission: ${insertError.message}` } 
      }, { status: 500 });
    }

    // Create notification for the invited user (unless skipped)
    if (!skipNotification) {
      await supabase
        .from('notifications')
        .insert({
          user_id: targetUser.id,
          type: 'document_shared',
          title: 'Document shared with you',
          message: `You have been given ${permission_level} access to a document`,
          document_id: documentId,
          created_by: userId,
          data: {
            permission_level: permission_level,
            shared_by_email: userId // Could enhance to get granter's email
          }
        });
    }

    return NextResponse.json({ 
      message: 'User successfully added to document',
      permission: newPermission
    }, { status: 201 });

  } catch (error: any) {
    console.error('Permissions POST Error:', error.message);
    return NextResponse.json({ 
      error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } 
    }, { status: 500 });
  }
} 