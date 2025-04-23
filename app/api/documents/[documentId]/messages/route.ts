import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Message, ToolCall as DbToolCall } from '@/types/supabase';

interface MessageWithDetails extends Message {
  signedDownloadUrl: string | null;
  tool_calls: DbToolCall[] | null;
}

const SIGNED_URL_EXPIRY = 60 * 5; // Signed URLs expire in 5 minutes

// Helper function (can be shared or defined locally)
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

// Helper to check if user owns the document (needed for RLS checks simulation/verification)
// Note: RLS policy `is_document_owner` should handle this on the DB side. This is belt-and-suspenders or for contexts where RLS might not apply (e.g., admin client).
async function checkDocumentOwnership(supabase: ReturnType<typeof createSupabaseServerClient>, documentId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle to return null if not found, instead of erroring

    if (error) {
        console.error(`Error checking document ownership for doc ${documentId}, user ${userId}:`, error.message);
        return false; // Assume no ownership on error
    }
    return !!data; // True if data is not null (document found and owned by user)
}

// GET handler for fetching messages for a document
export async function GET(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Optional: Verify document ownership explicitly
    // const isOwner = await checkDocumentOwnership(supabase, documentId, userId);
    // if (!isOwner) { ... return 403 ... }

    // Fetch messages - RLS ensures user can only access messages for owned documents
    const { data: messages, error: fetchError } = await supabase
      .from('messages')
      .select('id, created_at, role, content, image_url, user_id')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Messages GET Error:', fetchError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch messages: ${fetchError.message}` } }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 }); // Return empty array if no messages
    }

    // --- Fetch Tool Calls for these Messages --- 
    const messageIds = messages.map(m => m.id);
    const { data: toolCalls, error: toolFetchError } = await supabase
        .from('tool_calls')
        .select('*')
        .in('message_id', messageIds);

    if (toolFetchError) {
        // Handle error fetching tool calls
        console.error('Tool Calls GET Error:', toolFetchError.message);
        // Decide whether to return partial data (messages only) or an error
        // Returning error for now to indicate incomplete data
        return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch tool calls: ${toolFetchError.message}` } }, { status: 500 });
    }

    // Combine messages with tool calls and generate signed URLs
    const messagesWithDetails: MessageWithDetails[] = await Promise.all(
        (messages as Message[]).map(async (msg) => {
            // Find associated tool calls for this message
            const associatedToolCalls = toolCalls?.filter(tc => tc.message_id === msg.id) || null;

            let signedDownloadUrl: string | null = null;
            if (msg.image_url) {
                const { data, error: urlError } = await supabase.storage
                    .from('message_images') // Ensure this matches your bucket name
                    .createSignedUrl(msg.image_url, SIGNED_URL_EXPIRY);

                if (urlError) {
                    console.error(`Failed to create signed URL for image ${msg.image_url}:`, urlError.message);
                } else {
                    signedDownloadUrl = data.signedUrl;
                }
            }
            // Return the complete MessageWithDetails object
            return {
                ...msg,
                signedDownloadUrl,
                tool_calls: associatedToolCalls
            };
        })
    );

    return NextResponse.json({ data: messagesWithDetails }, { status: 200 });

  } catch (error: any) {
    console.error('Messages GET Error:', error.message);
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
  }
}

// POST handler for creating a new message
export async function POST(
  request: Request,
  { params }: { params: { documentId: string } }
) {
    const documentId = params.documentId;
    const cookieStore = cookies();
    const supabase = createSupabaseServerClient();

    try {
        const { userId, errorResponse } = await getUserOrError(supabase);
        if (errorResponse) return errorResponse;

        // Optional: Explicit ownership check (RLS should cover insert policy `is_document_owner`)
        // const isOwner = await checkDocumentOwnership(supabase, documentId, userId);
        // if (!isOwner) {
        //     return NextResponse.json({ error: { code: 'UNAUTHORIZED_ACCESS', message: 'You do not have permission to add messages to this document.' } }, { status: 403 });
        // }

        // Parse Request Body
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 });
        }
        const { role, content, imageUrlPath } = body; // imageUrlPath is the path stored after upload

        // Validate input
        if (role !== 'user') {
             // Currently only allowing client to post 'user' messages
             return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid role specified. Only "user" messages can be created via this endpoint.' } }, { status: 400 });
        }
         if (!content && !imageUrlPath) {
             return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Message must have content or an image URL path.' } }, { status: 400 });
        }
        if (content && typeof content !== 'string') {
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Message content must be a string.' } }, { status: 400 });
        }
         if (imageUrlPath && typeof imageUrlPath !== 'string') {
             return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'imageUrlPath must be a string.' } }, { status: 400 });
         }

        // Insert new message - RLS ensures user owns the document
        const { data: newMessage, error: insertError } = await supabase
            .from('messages')
            .insert({
                document_id: documentId,
                user_id: userId,
                role: role, // Should be 'user' based on validation
                content: content || null,
                image_url: imageUrlPath || null, // Store the path from upload
                metadata: null, // Add metadata if needed
            })
            .select() // Return the newly created message
            .single();

        if (insertError) {
            console.error('Message POST Error:', insertError.message);
            // Handle potential foreign key constraint errors if documentId is invalid
            return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to create message: ${insertError.message}` } }, { status: 500 });
        }

        return NextResponse.json({ data: newMessage as Message }, { status: 201 });

    } catch (error: any) {
        console.error('Message POST Error:', error.message);
        return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
    }
} 