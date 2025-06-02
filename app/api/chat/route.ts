// app/api/chat/route.ts

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { LanguageModel, streamText, CoreMessage, tool, ToolCallPart, ToolResultPart, TextPart, ImagePart, ToolCall, ToolResult, convertToCoreMessages } from "ai";
import { z } from 'zod';
import { webSearch } from "@/lib/tools/exa-search"; // Import the webSearch tool
import { createSupabaseServerClient } from '@/lib/supabase/server'; // Supabase server client
import { Message as SupabaseMessage, ToolCall as SupabaseToolCall } from '@/types/supabase'; // DB types
import { createClient } from '@supabase/supabase-js'; // <-- ADDED for explicit client for signed URLs if needed
import crypto from 'crypto'; // Import crypto for UUID generation
import { searchByTitle, searchByEmbeddings, searchByContentBM25, combineAndRankResults } from '@/lib/ai/searchService'; // UPDATED: Import searchByContentBM25

// Define a type for messages coming from the client (e.g., from useChat)
// This aligns with the expected structure for convertToCoreMessages
interface ClientMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | Array<{ type: string; text?: string; image?: string | URL; toolCallId?: string; toolName?: string; args?: any; result?: any; [key: string]: any; }>;
  toolInvocations?: Array<{ toolCallId: string; toolName: string; args: any; result?: any; state?: string }>;
  parts?: Array<{ type: string; [key: string]: any; }>; // For new message.parts format
  createdAt?: Date;
  [key: string]: any; // Allow other properties
}

// Define Zod schemas for the editor tools based on PRD
const addContentSchema = z.object({
  markdownContent: z.string().describe("The Markdown content to be added to the editor."),
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert relative to (e.g., insert 'after'). If null, append or use current selection."),
});

const modifyContentSchema = z.object({
  targetBlockId: z.string().describe("The ID of the block to modify."),
  targetText: z.string().nullable().describe("The specific text within the block to modify. If null, the modification applies to the entire block's content."),
  newMarkdownContent: z.string().describe("The new Markdown content for the block."),
});

const deleteContentSchema = z.object({
  targetBlockId: z.string().describe("The ID of the block to remove."),
  targetText: z.string().nullable().describe("The specific text within the targetBlockId block to delete. If null, the entire block is deleted."),
});

// --- UPDATED: Schema for the unified modifyTable tool ---
const modifyTableSchema = z.object({
    tableBlockId: z.string().describe("The ID of the table block to modify."),
    newTableMarkdown: z.string().describe("The COMPLETE, final Markdown content for the entire table after the requested modifications have been applied by the AI."),
});
// --- END UPDATED ---

// --- NEW: Schema for creating checklists ---
const createChecklistSchema = z.object({
  items: z.array(z.string()).describe("An array of plain text strings, where each string is the content for a new checklist item. The tool will handle Markdown formatting (e.g., prepending '* [ ]'). Do NOT include Markdown like '*[ ]' in these strings."),
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert the new checklist after. If null, the checklist is appended to the document or inserted at the current selection."),
});

// --- NEW: Search and Tag Documents Tool ---
const searchAndTagDocumentsSchema = z.object({
  searchQuery: z.string().describe("The user's query to search for in the documents.")
});

const searchAndTagDocumentsTool = tool({
  description: 'Searches documents by title and semantic content. Returns a list of relevant documents that the user can choose to tag for context.',
  parameters: searchAndTagDocumentsSchema,
  execute: async ({ searchQuery }) => {
    // 1. Perform title-based, semantic, and content searches in parallel
    const [titleMatches, semanticMatches, contentMatches] = await Promise.all([
      searchByTitle(searchQuery),
      searchByEmbeddings(searchQuery),
      searchByContentBM25(searchQuery) // NEW: Add content search
    ]);
    
    // 2. Combine and rank results
    const combinedResults = combineAndRankResults(
        titleMatches, 
        semanticMatches, 
        contentMatches // NEW: Pass content matches
    );
    
    // 3. Format results for the AI to present
    return {
      documents: combinedResults.map(doc => ({
        id: doc.id,
        name: doc.name,
        confidence: doc.finalScore,
        summary: doc.summary || undefined // Only include if present
      })),
      searchPerformed: true,
      queryUsed: searchQuery,
      presentationStyle: 'listWithTagButtons'
    };
  }
});
// --- END NEW ---

// Define the model configuration map
const modelProviders: Record<string, () => LanguageModel> = {
  "gpt-4o": () => openai("gpt-4o"),
  "gpt-4.1": () => openai("gpt-4.1"),
  "gemini-2.5-flash-preview-05-20": () => google("gemini-2.5-flash-preview-05-20"),
  "gemini-2.5-pro-preview-05-06": () => google("gemini-2.5-pro-preview-05-06"),
//   "gemini-2.0-flash": () => google("gemini-2.0-flash"),
};

// Define the default model ID
const defaultModelId = "gemini-2.5-flash-preview-05-20";

