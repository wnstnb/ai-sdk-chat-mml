// app/api/chat/route.ts

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { LanguageModel, streamText, CoreMessage, tool, ToolCallPart, ToolResultPart, TextPart, ToolCall, ToolResult } from "ai";
import { z } from 'zod';
import { webSearch } from "@/lib/tools/exa-search"; // Import the webSearch tool
import { createSupabaseServerClient } from '@/lib/supabase/server'; // Supabase server client
import { Message as SupabaseMessage, ToolCall as SupabaseToolCall } from '@/types/supabase'; // DB types
import { createClient } from '@supabase/supabase-js'; // <-- ADDED for explicit client for signed URLs if needed
import crypto from 'crypto'; // Import crypto for UUID generation

// Define Zod schemas for the editor tools based on PRD
const addContentSchema = z.object({
  markdownContent: z.string().describe("The Markdown content to be added to the editor."),
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert relative to (e.g., insert 'after'). If null, append or use current selection."),
});

const modifyContentSchema = z.object({
  targetBlockId: z.string().describe("The ID of the block containing the text to modify."),
  targetText: z.string().nullable().describe("The specific text within the block to modify. If null, the modification applies to the entire block's content."),
  newMarkdownContent: z.string().describe("The new Markdown content for replacement. If targetText is specified, this might be treated as plain text."),
});

const deleteContentSchema = z.object({
  targetBlockId: z.union([z.string(), z.array(z.string())]).describe("The ID or array of IDs of the block(s) to remove."),
  targetText: z.string().nullable().describe("The specific text within the targetBlockId block to delete. If null, the entire block(s) are deleted. Only applicable when targetBlockId is a single ID."),
});

// --- UPDATED: Schema for the unified modifyTable tool ---
const modifyTableSchema = z.object({
    tableBlockId: z.string().describe("The ID of the table block to modify."),
    newTableMarkdown: z.string().describe("The COMPLETE, final Markdown content for the entire table after the requested modifications have been applied by the AI."),
});
// --- END UPDATED ---

// Define the model configuration map
const modelProviders: Record<string, () => LanguageModel> = {
  "gpt-4o": () => openai("gpt-4o"),
  "gemini-2.5-flash-preview-04-17": () => google("gemini-2.5-flash-preview-04-17"),
  "gemini-2.0-flash": () => google("gemini-2.0-flash"),
};

// Define the default model ID
const defaultModelId = "gemini-2.0-flash";

