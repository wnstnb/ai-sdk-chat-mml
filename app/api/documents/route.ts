import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

interface DocumentWithSharingInfo {
  id: string;
  user_id: string;
  name: string;
  content?: string;
  created_at: string;
  updated_at: string;
  folder_id?: string;
  is_starred?: boolean;
  searchable_content?: string;
  access_type: 'owned' | 'shared';
  permission_level?: string;
  owner_id?: string;
  owner_email?: string;
}

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

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const url = new URL(request.url);
  const type = url.searchParams.get('type'); // 'owned', 'shared', or null (both)

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`[Documents API] Fetching documents for user ${userId}, type: ${type || 'all'}`);

    let allDocuments: DocumentWithSharingInfo[] = [];

    // Get owned documents (unless specifically asking for shared only)
    if (type !== 'shared') {
      console.log(`[Documents API] Fetching owned documents for user ${userId}`);
      
      const { data: ownedDocs, error: ownedError } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (ownedError) {
        console.error('Owned documents fetch error:', ownedError.message);
        return NextResponse.json({ 
          error: { code: 'DATABASE_ERROR', message: `Failed to fetch owned documents: ${ownedError.message}` } 
        }, { status: 500 });
      }

      const ownedDocuments: DocumentWithSharingInfo[] = (ownedDocs || []).map(doc => ({
        ...doc,
        access_type: 'owned' as const,
        permission_level: 'owner',
        owner_id: doc.user_id,
        owner_email: undefined // User is the owner
      }));

      console.log(`[Documents API] Found ${ownedDocuments.length} owned documents`);
      allDocuments.push(...ownedDocuments);
    }

    // Get shared documents (unless specifically asking for owned only)
    if (type !== 'owned') {
      console.log(`[Documents API] Fetching shared documents for user ${userId}`);
      
      // Step 1: Find documents that are truly shared (have more than 1 permission record)
      const { data: sharedDocIds, error: sharedIdsError } = await supabaseServiceRole
        .rpc('get_shared_document_ids');

      if (sharedIdsError) {
        console.error('Error fetching truly shared document IDs:', sharedIdsError.message);
        return NextResponse.json({ 
          error: { code: 'DATABASE_ERROR', message: `Failed to fetch shared document IDs: ${sharedIdsError.message}` } 
        }, { status: 500 });
      }

      console.log(`[Documents API] Found ${sharedDocIds?.length || 0} shared document records`);

      if (sharedDocIds && sharedDocIds.length > 0) {
        // Filter to truly shared documents (permission_count > 1)
        const trulySharedDocs = sharedDocIds.filter((row: any) => row.permission_count > 1);
        console.log(`[Documents API] Found ${trulySharedDocs.length} truly shared documents (count > 1)`);
        
        if (trulySharedDocs.length === 0) {
          console.log(`[Documents API] No truly shared documents found for user ${userId}`);
          // Continue to return empty shared documents
        } else {
          const trulySharedDocumentIds = trulySharedDocs.map((row: any) => row.document_id);
        
        // Step 2: Get user's permission records for truly shared documents only
        const { data: userPermissions, error: permError } = await supabase
          .from('document_permissions')
          .select('document_id, permission_level, granted_at')
          .eq('user_id', userId)
          .in('document_id', trulySharedDocumentIds);

        if (permError) {
          console.error('User permissions fetch error:', permError.message);
          return NextResponse.json({ 
            error: { code: 'DATABASE_ERROR', message: `Failed to fetch user permissions: ${permError.message}` } 
          }, { status: 500 });
        }

        console.log(`[Documents API] User has ${userPermissions?.length || 0} permissions for truly shared documents`);

        if (userPermissions && userPermissions.length > 0) {
          const userSharedDocIds = userPermissions.map(p => p.document_id);
          
          // Step 3: Get document details using service role (can access any document)
          const { data: sharedDocs, error: sharedError } = await supabaseServiceRole
            .from('documents')
            .select('*')
            .in('id', userSharedDocIds); // No user_id filter - include owners too

        if (sharedError) {
          console.error('Shared documents fetch error:', sharedError.message);
          return NextResponse.json({ 
            error: { code: 'DATABASE_ERROR', message: `Failed to fetch shared documents: ${sharedError.message}` } 
          }, { status: 500 });
        }

        console.log(`[Documents API] Found ${sharedDocs?.length || 0} shared documents`);

        // Step 3: Get owner information for shared documents
        if (sharedDocs && sharedDocs.length > 0) {
          const ownerIds = [...new Set(sharedDocs.map(doc => doc.user_id))];
          let ownerEmails: { [key: string]: string } = {};
          
          try {
            const { data: users, error: usersError } = await supabaseServiceRole.auth.admin.listUsers();
            if (usersError) {
              console.error('Error fetching user details:', usersError);
            } else {
              users?.users.forEach(user => {
                if (ownerIds.includes(user.id)) {
                  ownerEmails[user.id] = user.email || '';
                }
              });
            }
          } catch (userFetchError) {
            console.error('Error fetching owner emails:', userFetchError);
          }

          // Step 4: Combine document info with permission info
          const sharedDocuments: DocumentWithSharingInfo[] = sharedDocs.map(doc => {
            const userPermission = userPermissions.find(p => p.document_id === doc.id);
            return {
              ...doc,
              access_type: 'shared' as const,
              permission_level: userPermission?.permission_level,
              owner_id: doc.user_id,
              owner_email: ownerEmails[doc.user_id]
            };
          });

          console.log(`[Documents API] Final shared documents:`, sharedDocuments.map(d => ({ 
            id: d.id, 
            name: d.name, 
            permission: d.permission_level,
            owner_email: d.owner_email 
          })));
          
          allDocuments.push(...sharedDocuments);
        }
        }
        }
      }
    }

    console.log(`[Documents API] Total documents returned: ${allDocuments.length}`);

    return NextResponse.json({ 
      documents: allDocuments,
      total: allDocuments.length 
    });

  } catch (error: any) {
    console.error('[Documents API] Unexpected error:', error);
    return NextResponse.json({ 
      error: { code: 'INTERNAL_ERROR', message: `Unexpected error: ${error.message}` } 
    }, { status: 500 });
  }
} 