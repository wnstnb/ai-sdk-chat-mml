import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Message, ToolCall as DbToolCall } from '@/types/supabase';
import type { Message as FrontendMessage } from 'ai/react';
import { createClient } from '@supabase/supabase-js';

interface MessageWithDetails extends Message {
  signedDownloadUrl: string | null;
  tool_calls: DbToolCall[] | null;
}

const SIGNED_URL_EXPIRY = 60 * 5; // Signed URLs expire in 5 minutes

// Helper function (can be shared or defined locally)
async function getUserOrError(supabase: ReturnType<typeof createSupabaseServerClient>) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error('Auth User Error:', userError.message);
    return { errorResponse: NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Failed to get user.' } }, { status: 500 }) };
  }
  if (!user) {
    return { errorResponse: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'User not authenticated.' } }, { status: 401 }) };
  }
  return { userId: user.id };
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

// Helper function to get Supabase URL and Key (replace with your actual env variables)
function getSupabaseCredentials() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service key on backend

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase URL or Service Key is missing in environment variables.');
        throw new Error('Server configuration error.');
    }
    return { supabaseUrl, supabaseServiceKey };
}

// GET handler for fetching messages for a document
export async function GET(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient();
  const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
  const supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { userId, errorResponse } = await getUserOrError(supabase);
    if (errorResponse) return errorResponse;

    // Optional: Verify document ownership explicitly
    // const isOwner = await checkDocumentOwnership(supabase, documentId, userId);
    // if (!isOwner) { ... return 403 ... }

    // Fetch messages - RLS ensures user can only access messages for owned documents
    const { data: messagesData, error: fetchError } = await supabase
      .from('messages')
      .select('id, user_id, role, content, created_at, metadata')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Messages GET Error:', fetchError.message);
      return NextResponse.json({ error: { code: 'DATABASE_ERROR', message: `Failed to fetch messages: ${fetchError.message}` } }, { status: 500 });
    }

    if (!messagesData || messagesData.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 }); // Return empty array if no messages
    }

    // --- Fetch Tool Calls for these Messages --- 
    const messageIds = messagesData.map(m => m.id);
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

    // --- START REFACTOR: Process messages to handle JSON content and generate signed URLs --- 
    const processedMessages: FrontendMessage[] = [];
    for (const dbMsg of messagesData as Message[]) {
        let parts: any[] = [];
        let originalContent = dbMsg.content; // Keep original content for reference

        // 1. Parse the content JSON
        try { // Wrap parsing in try-catch
            if (typeof originalContent === 'object' && originalContent !== null) {
                parts = Array.isArray(originalContent) ? originalContent : [];
            } else if (typeof originalContent === 'string') {
                parts = JSON.parse(originalContent);
                if (!Array.isArray(parts)) parts = [];
            } else {
                console.warn(`[Messages GET] Msg ${dbMsg.id} (Role: ${dbMsg.role}) has unexpected content type:`, typeof originalContent);
                parts = [];
            }
        } catch (e) {
            console.warn(`[Messages GET] Msg ${dbMsg.id} (Role: ${dbMsg.role}) Failed to parse content JSON, treating as plain text. Content:`, originalContent, e);
            // If original content was string, create text part. Otherwise, parts remain empty.
            parts = typeof originalContent === 'string' ? [{ type: 'text', text: originalContent }] : [];
        }
        
        // --- Log parsed parts --- 
        // console.log(`[Messages GET] Msg ${dbMsg.id} (Role: ${dbMsg.role}) - Parsed parts:`, JSON.stringify(parts));

        // 2. Process parts (generate signed URLs for images)
        const processedParts = [];
        let hasImagePart = false;
        let hasToolCallPart = false;
        let textOnly = true; // Assume text only initially
        
        for (const part of parts) {
            if (part.type === 'image') {
                const bucketName = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents'; // Use consistent bucket name logic
                hasImagePart = true;
                textOnly = false;
                if (typeof part.image === 'string') {
                    const imagePath = part.image;
                    const { data: signedUrlData, error: signedUrlError } = await supabaseAdminClient.storage
                        .from(bucketName) // Use the determined bucket name
                        .createSignedUrl(imagePath, SIGNED_URL_EXPIRY);
                    if (signedUrlError) {
                        console.error(`[Messages GET] Error generating signed URL for ${imagePath}:`, signedUrlError.message);
                        processedParts.push({ ...part, image: null, error: 'Failed to load image' });
                    } else {
                        processedParts.push({ ...part, image: signedUrlData.signedUrl });
                    }
                } else {
                     console.warn(`[Messages GET] Msg ${dbMsg.id} ImagePart has non-string image data:`, part.image);
                     processedParts.push({ ...part, image: null, error: 'Invalid image data' });
                }
            } else if (part.type === 'tool-call') {
                 hasToolCallPart = true;
                 textOnly = false;
                 processedParts.push(part); // Pass tool call part through
            } else if (part.type === 'text') {
                 processedParts.push(part); // Pass text part through
                 if (!part.text?.trim()) { // Check if text part is effectively empty
                     // Don't set textOnly=false if it's just whitespace
                 } else {
                      textOnly = false; // Contains actual text
                 }
            } else {
                // Handle unknown part types if necessary
                 console.warn(`[Messages GET] Msg ${dbMsg.id} Unknown part type: ${part.type}`);
                 textOnly = false;
                 processedParts.push(part);
            }
        }

        // 3. Determine final content structure for frontend
        let finalContent: string | any[] = ''; // Default to empty string
        if (processedParts.length > 0) {
            // --- REVISED LOGIC --- 
            // If the original content was JSON (meaning parts array existed),
            // always send the processed parts array to the frontend,
            // even if it only contains a single text part after processing.
            // If the original content was a simple string (and resulted in a single text part), 
            // send that as a string.
            if (typeof originalContent === 'string' && parts.length === 1 && parts[0].type === 'text') {
                // Original was string, resulted in single text part -> send string
                finalContent = parts[0].text || '';
            } else {
                // Original was JSON array OR resulted in multiple/non-text parts -> send array
                finalContent = processedParts;
            }
            // --- END REVISED LOGIC --- 
        } else {
             // If parts array was empty after parsing/processing, use empty string
             finalContent = '';
             console.log(`[Messages GET] Msg ${dbMsg.id} (Role: ${dbMsg.role}) resulted in empty content.`);
        }

        // --- Log final content determination ---
        // console.log(`[Messages GET] Msg ${dbMsg.id} (Role: ${dbMsg.role}) - Final content type: ${typeof finalContent}, IsArray: ${Array.isArray(finalContent)}`);

        // 4. Construct the final message object for the frontend (using ai/react Message type)
        const frontendMessage: FrontendMessage = {
             id: dbMsg.id,
             role: dbMsg.role as FrontendMessage['role'], 
             content: finalContent as any, // Use type assertion 
             createdAt: new Date(dbMsg.created_at),
             // Include other relevant fields if needed
        };
        processedMessages.push(frontendMessage);
    }
    // --- END REFACTOR --- 

    return NextResponse.json({ data: processedMessages }, { status: 200 });

  } catch (error: any) {
    console.error('Messages GET Error (Outer Catch):', error.message);
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