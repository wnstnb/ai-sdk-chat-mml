// app/api/chat/route.ts

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { LanguageModel, streamText, CoreMessage, tool } from "ai";
import { z } from 'zod';
import { webSearch } from "@/lib/tools/exa-search"; // Import the webSearch tool
import { createSupabaseServerClient } from '@/lib/supabase/server'; // Supabase server client
import { Message as SupabaseMessage, ToolCall as SupabaseToolCall } from '@/types/supabase'; // DB types
import { createClient } from '@supabase/supabase-js'; // <-- ADDED for explicit client for signed URLs if needed

// Define Zod schemas for the editor tools based on PRD
const addContentSchema = z.object({
  markdownContent: z.string().describe("The Markdown content to be added to the editor."),
  // position: z.enum(['append', 'afterBlock', 'beforeBlock']).optional().describe("Where to add the content. Defaults to appending or inserting after the current selection."), // Optional: Refine later if needed
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert relative to (e.g., insert 'after'). If null, append or use current selection."),
});

const modifyContentSchema = z.object({
  targetBlockId: z.string().describe("The ID of the block containing the text to modify."),
  targetText: z.string().nullable().describe("The specific text within the block to modify. If null, the modification applies to the entire block's content."),
  newMarkdownContent: z.string().describe("The new Markdown content for replacement. If targetText is specified, this might be treated as plain text."),
  // modificationType: z.string().optional().describe("Provides context on the type of modification."), // Optional: Refine later if needed
});

const deleteContentSchema = z.object({
  targetBlockId: z.union([z.string(), z.array(z.string())]).describe("The ID or array of IDs of the block(s) to remove."),
  targetText: z.string().nullable().describe("The specific text within the targetBlockId block to delete. If null, the entire block(s) are deleted. Only applicable when targetBlockId is a single ID."),
});

// Define the model configuration map
const modelProviders: Record<string, () => LanguageModel> = {
  "gpt-4o": () => openai("gpt-4o"),
  "gemini-2.5-flash-preview-04-17": () => google("gemini-2.5-flash-preview-04-17"),
  "gemini-2.0-flash": () => google("gemini-2.0-flash"),
};

// Define the default model ID
const defaultModelId = "gemini-2.0-flash";