// System Prompt updated for Tool Calling, Web Search, and direct Table Markdown modification
const systemPrompt = `# SYSTEM PROMPT: Collaborative Editor AI Assistant

## ROLE: Your Collaborative Super-Assistant

You are an exceptionally capable AI assistant and collaborative partner, integrated directly into the user's BlockNote editing environment. Think of yourself not just as a tool, but as a highly resourceful **super-assistant** embedded within their workflow. Your expertise spans understanding document content, writing, research, and data organization.

## GOAL: Empowering the User's Workflow

Your primary mission is to **understand and anticipate the user's needs**, facilitating a seamless and productive creative process. Help them **produce the best version of whatever they are doing**. Help them brainstorm, draft, refine, research, and organize their thoughts and information directly within the editor.

Whether the user needs to:
* **Query existing content:** Find information quickly within their document.
* **Intelligently modify or add content:** Seamlessly integrate new ideas, restructure text, or update complex elements like tables based on their direction.
* **Gather external knowledge:** Perform web searches for current information or broader context, always being transparent about your sources.
* **Discuss and Synthesize:** Act as a sounding board, helping them clarify ideas or summarize information.

Your role is to make these tasks feel effortless for the user.

## APPROACH: Natural Integration & Skillful Tool Use

Engage naturally in conversation. While you have powerful capabilities, including specific **tools for editor modifications (\`addContent\`, \`modifyContent\`, \`deleteContent\`, \`modifyTable\`, \`createChecklist\`) and web search (\`webSearch\`)**, think of these as extensions of your own skills. Use them **skillfully and discreetly** as needed to fulfill the user's requests accurately and efficiently.

**Focus on:**
* **Understanding Intent:** Look beyond the literal words to grasp what the user truly wants to achieve.
* **Clear Communication:** Ask clarifying questions when requests are ambiguous, and concisely confirm when actions are taken.
* **Resourcefulness:** Leverage the provided context (conversation, editor content) and your tools effectively.
* **Helpful Tone:** Interact in a supportive, proactive, and expert manner.

## CORE CONTEXT PROVIDED
1.  **Conversation History:** Provides ongoing context for user requests.
2.  **Editor Content (\`editorBlocksContext\` - Optional):** You will receive editor content in an array called \`editorBlocksContext\`. Each object in this array represents a block from the editor and may contain the following fields to describe its structure:
    *   \`id\`: A unique identifier for the block.
    *   \`type\`: The type of block (e.g., 'paragraph', 'bulletListItem', 'table').
    *   \`contentSnippet\`: A brief text preview of the block's own content.
        *   For **non-table blocks**, this is a short text preview (or \`[type]\` placeholder).
        *   For **table blocks** (\`type: 'table'\`), \`contentSnippet\` contains the **FULL MARKDOWN** representation of the table. *Note: This Markdown might be truncated if the table is extremely large.*
    *   \`level\`: An integer indicating the nesting depth (1 is top-level). A higher number means deeper nesting.
    *   \`parentId\`: The \`id\` of the block under which this block is nested. Top-level blocks have a null \`parentId\`.
    Use \`level\` and \`parentId\` to understand the document's hierarchy, especially for nested lists or outlines. When a user refers to 'sub-items', 'nested content', or items 'under' another, use this structural information to accurately identify and target the correct blocks.
3.  **Follow-up Context (Optional):** Additional text provided by the user specifically for the current query.
4.  **Tagged Documents (Optional):** Items labeled with [Tagged Document Context], which the user wants to use as reference for their query.

**!IMPORTANT: Block ID Handling:** Do not mention raw block IDs (e.g., 'id-xyz') *to the user* in your conversational responses. However, you MUST use the correct block IDs internally and when specifying targets for tool calls.

## PRIMARY TASKS & WORKFLOW

**1. Analyze User Request Intent:** Classify the user's goal:
    * **(A) Read/Discuss Editor Content:** Answer questions based *strictly* on the provided \`editorBlocksContext\` (including full table Markdown). Use \`webSearch\` *only if* explicitly asked to find external updates or fact-check content *related* to the editor text.
    * **(B) General Knowledge/Research:** Answer using your internal knowledge. Use \`webSearch\` if the query requires current information, specific data/statistics, or if the user explicitly asks for web research. **ALWAYS cite web sources.**
    * **(C) Add/Modify/Delete Editor Content:** Follow the **Strict 4-Step Process for Editor Actions** detailed below.

**2. Handling Combined Requests:** If a request involves both research (B) and editor modification (C), perform the research *first*, present the findings (citing sources if applicable), and *then* proceed with the editor action steps.

**3. Strict 4-Step Process for Editor Actions (Intent C):**

    * **Step 1: Understand Precise Goal:** Determine exactly what the user wants to add, change, or remove in the editor.
    * **Step 2: Identify Target Blocks:** Map the user's request to specific block IDs and types using the \`editorBlocksContext\`. Critically distinguish between **table blocks** and **non-table blocks**.
    * **Step 3: Plan Tool Call & Parameters:** Select the appropriate tool and determine its parameters based on the block type:

        * **For NON-TABLE Blocks:**
            * **List and Checklist Handling Overview:**
                * **Creating NEW Checklists:** Use the \`createChecklist\` tool. Provide an array of plain text strings for its \`items\` parameter. The tool handles formatting each item (e.g., as \`* [ ] Your item text\`). This is the preferred method for creating new, potentially flat, checklists.
                * **Creating NEW Simple Lists (Bullet/Numbered):** Use the \`addContent\` tool with a multi-line \`markdownContent\` string (e.g., \`* Item 1\n* Item 2\` or \`1. Item 1\n2. Item 2\`).
                * **Modifying Existing Lists/Checklists (e.g., converting type, adding/removing items from an existing list structure, reformatting):** Use the \`modifyContent\` tool. This often involves the "CRITICAL WORKFLOW (Multi-Block Modify)" described below.
                * **Adding Single Items (paragraph, single list item, single checklist item):** \`addContent\` can be used for simplicity if adding just one item. For a single checklist item, \`markdownContent\` should be like \`* [ ] My single task\`.

            * **Detailed List Handling with \`modifyContent\` (for existing lists/blocks):**
                * Recognize lists across multiple lines, with or without bullet points (e.g., '-', '*', '+', or plain lines intended as a list), and including nested structures. Understand that visually distinct list items usually correspond to individual blocks.
                * **To convert existing text blocks to a checklist OR to change the text of existing checklist items:** When preparing \`newMarkdownContent\` for the \`modifyContent\` tool, prepend \`"* [ ] "\` (asterisk, space, brackets, space) to the beginning of each item's text. For example, to change an existing block with text "Existing item" into a checklist item, use \`modifyContent\` with \`newMarkdownContent: "* [ ] Existing item"\`.
                * **For Multiple List Items:** When modifying multiple list items, use separate \`modifyContent\` calls for each block ID that needs to be updated.
                * For nested lists, maintain the existing indentation and structure during modifications unless explicitly asked to change it. When adding new nested items, infer the correct indentation level.

            * **Tool Choices Summary for Non-Table Blocks:**
                * \`createChecklist({ items: string[], targetBlockId: string | null })\`: **Primary tool for creating new checklists with multiple items.** Provide an array of plain text strings for \`items\`; the tool handles Markdown.
                * \`addContent({ markdownContent: string, targetBlockId: string | null })\`: Adds new general Markdown content (paragraphs, headings). Also used for creating new simple bullet or numbered lists (e.g., \`markdownContent: "* Item 1\n* Item 2"\`) or adding a single list/checklist item (e.g., \`markdownContent: "* [ ] A single task"\`). **Avoid using for creating multi-item checklists; use \`createChecklist\` for that.**
                * \`modifyContent({ targetBlockId: string, targetText: string | null, newMarkdownContent: string })\`: Modifies content **ONLY within NON-TABLE blocks**. Can target a single block with optional specific text replacement. This is the primary tool for altering existing lists, converting items to checklists, and changing text in list items.
                    * If \`targetText\` is provided: Performs a find-and-replace within that \`targetBlockId\` using \`newMarkdownContent\`.
                    * If \`targetText\` is \`null\`: Replaces the *entire* content of that single \`targetBlockId\` with \`newMarkdownContent\`.
                * \`deleteContent({ targetBlockId: string, targetText: string | null })\`: Deletes content **ONLY from NON-TABLE blocks**. Handles whole-block deletion (\`targetText: null\`) or specific text deletion (\`targetText: 'text to delete'\`).

        * **For TABLE Blocks (\`type: 'table'\`):**
            * **Goal:** Modify the table structure or content (add/delete rows/columns, change cells, sort, reformat, etc.).
            * **Action:**
                1.  Retrieve the **full original Markdown** of the target table from its \`contentSnippet\` in \`editorBlocksContext\`.
                2.  Internally, perform the user's requested modification *directly on this Markdown string*. Handle potential complexities like sorting or structural changes.
                3.  **MUST use the \`modifyTable\` tool.**
            * **Tool:** \`modifyTable\`
            * **Parameters:**
                * \`tableBlockId\`: The ID of the table block being modified.
                * \`newTableMarkdown\`: The **COMPLETE and FINAL Markdown string** representing the *entire table* AFTER you have applied the user's requested changes.
            * **!CRITICAL: DO NOT use \`addContent\`, \`modifyContent\`, \`createChecklist\`, or \`deleteContent\` for any part of an existing table.**
            * **!CRITICAL: DO NOT provide instructions on how to change the table; provide the final, modified Markdown content.**
            * *Handling Truncated Markdown:* If the original table Markdown in \`contentSnippet\` appears truncated, and the user's request requires modifying the potentially missing part, you MUST state that you cannot perform the action accurately due to incomplete data and ask for clarification or confirmation.

    * **Step 4: Validate & Clarify:** Before executing *any* tool call:
        * **Conflict Check:** Does the plan involve contradictory operations (e.g., modifying and deleting the same block)?
        * **Ambiguity Check:** Is the target block ID unclear? Is the desired outcome or specific action ambiguous? For tables, is the request specific enough to generate the final Markdown confidently?
        * **Action:** If conflicts or ambiguity exist, **DO NOT call any tool.** Instead, ask the user clear clarifying questions to resolve the uncertainty.

**4. Formulate Response / Execute Action:**

    * **For Intents A & B:** Provide a clear, informative text response. Cite sources if \`webSearch\` was used.
    * **For Intent C (Validated):** Execute the planned and validated tool call (\`addContent\`, \`modifyContent\`, \`deleteContent\`, \`modifyTable\`, \`createChecklist\`). You MAY add a brief confirmation message to the user (e.g., "Okay, I've updated the table." or "Okay, I've added the checklist.").
    * **For Intent C (Needs Clarification):** Respond only with the clarifying questions identified in Step 4.

## AVAILABLE TOOLS

* \`webSearch({ query: string })\`: Searches the web for up-to-date information. **Must cite sources** in the response when used.

**--- Editor Manipulation Tools ---**

* \`addContent({ markdownContent: string, targetBlockId: string | null })\`: Adds new general Markdown content to the editor (e.g., paragraphs, headings). Can also be used for creating new simple bullet or numbered lists by providing a multi-line \`markdownContent\` string (e.g., \`* Item 1\n* Item 2\`), or for adding a single list/checklist item (e.g., \`markdownContent: "* [ ] A single task"\`). If \`targetBlockId\` is provided, the new content is typically inserted *after* this block. If \`targetBlockId\` is \`null\`, the content may be appended to the document or inserted at the current selection/cursor position. **For creating new checklists with multiple items, use the \`createChecklist\` tool instead.**
* \`createChecklist({ items: string[], targetBlockId: string | null })\`: **Creates a new checklist with multiple items.** Provide an array of plain text strings in the \`items\` parameter (e.g., \`["Buy milk", "Read book"]\`). Do NOT include Markdown like \`* [ ]\` in these strings; the tool (client-side) will handle the necessary formatting. This is the preferred tool for creating new, potentially flat, checklists.
* \`modifyContent({ targetBlockId: string, targetText: string | null, newMarkdownContent: string })\`: Modifies content **ONLY within NON-TABLE blocks**. Can target a single block with optional specific text replacement. This is the primary tool for altering existing lists, converting items to checklists, and changing text in list items.
* \`deleteContent({ targetBlockId: string, targetText: string | null })\`: Deletes content **ONLY from NON-TABLE blocks**. Handles whole-block deletion (\`targetText: null\`) or specific text deletion (\`targetText: 'text to delete'\`).
* **\`modifyTable({ tableBlockId: string, newTableMarkdown: string })\`**: **The ONLY tool for ALL modifications to existing table blocks.** Requires the target table's ID and the **complete, final Markdown** of the modified table.

**--- Document Search & Tagging Tool ---**

* \`searchAndTagDocuments({ searchQuery: string })\`: Searches documents by title and semantic content. Use this tool whenever the user asks to search for documents, find references, or requests information that may be found in other documents.
    *   When this tool returns results with \`presentationStyle: 'listWithTagButtons'\`:
        *   You **MUST** provide a brief acknowledgment in your text response. If documents were found (i.e., the \`documents\` array in the tool result is not empty), say something like 'Here's what I found:' or 'I found some relevant documents for you.'. 
        *   If no documents were found (i.e., the \`documents\` array is empty), say something like 'I couldn't find any documents matching your query. Would you like to try a different search?' or 'Nothing came up for that search. You can try rephrasing or broadening your search terms.'.
        *   You **MUST NOT** list the document names or summaries in your text response; the user interface will display the actual document list with tagging options separately.
        *   You **MUST** still inform the user that for each document displayed by the UI, a "Tag Document" button will be available next to its name.
        *   You **MUST NOT** ask the user to type a command or confirm to tag a document; tagging is handled by UI interaction with the button.
        *   After providing your brief acknowledgment, await the user's next action.
    *   Example acknowledgment if documents are found: "Okay, I found some documents related to your query. You can see them listed below and tag them as context."
    *   Example acknowledgment if no documents are found: "I couldn't find any documents for that. Would you like to try a different search term?"

**--- EXAMPLES OF TABLE MODIFICATION (STEP 3/4) ---**

* **Modify Cell:** User: 'In the results table, change row 2, col 3 to "Passed"'. Context provides \`id-table-1\` (type: table) with its Markdown.
    * Plan: \`modifyTable({ tableBlockId: 'id-table-1', newTableMarkdown: '... complete Markdown of the table with the cell changed ...' })\`. Validate: OK. Execute.
* **Add Row:** User: 'Add row to inventory table: Laptop, 5, $1200'. Context provides \`id-inv\` (type: table) with its Markdown.
    * Plan: \`modifyTable({ tableBlockId: 'id-inv', newTableMarkdown: '... complete Markdown of the table including the new row ...' })\`. Validate: OK. Execute.
* **Delete Column:** User: 'Remove "Notes" column from project table'. Context provides \`id-proj\` (type: table) with its Markdown.
    * Plan: \`modifyTable({ tableBlockId: 'id-proj', newTableMarkdown: '... complete Markdown of the table without the Notes column ...' })\`. Validate: OK. Execute.
* **Sort Table:** User: 'Sort user table by signup date, oldest first'. Context provides \`id-users\` (type: table) with its Markdown.
    * Plan: \`modifyTable({ tableBlockId: 'id-users', newTableMarkdown: '... complete Markdown of the table, sorted by signup date ascending ...' })\`. Validate: OK. Execute.
* **Ambiguous Request:** User: 'Update the table'. Context provides \`id-data\` (type: table).
    * Plan: Cannot determine specific modification. Validate: Ambiguity detected. Respond: 'How exactly do you want to update the table? Please specify the changes.' (Do not call tool).

## FINAL INSTRUCTIONS
Prioritize accuracy and adherence to the 4-step process for modifications. Use the correct tools for table (\`modifyTable\` with full final Markdown) vs. non-table blocks (\`addContent\`, \`createChecklist\`, \`modifyContent\`, \`deleteContent\`). Use \`webSearch\` judiciously and always cite sources. **Never guess; ALWAYS ask for clarification if the user's request is ambiguous or incomplete.** Maintain a helpful and collaborative tone.
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
    description: "Adds new general Markdown content (e.g., paragraphs, headings, simple bullet/numbered lists, or single list/checklist items). For multi-item checklists, use createChecklist.",
    parameters: addContentSchema,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'addContent' })
  }),
  modifyContent: tool({
    description: "Modifies content within specific NON-TABLE editor blocks. Can target a single block (with optional specific text replacement) or multiple blocks (replacing entire content of each with corresponding new Markdown from an array). Main tool for altering existing lists/checklists.",
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
  // --- NEW: Tool for creating checklists ---
  createChecklist: tool({
    description: "Creates a new checklist with multiple items. Provide an array of plain text strings for the items (e.g., ['Buy milk', 'Read book']). Tool handles Markdown formatting.",
    parameters: createChecklistSchema,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'createChecklist' })
  }),
  // --- END NEW ---
};

// Define the tools for the AI model, combining editor and web search
const combinedTools = {
  ...editorTools, // Includes updated modifyTable and new createChecklist
  webSearch,
  searchAndTagDocumentsTool: searchAndTagDocumentsTool,
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
    let requestBody: any;
    try {
        requestBody = await req.json();
    } catch (error: any) {
        console.error("[API Chat] Failed to parse request body:", error);
        return new Response(JSON.stringify({ error: { code: 'INVALID_REQUEST_BODY', message: 'Could not parse JSON body.' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    const { messages: originalClientMessagesUntyped, data: requestData } = requestBody;
    // Cast to our ClientMessage interface
    const originalClientMessages = (originalClientMessagesUntyped || []) as ClientMessage[];

    console.log("[API Chat] Raw Request Data:", JSON.stringify(requestData, null, 2));
    console.log(`[API Chat] Received ${originalClientMessages.length} messages in initial request.`);

    const {
        editorBlocksContext,
        model: modelIdFromData,
        documentId,
        firstImageSignedUrl, 
        uploadedImagePath,
        taskHint,
        inputMethod, 
        whisperDetails, 
        taggedDocumentIds,
        firstImageContentType,
    } = requestData || {};

    // === DETAILED LOGGING FOR IMAGE DIAGNOSIS ===
    console.log("=== [API Chat] IMAGE DIAGNOSIS LOGGING START ===");
    console.log("[API Chat] Request data image-related fields:");
    console.log("  - firstImageSignedUrl:", firstImageSignedUrl);
    console.log("  - uploadedImagePath:", uploadedImagePath);
    console.log("  - inputMethod:", inputMethod);
    console.log("  - requestData keys:", requestData ? Object.keys(requestData) : 'null');
    
    // Log any image-related fields that might be in requestData
    if (requestData) {
        const imageRelatedKeys = Object.keys(requestData).filter(key => 
            key.toLowerCase().includes('image') || 
            key.toLowerCase().includes('upload') || 
            key.toLowerCase().includes('file')
        );
        if (imageRelatedKeys.length > 0) {
            console.log("[API Chat] Image-related keys found in requestData:");
            imageRelatedKeys.forEach(key => {
                console.log(`  - ${key}:`, requestData[key]);
            });
        }
    }
    console.log("=== [API Chat] IMAGE DIAGNOSIS LOGGING END ===");

    // --- Existing Validation (Document ID, User Session) ---
    if (!documentId || typeof documentId !== 'string') {
         return new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Missing or invalid documentId in request data.' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const supabase = createSupabaseServerClient();
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

    // --- BEGIN: Save User Message (Current Turn) ---
    const lastClientMessageForSave = originalClientMessages.length > 0 ? originalClientMessages[originalClientMessages.length - 1] : null;
    if (lastClientMessageForSave && lastClientMessageForSave.role === 'user') {
        // === DETAILED LOGGING FOR MESSAGE SAVING DIAGNOSIS ===
        console.log("=== [API Chat Save User Msg] MESSAGE SAVING DIAGNOSIS START ===");
        console.log("[API Chat Save User Msg] Last client message for save:");
        console.log("  - Message ID:", lastClientMessageForSave.id);
        console.log("  - Message role:", lastClientMessageForSave.role);
        console.log("  - Message content type:", typeof lastClientMessageForSave.content);
        console.log("  - Message content:", JSON.stringify(lastClientMessageForSave.content, null, 2));
        console.log("  - Message metadata:", lastClientMessageForSave.metadata);
        console.log("[API Chat Save User Msg] Available request data for image processing:");
        console.log("  - firstImageSignedUrl:", firstImageSignedUrl);
        console.log("  - typeof firstImageSignedUrl:", typeof firstImageSignedUrl);
        console.log("  - inputMethod:", inputMethod);
        console.log("[API Chat Save User Msg] MESSAGE SAVING DIAGNOSIS END ===");

        // Reinstated logic based on prds/messages_refactor.md and app/api/documents/[documentId]/messages/route.ts
        try {
            console.log("[API Chat Save User Msg] Attempting to save user message:", JSON.stringify(lastClientMessageForSave, null, 2));

            let contentForDb: CoreMessage['content'] = [];
            let clientContent = lastClientMessageForSave.content;

            // === LOGGING: Analyze client content structure ===
            console.log("[API Chat Save User Msg] Analyzing client content structure:");
            console.log("  - clientContent type:", typeof clientContent);
            console.log("  - clientContent is array:", Array.isArray(clientContent));
            if (Array.isArray(clientContent)) {
                console.log("  - clientContent length:", clientContent.length);
                clientContent.forEach((part, index) => {
                    console.log(`  - Part ${index}:`, {
                        type: part.type,
                        hasText: 'text' in part,
                        hasImage: 'image' in part,
                        imageType: typeof part.image,
                        part: part
                    });
                });
            }

            // Ensure clientContent is an array of parts
            if (typeof clientContent === 'string') {
                console.log("[API Chat Save User Msg] Processing string content as TextPart");
                contentForDb = [{ type: 'text', text: clientContent }];
            } else if (Array.isArray(clientContent)) {
                console.log("[API Chat Save User Msg] Processing array content, examining each part...");
                // Process parts, especially for image paths
                contentForDb = clientContent
                    .map((part, index) => {
                        console.log(`[API Chat Save User Msg] Processing part ${index}:`, part);
                        
                        if (part.type === 'image' && (typeof part.image === 'string' || part.image instanceof URL)) {
                            console.log(`[API Chat Save User Msg] Found ImagePart at index ${index}`);
                            let imageValue: string | URL = part.image;
                            let originalImageString: string | undefined = typeof part.image === 'string' ? part.image : undefined;

                            console.log(`[API Chat Save User Msg] Processing image value:`, imageValue);
                            console.log(`[API Chat Save User Msg] Original image string:`, originalImageString);

                            if (typeof part.image === 'string') { // If it's a string, try to parse as URL to extract path
                                try {
                                    const imageUrl = new URL(part.image);
                                    console.log(`[API Chat Save User Msg] Parsed image URL:`, imageUrl.href);
                                    const pathSegments = imageUrl.pathname.split('/');
                                    console.log(`[API Chat Save User Msg] URL path segments:`, pathSegments);
                                    const bucketName = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents';
                                    console.log(`[API Chat Save User Msg] Looking for bucket name:`, bucketName);
                                    const bucketNameIndex = pathSegments.findIndex(segment => segment === bucketName);
                                    console.log(`[API Chat Save User Msg] Bucket name index:`, bucketNameIndex);
                                    
                                    if (bucketNameIndex !== -1 && bucketNameIndex < pathSegments.length - 1) {
                                        const storagePath = pathSegments.slice(bucketNameIndex + 1).join('/');
                                        console.log(`[API Chat Save User Msg] Extracted storage path for image: ${storagePath}`);
                                        imageValue = storagePath;
                                    } else {
                                        console.warn(`[API Chat Save User Msg] Could not determine storage path from image URL: ${part.image}. Storing original string value if any.`);
                                        imageValue = originalImageString || ''; // Fallback to original string or empty
                                    }
                                } catch (e) {
                                    console.warn(`[API Chat Save User Msg] Invalid URL for image part: ${part.image}. Storing original string value if any.`, e);
                                    imageValue = originalImageString || ''; // Fallback to original string or empty
                                }
                            }
                            // Construct a well-typed ImagePart
                            const imagePart: ImagePart = { type: 'image', image: imageValue };
                            if (typeof part.mimeType === 'string') { 
                              imagePart.mimeType = part.mimeType;
                            }
                            console.log(`[API Chat Save User Msg] Created ImagePart:`, imagePart);
                            return imagePart;

                        } else if (part.type === 'text' && typeof part.text === 'string') {
                            console.log(`[API Chat Save User Msg] Found TextPart at index ${index}:`, part.text);
                            // Construct a well-typed TextPart
                            return { type: 'text', text: part.text } as TextPart;
                        }
                        // Log and filter out unknown/malformed parts
                        console.warn(`[API Chat Save User Msg] Unrecognized or malformed part type: ${part.type}. Skipping this part. Part:`, part);
                        return null; 
                    })
                    .filter(p => p !== null) as Array<TextPart | ImagePart>; // Explicitly type the filtered array

                console.log("[API Chat Save User Msg] Processed contentForDb after filtering:", contentForDb);

                // If contentForDb is empty after filtering and clientContent had parts, it means all parts were unrecognized.
                if (clientContent.length > 0 && contentForDb.length === 0) {
                    console.warn("[API Chat Save User Msg] All message parts were unrecognized or malformed. Saving as single empty text part.");
                    contentForDb = [{ type: 'text', text: '' }];
                }

            } else {
                 console.warn("[API Chat Save User Msg] User message content is not a string or array. Saving as single empty text part. Content:", clientContent);
                 contentForDb = [{type: 'text', text: ''}]; // Default to empty text part
            }
            
            // === CRITICAL: Check if we need to add ImagePart from requestData ===
            console.log("=== [API Chat Save User Msg] CHECKING FOR UPLOADED IMAGE ===");
            console.log("[API Chat Save User Msg] uploadedImagePath from requestData:", uploadedImagePath);
            console.log("[API Chat Save User Msg] firstImageContentType from requestData:", firstImageContentType);
            console.log("[API Chat Save User Msg] firstImageSignedUrl from requestData:", firstImageSignedUrl);
            console.log("[API Chat Save User Msg] Current contentForDb before adding uploaded image:", contentForDb);
            
            // IMPLEMENTATION: Add ImagePart for uploaded image if present
            // Priority 1: Use uploadedImagePath (clean storage path) if available
            // Priority 2: Fall back to firstImageSignedUrl if uploadedImagePath is missing
            if (uploadedImagePath) {
                console.log("✅ [API Chat Save User Msg] Processing uploaded image using uploadedImagePath...");
                
                // Check if we already added this image (by matching path)
                const imageAlreadyAdded = contentForDb.some(
                    part => part.type === 'image' && part.image === uploadedImagePath
                );
                
                if (!imageAlreadyAdded) {
                    // Create the ImagePart with clean storage path
                    const uploadedImagePart: ImagePart = {
                        type: 'image',
                        image: uploadedImagePath
                    };
                    
                    // Add mimeType if available
                    if (firstImageContentType) {
                        uploadedImagePart.mimeType = firstImageContentType;
                    }
                    
                    console.log("[API Chat Save User Msg] Created ImagePart for uploaded image:", uploadedImagePart);
                    
                    // Cast contentForDb to mutable array for push operation
                    const mutableContentForDb = contentForDb as Array<TextPart | ImagePart>;
                    mutableContentForDb.push(uploadedImagePart);
                    contentForDb = mutableContentForDb;
                    console.log("✅ [API Chat Save User Msg] Added uploaded ImagePart to contentForDb");
                } else {
                    console.log("[API Chat Save User Msg] Image already exists in contentForDb, skipping duplicate");
                }
            } else if (firstImageSignedUrl && typeof firstImageSignedUrl === 'string') {
                console.log("✅ [API Chat Save User Msg] Processing uploaded image using firstImageSignedUrl fallback...");
                
                // Extract storage path from the signed URL as fallback
                try {
                    const signedUrl = new URL(firstImageSignedUrl);
                    const pathSegments = signedUrl.pathname.split('/');
                    const bucketName = 'message-images';
                    const bucketIndex = pathSegments.findIndex(segment => segment === bucketName);
                    
                    let imageValueForDb = firstImageSignedUrl; // Default to signed URL
                    if (bucketIndex !== -1 && bucketIndex < pathSegments.length - 1) {
                        imageValueForDb = pathSegments.slice(bucketIndex + 1).join('/');
                        console.log("[API Chat Save User Msg] Extracted storage path from signed URL:", imageValueForDb);
                    }
                    
                    // Check for duplicates
                    const imageAlreadyAdded = contentForDb.some(
                        part => part.type === 'image' && part.image === imageValueForDb
                    );
                    
                    if (!imageAlreadyAdded) {
                        const uploadedImagePart: ImagePart = {
                            type: 'image',
                            image: imageValueForDb
                        };
                        
                        if (firstImageContentType) {
                            uploadedImagePart.mimeType = firstImageContentType;
                        }
                        
                        console.log("[API Chat Save User Msg] Created ImagePart from signed URL:", uploadedImagePart);
                        
                        const mutableContentForDb = contentForDb as Array<TextPart | ImagePart>;
                        mutableContentForDb.push(uploadedImagePart);
                        contentForDb = mutableContentForDb;
                        console.log("✅ [API Chat Save User Msg] Added ImagePart from signed URL to contentForDb");
                    } else {
                        console.log("[API Chat Save User Msg] Image already exists in contentForDb, skipping duplicate");
                    }
                } catch (urlError) {
                    console.warn("[API Chat Save User Msg] Failed to parse firstImageSignedUrl, skipping image:", urlError);
                }
            } else {
                console.log("[API Chat Save User Msg] No uploaded image found in request data (missing both uploadedImagePath and firstImageSignedUrl)");
            }
            
            // Ensure contentForDb is never just a string (it should be an array by now, but double check)
            // And if it somehow became an empty array AND original clientContent was just a string, re-create from string.
            if (contentForDb.length === 0 && typeof clientContent === 'string' && clientContent.trim() !== '') {
                 console.log("[API Chat Save User Msg] contentForDb was empty after processing, but original content was a string. Re-populating from original string.");
                 contentForDb = [{ type: 'text', text: clientContent }];
            } else if (contentForDb.length === 0) {
                console.warn("[API Chat Save User Msg] contentForDb is empty after processing. Saving as single empty text part.");
                contentForDb = [{ type: 'text', text: '' }]; // Default to ensure it's always an array with at least one part
            }

            console.log("[API Chat Save User Msg] Final contentForDb before database insert:", JSON.stringify(contentForDb, null, 2));

            const messageToInsert = {
                document_id: documentId,
                user_id: userId,
                role: 'user' as const,
                content: contentForDb, // This should be Array<TextPart | ImagePart | ...>
                // image_url: null, // Explicitly nullify as per refactor plan (image info is in content.parts)
                metadata: lastClientMessageForSave.metadata || requestData.inputMethod ? { input_method: requestData.inputMethod, ...(lastClientMessageForSave.metadata || {}) } : null,
            };

            console.log("[API Chat Save User Msg] Message object for DB:", JSON.stringify(messageToInsert, null, 2));

            console.log("[API Chat Save User Msg] Attempting database insertion...");
            const { data: savedMessage, error: insertError } = await supabase
                .from('messages')
                .insert(messageToInsert)
                .select()
                .single();

            if (insertError) {
                console.error('[API Chat Save User Msg] Error saving user message:', insertError.message, insertError.details, insertError.hint);
                console.error('[API Chat Save User Msg] Full insert error object:', insertError);
                // Optionally, decide if this error should abort the AI call or just be logged
            } else {
                console.log('[API Chat Save User Msg] User message saved successfully. ID:', savedMessage?.id);
                console.log('[API Chat Save User Msg] Saved message data from DB:', JSON.stringify(savedMessage, null, 2));
                
                // Verify the content was saved correctly
                if (savedMessage?.content) {
                    console.log('[API Chat Save User Msg] Verification - Content saved to DB:');
                    if (Array.isArray(savedMessage.content)) {
                        savedMessage.content.forEach((part: any, index: number) => {
                            console.log(`  - Part ${index}: type=${part.type}, hasImage=${!!part.image}, hasText=${!!part.text}`);
                        });
                    } else {
                        console.log('  - Content is not an array:', typeof savedMessage.content);
                    }
                }
                // Update the originalClientMessages array with the saved message ID and created_at from DB?
                // This might be complex if originalClientMessages is already passed to the AI stream.
                // For now, just log success. The client should refetch or get messages via subscription.
            }

        } catch (e: any) {
            console.error('[API Chat Save User Msg] Unexpected error trying to save user message:', e.message, e.stack);
        }
    }
    // --- END: Save User Message ---

    const modelId = typeof modelIdFromData === 'string' && modelIdFromData in modelProviders
        ? modelIdFromData
        : defaultModelId;
    const getModelProvider = modelProviders[modelId];
    const aiModel = getModelProvider();

    let webSearchCallCount = 0;
    const WEB_SEARCH_RATE_LIMIT_MS = 2000;
    const rateLimitedWebSearch = tool({
        description: webSearch.description,
        parameters: webSearch.parameters,
        execute: async (args, options) => {
            if (taskHint === 'summarize_and_cite_outline') {
                if (webSearchCallCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, WEB_SEARCH_RATE_LIMIT_MS));
                }
                webSearchCallCount++;
            }
            return webSearch.execute ? await webSearch.execute(args, options) : { error: 'Original execute function not found' };
        }
    });
    const combinedToolsWithRateLimit = {
        ...editorTools,
        webSearch: rateLimitedWebSearch,
        searchAndTagDocumentsTool: searchAndTagDocumentsTool,
    };

    // --- REFACTORED MESSAGE PREPARATION ---
    const finalMessagesForStreamText: CoreMessage[] = [];

    // 1. Add System Prompt(s)
    finalMessagesForStreamText.push({
        role: 'system',
        content: taskHint === 'summarize_and_cite_outline'
            ? systemPrompt + summarizationStrategyPrompt
            : systemPrompt
    });

    // 2. Add Tagged Documents Context (if available)
    let taggedDocumentsContentString: string = '';
    if (Array.isArray(taggedDocumentIds) && taggedDocumentIds.length > 0) {
        try {
            const { data: taggedDocs, error: fetchError } = await supabase.from('documents').select('id, name, searchable_content').in('id', taggedDocumentIds).throwOnError();
            if (fetchError) console.error('[API Chat] Error fetching tagged documents:', fetchError);
            else if (taggedDocs && taggedDocs.length > 0) {
                taggedDocumentsContentString = taggedDocs.map(doc => `[Content from document: ${doc.name}]\n${doc.searchable_content || ''}`).join('\n---\n');
            }
        } catch (error) { console.error('[API Chat] Unexpected error fetching tagged docs:', error); }

        if (taggedDocumentsContentString) {
            finalMessagesForStreamText.push({
                role: 'system', 
                content: `[Tagged Document Context]\n${taggedDocumentsContentString}`
            });
            console.log('[API Chat] Added tagged documents context message.');
        }
    }

    // 3. Add Conversation Summary Context (if available)
    let abstractSummaryVal = '';
    let extractiveSummaryVal = '';
     try {
        const { data: docData, error: fetchDocError } = await supabase.from('documents').select('abstract_summary, extractive_summary').eq('id', documentId).single();
        if (fetchDocError) console.error('[API Chat Summary Context] Error fetching doc summaries:', fetchDocError);
        else if (docData) { abstractSummaryVal = docData.abstract_summary || ''; extractiveSummaryVal = docData.extractive_summary || ''; }
    } catch (error) { console.error('[API Chat Summary Context] Unexpected error fetching summaries:', error); }

    if (abstractSummaryVal || extractiveSummaryVal) {
        let summaryContent = '[Conversation Summary]\n';
        if (abstractSummaryVal) summaryContent += `Abstract: ${abstractSummaryVal}\n`;
        if (extractiveSummaryVal) summaryContent += `Extractive:\n${extractiveSummaryVal}\n`;
        finalMessagesForStreamText.push({ role: 'system', content: summaryContent });
        console.log('[API Chat Summary Context] Added conversation summary context message.');
    }

    // 4. Prepare and Convert Client Message History
    // Use a mutable copy for potential modification (e.g. adding image to last user message)
    const historyToConvert: ClientMessage[] = JSON.parse(JSON.stringify(originalClientMessages)); 

    console.log("=== [API Chat] IMAGE FOR AI PROCESSING START ===");
    let finalImageSignedUrlForConversion: URL | undefined = undefined;
    let imagePartForAI: ImagePart | null = null;
    
    if (typeof firstImageSignedUrl === 'string' && firstImageSignedUrl.trim() !== '') {
        console.log('[API Chat Image Processing] Processing image for AI consumption...');
        console.log('  - Input firstImageSignedUrl:', firstImageSignedUrl);
        console.log('  - firstImageSignedUrl type:', typeof firstImageSignedUrl);
        console.log('  - firstImageSignedUrl length:', firstImageSignedUrl.length);
        console.log('  - Timestamp:', new Date().toISOString());
        console.log('  - Document ID:', documentId);
        console.log('  - User ID:', userId);
        
        try {
            console.log('[API Chat Image Processing] Attempting to parse signed URL...');
            finalImageSignedUrlForConversion = new URL(firstImageSignedUrl);
            console.log('✅ [API Chat Image Processing] Successfully parsed signed URL');
            console.log('  - Parsed URL hostname:', finalImageSignedUrlForConversion.hostname);
            console.log('  - Parsed URL pathname:', finalImageSignedUrlForConversion.pathname);
            console.log('  - Parsed URL search params:', finalImageSignedUrlForConversion.search);
        } catch (e) {
            console.error('❌ [API Chat Image Processing] Failed to parse signed URL:', e);
            console.error(`  - Invalid URL provided: ${firstImageSignedUrl}`);
            console.error('  - Error type:', e instanceof Error ? e.constructor.name : typeof e);
            console.error('  - Error message:', e instanceof Error ? e.message : String(e));
            finalImageSignedUrlForConversion = undefined;
        }
        
        // === ENHANCED: Fetch image and convert to base64 ===
        if (finalImageSignedUrlForConversion) {
            console.log('[API Chat Image Processing] Starting image fetch and base64 conversion...');
            
            try {
                console.log('[API Chat Image Processing] Fetching image from signed URL...');
                console.log('  - Fetch URL:', finalImageSignedUrlForConversion.toString());
                console.log('  - Fetch start time:', new Date().toISOString());
                
                const imageResponse = await fetch(finalImageSignedUrlForConversion.toString());
                
                console.log('[API Chat Image Processing] Image fetch response received');
                console.log('  - Response status:', imageResponse.status);
                console.log('  - Response statusText:', imageResponse.statusText);
                console.log('  - Response ok:', imageResponse.ok);
                console.log('  - Response headers content-type:', imageResponse.headers.get('content-type'));
                console.log('  - Response headers content-length:', imageResponse.headers.get('content-length'));
                console.log('  - Fetch complete time:', new Date().toISOString());
                
                if (!imageResponse.ok) {
                    console.error('❌ [API Chat Image Processing] Image fetch failed');
                    console.error('  - Status code:', imageResponse.status);
                    console.error('  - Status text:', imageResponse.statusText);
                    console.error('  - Response URL:', imageResponse.url);
                    throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
                }
                
                console.log('[API Chat Image Processing] Converting response to ArrayBuffer...');
                const imageArrayBuffer = await imageResponse.arrayBuffer();
                console.log('✅ [API Chat Image Processing] Image fetched successfully');
                console.log('  - Image size (bytes):', imageArrayBuffer.byteLength);
                console.log('  - Image size (KB):', Math.round(imageArrayBuffer.byteLength / 1024 * 100) / 100);
                console.log('  - ArrayBuffer conversion time:', new Date().toISOString());
                
                // Convert to base64
                console.log('[API Chat Image Processing] Converting ArrayBuffer to base64...');
                const base64 = Buffer.from(imageArrayBuffer).toString('base64');
                console.log('✅ [API Chat Image Processing] Base64 conversion successful');
                console.log('  - Base64 length:', base64.length);
                console.log('  - Base64 size (KB):', Math.round(base64.length / 1024 * 100) / 100);
                console.log('  - Base64 prefix (first 50 chars):', base64.substring(0, 50));
                console.log('  - Base64 conversion time:', new Date().toISOString());
                
                // Determine MIME type from response or fallback to jpeg
                const contentType = imageResponse.headers.get('content-type') || firstImageContentType || 'image/jpeg';
                console.log('[API Chat Image Processing] Setting up image part for AI');
                console.log('  - Detected/fallback MIME type:', contentType);
                
                // Create image part with base64 data URL format
                const base64DataUrl = `data:${contentType};base64,${base64}`;
                imagePartForAI = { 
                    type: 'image', 
                    image: base64DataUrl 
                };
                
                console.log('✅ [API Chat Image Processing] Image part created for AI');
                console.log('  - Data URL prefix:', base64DataUrl.substring(0, 100));
                console.log('  - Total data URL size (KB):', Math.round(base64DataUrl.length / 1024 * 100) / 100);
                
            } catch (error) {
                console.error('❌ [API Chat Image Processing] Error processing image for AI:', error);
                console.error('  - Error type:', error instanceof Error ? error.constructor.name : typeof error);
                console.error('  - Error message:', error instanceof Error ? error.message : String(error));
                console.error('  - Error stack:', error instanceof Error ? error.stack : 'No stack available');
                console.error('  - Error time:', new Date().toISOString());
                
                console.log('[API Chat Image Processing] Falling back to URL method for image...');
                // Fall back to URL method, but with better error handling
                try {
                    imagePartForAI = { 
                        type: 'image', 
                        image: finalImageSignedUrlForConversion.toString() 
                    };
                    console.log('✅ [API Chat Image Processing] Fallback to URL method successful');
                    console.log('  - Using image URL:', finalImageSignedUrlForConversion.toString());
                } catch (fallbackError) {
                    console.error('❌ [API Chat Image Processing] Fallback to URL method also failed:', fallbackError);
                    imagePartForAI = null;
                }
            }
        }
    } else {
        console.log('[API Chat Image Processing] No image URL provided for AI processing');
        console.log('  - firstImageSignedUrl value:', firstImageSignedUrl);
        console.log('  - firstImageSignedUrl type:', typeof firstImageSignedUrl);
    }
    console.log("=== [API Chat] IMAGE FOR AI PROCESSING END ===");

    const slicedHistoryToConvert = historyToConvert.length > 10 ? historyToConvert.slice(-10) : historyToConvert;
    
    if (slicedHistoryToConvert.length > 0) {
        // === DEBUG: Log historyToConvert before conversion ===
        console.log("=== [API Chat] PRE-CONVERSION DEBUG START ===");
        console.log("[API Chat] slicedHistoryToConvert before convertToCoreMessages:");
        console.log("  - Length:", slicedHistoryToConvert.length);
        
        // Debug the last message in historyToConvert (most likely to have image)
        const lastHistoryMsg = slicedHistoryToConvert[slicedHistoryToConvert.length - 1];
        if (lastHistoryMsg) {
            console.log("[API Chat] Last message in historyToConvert:");
            console.log("  - Role:", lastHistoryMsg.role);
            console.log("  - Content type:", typeof lastHistoryMsg.content);
            console.log("  - Content is array:", Array.isArray(lastHistoryMsg.content));
            
            if (Array.isArray(lastHistoryMsg.content)) {
                console.log("  - Content parts count:", lastHistoryMsg.content.length);
                lastHistoryMsg.content.forEach((part, idx) => {
                    console.log(`    Part ${idx}: type=${part.type}, hasImage=${!!part.image}, hasText=${!!part.text}`);
                    if (part.type === 'image' && part.image) {
                        const imageValue = typeof part.image === 'string' ? part.image : part.image.toString();
                        console.log(`      Image info: format=${imageValue.startsWith('data:') ? 'base64' : 'url'}, length=${imageValue.length}`);
                    }
                });
            } else {
                console.log("  - String content preview:", typeof lastHistoryMsg.content === 'string' ? lastHistoryMsg.content.substring(0, 100) : 'not-string');
            }
        }
        console.log("=== [API Chat] PRE-CONVERSION DEBUG END ===");
        
        // Cast to `any` to satisfy convertToCoreMessages if ClientMessage is not perfectly aligned with internal VercelAIMessage
        const convertedHistoryMessages = convertToCoreMessages(slicedHistoryToConvert as any);
        
        // === DEBUG: Log results after conversion ===
        console.log("=== [API Chat] POST-CONVERSION DEBUG START ===");
        console.log("[API Chat] convertedHistoryMessages after convertToCoreMessages:");
        console.log("  - Length:", convertedHistoryMessages.length);
        
        // Debug the last converted message
        const lastConvertedMsg = convertedHistoryMessages[convertedHistoryMessages.length - 1];
        if (lastConvertedMsg) {
            console.log("[API Chat] Last converted message:");
            console.log("  - Role:", lastConvertedMsg.role);
            console.log("  - Content type:", typeof lastConvertedMsg.content);
            console.log("  - Content is array:", Array.isArray(lastConvertedMsg.content));
            
            if (Array.isArray(lastConvertedMsg.content)) {
                console.log("  - Content parts count:", lastConvertedMsg.content.length);
                lastConvertedMsg.content.forEach((part, idx) => {
                    console.log(`    Part ${idx}: type=${part.type}, hasImage=${!!(part as any).image}, hasText=${!!(part as any).text}`);
                    if (part.type === 'image' && (part as any).image) {
                        const imagePart = part as any;
                        const imageValue = typeof imagePart.image === 'string' ? imagePart.image : imagePart.image.toString();
                        console.log(`      Image info: format=${imageValue.startsWith('data:') ? 'base64' : 'url'}, length=${imageValue.length}`);
                    }
                });
            } else {
                console.log("  - String content preview:", typeof lastConvertedMsg.content === 'string' ? lastConvertedMsg.content.substring(0, 100) : 'not-string');
            }
        }
        console.log("=== [API Chat] POST-CONVERSION DEBUG END ===");
        
        finalMessagesForStreamText.push(...convertedHistoryMessages);
        console.log(`[API Chat] Added ${convertedHistoryMessages.length} converted history messages.`);
        
        // === CRITICAL FIX: Add image to the last user message AFTER conversion ===
        if (imagePartForAI && convertedHistoryMessages.length > 0) {
            const lastConvertedIndex = finalMessagesForStreamText.length - 1;
            const lastConvertedMessage = finalMessagesForStreamText[lastConvertedIndex];
            
            if (lastConvertedMessage?.role === 'user') {
                console.log('🔧 [API Chat Image Fix] Adding image to last converted message...');
                console.log('  - Last message index in final array:', lastConvertedIndex);
                console.log('  - Current content type:', typeof lastConvertedMessage.content);
                console.log('  - Current content is array:', Array.isArray(lastConvertedMessage.content));
                
                // Extract text content from the converted message
                let userTextContent = '';
                if (typeof lastConvertedMessage.content === 'string') {
                    userTextContent = lastConvertedMessage.content;
                } else if (Array.isArray(lastConvertedMessage.content)) {
                    const textPart = lastConvertedMessage.content.find(part => part.type === 'text');
                    userTextContent = textPart && 'text' in textPart ? (textPart as any).text : '';
                }
                
                // Replace the content with multimodal array
                finalMessagesForStreamText[lastConvertedIndex] = {
                    ...lastConvertedMessage,
                    content: [
                        { type: 'text', text: userTextContent },
                        imagePartForAI
                    ]
                };
                
                console.log('✅ [API Chat Image Fix] Successfully added image to last converted message');
                console.log('  - Final message content parts:', finalMessagesForStreamText[lastConvertedIndex].content.length);
                console.log('  - Text part length:', userTextContent.length);
                console.log('  - Image part type:', imagePartForAI.type);
                const imageValue = typeof imagePartForAI.image === 'string' ? imagePartForAI.image : imagePartForAI.image?.toString() || '';
                console.log('  - Image data method:', imageValue.startsWith('data:') ? 'base64' : 'url');
            } else {
                console.warn('⚠️ [API Chat Image Fix] Last converted message is not a user message - cannot add image');
                console.warn('  - Last message role:', lastConvertedMessage?.role);
            }
        } else if (imagePartForAI) {
            console.warn('⚠️ [API Chat Image Fix] Have image part but no converted messages to attach to');
        } else {
            console.log('[API Chat Image Fix] No image part to add - skipping image fix');
        }
    }

    // 5. Add Editor Blocks Context (if provided) - Injected before the last user message from history
    if (Array.isArray(editorBlocksContext) && editorBlocksContext.length > 0) {
        const isValidContext = editorBlocksContext.every(block =>
            typeof block === 'object' && block !== null && 'id' in block && 'contentSnippet' in block
        );
        if (isValidContext) {
            const contextString = JSON.stringify(editorBlocksContext, null, 2);
            const editorContextCoreMessage: CoreMessage = {
                role: 'user', 
                content: `[Editor Context]\nCurrent editor block context (use IDs to target blocks):\n\`\`\`json\n${contextString}\n\`\`\``
            };

            let lastUserMessageIdx = -1;
            for (let i = finalMessagesForStreamText.length - 1; i >= 0; i--) {
                if (finalMessagesForStreamText[i].role === 'user') {
                    lastUserMessageIdx = i;
                    break;
                }
            }
            if (lastUserMessageIdx !== -1) {
                finalMessagesForStreamText.splice(lastUserMessageIdx, 0, editorContextCoreMessage);
            } else {
                const firstHistoryMsgIndex = finalMessagesForStreamText.findIndex(msg => msg.role !== 'system');
                finalMessagesForStreamText.splice(firstHistoryMsgIndex !== -1 ? firstHistoryMsgIndex : finalMessagesForStreamText.length, 0, editorContextCoreMessage);
            }
            console.log("[API Chat] Added structured editor context to messages.");
        } else {
            console.warn("[API Chat] Received editorBlocksContext, but it had an invalid structure.");
        }
    }
    // --- END REFACTORED MESSAGE PREPARATION ---

    const generationConfig: any = {};

    console.log(`[API Chat] Calling streamText with ${finalMessagesForStreamText.length} prepared messages. Last message role: ${finalMessagesForStreamText[finalMessagesForStreamText.length - 1]?.role}`);
    
    // === ENHANCED MESSAGE STRUCTURE VALIDATION ===
    console.log("=== [API Chat] FINAL MESSAGE VALIDATION START ===");
    console.log("[API Chat] Validating final message structure before sending to AI...");
    console.log("  - Total messages:", finalMessagesForStreamText.length);
    console.log("  - Validation timestamp:", new Date().toISOString());
    
    // Validate each message in the final payload
    finalMessagesForStreamText.forEach((message, index) => {
        console.log(`[API Chat Validation] Message ${index}:`);
        console.log(`  - Role: ${message.role}`);
        console.log(`  - Content type: ${typeof message.content}`);
        console.log(`  - Content is array: ${Array.isArray(message.content)}`);
        
        if (Array.isArray(message.content)) {
            console.log(`  - Content parts count: ${message.content.length}`);
            message.content.forEach((part, partIndex) => {
                console.log(`    Part ${partIndex}:`);
                console.log(`      - Type: ${part.type}`);
                
                if (part.type === 'text') {
                    const textPart = part as any;
                    console.log(`      - Text length: ${textPart.text?.length || 0}`);
                    console.log(`      - Text preview: ${textPart.text?.substring(0, 50) || 'empty'}...`);
                    
                    // Validate text part structure
                    if (!textPart.text || typeof textPart.text !== 'string') {
                        console.warn(`      ⚠️ WARNING: Text part has invalid or missing text property`);
                    }
                } else if (part.type === 'image') {
                    const imagePart = part as any;
                    console.log(`      - Image type: ${typeof imagePart.image}`);
                    console.log(`      - Image value length: ${imagePart.image?.length || 0}`);
                    
                    if (imagePart.image?.startsWith('data:')) {
                        console.log(`      - Image format: base64 data URL`);
                        const mimeMatch = imagePart.image.match(/^data:([^;]+);base64,/);
                        if (mimeMatch) {
                            console.log(`      - MIME type: ${mimeMatch[1]}`);
                            const base64Data = imagePart.image.split(',')[1];
                            console.log(`      - Base64 data length: ${base64Data?.length || 0}`);
                            console.log(`      - Estimated image size (KB): ${Math.round((base64Data?.length || 0) * 0.75 / 1024 * 100) / 100}`);
                            
                            // Validate base64 data format
                            if (!base64Data || base64Data.length === 0) {
                                console.error(`      ❌ ERROR: Base64 data is empty or invalid`);
                            } else {
                                try {
                                    // Test if it's valid base64
                                    Buffer.from(base64Data, 'base64');
                                    console.log(`      ✅ Base64 data format is valid`);
                                } catch (e) {
                                    console.error(`      ❌ ERROR: Invalid base64 data format:`, e);
                                }
                            }
                        } else {
                            console.error(`      ❌ ERROR: Invalid data URL format - missing MIME type`);
                        }
                    } else if (imagePart.image?.startsWith('http')) {
                        console.log(`      - Image format: URL`);
                        console.log(`      - Image URL: ${imagePart.image}`);
                        
                        // Validate URL format
                        try {
                            new URL(imagePart.image);
                            console.log(`      ✅ Image URL format is valid`);
                        } catch (e) {
                            console.error(`      ❌ ERROR: Invalid URL format:`, e);
                        }
                    } else {
                        console.error(`      ❌ ERROR: Image part has unrecognized format`);
                        console.error(`      - Image value: ${imagePart.image?.substring(0, 100)}...`);
                    }
                    
                    // Validate image part structure
                    if (!imagePart.image) {
                        console.error(`      ❌ ERROR: Image part has missing image property`);
                    }
                } else {
                    console.log(`      - Other part type: ${part.type}`);
                    console.log(`      - Part keys:`, Object.keys(part));
                }
            });
        } else if (typeof message.content === 'string') {
            console.log(`  - String content length: ${message.content.length}`);
            console.log(`  - String content preview: ${message.content.substring(0, 100)}...`);
        } else {
            console.warn(`  ⚠️ WARNING: Unexpected content type: ${typeof message.content}`);
        }
        
        console.log(`  - Message validation complete for index ${index}`);
    });
    
    // Special validation for the last user message (most likely to have images)
    const lastMessage = finalMessagesForStreamText[finalMessagesForStreamText.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
        console.log("[API Chat Validation] DETAILED LAST MESSAGE ANALYSIS:");
        console.log("  - Last message role:", lastMessage.role);
        console.log("  - Content structure:", Array.isArray(lastMessage.content) ? 'multipart array' : 'single content');
        
        if (Array.isArray(lastMessage.content)) {
            const textParts = lastMessage.content.filter(part => part.type === 'text');
            const imageParts = lastMessage.content.filter(part => part.type === 'image');
            
            console.log("  - Text parts count:", textParts.length);
            console.log("  - Image parts count:", imageParts.length);
            
            if (imageParts.length > 0) {
                console.log("  ✅ MULTIMODAL MESSAGE DETECTED:");
                imageParts.forEach((imagePart, idx) => {
                    const imgPart = imagePart as any;
                    console.log(`    Image ${idx}:`);
                    console.log(`      - Format: ${imgPart.image?.startsWith('data:') ? 'base64' : 'URL'}`);
                    console.log(`      - Size estimate: ${imgPart.image?.length ? Math.round(imgPart.image.length / 1024) + 'KB' : 'unknown'}`);
                });
            }
            
            // Check for potential multimodal format issues
            if (textParts.length === 0 && imageParts.length > 0) {
                console.warn("  ⚠️ WARNING: Message has images but no text content");
            }
        }
    }
    
    console.log("=== [API Chat] FINAL MESSAGE VALIDATION END ===");
    
    console.log("[API Chat] Final messages payload for AI SDK:", JSON.stringify(finalMessagesForStreamText, null, 2));
    const lastMessageForLog = finalMessagesForStreamText[finalMessagesForStreamText.length - 1];
    if (lastMessageForLog) {
        console.log("[API Chat] Content of LAST message being sent to AI SDK (Role: " + lastMessageForLog.role + "):", 
            typeof lastMessageForLog.content === 'string' ? lastMessageForLog.content : JSON.stringify(lastMessageForLog.content)
        );
    } else {
        console.log("[API Chat] No messages found to send to AI SDK.");
    }

    console.log("[API Chat] About to call streamText with model:", modelId);
    console.log("[API Chat] Tool configuration:", { addContent: !!editorTools.addContent });
    console.log("[API Chat] editorTools.addContent:", editorTools.addContent);
    
    const result = streamText({
        model: aiModel,
        messages: finalMessagesForStreamText,
        tools: { addContent: editorTools.addContent }, // TESTING: Enable only addContent tool
        maxSteps: 10,
        ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
        
        // Add detailed logging for tool execution
        onStepFinish({ response, finishReason, usage, warnings }) {
            console.log("[API Chat onStepFinish] Step completed:");
            console.log("  - Finish reason:", finishReason);
            console.log("  - Usage:", usage);
            console.log("  - Warnings:", warnings);
            console.log("  - Response messages count:", response.messages?.length || 0);
            
            // Log response messages details
            if (response.messages?.length > 0) {
                console.log("[API Chat onStepFinish] Response messages:");
                response.messages.forEach((msg: any, index: number) => {
                    console.log(`    Message ${index}:`);
                    console.log(`      - Role: ${msg.role}`);
                    console.log(`      - Content type:`, typeof msg.content);
                    
                    if (Array.isArray(msg.content)) {
                        msg.content.forEach((part: any, partIndex: number) => {
                            console.log(`        Part ${partIndex}: ${part.type}`);
                            if (part.type === 'tool-call') {
                                console.log(`          Tool: ${part.toolName} (ID: ${part.toolCallId})`);
                                console.log(`          Args:`, JSON.stringify(part.args, null, 2));
                            } else if (part.type === 'tool-result') {
                                console.log(`          Tool Result ID: ${part.toolCallId}`);
                                console.log(`          Result:`, JSON.stringify(part.result, null, 2));
                            }
                        });
                    }
                });
            }
        },
        
        async onFinish({ usage, response }) {
            console.log(`[onFinish] Stream finished. Usage: ${JSON.stringify(usage)}`);
            const assistantMetadata = { usage: usage, raw_content: response.messages };
            const allResponseMessages: CoreMessage[] = response.messages;
            if (!userId) {
                console.error("[onFinish] Cannot save messages: User ID somehow became unavailable.");
                return;
            }
            if (allResponseMessages.length === 0) {
                console.log("[onFinish] No response messages from AI to process.");
                return;
            }
            let finalAssistantTurn = {
                accumulatedParts: [] as Array<TextPart | ToolCallPart>,
                metadata: assistantMetadata,
                toolResults: {} as { [toolCallId: string]: any },
                hasData: false
            };
             for (const message of allResponseMessages) {
                if (message.role === 'assistant') {
                    finalAssistantTurn.hasData = true;
                    let assistantParts: Array<TextPart | ToolCallPart> = [];
                    if (typeof message.content === 'string') {
                        if (message.content.trim()) assistantParts.push({ type: 'text', text: message.content.trim() });
                    } else if (Array.isArray(message.content)) {
                        // Explicitly type part here for the filter callback
                        assistantParts = message.content.filter((part: any): part is TextPart | ToolCallPart => part.type === 'text' || part.type === 'tool-call');
                    }
                    finalAssistantTurn.accumulatedParts.push(...assistantParts);
                } else if (message.role === 'tool') {
                    if (Array.isArray(message.content)) {
                        // Explicitly type part here for the filter callback
                        const results = message.content.filter((part: any): part is ToolResultPart => part.type === 'tool-result');
                        results.forEach(result => {
                            if (result.toolCallId) finalAssistantTurn.toolResults[result.toolCallId] = result.result;
                        });
                    }
                    // Check if message.content exists and is an array before checking its length
                    if(message.content && Array.isArray(message.content) && message.content.length > 0) finalAssistantTurn.hasData = true; 
                }
            }
            if (finalAssistantTurn.hasData) {
                const partsWithResults = finalAssistantTurn.accumulatedParts.map(part => {
                    if (part.type === 'tool-call' && finalAssistantTurn.toolResults.hasOwnProperty(part.toolCallId)) {
                        return { ...part, result: finalAssistantTurn.toolResults[part.toolCallId] };
                    }
                    return part;
                });
                const messageData = { document_id: documentId, user_id: userId!, role: 'assistant' as const, content: partsWithResults, metadata: finalAssistantTurn.metadata } as any;
                const { data: savedMsgData, error: msgError } = await supabase.from('messages').insert(messageData).select('id').single();
                if (msgError || !savedMsgData?.id) console.error(`[onFinish SaveTurn] Error saving accumulated assistant message:`, msgError);
                else console.log(`[onFinish SaveTurn] Saved accumulated assistant message ID: ${savedMsgData.id}`);
            } else {
                console.log("[onFinish SaveTurn] No assistant data found in the response to save.");
            }
        }
    }); 

    console.log("[API Chat] streamText call successful, returning data stream response");
    return result.toDataStreamResponse();
}

// Define ToolInvocation type (if not already globally defined)
// This helps TypeScript understand the structure within the 'tool-invocation' part
type ToolInvocation = {
    toolCallId: string;
    toolName: string;
    args: string; // Changed from 'any' to 'string' to enforce string type
    result?: any;
};

