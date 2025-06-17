import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Message, ToolCall as DbToolCall } from '@/types/supabase';
import type { Message as FrontendMessage } from 'ai/react';
import { createClient } from '@supabase/supabase-js';
import { getUserOrError } from '@/lib/utils/getUserOrError';
import { getSupabaseCredentials } from '@/lib/utils/getSupabaseCredentials';

interface MessageWithDetails extends Message {
  signedDownloadUrl: string | null;
  tool_calls: DbToolCall[] | null;
}

const SIGNED_URL_EXPIRY = 60 * 5; // Signed URLs expire in 5 minutes

// Helper function to check if user has document access and permission level
async function checkDocumentAccess(supabase: ReturnType<typeof createSupabaseServerClient>, documentId: string, userId: string) {
  try {
    // Use the new database function to check access without causing RLS recursion
    const { data, error } = await supabase
      .rpc('check_shared_document_access', {
        doc_id: documentId,
        user_uuid: userId
      });

    if (error) {
      throw new Error(`Database error checking document access: ${error.message}`);
    }

    if (!data || data.length === 0 || !data[0]?.has_access) {
      return null;
    }

    return { permission_level: data[0].permission_level };
  } catch (error: any) {
    throw new Error(`Database error checking document ownership: ${error.message}`);
  }
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

    // Check if user has access to this document
    const userPermission = await checkDocumentAccess(supabase, documentId, userId);
    if (!userPermission) {
      return NextResponse.json({ 
        error: { code: 'FORBIDDEN', message: 'You do not have access to this document.' } 
      }, { status: 403 });
    }

    // Fetch only THIS USER's messages for this document
    // Each user has their own private AI conversation per document
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

    // --- Create a map of tool_call_id to tool_output for efficient lookup ---
    const toolResultsMap = new Map<string, any>();
    if (toolCalls) {
        for (const tc of toolCalls) {
            if (tc.tool_call_id && tc.tool_output) { // Ensure tool_call_id and tool_output exist
                toolResultsMap.set(tc.tool_call_id, tc.tool_output);
            }
        }
    }
    // --- END Create a map ---

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

                 // --- MORE DETAILED LOGGING --- 
                 console.log(`[Messages GET] Msg ${dbMsg.id} attempting to find result for tool-call. Part details:`, JSON.stringify(part));
                 console.log(`[Messages GET] Msg ${dbMsg.id} current toolResultsMap keys:`, Array.from(toolResultsMap.keys()));
                 // --- END MORE DETAILED LOGGING ---

                 // --- ADD LOGIC TO INCLUDE TOOL RESULT IF AVAILABLE ---
                 if (part.toolCallId && toolResultsMap.has(part.toolCallId)) {
                    const result = toolResultsMap.get(part.toolCallId);
                    processedParts.push({
                        type: 'tool-result',
                        toolCallId: part.toolCallId,
                        toolName: part.toolName, // Ensure toolName is included as per ToolResultPart
                        result: result,
                    });
                    console.log(`[Messages GET] Msg ${dbMsg.id} Added tool-result for toolCallId: ${part.toolCallId}`);
                 }
                 // --- END LOGIC TO INCLUDE TOOL RESULT ---
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
        let validCreatedAt: Date | undefined = undefined;
        if (dbMsg.created_at && typeof dbMsg.created_at === 'string' && dbMsg.created_at.trim() !== '') {
            const parsedDate = new Date(dbMsg.created_at);
            if (!isNaN(parsedDate.getTime())) {
                validCreatedAt = parsedDate;
            } else {
                console.warn(`[API Messages GET] Msg ID ${dbMsg.id}: dbMsg.created_at ('${dbMsg.created_at}') resulted in an invalid date.`);
            }
        } else {
            console.warn(`[API Messages GET] Msg ID ${dbMsg.id}: dbMsg.created_at is null, undefined, or empty. Value:`, dbMsg.created_at);
        }

        const frontendMessage: FrontendMessage = {
             id: dbMsg.id,
             role: dbMsg.role as FrontendMessage['role'], 
             content: finalContent as any, // Use type assertion 
             createdAt: validCreatedAt, // Use the validated date
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

        // Check if user has permission to add messages to this document
        const userPermission = await checkDocumentAccess(supabase, documentId, userId);
        if (!userPermission || !['owner', 'editor'].includes(userPermission.permission_level)) {
          return NextResponse.json({ 
            error: { code: 'FORBIDDEN', message: 'You do not have permission to add messages to this document.' } 
          }, { status: 403 });
        }

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