// System Prompt updated for Tool Calling and Web Search
const systemPrompt = `You are a helpful and versatile AI assistant integrated with a BlockNote rich text editor. Your role is to act as a collaborative partner, assisting users with a wide range of tasks involving their document content and general knowledge.

Your primary goal is to help users query, insert, and modify the editor's content, engage in discussions, and perform research, potentially using web search for up-to-date information.

!IMPORTANT: You have access to a \`webSearch\` tool for current information. When you use this tool, you **MUST ALWAYS** cite your sources clearly in your response.

CONTEXT PROVIDED:
- User Messages: The history of the conversation provides context for the current request.
- Editor Content (Optional): A structured array of editor blocks, editorBlocksContext, where each element is an object like { id: string, contentSnippet: string }. This represents the current state of the document.
!IMPORTANT: Do not discuss any block information or UUIDs for blocks (eg. Block e86357ab-a882-4a3b-9ffa-18550d63c272) when user asks about content in the editor. They are asking about the content in the editor, not specific blocks.

YOUR TASK:

1.  **Analyze the User's Request:** Carefully determine the user's intent based on their message and the conversation history. Categorize the intent:

    * **A) Read/Discuss Editor Content:** The user is asking a question *about* content already present in the editor (using editorBlocksContext).
        * **Action:** Generate a direct text response based *only* on the provided editor content.
        * **Tool Usage:** **Generally, DO NOT use web search.** However, if the user *explicitly* asks for *external updates* or *fact-checking related to* a specific part of the editor content (e.g., "Find the latest population number for the city mentioned in block X", "Verify the date in this paragraph using a web search"), you MAY use the \`webSearch\` tool. Remember to cite sources if search is used in this specific case.

    * **B) General Knowledge, Discussion, or Research:** The user asks a question not specific to the editor content, requests general information, or wants to discuss a topic. This may require current data.
        * **Action:** First, attempt to answer using your internal knowledge.
        * **Assess Need for Search:** Use the \`webSearch\` tool ONLY IF:
            * The user explicitly asks for a search ("search for...", "look up...", "find recent info on...").
            * The query clearly requires up-to-date external information that you likely don't possess (e.g., current events, stock prices, weather, specific recent statistics, verifying a very specific or niche fact).
        * **Tool Usage:** If \`webSearch\` is needed, use the tool. If not, proceed without it.
        * **Response:** Synthesize information (from internal knowledge or search results). **If \`webSearch\` was used, you MUST cite sources** (e.g., footnotes, inline citations like [Source: url]).

    * **C) Add/Modify/Delete Editor Content:** The user wants to generate new content, change existing content, or remove content *within the editor*.
        * **Action:** Determine the correct editor tool (\`addContent\`, \`modifyContent\`, \`deleteContent\`) and its parameters.
        * **Tool Usage:** **DO NOT use web search for generating the *content* itself in this step.** (Research might precede this in a separate step if requested, see "Handling Combined Requests"). Refer to editorBlocksContext for block IDs and context. Follow the specific tool instructions below.

2.  **Handling Combined Requests:** If a user request involves multiple steps (e.g., "Research topic X and then add a summary to my notes"), address them logically. Perform the research (\`webSearch\`, if necessary, following rule B) first. Then, based on the outcome and the user's request, formulate the appropriate editor tool call (following rule C).

3.  **Formulate Your Response/Action:**

    * **For A & B (Discussion/Info):** Generate a text response. If \`webSearch\` was used, ensure citations are included.
    * **For C (Editor Actions):**
        * Prepare the appropriate tool call (\`addContent\`, \`modifyContent\`, or \`deleteContent\`) with correct parameters.
        * **\`targetText\` Parameter:** Use this ONLY for finding and replacing/deleting a specific word or phrase *within a single block*. For any broader changes (summarizing, reformatting, rewriting paragraphs, deleting whole blocks, converting formats), set \`targetText\` to \`null\`.
        * **\`modifyContent\` Specifics:**
            * When \`targetText\` is \`null\`, the goal is usually to rewrite, summarize, reformat, or otherwise transform one or more blocks.
            * \`targetBlockId\` should be the ID of the *first* block in the sequence to be modified.
            * \`newMarkdownContent\` **MUST contain the complete, rewritten Markdown for the *entire* affected section**, reflecting the desired final state. For example, if converting list items to a checklist, provide the full list markdown with \`[ ]\` markers. If summarizing multiple paragraphs into one, provide the single new Markdown paragraph.
        * **\`deleteContent\` Specifics:** If deleting entire blocks (\`targetText\` is \`null\`), provide the \`targetBlockId\` (single ID or an array of IDs) for removal.
        * **Confirmation:** You can optionally provide a brief text message confirming the action alongside the tool call (e.g., "Okay, I've added the summary to your notes." or "I've reformatted the list as requested.").

    * **Ambiguity:** If the user's instruction is unclear about *what* to change, *where* to change it, or *how* to change it, **DO NOT GUESS or use any tool.** Ask clarifying questions first.

TOOLS AVAILABLE:
- webSearch({ query: string }): Searches the web. Use according to rules A and B. Always cite sources from results.
- addContent({ markdownContent: string, targetBlockId: string | null }): Adds new Markdown content. Use \`null\` for targetBlockId to add at the end, or provide an ID to add after that block.
- modifyContent({ targetBlockId: string, targetText: string | null, newMarkdownContent: string }): Modifies existing content. Replaces content starting at targetBlockId. Requires careful construction of newMarkdownContent.
- deleteContent({ targetBlockId: string | string[], targetText: string | null }): Deletes content, either specific text within a block or entire blocks.

Final Check: Always prioritize accuracy, carefully select the right tool (or none), use editor context appropriately for editor actions, rely on web search judiciously for external/current info, and rigorously cite web sources.
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

// Define the tools for the AI model, omitting execute as actions happen client-side
const editorTools = {
  addContent: tool({
    description: "Adds new content (provided as Markdown) to the editor, optionally relative to a target block.",
    parameters: addContentSchema,
    // Dummy execute to satisfy SDK - actual logic is client-side
    execute: async (args) => {
      console.log(`Backend: addContent tool called (forwarding to client)`, args);
      return { status: 'forwarded to client', tool: 'addContent' };
    }
  }),
  modifyContent: tool({
    description: "Modifies content within a specific editor block. Can target the entire block or specific text within it.",
    parameters: modifyContentSchema,
    // Dummy execute to satisfy SDK - actual logic is client-side
    execute: async (args) => {
      console.log(`Backend: modifyContent tool called (forwarding to client)`, args);
      return { status: 'forwarded to client', tool: 'modifyContent' };
    }
  }),
  deleteContent: tool({
    description: "Deletes one or more blocks, or specific text within a block, from the editor.",
    parameters: deleteContentSchema,
    // Dummy execute to satisfy SDK - actual logic is client-side
    execute: async (args) => {
      console.log(`Backend: deleteContent tool called (forwarding to client)`, args);
      return { status: 'forwarded to client', tool: 'deleteContent' };
    }
  }),
};

// Define the tools for the AI model, combining editor and web search tools
const combinedTools = {
  ...editorTools, // Include existing editor tools
  webSearch,      // Add the web search tool
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

    // Read messages and data from the request body
    const { messages: originalMessages, data: requestData } = await req.json();

    // Extract relevant data, including the potential image SIGNED URL
    const {
        editorBlocksContext,
        model: modelIdFromData,
        documentId,
        firstImageSignedUrl, // <-- UPDATED: Expect signed URL
        taskHint
    } = requestData || {};

    // --- Existing Validation (Document ID, User Session) ---
    if (!documentId || typeof documentId !== 'string') {
         return new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Missing or invalid documentId in request data.' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const supabaseUserClient = createSupabaseServerClient(); // Use user client for auth check
    const { data: { session }, error: sessionError } = await supabaseUserClient.auth.getSession();
    if (sessionError || !session) {
        const code = sessionError ? 'SERVER_ERROR' : 'UNAUTHENTICATED';
        const message = sessionError?.message || 'User not authenticated.';
        const status = sessionError ? 500 : 401;
        return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } });
    }
    const userId = session.user.id;
    // --- End Validation ---


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
                    console.log(`[Rate Limit] Applying ${WEB_SEARCH_RATE_LIMIT_MS}ms delay before webSearch #${webSearchCallCount + 1} for summarization task.`);
                    await new Promise(resolve => setTimeout(resolve, WEB_SEARCH_RATE_LIMIT_MS));
                }
                webSearchCallCount++;
            }
            // Execute the original webSearch function
            console.log(`[Rate Limit] Executing webSearch (Call #${webSearchCallCount} for this task hint). Args:`, args);
            // Call the original execute with both args and options
            return webSearch.execute ? await webSearch.execute(args, options) : { error: 'Original execute function not found' };
        }
    });

    // Rebuild combinedTools with the rate-limited version
    const combinedToolsWithRateLimit = {
        ...editorTools,
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
            console.log(`[API Chat] Using provided signed URL for image.`);
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
                console.log(`[API Chat] Formatting last user message (ID: ${msg.id || 'N/A'}) as multimodal.`);
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
                                     console.warn(`[API Chat] User message (ID: ${msg.id || 'N/A'}) content looks structured but failed to extract text. Using original string.`);
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
                     console.warn(`[API Chat] Received message with role 'tool' (ID: ${msg.id || 'N/A'}) but content was not a valid tool-result array. Skipping.`);
                }
            } catch (e) {
                console.warn(`[API Chat] Failed to parse content for tool message (ID: ${msg.id || 'N/A'}). Skipping. Error:`, e);
            }
        } else if (msg.role === 'system') {
            messages.push({ role: 'system', content: msg.content || '' });
        }
        // else: ignore other roles potentially added by ai/react
    }
    // --- END REVISED Message Processing Loop (Take 2) ---


    // --- NEW: Inject Strategy Prompt Conditionally ---
    if (taskHint === 'summarize_and_cite_outline') {
        console.log("[API Chat] Task Hint 'summarize_and_cite_outline' detected. Injecting strategy prompt.");
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
            console.log("[API Chat] Added structured editor context to messages.");
        } else {
            console.warn("[API Chat] Received editorBlocksContext, but it had an invalid structure.");
        }
    } else if (editorBlocksContext !== undefined) {
         console.log("[API Chat] Editor blocks context received but was empty, not an array, or undefined.");
    }

    // --- Existing streamText call setup ---
    const generationConfig: any = {};
    if (modelId === "gemini-2.5-flash-preview-04-17") {
        generationConfig.thinkingConfig = {
            thinkingBudget: 5120,
        };
        console.log(`Enabling thinkingConfig for model: ${modelId}`);
    }

    console.log(`[API Chat] Calling streamText with ${messages.length} prepared messages. Last message role: ${messages[messages.length - 1]?.role}`);
    // --> ADDED: Log the final messages array for debugging multimodal structure
    console.log("[API Chat] Final messages payload for AI:", JSON.stringify(messages, null, 2));

    const result = streamText({
        model: aiModel,
        system: systemPrompt,
        messages: messages, // Use the potentially modified messages array
        tools: combinedToolsWithRateLimit, // Use the rate-limited tools
        maxSteps: 10, // Increased maxSteps slightly to accommodate potential multi-step (search then edit)
         ...(Object.keys(generationConfig).length > 0 && { generationConfig }),

        // --- onFinish callback for saving assistant response ---
         async onFinish({ usage, response }) {
            console.log(`[onFinish] Stream finished. Usage: ${JSON.stringify(usage)}`);
            // --- DEBUG: Log entire response structure ---
            console.log('[onFinish] Full response object:', JSON.stringify(response, null, 2));
            // --- END DEBUG ---

            const allResponseMessages = response.messages;
            const supabase = createSupabaseServerClient(); // Ensure supabase client is initialized
            const userId = session?.user?.id; // Ensure userId is available

            if (!userId) {
                console.error("[onFinish] Cannot save messages: User ID not found.");
                return;
            }
            if (allResponseMessages.length === 0) {
                console.log("[onFinish] No messages in response to save.");
                return;
            }

            try {
                for (let i = 0; i < allResponseMessages.length; i++) {
                    const message = allResponseMessages[i]; // message is CoreMessage

                    if (message.role !== 'assistant') { continue; }

                    console.log(`[onFinish] Processing assistant message index ${i}, ID: ${message.id}`);

                    // --- Extract tool calls from content --- CORRECTED LOGIC ---
                    let assistantToolCalls: Array<{ toolCallId: string; toolName: string; args: any }> = [];
                    if (Array.isArray(message.content)) {
                        assistantToolCalls = message.content
                            .filter((part): part is { type: 'tool-call'; toolCallId: string; toolName: string; args: any } => part.type === 'tool-call')
                            .map(part => ({
                                toolCallId: part.toolCallId,
                                toolName: part.toolName,
                                args: part.args
                            }));
                    }
                    const hasToolCalls = assistantToolCalls.length > 0;
                    // --- END Tool Call Extraction ---

                    // --- Save Assistant Message Content (extract text part if content is array) ---
                    let plainTextContent: string | null = null;
                    if (typeof message.content === 'string') {
                        plainTextContent = message.content.trim() || null;
                    } else if (Array.isArray(message.content)) {
                        const textPart = message.content.find((part): part is { type: 'text'; text: string } => part.type === 'text');
                        plainTextContent = textPart?.text?.trim() || null;
                         // If content only had tool calls, plainTextContent will correctly be null here
                    }
                    const messageData: Omit<SupabaseMessage, 'id' | 'created_at'> = {
                        document_id: documentId,
                        user_id: userId,
                        role: 'assistant',
                        content: plainTextContent, // Saves null if only tool calls were present
                        image_url: null,
                        metadata: null,
                    };
                    const { data: savedMsgData, error: msgError } = await supabase.from('messages').insert(messageData).select('id').single();

                    if (msgError || !savedMsgData?.id) {
                        console.error(`[onFinish] Error saving assistant message content or getting ID:`, msgError);
                        continue; // Skip to next message in response
                    }
                    const savedMessageId = savedMsgData.id;
                    console.log(`[onFinish] Saved assistant message ID: ${savedMessageId}. Content saved: "${plainTextContent?.slice(0, 50)}..."`);


                    // --- REVISED (Take 3): Save Tool Calls WITH Output ---
                    if (hasToolCalls) {
                        // Use the extracted assistantToolCalls
                        console.log(`[onFinish] Assistant message ${savedMessageId} HAS ${assistantToolCalls.length} toolCalls (extracted from content):`, JSON.stringify(assistantToolCalls));
                        const toolCallsToSave: Omit<SupabaseToolCall, 'id' | 'created_at'>[] = [];

                        // Use the extracted assistantToolCalls array
                        for (const toolCall of assistantToolCalls) {
                            let toolOutput: any = null;
                            console.log(`[onFinish] > Searching for result for toolCallId: ${toolCall.toolCallId}`);
                            for (let j = i + 1; j < allResponseMessages.length; j++) {
                                const potentialToolMsg = allResponseMessages[j];
                                if (potentialToolMsg.role === 'tool' && Array.isArray(potentialToolMsg.content)) {
                                     console.log(`[onFinish] >> Found potential tool message at index ${j}`);
                                     const toolResultPart = potentialToolMsg.content.find(part =>
                                        part.type === 'tool-result' && part.toolCallId === toolCall.toolCallId
                                    );
                                    if (toolResultPart) {
                                        toolOutput = toolResultPart.result;
                                        console.log(`[onFinish] >>> Found matching toolResultPart! Output:`, JSON.stringify(toolOutput));
                                        break;
                                    }
                                }
                                if (potentialToolMsg.role === 'assistant' || potentialToolMsg.role === 'user') {
                                    console.log(`[onFinish] >> Stopped search for ${toolCall.toolCallId} result at index ${j} (role: ${potentialToolMsg.role})`);
                                    break;
                                }
                            }

                            if (toolOutput === null) {
                                 console.warn(`[onFinish] Could not find tool_output for tool call ${toolCall.toolCallId} associated with message ${savedMessageId}. Saving with null output.`);
                            }

                            toolCallsToSave.push({
                                message_id: savedMessageId,
                                user_id: userId,
                                tool_call_id: toolCall.toolCallId, // Use data from extracted call
                                tool_name: toolCall.toolName,     // Use data from extracted call
                                tool_input: toolCall.args,        // Use data from extracted call
                                tool_output: toolOutput
                            });
                        }

                        console.log(`[onFinish] Attempting to insert ${toolCallsToSave.length} tool calls for message ${savedMessageId}:`, JSON.stringify(toolCallsToSave));
                        if (toolCallsToSave.length > 0) {
                            const { error: toolError } = await supabase
                                .from('tool_calls')
                                .insert(toolCallsToSave);

                            if (toolError) {
                                console.error(`[onFinish] SUPABASE TOOL INSERT ERROR for message ${savedMessageId}:`, toolError);
                            } else {
                                console.log(`[onFinish] Successfully saved tool calls for message ${savedMessageId}.`);
                            }
                        } else {
                             console.log(`[onFinish] No tool calls prepared for saving for message ${savedMessageId}.`);
                        }
                    } else {
                        console.log(`[onFinish] Assistant message ${savedMessageId} had no tool calls in its content.`); // Updated log
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

