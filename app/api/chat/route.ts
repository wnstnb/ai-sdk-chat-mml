// app/api/chat/route.ts

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { LanguageModel, streamText, CoreMessage, tool, appendResponseMessages } from "ai";
import { z } from 'zod';
import { webSearch } from "@/lib/tools/exa-search"; // Import the webSearch tool
import { createSupabaseServerClient } from '@/lib/supabase/server'; // Supabase server client
import { Message as SupabaseMessage, ToolCall as SupabaseToolCall } from '@/types/supabase'; // DB types

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

export async function POST(req: Request) {
  // Read messages and data from the request body
  const { messages: originalMessages, data: requestData } = await req.json();

  // Extract editor block context, model ID, and document ID from data
  const { editorBlocksContext, model: modelIdFromData, documentId } = requestData || {};

  // Validate Document ID
  if (!documentId || typeof documentId !== 'string') {
    return new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Missing or invalid documentId in request data.' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // --- Get User ID (needed for saving) ---
  const supabase = createSupabaseServerClient(); // Create client early
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    const code = sessionError ? 'SERVER_ERROR' : 'UNAUTHENTICATED';
    const message = sessionError?.message || 'User not authenticated.';
    const status = sessionError ? 500 : 401;
    return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } });
  }
  const userId = session.user.id;
  // --- End Get User ID ---

  // Determine the model ID
  const modelId = typeof modelIdFromData === 'string' && modelIdFromData in modelProviders
    ? modelIdFromData
    : defaultModelId;

  // Get the AI model provider function from the map
  const getModelProvider = modelProviders[modelId];
  const aiModel = getModelProvider();

  // Prepare messages for the AI, potentially adding editor context
  const messages: CoreMessage[] = [...originalMessages];

  // Add structured editor context, if provided and valid
  if (Array.isArray(editorBlocksContext) && editorBlocksContext.length > 0) {
    // Basic validation for structure - enhance if needed
    const isValidContext = editorBlocksContext.every(block =>
      typeof block === 'object' && block !== null && 'id' in block && 'contentSnippet' in block
    );

    if (isValidContext) {
      const contextString = JSON.stringify(editorBlocksContext, null, 2);
      const contextMessage = `Current editor block context (use IDs to target blocks):\n\`\`\`json\n${contextString}\n\`\`\``;
      // Insert the context message before the last user message
      messages.splice(messages.length > 1 ? messages.length - 1 : 0, 0, {
        role: 'user',
        content: `[Editor Context]\n${contextMessage}`
      });
      console.log("Added structured editor context to messages.");
    } else {
      console.warn("Received editorBlocksContext, but it had an invalid structure.");
    }
  } else if (editorBlocksContext !== undefined) {
    console.log("Editor blocks context received but was empty, not an array, or undefined.");
  }

  // Prepare generation config, including thinking config if applicable
  const generationConfig: any = {};
  if (modelId === "gemini-2.5-flash-preview-04-17") {
    generationConfig.thinkingConfig = {
      thinkingBudget: 5120,
    };
    console.log(`Enabling thinkingConfig for model: ${modelId}`);
  }

  // Use streamText - DO NOT await the call itself here
  const result = streamText({
    model: aiModel,
    system: systemPrompt,
    messages: messages,
    tools: combinedTools, // Provide ALL defined tools to the model
    maxSteps: 5, // Allow for tool call -> result -> text response flow
    ...(Object.keys(generationConfig).length > 0 && { generationConfig }), // Conditionally add generationConfig

    // --- ADDED: onFinish callback for saving --- 
    async onFinish({ usage, response }) {
        console.log(`[onFinish] Stream finished. Usage: ${JSON.stringify(usage)}`);
        // Filter for assistant messages
        const assistantMessages = response.messages.filter(m => m.role === 'assistant');

        if (assistantMessages.length === 0) {
            console.log("[onFinish] No assistant messages to save.");
            return;
        }

        try {
            for (const message of assistantMessages) {
                // Cast the message to include optional toolCalls for type checking
                const assistantMessage = message as CoreMessage & { toolCalls?: { toolCallId: string; toolName: string; args: any }[] };

                // Type guard to check for toolCalls property
                const hasToolCalls = Array.isArray(assistantMessage.toolCalls) && assistantMessage.toolCalls.length > 0;

                // Extract plain text content for saving
                let plainTextContent: string | null = null;
                // Check if content is the tool call structure first before trying to extract text
                let contentIsToolCallStructure = false;
                if (Array.isArray(assistantMessage.content) && assistantMessage.content.length > 0 && assistantMessage.content[0]?.type === 'tool-call') {
                    contentIsToolCallStructure = true;
                } else if (typeof assistantMessage.content === 'string' && assistantMessage.content.startsWith('[') && assistantMessage.content.endsWith(']')) {
                    try {
                        const parsed = JSON.parse(assistantMessage.content);
                        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type === 'tool-call') {
                            contentIsToolCallStructure = true;
                        }
                    } catch { /* Ignore parse error, treat as non-tool-call string */ }
                }

                // Only extract plain text if content isn't primarily a tool call
                if (!contentIsToolCallStructure) {
                    if (typeof assistantMessage.content === 'string') {
                        plainTextContent = assistantMessage.content.trim();
                        if (plainTextContent === '') plainTextContent = null;
                    } else if (Array.isArray(assistantMessage.content)) {
                        plainTextContent = assistantMessage.content
                            .filter(part => part.type === 'text')
                            .map(part => part.text)
                            .join('');
                        if (plainTextContent.trim() === '') plainTextContent = null;
                    }
                }

                // --- REVISED LOGIC to handle toolCalls property vs content structure ---
                let contentToSave: string | null = null;
                let shouldSaveToToolCallsTable = false;
                const actualToolCalls = (Array.isArray(assistantMessage.toolCalls) && assistantMessage.toolCalls.length > 0) ? assistantMessage.toolCalls : undefined;

                console.log(`[onFinish Pre-Logic] plainTextContent:`, plainTextContent);
                console.log(`[onFinish Pre-Logic] actualToolCalls (from .toolCalls prop):`, JSON.stringify(actualToolCalls));
                console.log(`[onFinish Pre-Logic] contentIsToolCallStructure (from .content):`, contentIsToolCallStructure);

                if (plainTextContent) {
                    // Case 1: There is text content.
                    contentToSave = plainTextContent;
                    // Save tool calls separately ONLY if they exist in the .toolCalls property.
                    shouldSaveToToolCallsTable = !!actualToolCalls;
                    console.log(`[onFinish Decision] Case 1: Text content exists. Saving text to content. Separate tool calls: ${shouldSaveToToolCallsTable}`);
                } else if (actualToolCalls) {
                    // Case 2: No text, but tool calls found in .toolCalls property.
                    try {
                        contentToSave = JSON.stringify(actualToolCalls);
                        console.log(`[onFinish Decision] Case 2: No text, using toolCalls from .toolCalls prop for content.`);
                    } catch (stringifyError) {
                        console.error(`[onFinish] Error stringifying tool calls from .toolCalls prop:`, stringifyError);
                        contentToSave = '[{"error":"Could not serialize tool calls"}]';
                    }
                    shouldSaveToToolCallsTable = false; // Don't save separately
                } else if (contentIsToolCallStructure) {
                    // Case 3: No text, no .toolCalls prop, but .content IS the tool call structure.
                    // Save the original raw content string (which should be the JSON array string).
                    if (typeof assistantMessage.content === 'string') {
                        contentToSave = assistantMessage.content;
                        console.log(`[onFinish Decision] Case 3: No text, using raw .content string (tool call JSON) for content.`);
                    } else if (Array.isArray(assistantMessage.content)) { // Should ideally be string, but handle array just in case
                         try {
                            contentToSave = JSON.stringify(assistantMessage.content);
                            console.log(`[onFinish Decision] Case 3: No text, stringifying .content array (tool call JSON) for content.`);
                        } catch (stringifyError) {
                            console.error(`[onFinish] Error stringifying tool calls from .content array:`, stringifyError);
                            contentToSave = '[{"error":"Could not serialize tool calls"}]';
                        }
                    }
                    shouldSaveToToolCallsTable = false; // Don't save separately
                } else {
                    // Case 4: No text and no tool calls found anywhere.
                    contentToSave = null;
                    shouldSaveToToolCallsTable = false;
                    console.log(`[onFinish Decision] Case 4: No text or tool calls found. Saving null content.`);
                }
                // --- END REVISED LOGIC ---

                // --- Add detailed logging before saving ---
                // console.log(`[onFinish Debug] Assistant Message ID (from response): ${message.id ?? 'N/A'}`);
                // console.log(`[onFinish Debug] Raw assistantMessage.content:`, JSON.stringify(assistantMessage.content));
                // console.log(`[onFinish Debug] assistantMessage.toolCalls:`, JSON.stringify(assistantMessage.toolCalls));
                // console.log(`[onFinish Debug] Extracted plainTextContent:`, plainTextContent);
                // console.log(`[onFinish Debug] hasToolCalls (derived from actualToolCalls):`, !!actualToolCalls);
                console.log(`[onFinish Debug] Final determined contentToSave:`, contentToSave);
                console.log(`[onFinish Debug] Final determined shouldSaveToToolCallsTable:`, shouldSaveToToolCallsTable);
                // --- End detailed logging ---

                // 1. Save Assistant Message
                const { data: savedMsgData, error: msgSaveError } = await supabase
                    .from('messages')
                    .insert({
                        document_id: documentId,
                        user_id: userId,
                        role: 'assistant',
                        content: contentToSave, // <-- Use determined content to save
                        image_url: null,
                        metadata: { usage, raw_content: assistantMessage.content }, // Store raw content if needed
                    })
                    .select('id')
                    .single();

                if (msgSaveError) {
                    console.error(`[onFinish] Error saving assistant message: ${msgSaveError.message}`);
                    continue;
                }
                 if (!savedMsgData || !savedMsgData.id) {
                    console.error("[onFinish] Error saving assistant message: No ID returned.");
                    continue;
                }
                const savedAssistantMessageId = savedMsgData.id;
                console.log(`[onFinish] Saved assistant message with ID: ${savedAssistantMessageId}`);

                // 2. Save Tool Calls if needed (only if there was also text content)
                if (shouldSaveToToolCallsTable) {
                    // Type assertion is safe here due to the guard and the modified logic
                    const toolCallsToSave = assistantMessage.toolCalls as { toolCallId: string; toolName: string; args: any }[];

                    const toolCallInserts = toolCallsToSave.map(tc => ({
                        message_id: savedAssistantMessageId,
                        user_id: userId,
                        tool_call_id: tc.toolCallId,
                        tool_name: tc.toolName,
                        tool_input: tc.args,
                    }));

                    const { error: toolSaveError } = await supabase
                        .from('tool_calls')
                        .insert(toolCallInserts);

                    if (toolSaveError) {
                        console.error(`[onFinish] Error saving tool calls for message ${savedAssistantMessageId}: ${toolSaveError.message}`);
                    } else {
                        console.log(`[onFinish] Saved ${toolCallInserts.length} tool calls for message ${savedAssistantMessageId}`);
                    }
                }
            }
            console.log("[onFinish] Completed processing assistant messages and tool calls.");

        } catch (dbError: any) {
            console.error(`[onFinish] Unexpected error during DB operations: ${dbError.message}`);
        }
    },
    // --- END ADDED onFinish ---

  });

  // ADDED: Consume stream to ensure onFinish runs even if client disconnects
  result.consumeStream(); // no await

  // Return the streaming response directly.
  // The client will handle text deltas and tool calls from the stream.
  return result.toDataStreamResponse(); // Use standard Data Stream response
}

