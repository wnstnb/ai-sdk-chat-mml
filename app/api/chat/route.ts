// app/api/chat/route.ts

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { LanguageModel, streamText, CoreMessage, tool, ToolCallPart, ToolResultPart } from "ai";
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
        whisperDetails // <-- Expect whisperDetails object
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

    if (lastClientMessage && lastClientMessage.role === 'user') {
        // Determine input method for metadata
        const messageInputMethod = inputMethod === 'audio' ? 'audio' : 'text';
        // Determine image URL (use signed URL only if it's a text input)
        const imageUrlForDb = messageInputMethod === 'text' ? firstImageSignedUrl : null;
        // Extract text content and prepend follow-up context if available
        let userContentText = '';
        const originalUserText = typeof lastClientMessage.content === 'string' ? lastClientMessage.content : '';
        const contextFromRequest = typeof requestData?.followUpContext === 'string' ? requestData.followUpContext : null;

        if (contextFromRequest) {
            userContentText = `${contextFromRequest}\n\n---\n\n${originalUserText}`;
        } else {
            userContentText = originalUserText;
        }

        console.log(`[API Chat Save User Msg] Saving user message (inputMethod: ${messageInputMethod}). Content: "${userContentText?.slice(0, 50)}..." Image: ${imageUrlForDb ? 'Yes' : 'No'}`);
        const userMessageData: Omit<SupabaseMessage, 'id' | 'created_at'> = {
            document_id: documentId,
            user_id: userId,
            role: 'user',
            content: userContentText,
            image_url: typeof imageUrlForDb === 'string' ? imageUrlForDb : '', // Explicit type check
            metadata: { input_method: messageInputMethod },
        };

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
            // Handle potential multimodal content for the last user message
            // The actual image data (signed URL) comes from requestData.firstImageSignedUrl
            if (isLastMessage && finalImageSignedUrl) {
                // console.log(`[API Chat] Formatting last user message (ID: ${msg.id || 'N/A'}) as multimodal.`);
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: msg.content || '' }, // Assume msg.content is text for multimodal
                        { type: 'image', image: finalImageSignedUrl }
                    ]
                });
            } else {
                 // Check if msg.content is structured (from potential previous multimodal history)
                 // Although simple string is expected from client now for non-last messages
                 let contentString = '';
                 if (typeof msg.content === 'string') {
                     // Attempt to parse if it looks like Vercel AI SDK's structured content string
                     if (msg.content.startsWith('[') && msg.content.includes('"type":"text"')) {
                         try {
                             const parts = JSON.parse(msg.content);
                             if (Array.isArray(parts)) {
                                const textPart = parts.find(p => p.type === 'text');
                                contentString = textPart?.text || '';
                                if (contentString === '' && msg.content.length > 2) { // Parsing failed or no text part
                                     // console.warn(`[API Chat] User message (ID: ${msg.id || 'N/A'}) content looks structured but failed to extract text. Using original string.`);
                                     contentString = msg.content; // Fallback
                                }
                             } else {
                                 contentString = msg.content; // Not an array
                             }
                         } catch {
                             contentString = msg.content; // Not valid JSON
                         }
                     } else {
                         contentString = msg.content; // Regular string content
                     }
                 }
                messages.push({ role: 'user', content: contentString });
            }
        } else if (msg.role === 'assistant') {
             // Check for the toolCalls property added by the client hook
            const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
            messages.push({
                role: 'assistant',
                content: msg.content || '', // Text content accompanying calls
                // Map the toolCalls property if it exists
                ...(hasToolCalls && {
                    toolCalls: msg.toolCalls!.map(tc => ({
                        toolCallId: tc.toolCallId,
                        toolName: tc.toolName,
                        args: tc.args
                    }))
                }),
            });
        } else if (msg.role === 'tool') {
            // Parse the stringified content from the client Message to get the ToolContentPart[]
            try {
                const toolContent = JSON.parse(msg.content) as Array<{ type: 'tool-result', toolCallId: string, toolName: string, result: any }>;
                if (Array.isArray(toolContent) && toolContent[0]?.type === 'tool-result') {
                    messages.push({
                        role: 'tool',
                        content: toolContent.map(tc => ({ // Map to CoreMessage ToolContentPart
                            type: 'tool-result',
                            toolCallId: tc.toolCallId,
                            toolName: tc.toolName,
                            result: tc.result
                        }))
                    });
                } else {
                     // console.warn(`[API Chat] Received message with role 'tool' (ID: ${msg.id || 'N/A'}) but content was not a valid tool-result array. Skipping.`);
                }
            } catch (e) {
                // console.warn(`[API Chat] Failed to parse content for tool message (ID: ${msg.id || 'N/A'}). Skipping. Error:`, e);
            }
        } else if (msg.role === 'system') {
            messages.push({ role: 'system', content: msg.content || '' });
        }
        // else: ignore other roles potentially added by ai/react
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

    console.log(`[API Chat] Calling streamText with ${messages.length} prepared messages. Last message role: ${messages[messages.length - 1]?.role}`);
    // --- DEBUG: Log final payload to AI SDK ---
    // console.log("[API Chat] Final messages payload for AI SDK:", JSON.stringify(messages, null, 2));
    // ---> ADDED: Log content of the last message explicitly < ---
    const lastMessageForLog = messages[messages.length - 1];
    if (lastMessageForLog) {
        console.log("[API Chat] Content of LAST message being sent to AI SDK (Role: " + lastMessageForLog.role + "):", 
            typeof lastMessageForLog.content === 'string' ? lastMessageForLog.content : JSON.stringify(lastMessageForLog.content)
        );
    } else {
        console.log("[API Chat] No messages found to send to AI SDK.");
    }
    // --- END DEBUG ---

    const result = streamText({
        model: aiModel,
        system: systemPrompt,
        messages: messages, // Use the potentially modified messages array
        tools: combinedToolsWithRateLimit, // Use the rate-limited tools
        maxSteps: 10, // Increased maxSteps slightly to accommodate potential multi-step (search then edit)
         ...(Object.keys(generationConfig).length > 0 && { generationConfig }),

        // --- onFinish callback MODIFIED for saving user message + Whisper log first ---
         async onFinish({ usage, response }) {
            console.log(`[onFinish] Stream finished. Usage: ${JSON.stringify(usage)}`);

            const assistantMetadata = {
                usage: usage,
                raw_content: response.messages
            };

            const allResponseMessages: CoreMessage[] = response.messages;
            // Note: Supabase client (user scope) is already available from the outer scope

            if (!userId) {
                // This check might be redundant now but kept as a safeguard
                console.error("[onFinish] Cannot save messages: User ID somehow became unavailable.");
                return;
            }
            if (allResponseMessages.length === 0) {
                return;
            }

            try {
                // --- Save Assistant Message(s) and their Tool Calls ---
                for (let i = 0; i < allResponseMessages.length; i++) {
                    const message = allResponseMessages[i];

                    // Skip non-assistant messages
                    if (message.role !== 'assistant') { continue; }

                    // Extract tool calls (if any) from assistant message content
                    let assistantToolCalls: ToolCallPart[] = [];
                    if (Array.isArray(message.content)) {
                        assistantToolCalls = message.content.filter((part): part is ToolCallPart => part.type === 'tool-call');
                    }
                    const hasToolCalls = assistantToolCalls.length > 0;

                    // Save Assistant Message Content
                    // Initialize to empty string
                    let plainTextContent: string = '';
                    if (typeof message.content === 'string') {
                        plainTextContent = message.content.trim() || ''; // Ensure empty string if trim results in falsy
                    } else if (Array.isArray(message.content)) {
                        const textPart = message.content.find((part): part is { type: 'text'; text: string } => part.type === 'text');
                        plainTextContent = textPart?.text?.trim() ?? ''; // Use empty string if not found or empty after trim
                    }

                    const messageData: Omit<SupabaseMessage, 'id' | 'created_at'> = {
                        document_id: documentId,
                        user_id: userId,
                        role: 'assistant',
                        content: plainTextContent, // Now guaranteed to be string
                        image_url: null,
                        metadata: assistantMetadata,
                    };
                    const { data: savedMsgData, error: msgError } = await supabase.from('messages').insert(messageData).select('id').single();

                    if (msgError || !savedMsgData?.id) {
                        console.error(`[onFinish] Error saving assistant message content or getting ID:`, msgError);
                        continue;
                    }
                    const savedAssistantMessageId = savedMsgData.id;
                    console.log(`[onFinish] Saved assistant message ID: ${savedAssistantMessageId}.`);

                    // Save Tool Calls with Output
                    if (hasToolCalls) {
                        const toolCallsToSave: Omit<SupabaseToolCall, 'id' | 'created_at'>[] = [];

                        for (const toolCall of assistantToolCalls) {
                            let toolOutput: any = null;
                            // Find the corresponding tool result in subsequent messages
                            for (let j = i + 1; j < allResponseMessages.length; j++) {
                                const potentialToolMsg = allResponseMessages[j];
                                if (potentialToolMsg.role === 'tool' && Array.isArray(potentialToolMsg.content)) {
                                    const toolResultPart = potentialToolMsg.content.find((part): part is ToolResultPart =>
                                        part.type === 'tool-result' && part.toolCallId === toolCall.toolCallId
                                    );
                                    if (toolResultPart) {
                                        toolOutput = toolResultPart.result;
                                        break;
                                    }
                                }
                                // Stop searching if we hit the next user/assistant message
                                if (potentialToolMsg.role === 'assistant' || potentialToolMsg.role === 'user') {
                                    break;
                                }
                            }

                            toolCallsToSave.push({
                                message_id: savedAssistantMessageId,
                                user_id: userId,
                                tool_call_id: toolCall.toolCallId,
                                tool_name: toolCall.toolName,
                                tool_input: toolCall.args,
                                tool_output: toolOutput // Will be null if not found
                            });
                        }

                        if (toolCallsToSave.length > 0) {
                            const { error: toolError } = await supabase
                                .from('tool_calls')
                                .insert(toolCallsToSave);

                            if (toolError) {
                                console.error(`[onFinish] SUPABASE TOOL INSERT ERROR for assistant message ${savedAssistantMessageId}:`, toolError);
                            } else {
                                console.log(`[onFinish] Successfully saved ${toolCallsToSave.length} tool calls for assistant message ${savedAssistantMessageId}.`);
                            }
                        }
                    }
                }
            } catch (dbError: any) {
                 console.error('[onFinish] Database error during save:', dbError);
            }
        } // end onFinish
    }); // end streamText call

    // Return the streaming response
    return result.toDataStreamResponse();
}