// System Prompt updated for Tool Calling, Web Search, and direct Table Markdown modification
const systemPrompt = `You are a helpful and versatile AI assistant integrated with a BlockNote rich text editor. Your role is to act as a collaborative partner, assisting users with a wide range of tasks involving their document content and general knowledge.

Your primary goal is to help users query, insert, and modify the editor's content, engage in discussions, and perform research, potentially using web search for up-to-date information.

!IMPORTANT: You have access to a \`webSearch\` tool for current information. When you use this tool, you **MUST ALWAYS** cite your sources clearly in your response.

CONTEXT PROVIDED:
- User Messages: The history of the conversation provides context for the current request.
- Editor Content (Optional): A structured array of editor blocks, editorBlocksContext. Each element is an object like { id: string, type: string, contentSnippet: string }.
    - For non-table blocks, contentSnippet is a short text preview (or [type]).
    - **For table blocks (type: 'table'), contentSnippet now contains the FULL MARKDOWN representation of that table.** (May be truncated if extremely long).
!IMPORTANT: Do not discuss block IDs.
- Follow-up Context (Optional): User-provided text for the immediate query.

YOUR TASK:

1.  **Analyze Request:** Determine intent (Read Content, General Info, Modify Content).

    * **A) Read/Discuss Editor Content:** Answer based *only* on provided editor content (including full table markdown if relevant). Use \`webSearch\` only if explicitly asked for external updates/fact-checking related to editor content.
    * **B) General Knowledge/Research:** Answer from internal knowledge or use \`webSearch\` if needed (current info, specific stats, explicit request). MUST cite web sources.
    * **C) Add/Modify/Delete Editor Content:** Follow the **Structured 4-Step Process** below.

2.  **Combined Requests:** Research first (1B), then editor action (1C).

3.  **Structured 4-Step Process for Editor Actions (Intent C):**

    *   **Step 1: Understand Intent:** Determine the goal for modifying the editor.
    *   **Step 2: Identify Target Blocks:** Map user request to block IDs and types from \`editorBlocksContext\`. Distinguish between **table blocks** and **non-table blocks**.
    *   **Step 3: Plan Actions & Parameters:**
        *   **Non-Table Blocks:** Use \`addContent\`, \`modifyContent\`, or \`deleteContent\`.
        *   **Table Blocks (type: 'table'):**
            *   **Goal:** Modify the table according to the user's request (add/delete row/col, change cell, sort, etc.).
            *   **Action:** 
                1. Read the *full original Markdown* of the table from the \`contentSnippet\` of the corresponding block in \`editorBlocksContext\`.
                2. Perform the requested modification *directly on the Markdown content* internally.
                3. **Use the \`modifyTable\` tool.**
            *   **Tool Parameters:**
                *   \`tableBlockId\`: The ID of the table block being modified.
                *   \`newTableMarkdown\`: The **COMPLETE, final Markdown string** representing the *entire table* AFTER you have applied the user's requested changes.
            *   **DO NOT use \`addContent\`, \`modifyContent\`, or \`deleteContent\` for tables.**
            *   **DO NOT provide instructions; provide the final Markdown.**
        *   **\`targetText\` Parameter (for \`modifyContent\` / \`deleteContent\` on *Non-Table* Blocks):** ONLY for specific find/replace/delete within a single non-table block.
        *   **\`modifyContent\` Specifics (Non-Table, \`targetText: null\`):** Replaces entire block(s) content with \`newMarkdownContent\`.
        *   **\`deleteContent\` Specifics (Non-Table, \`targetText: null\`):** Provide \`targetBlockId\` for removal.
    *   **Step 4: Validate & Clarify:**
        *   **Overlap Check:** Any contradictory operations?
        *   **Ambiguity Check:** Mapping to block IDs uncertain? Desired outcome/action unclear? Is the user's request for table modification clear enough for you to generate the final Markdown?
        *   **Action:** If overlap or ambiguity, **DO NOT use any tool.** Ask clarifying questions.

4.  **Formulate Response/Action:**

    * **A & B:** Text response (cite if needed).
    * **C (Validated):** Prepare validated tool call (\`addContent\`, \`modifyContent\`, \`deleteContent\`, or \`modifyTable\`). Optionally add brief confirmation text.
    * **C (Needs Clarification):** Ask clarifying question(s).

TOOLS AVAILABLE:
- webSearch({ query: string }): Searches the web. Cite sources.

**--- Editor Tools ---**
- addContent({ markdownContent: string, targetBlockId: string | null }): Adds new Markdown content (for non-table blocks).
- modifyContent({ targetBlockId: string, targetText: string | null, newMarkdownContent: string }): Modifies **non-table blocks ONLY**.
- deleteContent({ targetBlockId: string | string[], targetText: string | null }): Deletes content from **non-table blocks ONLY**.
- **modifyTable({ tableBlockId: string, newTableMarkdown: string })**: **Use THIS tool for ALL modifications to existing table blocks.** Provide the ID of the table block (\`tableBlockId\`) and the **complete, final Markdown content of the entire modified table** (\`newTableMarkdown\`). The AI reads the original Markdown from context, applies changes, and provides the full result here.
**--------------------**

EXAMPLES OF STEP 4 VALIDATION:
*   (Non-table examples remain the same...)
*   **Example (Modify Table Cell):** User asks: 'In the results table, change the value in row 2, column 3 to "Passed".' (Context has table 'id-table-1' with its full Markdown). Step 2: Target 'id-table-1' (type: table). Step 3: AI reads context Markdown, modifies it internally to change the cell. Plans tool call: \`modifyTable({ tableBlockId: 'id-table-1', newTableMarkdown: '... complete Markdown of the table with the cell changed ...' })\`. Step 4 Check: OK. Result: Execute.
*   **Example (Add Table Row):** User asks: 'Add a row to the inventory table with data: Laptop, 5, $1200.' (Context has table 'id-inv' with its Markdown). Step 2: Target 'id-inv' (type: table). Step 3: AI reads context Markdown, adds the row internally. Plans tool call: \`modifyTable({ tableBlockId: 'id-inv', newTableMarkdown: '... complete Markdown of the table including the new row ...' })\`. Step 4 Check: OK. Result: Execute.
*   **Example (Delete Table Column):** User asks: 'Remove the "Notes" column from the project table.' (Context has table 'id-proj' with Markdown). Step 2: Target 'id-proj' (type: table). Step 3: AI reads context Markdown, removes the column internally. Plans tool call: \`modifyTable({ tableBlockId: 'id-proj', newTableMarkdown: '... complete Markdown of the table without the Notes column ...' })\`. Step 4 Check: OK. Result: Execute.
*   **Example (Sort Table):** User asks: 'Sort the user table by signup date, oldest first.' (Context has table 'id-users' with Markdown). Step 2: Target 'id-users' (type: table). Step 3: AI reads context Markdown, sorts it internally. Plans tool call: \`modifyTable({ tableBlockId: 'id-users', newTableMarkdown: '... complete Markdown of the table, sorted by signup date ascending ...' })\`. Step 4 Check: OK. Result: Execute.
*   **Example (Ambiguous Table Request):** User asks: 'Update the table.' (Context has table 'id-data' with Markdown). Step 2: Target 'id-data' (type: table). Step 3: AI cannot determine how to modify the Markdown. Step 4 Check: Ambiguity detected. Result: Ask user: 'How exactly do you want to update the table? Please specify the changes.' DO NOT use a tool.

Final Check: Prioritize accuracy, follow the 4-step process, use \`modifyTable\` for table edits providing the *final Markdown*, use web search judiciously, cite sources, and ALWAYS ask for clarification if ambiguous.
`;

// --- NEW: Detailed Strategy for Summarization Task --- 
const summarizationStrategyPrompt = `
--- SPECIAL INSTRUCTIONS FOR SUMMARIZATION TASK ---

The user wants you to summarize multiple points, likely from an outline, and provide sources. Follow this specific strategy:

1.  **Comprehensive Web Search:** Perform ONE or TWO broad web searches covering the main topic of the outline. Gather sufficient information and identify potential sources from these initial searches.
2.  **Synthesize Summaries:** Based *only* on the information gathered in step 1, generate a concise summary for EACH bullet point or item in the original user request/editor context.
3.  **Cite Sources:** For each summary, clearly cite the source(s) from your web search results where the information was found. Use inline citations (e.g., [Source: URL]) or footnotes.
4.  **Format for Editor:** Structure your response so it can be easily inserted using the 'addContent' or 'modifyContent' tool. Ideally, prepare a *single* Markdown block containing all the summaries and citations, formatted to integrate cleanly with the original outline structure.
5.  **Tool Call:** Use ONE appropriate editor tool call ('addContent' or 'modifyContent' with targetText=null) to apply ALL the generated summaries and citations to the document at once. Avoid making multiple separate tool calls for each bullet point.

--- END SPECIAL INSTRUCTIONS ---
`;
// --- END NEW ---

// Define the tools for the AI model
const editorTools = {
  addContent: tool({
    description: "Adds new content (provided as Markdown) to the editor, optionally relative to a target block.",
    parameters: addContentSchema,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'addContent' })
  }),
  modifyContent: tool({
    description: "Modifies content within a specific NON-TABLE editor block. Can target the entire block or specific text within it.",
    parameters: modifyContentSchema,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'modifyContent' })
  }),
  deleteContent: tool({
    description: "Deletes one or more NON-TABLE blocks, or specific text within a NON-TABLE block, from the editor.",
    parameters: deleteContentSchema,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'deleteContent' })
  }),
  // --- UPDATED: Unified modifyTable tool ---
  modifyTable: tool({
    description: "Modifies an existing TABLE block by providing the complete final Markdown. Reads original from context, applies changes, returns result.",
    parameters: modifyTableSchema,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'modifyTable' })
  }),
  // --- END UPDATED ---
};

// Define the tools for the AI model, combining editor and web search
const combinedTools = {
  ...editorTools, // Includes updated modifyTable
  webSearch,
};

// Helper function to get Supabase URL and Key (replace with your actual env variables)
function getSupabaseCredentials() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service key on backend for elevated privileges like generating signed URLs

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase URL or Service Key is missing in environment variables.');
        throw new Error('Server configuration error.');
    }
    return { supabaseUrl, supabaseServiceKey };
}

// Constants
const SIGNED_URL_EXPIRES_IN = 60 * 5; // 5 minutes expiration for image URLs sent to AI

export async function POST(req: Request) {
    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey); // Admin client for storage operations
    
    console.log("\n--- [API Chat] POST Request Received ---");
    // Read messages and data from the request body
    let requestBody: any;
    try {
        requestBody = await req.json();
    } catch (error: any) {
        console.error("[API Chat] Failed to parse request body:", error);
        return new Response(JSON.stringify({ error: { code: 'INVALID_REQUEST_BODY', message: 'Could not parse JSON body.' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const { messages: originalMessages, data: requestData } = requestBody;
    console.log("[API Chat] Raw Request Data:", JSON.stringify(requestData, null, 2));
    console.log(`[API Chat] Received ${originalMessages?.length ?? 0} messages in initial request.`);

    // Extract relevant data, including the potential image SIGNED URL and potential audio details
    const {
        editorBlocksContext,
        model: modelIdFromData,
        documentId,
        firstImageSignedUrl, // <-- UPDATED: Expect signed URL
        taskHint,
        inputMethod, // <-- Expect inputMethod ('audio')
        whisperDetails, // <-- Expect whisperDetails object
        uploadedImagePathFromRequest // <-- ADD: Extract uploadedImagePath from requestData
    } = requestData || {};

    // --- Existing Validation (Document ID, User Session) ---
    if (!documentId || typeof documentId !== 'string') {
         return new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Missing or invalid documentId in request data.' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const supabase = createSupabaseServerClient(); // Use user client for auth check and data saving
    // Use getUser() instead of getSession() for server-side security
    const { data: { user }, error: userError } = await supabase.auth.getUser(); 

    if (userError || !user) {
        const code = userError ? 'SERVER_ERROR' : 'UNAUTHENTICATED';
        const message = userError?.message || 'User not authenticated.';
        const status = userError ? 500 : 401;
        console.error(`[API Chat] Auth Error (${status}): ${message}`);
        return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } });
    }
    const userId = user.id;
    // --- End Validation ---

    // --- BEGIN: Save User Message --- 
    let savedUserMessageId: string | null = null; // Track saved ID if needed elsewhere
    const lastClientMessage = Array.isArray(originalMessages) && originalMessages.length > 0 
        ? originalMessages[originalMessages.length - 1] 
        : null;

    // --- ADDED LOGGING: Inspect received lastClientMessage --- 
    console.log(`[API Chat Save User Msg] Received lastClientMessage:`, JSON.stringify(lastClientMessage, null, 2));
    // --- END LOGGING --- 

    if (lastClientMessage && lastClientMessage.role === 'user') {
        // Determine input method for metadata
        const messageInputMethod = inputMethod === 'audio' ? 'audio' : 'text';

        // --- REVISED LOGIC v2: Use uploadedImagePathFromRequest --- 
        let userContentParts: any[] = []; 
        let imagePartProcessed = false; // Flag to ensure only one image part is added

        // 1. Prioritize parts array IF it exists
        if (Array.isArray(lastClientMessage.parts) && lastClientMessage.parts.length > 0) {
            console.log(`[API Chat Save User Msg] Processing 'parts' array received from client.`);
            userContentParts = lastClientMessage.parts.map((part: any) => {
                 // --- REVERTED IMAGE PART LOGIC --- 
                 if (part.type === 'image' && typeof part.image === 'string' && !imagePartProcessed) {
                    // Assuming part.image is the signed URL string from the client
                    console.log(`[API Chat Save User Msg] Found image part in array, attempting to extract path from URL: ${part.image}`);
                    imagePartProcessed = true; // Process only the first image part found
                    try {
                        const imageUrl = new URL(part.image);
                        // Extract path assuming Supabase storage URL structure
                        // Example: https://<project_ref>.supabase.co/storage/v1/object/sign/<bucket_name>/<actual_path>
                        // We want: <actual_path> (e.g., user_id/uuid_filename.ext)
                        const pathSegments = imageUrl.pathname.split('/');
                        // --- CORRECTED PATH EXTRACTION --- 
                        const bucketName = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents'; // Use the same logic as upload/download routes
                        const bucketNameIndex = pathSegments.indexOf(bucketName);
                        
                        if (bucketNameIndex !== -1 && pathSegments.length > bucketNameIndex + 1) {
                             const extractedPath = pathSegments.slice(bucketNameIndex + 1).join('/'); // Slice *after* the bucket name
                        // --- END CORRECTED PATH EXTRACTION --- 
                             console.log(`[API Chat Save User Msg] Extracted storage path: ${extractedPath}`);
                            // Store the extracted path string
                            return { ...part, image: extractedPath }; 
                        } else {
                             console.warn(`[API Chat Save User Msg] Could not extract valid storage path from ImagePart URL structure: ${part.image}`);
                            return { ...part, image: null, error: 'Invalid image URL structure' }; // Mark as invalid
                        }
                    } catch (e) {
                        console.warn(`[API Chat Save User Msg] Failed to parse URL in ImagePart, marking as invalid:`, part.image, e);
                        return { ...part, image: null, error: 'Invalid image URL' }; // Mark as invalid
                    }
                 // --- END REVERTED IMAGE PART LOGIC --- 
                 } else if (part.type === 'text') {
                     return part; // Keep text parts
                 } else {
                      console.warn(`[API Chat Save User Msg] Ignoring unexpected part type in user message parts array: ${part.type}`);
                      return null; // Ignore other unexpected parts like nested images
                 }
            }).filter(part => part !== null); // Remove nulls

            // If parts existed but we didn't process an image (e.g., only text parts were sent),
            // ensure text content is captured if the top-level content was used.
            if (!imagePartProcessed && typeof lastClientMessage.content === 'string' && lastClientMessage.content.trim()) {
                if (!userContentParts.some(p => p.type === 'text')) { // Avoid duplicating text if already in parts
                     console.log('[API Chat Save User Msg] Adding text from content string as parts array only had other types.');
                     userContentParts.push({ type: 'text', text: lastClientMessage.content.trim() });
                }
            }

        } 
        // 2. Fallback: If no parts array, use content string
        else if (typeof lastClientMessage.content === 'string' && lastClientMessage.content.trim()) {
            console.warn('[API Chat Save User Msg] User message parts array missing or empty, using content string.');
            userContentParts.push({ type: 'text', text: lastClientMessage.content.trim() });
            // Cannot add image part here as we don't have the path
        } 
        // 3. Handle totally unexpected format
        else {
             console.error('[API Chat Save User Msg] User message has unexpected format (no parts array or content string): ', lastClientMessage);
             userContentParts = []; // Save empty content on unexpected format
        }
        // --- END REVISED LOGIC --- 

        console.log(`[API Chat Save User Msg] Saving user message (inputMethod: ${messageInputMethod}). Final Parts to Save:`, JSON.stringify(userContentParts));
        
        // --- REFACTOR: Save parts array to content column --- 
        // Use 'as any' to bypass strict type checking for the content field during insertion
        const userMessageData = { 
            document_id: documentId,
            user_id: userId,
            role: 'user' as const, // Add 'as const' for role literal type
            content: userContentParts, // Save the processed parts array as JSON
            metadata: { input_method: messageInputMethod },
        } as any; // <-- Use type assertion here
        // --- END REFACTOR ---

        const { data: savedUserData, error: userMsgError } = await supabase
            .from('messages')
            .insert(userMessageData)
            .select('id')
            .single();

        if (userMsgError || !savedUserData?.id) {
            console.error(`[API Chat Save User Msg] Error saving user message:`, userMsgError);
            // Decide if we should abort or continue? For now, log and continue.
        } else {
            savedUserMessageId = savedUserData.id;
            console.log(`[API Chat Save User Msg] Saved user message ID: ${savedUserMessageId}`);

            // --- Log Whisper details ONLY if it was an audio input AND saved successfully ---
            if (messageInputMethod === 'audio' && whisperDetails && typeof savedUserMessageId === 'string') {
                const whisperToolCallId = `whisper-${crypto.randomUUID()}`;
                const fileSize = typeof whisperDetails.file_size_bytes === 'number' ? whisperDetails.file_size_bytes : null;
                const fileType = typeof whisperDetails.file_type === 'string' ? whisperDetails.file_type : null;
                const costEstimate = typeof whisperDetails.cost_estimate === 'number' ? whisperDetails.cost_estimate : null;
                const toolInputJson = { file_size_bytes: fileSize, file_type: fileType };
                const toolOutputJson = { status: "success", cost_estimate: costEstimate };

                const whisperToolCallData: Omit<SupabaseToolCall, 'id' | 'created_at'> = {
                    message_id: savedUserMessageId, // Now guaranteed to be string
                    user_id: userId,
                    tool_name: 'whisper_transcription',
                    tool_call_id: whisperToolCallId,
                    tool_input: toolInputJson,
                    tool_output: toolOutputJson,
                };
                const { error: whisperLogError } = await supabase.from('tool_calls').insert(whisperToolCallData);
                if (whisperLogError) {
                    console.error(`[API Chat Save User Msg] SUPABASE WHISPER LOG INSERT ERROR for msg ${savedUserMessageId}:`, whisperLogError);
                } else {
                    console.log(`[API Chat Save User Msg] Successfully saved Whisper tool log for msg ${savedUserMessageId}.`);
                }
            }
        }
    } else {
        console.warn("[API Chat Save User Msg] Could not save user message: Last message not found or not from user.");
    }
    // --- END: Save User Message --- 

    // Determine the model ID
    const modelId = typeof modelIdFromData === 'string' && modelIdFromData in modelProviders
        ? modelIdFromData
        : defaultModelId;
    const getModelProvider = modelProviders[modelId];
    const aiModel = getModelProvider();

    // --- Rate Limiting State (per request) ---
    let webSearchCallCount = 0;
    const WEB_SEARCH_RATE_LIMIT_MS = 2000; // 2 second delay between searches for specific tasks

    // --- Wrap the webSearch tool for conditional rate limiting ---
    const rateLimitedWebSearch = tool({
        // description and parameters are top-level, not nested under 'config'
        description: webSearch.description,
        parameters: webSearch.parameters,
        execute: async (args, options) => { // Add the second 'options' argument
            // Apply rate limiting ONLY if this is a summarization task
            if (taskHint === 'summarize_and_cite_outline') {
                if (webSearchCallCount > 0) {
                    // console.log(`[Rate Limit] Applying ${WEB_SEARCH_RATE_LIMIT_MS}ms delay before webSearch #${webSearchCallCount + 1} for summarization task.`);
                    await new Promise(resolve => setTimeout(resolve, WEB_SEARCH_RATE_LIMIT_MS));
                }
                webSearchCallCount++;
            }
            // Execute the original webSearch function
            // console.log(`[Rate Limit] Executing webSearch (Call #${webSearchCallCount} for this task hint). Args:`, args);
            // Call the original execute with both args and options
            return webSearch.execute ? await webSearch.execute(args, options) : { error: 'Original execute function not found' };
        }
    });

    // Rebuild combinedTools with the rate-limited version
    const combinedToolsWithRateLimit = {
        ...editorTools, // Now includes modifyTable
        webSearch: rateLimitedWebSearch,
    };
    // --- End Rate Limiting Wrapper ---

    // --- Prepare messages for the AI ---
    let finalImageSignedUrl: URL | undefined = undefined; // Use the directly passed URL

    // If a signed image URL was provided, try to parse it
    if (typeof firstImageSignedUrl === 'string' && firstImageSignedUrl.trim() !== '') {
        try {
            // Validate if it's a proper URL
            finalImageSignedUrl = new URL(firstImageSignedUrl);
            // console.log(`[API Chat] Using provided signed URL for image.`);
        } catch (e: any) {
            console.error(`[API Chat] Invalid image URL provided in request data: ${firstImageSignedUrl}`, e);
             // Log and proceed without image if URL is invalid
        }
    }

    // --- REVISED Message Processing Loop (Take 2) ---
    // Input: originalMessages are now in the ai/react Message[] format
    const messages: CoreMessage[] = [];
    // Explicitly type the input messages from the request body using ai/react's Message type
    const clientMessages = originalMessages as Array<{
        id: string;
        role: 'user' | 'assistant' | 'system' | 'tool';
        content: string; // Could be stringified JSON for tool results or multimodal content
        createdAt?: Date;
        toolCalls?: Array<{ toolCallId: string; toolName: string; args: any }>; // Property from client assistant message
        // Note: experimental_attachments might exist but CoreMessage uses a different format
    }>;

    for (let i = 0; i < clientMessages.length; i++) {
        const msg = clientMessages[i];
        const isLastMessage = i === clientMessages.length - 1;

        if (msg.role === 'user') {
            // --- Extract text content FIRST, regardless of position/image --- 
            let textContent = '';
            if (Array.isArray(msg.content)) {
                const textPart = msg.content.find(p => p.type === 'text');
                textContent = textPart?.text || '';
            } else if (typeof msg.content === 'string') {
                textContent = msg.content;
            }

            // --- Construct CoreMessage --- 
            if (isLastMessage && finalImageSignedUrl) {
                // Last user message WITH an image: Use extracted text + image URL
                messages.push({
                    role: 'user',
                    content: [
                        // Use the extracted textContent here
                        { type: 'text', text: textContent }, 
                        { type: 'image', image: finalImageSignedUrl }
                    ]
                });
            } else {
                 // Other user messages OR last message without image: Send only text content
                 // (The AI doesn't need historical images unless explicitly handled)
                 messages.push({ role: 'user', content: textContent });
            }
        } else if (msg.role === 'assistant') {
            // Handle assistant messages. These might come from live interaction (with toolCalls)
            // or from history (with the custom 'parts' containing tool-invocation).
            // The transformation step below specifically handles the 'parts' case.
            // Here, we handle text content and standard toolCalls.

            // Initialize explicitly with allowed part types for assistant content array
            let assistantContent: (TextPart | ToolCallPart)[] = [];
            const textContent = typeof msg.content === 'string' ? msg.content.trim() : '';
            const standardToolCalls = (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) ? msg.toolCalls : null;
            // Extract customParts using 'as any' since it's not standard
            const customParts = (msg as any).parts;

            // Add text part if present
            if (textContent) {
                assistantContent.push({ type: 'text', text: textContent });
            }

            // Add standard tool call parts if present (from live interaction)
            if (standardToolCalls) {
                 const toolCallParts: ToolCallPart[] = standardToolCalls.map(tc => ({
                     type: 'tool-call',
                     toolCallId: tc.toolCallId,
                     toolName: tc.toolName,
                     args: tc.args
                 }));
                 assistantContent.push(...toolCallParts);
            }

            // If the source message had custom 'parts' AND assistantContent is still empty,
            // try to populate assistantContent with compatible parts from customParts.
            if (Array.isArray(customParts) && assistantContent.length === 0) {
                 const compatibleParts = customParts.filter(
                     (part): part is TextPart | ToolCallPart =>
                         part.type === 'text' || part.type === 'tool-call'
                 );
                 if (compatibleParts.length > 0) {
                     assistantContent = compatibleParts;
                 }
            }

            // Final CoreMessage content: Use the array if populated, otherwise use empty string.
            const finalContent: CoreMessage['content'] = assistantContent.length > 0 ? assistantContent : '';

            const assistantMessage: CoreMessage = {
                 role: 'assistant',
                 content: finalContent,
                 // Add the non-standard 'parts' property back if it existed, for the transformation step.
                 ...(Array.isArray(customParts) && { parts: customParts })
             };

            messages.push(assistantMessage);

        } else if (msg.role === 'tool') {
            // Existing logic to parse stringified tool-result content seems correct for CoreMessage
            try {
                // Assuming msg.content from client is a JSON string representing ToolResultPart[]
                const toolResultParts = JSON.parse(msg.content) as ToolResultPart[];
                if (Array.isArray(toolResultParts) && toolResultParts.every(p => p.type === 'tool-result')) {
                    messages.push({ role: 'tool', content: toolResultParts });
                } else {
                     console.warn(`[API Chat Pre-Transform] Received tool message content is not a valid ToolResultPart array. ID: ${msg.id}`);
                }
            } catch (e) {
                 console.warn(`[API Chat Pre-Transform] Failed to parse tool message content. ID: ${msg.id}. Error:`, e);
            }
        } else if (msg.role === 'system') {
            messages.push({ role: 'system', content: msg.content || '' });
        }
    }
    // --- END REVISED Message Processing Loop (Take 2) ---


    // --- NEW: Inject Strategy Prompt Conditionally ---
    if (taskHint === 'summarize_and_cite_outline') {
        // console.log("[API Chat] Task Hint 'summarize_and_cite_outline' detected. Injecting strategy prompt.");
        // Insert the strategy prompt before the last user message
        let lastUserMessageIndex = messages.length - 1;
        while (lastUserMessageIndex >= 0 && messages[lastUserMessageIndex].role !== 'user') {
            lastUserMessageIndex--;
        }
        // Use a role that the model will pay attention to, but clearly indicates it's an instruction
        // Using 'system' might be overridden by the main system prompt, let's try 'user'
        messages.splice(lastUserMessageIndex >= 0 ? lastUserMessageIndex : messages.length, 0, {
            role: 'user', // Or 'system' if preferred, test which works better
            content: summarizationStrategyPrompt
        });
    }
    // --- END NEW ---

    // Add structured editor context, if provided and valid (insert before the last user message)
    if (Array.isArray(editorBlocksContext) && editorBlocksContext.length > 0) {
        const isValidContext = editorBlocksContext.every(block =>
            typeof block === 'object' && block !== null && 'id' in block && 'contentSnippet' in block
        );
        if (isValidContext) {
            const contextString = JSON.stringify(editorBlocksContext, null, 2);
            const contextMessage = `Current editor block context (use IDs to target blocks):\n\`\`\`json\n${contextString}\n\`\`\``;
            // Find the index of the last user message to insert before it
            let lastUserMessageIndex = messages.length - 1;
            while (lastUserMessageIndex >= 0 && messages[lastUserMessageIndex].role !== 'user') {
                lastUserMessageIndex--;
            }
            messages.splice(lastUserMessageIndex >= 0 ? lastUserMessageIndex : 0, 0, {
                role: 'user',
                content: `[Editor Context]\n${contextMessage}`
            });
            // console.log("[API Chat] Added structured editor context to messages.");
        } else {
            console.warn("[API Chat] Received editorBlocksContext, but it had an invalid structure.");
        }
    } else if (editorBlocksContext !== undefined) {
         // console.log("[API Chat] Editor blocks context received but was empty, not an array, or undefined.");
    }

    // --- BEGIN TRANSFORMATION STEP for AI SDK ---
    // Convert messages with custom 'tool-invocation' parts (from history reconstruction)
    // into the standard format expected by the AI SDK (separate assistant+tool messages).
    console.log("[API Chat] Starting message transformation for AI SDK compatibility...");
    const transformedMessages: CoreMessage[] = [];
    for (const msg of messages) {

        let isAssistantWithToolInvocation = false;
        let sourceParts: any[] = [];

        // Check if it's an assistant message and if its content contains the custom part
        if (msg.role === 'assistant') {
            if (Array.isArray(msg.content)) {
                 // Standard CoreMessage structure uses 'content' array for parts
                 if (msg.content.some((part: any) => part.type === 'tool-invocation')) {
                    isAssistantWithToolInvocation = true;
                    sourceParts = msg.content;
                 }
            } else if (Array.isArray((msg as any).parts)) {
                // Check for non-standard 'parts' property added during history reconstruction
                 if ((msg as any).parts.some((part: any) => part.type === 'tool-invocation')) {
                    isAssistantWithToolInvocation = true;
                    sourceParts = (msg as any).parts;
                 }
            }
        }


        if (isAssistantWithToolInvocation) {
            console.log(`[API Chat Transform] Found assistant message with 'tool-invocation'.`);
            // Found an assistant message reconstructed with tool-invocation parts

            const textParts = sourceParts.filter((part): part is TextPart => part.type === 'text');
            // Explicitly type the tool invocation parts for clarity
            const toolInvocationParts = sourceParts.filter((part): part is { type: 'tool-invocation', toolInvocation: { toolCallId: string; toolName: string; args: any; result: any; state?: string } } => part.type === 'tool-invocation');

            // 1. Add assistant message with only text content (if any)
            // If there's text content alongside the tool invocation, preserve it.
            // Ensure content is always an array as per CoreMessage[] expected format when parts exist
            if (textParts.length > 0) {
                transformedMessages.push({
                    role: 'assistant',
                    content: textParts // Keep as array of text parts
                });
                console.log(`[API Chat Transform] Added assistant text part.`);
            }

            // 2. Add assistant message with standard toolCalls part
            // Correct structure for ToolCallPart[]: directly include properties
            const toolCalls: ToolCallPart[] = toolInvocationParts.map(part => ({
                type: 'tool-call',
                toolCallId: part.toolInvocation.toolCallId,
                toolName: part.toolInvocation.toolName,
                args: part.toolInvocation.args
            }));

            if (toolCalls.length > 0) {
                 // An assistant message containing ONLY tool calls should have content = toolCalls array
                transformedMessages.push({
                    role: 'assistant',
                    content: toolCalls // Content IS the array of ToolCallPart for this message
                });
                console.log(`[API Chat Transform] Added assistant message with ${toolCalls.length} tool call(s).`);
            }

            // 3. Add separate 'tool' message with standard toolResults part
            // --- TEMPORARILY DISABLED due to AI_MessageConversionError: Unsupported role: tool ---
            // It seems @ai-sdk/google provider doesn't accept 'tool' role in input history.
            /*
            const toolResults: ToolResultPart[] = toolInvocationParts
                .filter(part => part.toolInvocation.result !== undefined) // Only include if result exists
                .map(part => ({
                    type: 'tool-result',
                    toolCallId: part.toolInvocation.toolCallId,
                    toolName: part.toolInvocation.toolName, // Include toolName here as per ToolResultPart
                    result: part.toolInvocation.result
                }));

            if (toolResults.length > 0) {
                transformedMessages.push({
                    role: 'tool',
                    content: toolResults // Content IS the array of ToolResultPart for this message
                });
                 console.log(`[API Chat Transform] Added tool message with ${toolResults.length} tool result(s).`);
            } else if (toolInvocationParts.length > 0) {
                 // Log if we had invocations but no results to transform (should not happen if state='result')
                 console.warn(`[API Chat Transform] Tool invocation part(s) found but no result property was present to create a tool-result message.`);
            }
            */
            // --- END TEMPORARY DISABLE ---

        } else {
            // Pass through user messages, standard tool messages, system messages,
            transformedMessages.push(msg);
        }
    }
    console.log("[API Chat] Message transformation complete.");
    // --- END TRANSFORMATION STEP ---


    // --- Existing streamText call setup ---
    const generationConfig: any = {};
    /* --- Temporarily Disable thinkingConfig --- 
    if (modelId === "gemini-2.5-flash-preview-04-17") {
        generationConfig.thinkingConfig = {
            thinkingBudget: 5120,
        };
        console.log(`Enabling thinkingConfig for model: ${modelId}`);
    }
    */

    console.log(`[API Chat] Calling streamText with ${transformedMessages.length} prepared messages. Last message role: ${transformedMessages[transformedMessages.length - 1]?.role}`);
    // --- DEBUG: Log final payload to AI SDK ---
    // console.log("[API Chat] Final messages payload for AI SDK:", JSON.stringify(messages, null, 2));
    // ---> ADDED: Log content of the last message explicitly < ---
    const lastMessageForLog = transformedMessages[transformedMessages.length - 1];
    if (lastMessageForLog) {
        console.log("[API Chat] Content of LAST message being sent to AI SDK (Role: " + lastMessageForLog.role + "):", 
            typeof lastMessageForLog.content === 'string' ? lastMessageForLog.content : JSON.stringify(lastMessageForLog.content)
        );
    } else {
        console.log("[API Chat] No messages found to send to AI SDK.");
    }
    // --- END DEBUG ---

    try {
        console.log(`[API Chat] Calling streamText with ${transformedMessages.length} prepared messages.`);
        // Use the *transformedMessages* array here
        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages: transformedMessages, // Use the TRANSFORMED messages
            tools: combinedToolsWithRateLimit,
            maxSteps: 10,
            ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
            async onFinish({ usage, response }) {
                console.log(`[onFinish] Stream finished. Usage: ${JSON.stringify(usage)}`);

                const assistantMetadata = {
                    usage: usage,
                    raw_content: response.messages // Keep raw response for metadata if needed
                };

                const allResponseMessages: CoreMessage[] = response.messages;
                // Note: Supabase client (user scope) is already available from the outer scope

                if (!userId) {
                    console.error("[onFinish] Cannot save messages: User ID somehow became unavailable.");
                    return;
                }
                if (allResponseMessages.length === 0) {
                    console.log("[onFinish] No response messages from AI to process.");
                    return;
                }

                // --- REVISED Save Logic: Accumulate ALL parts first ---
                let finalAssistantTurn = {
                    accumulatedParts: [] as Array<TextPart | ToolCallPart>, // New field to hold parts
                    metadata: assistantMetadata, // Use metadata from the callback
                    toolResults: {} as { [toolCallId: string]: any },
                    hasData: false // Flag to indicate if *any* assistant content was found
                };

                try {
                    // Loop through ALL messages to gather parts for ONE final assistant turn
                    for (const message of allResponseMessages) {
                        // --- ADDED LOGGING: Inspect each message from AI response --- 
                        console.log(`[onFinish Loop] Processing message part:`, JSON.stringify(message, null, 2));
                        // --- END LOGGING --- 

                        if (message.role === 'assistant') {
                            finalAssistantTurn.hasData = true; // Mark that we found assistant content

                            // --- REFACTOR: Ensure content is always parts array --- 
                            let assistantParts: Array<TextPart | ToolCallPart> = [];
                            if (typeof message.content === 'string') {
                                if (message.content.trim()) {
                                    assistantParts.push({ type: 'text', text: message.content.trim() });
                                }
                            } else if (Array.isArray(message.content)) {
                                // Filter for valid TextPart and ToolCallPart
                                assistantParts = message.content.filter(
                                     (part): part is TextPart | ToolCallPart => 
                                        part.type === 'text' || part.type === 'tool-call'
                                );
                            }
                            finalAssistantTurn.accumulatedParts.push(...assistantParts); // Accumulate parts
                            // --- END REFACTOR ---

                        } else if (message.role === 'tool') {
                            // Collect tool results
                            if (Array.isArray(message.content)) {
                                const results = message.content.filter((part): part is ToolResultPart => part.type === 'tool-result');
                                results.forEach(result => {
                                    if (result.toolCallId) {
                                        finalAssistantTurn.toolResults[result.toolCallId] = result.result;
                                    }
                                });
                            }
                            // Still mark hasData = true if we only get tool results back for some reason
                            if(message.content.length > 0) finalAssistantTurn.hasData = true; 
                        } 
                        // Ignore user/system messages within the AI response itself
                    } // End of loop

                    // --- Save the accumulated turn AFTER the loop --- 
                    if (finalAssistantTurn.hasData) {
                         console.log(`[onFinish SaveTurn] Saving accumulated assistant turn. Parts Count: ${finalAssistantTurn.accumulatedParts.length}, Tool Results: ${Object.keys(finalAssistantTurn.toolResults).length}`);
                        
                        // --- ADDED LOGGING: Inspect final accumulated parts before save --- 
                        console.log(`[onFinish SaveTurn] Final accumulatedParts before insert:`, JSON.stringify(finalAssistantTurn.accumulatedParts, null, 2));
                        // --- END LOGGING --- 

                        // --- Step 2 & 3: Merge results into parts --- 
                        const partsWithResults = finalAssistantTurn.accumulatedParts.map(part => {
                            if (part.type === 'tool-call' && finalAssistantTurn.toolResults.hasOwnProperty(part.toolCallId)) {
                                console.log(`[onFinish SaveTurn] Merging result for toolCallId: ${part.toolCallId}`);
                                return {
                                    ...part, 
                                    result: finalAssistantTurn.toolResults[part.toolCallId] // Add result property
                                };
                            }
                            return part; // Return original part if not a tool-call or no result found
                        });
                         // --- ADDED LOGGING: Inspect parts after merging results --- 
                        console.log(`[onFinish SaveTurn] Parts after merging results:`, JSON.stringify(partsWithResults, null, 2));
                        // --- END LOGGING --- 

                        // Save the primary message (contains accumulated parts or is base for tool calls)
                         // --- REFACTOR: Save parts array to content --- 
                         // Use 'as any' to bypass strict type checking for the content field during insertion
                        const messageData = { 
                            document_id: documentId,
                            user_id: userId!,
                            role: 'assistant' as const, // Add 'as const' for role literal type
                            // --- MODIFICATION: Save partsWithResults and stringify --- 
                            content: JSON.stringify(partsWithResults), // Save the array with results included
                            // --- END MODIFICATION ---
                            metadata: finalAssistantTurn.metadata,
                        } as any; // <-- Use type assertion here
                        // --- END REFACTOR ---
                        const { data: savedMsgData, error: msgError } = await supabase.from('messages').insert(messageData).select('id').single();

                        if (msgError || !savedMsgData?.id) {
                            console.error(`[onFinish SaveTurn] Error saving accumulated assistant message:`, msgError);
                            // No need to reset here as it's the end of the callback
                        } else {
                            const savedMessageId = savedMsgData.id;
                            console.log(`[onFinish SaveTurn] Saved accumulated assistant message ID: ${savedMessageId}`);

                            // Save associated Tool Calls using the obtained ID
                            if (finalAssistantTurn.toolResults.length > 0) {
                                const toolCallsToSave: Omit<SupabaseToolCall, 'id' | 'created_at'>[] = Object.entries(finalAssistantTurn.toolResults).map(([toolCallId, result]) => ({
                                    message_id: savedMessageId, // Use the ID of the single message saved above
                                    user_id: userId!,
                                    tool_call_id: toolCallId,
                                    tool_name: toolCallId, // Use toolCallId as toolName
                                    tool_input: result,
                                    tool_output: result
                                }));

                                const { error: toolError } = await supabase.from('tool_calls').insert(toolCallsToSave);
                                if (toolError) {
                                    console.error(`[onFinish SaveTurn] SUPABASE TOOL INSERT ERROR for message ${savedMessageId}:`, toolError);
                                } else {
                                    console.log(`[onFinish SaveTurn] Successfully saved ${toolCallsToSave.length} tool calls for message ${savedMessageId}.`);
                                }
                            }
                        }
                    } else {
                         console.log("[onFinish SaveTurn] No assistant data found in the response to save.");
                    }
                    // --- END REVISED Save Logic ---
                } catch (dbError: any) {
                     console.error('[onFinish] Database error during save:', dbError);
                }
            } // end onFinish
        }); // end streamText call

        // Return the streaming response
        return result.toDataStreamResponse();
    } catch (error: any) {
        // Log the detailed error that occurred during streamText or setup
        console.error("[API Chat Stream/Execute Error] An error occurred:", error);

        // Determine appropriate status code
        // Check for specific error types if possible (e.g., AuthenticationError from SDK)
        // For now, use 500 as a general server error fallback
        const statusCode = 500;
        const errorCode = error.code || 'STREAMING_ERROR'; // Use error code if available
        const errorMessage = error.message || 'An unexpected error occurred while processing the chat response.';

        // Return a structured JSON error response
        return new Response(JSON.stringify({
            error: {
                code: errorCode,
                message: errorMessage,
                // Optionally include stack in development
                ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
            }
        }), {
            status: statusCode,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Define ToolInvocation type (if not already globally defined)
// This helps TypeScript understand the structure within the 'tool-invocation' part
type ToolInvocation = {
    toolCallId: string;
    toolName: string;
    args: any;
    result?: any; // Make result optional as it might not always be present initially
};

