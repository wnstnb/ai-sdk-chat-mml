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
import { searchByTitle, searchByEmbeddings, combineAndRankResults } from '@/lib/ai/searchService';

// Define Zod schemas for the editor tools based on PRD
const addContentSchema = z.object({
  markdownContent: z.string().describe("The Markdown content to be added to the editor."),
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert relative to (e.g., insert 'after'). If null, append or use current selection."),
});

const modifyContentSchema = z.object({
  targetBlockId: z.union([z.string(), z.array(z.string())]).describe("The ID of the block (or an array of block IDs) to modify."),
  targetText: z.string().nullable().describe("The specific text within the block to modify. If null, the modification applies to the entire block's content. This is typically null when targetBlockId is an array."),
  newMarkdownContent: z.union([z.string(), z.array(z.string())]).describe("The new Markdown content. If targetBlockId is an array, this should be an array of Markdown strings of the same length, where each string corresponds to the block ID at the same index. If targetBlockId is a single string, this should be a single Markdown string."),
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

// --- NEW: Schema for creating checklists ---
const createChecklistSchema = z.object({
  items: z.array(z.string()).describe("An array of plain text strings, where each string is the content for a new checklist item. The tool will handle Markdown formatting (e.g., prepending '* [ ]'). Do NOT include Markdown like '*[ ]' in these strings."),
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert the new checklist after. If null, the checklist is appended to the document or inserted at the current selection."),
});
// --- END NEW ---

// --- NEW: Search and Tag Documents Tool ---
const searchAndTagDocumentsSchema = z.object({
  searchQuery: z.string().describe("The user's query to search for in the documents.")
});

const searchAndTagDocumentsTool = tool({
  description: 'Searches documents by title and semantic content. Returns a list of relevant documents that the user can choose to tag for context.',
  parameters: searchAndTagDocumentsSchema,
  execute: async ({ searchQuery }) => {
    // 1. Perform title-based search
    const titleMatches = await searchByTitle(searchQuery);
    // 2. Perform semantic search
    const semanticMatches = await searchByEmbeddings(searchQuery);
    // 3. Combine and rank results
    const combinedResults = combineAndRankResults(titleMatches, semanticMatches);
    // 4. Format results for the AI to present
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
  "gemini-2.5-flash-preview-04-17": () => google("gemini-2.5-flash-preview-04-17"),
  "gemini-2.5-pro-preview-05-06": () => google("gemini-2.5-pro-preview-05-06"),
  "gemini-2.0-flash": () => google("gemini-2.0-flash"),
};

// Define the default model ID
const defaultModelId = "gemini-2.0-flash";

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
                * **To convert existing text blocks to a checklist OR to change the text of existing checklist items:** When preparing \`newMarkdownContent\` for the \`modifyContent\` tool, prepend \`"* [ ] "\` (hyphen, space, brackets, space) or \`"* [ ] "\` (asterisk, space, brackets, space) to the beginning of each item's text. For example, to change an existing block with text "Existing item" into a checklist item, its corresponding entry in the \`newMarkdownContent\` array would be \`"* [ ] Existing item"\`. This format is crucial for the editor to correctly parse each line as a distinct checklist item block when using \`modifyContent\`.
                * **CRITICAL WORKFLOW (Multi-Block Modify with \`modifyContent\`):** Use a single \`modifyContent\` call to update all list items simultaneously.
                    1.  **Identify Blocks:** Use \`editorBlocksContext\` to identify the sequence of ALL individual block IDs that constitute the target list (e.g., \`[B_id1, B_id2, ..., B_idN]\`).
                    2.  **Prepare New Content for Each Block:** For EACH block ID identified in Step 1:
                        a.  Determine the original text content of that specific block.
                        b.  Construct the new Markdown for that SINGLE list item (e.g., if converting text "Apple" to a checklist item, the new Markdown for this item would be \`"* [ ] Apple"\`. If changing text of an existing checklist item, it would be \`"* [ ] New text for apple"\`).
                    3.  **Construct Content Array:** Create an array of these new Markdown strings, ensuring the order matches the order of block IDs from Step 1 (e.g., \`[new_md_for_B_id1, new_md_for_B_id2, ..., new_md_for_B_idN]\`).
                    4.  **Execute Single \`modifyContent\` Call:**
                        *   Set \`targetBlockId\` to the array of block IDs identified in Step 1.
                        *   Set \`targetText\` to \`null\` (as you are replacing entire blocks).
                        *   Set \`newMarkdownContent\` to the array of new Markdown strings constructed in Step 3.
                    *   **Result:** This will apply the corresponding new Markdown to each target block ID.
                * For nested lists, maintain the existing indentation and structure during modifications unless explicitly asked to change it. When adding new nested items, infer the correct indentation level.

            * **Tool Choices Summary for Non-Table Blocks:**
                * \`createChecklist({ items: string[], targetBlockId: string | null })\`: **Primary tool for creating new checklists with multiple items.** Provide an array of plain text strings for \`items\`; the tool handles Markdown.
                * \`addContent({ markdownContent: string, targetBlockId: string | null })\`: Adds new general Markdown content (paragraphs, headings). Also used for creating new simple bullet or numbered lists (e.g., \`markdownContent: "* Item 1\n* Item 2"\`) or adding a single list/checklist item (e.g., \`markdownContent: "* [ ] A single task"\`). **Avoid using for creating multi-item checklists; use \`createChecklist\` for that.**
                * \`modifyContent({ targetBlockId: string | string[], targetText: string | null, newMarkdownContent: string | string[] })\`: Modifies content **ONLY within NON-TABLE blocks**. This is the main tool for altering existing lists, converting items to checklists, and changing text in multiple list items at once.
                    * If \`targetBlockId\` is a single string:
                        * If \`targetText\` is provided: Performs a find-and-replace within that \`targetBlockId\` using \`newMarkdownContent\` (which must be a single string).
                        * If \`targetText\` is \`null\`: Replaces the *entire* content of that single \`targetBlockId\` with \`newMarkdownContent\` (which must be a single string).
                    * If \`targetBlockId\` is an array of strings:
                        * \`targetText\` MUST be \`null\`.
                        * \`newMarkdownContent\` MUST be an array of strings of the SAME LENGTH as \`targetBlockId\`. Each block in \`targetBlockId\` will have its entire content replaced by the Markdown string at the corresponding index in \`newMarkdownContent\`. This is the primary way to modify multiple list items at once.
                * \`deleteContent({ targetBlockId: string | string[], targetText: string | null })\`: Deletes content **ONLY from NON-TABLE blocks**. Handles whole-block deletion (\`targetText: null\`) or specific text deletion (\`targetText: 'text to delete'\`).

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
* \`modifyContent({ targetBlockId: string | string[], targetText: string | null, newMarkdownContent: string | string[] })\`: Modifies content within specific NON-TABLE editor blocks. Can target a single block (with optional specific text replacement) or multiple blocks (replacing entire content of each with corresponding new Markdown from an array). This is the primary tool for altering existing lists, converting items to checklists, and changing text in multiple list items at once.
* \`deleteContent({ targetBlockId: string | string[], targetText: string | null })\`: Deletes content **ONLY from NON-TABLE blocks**. Handles whole-block deletion (\`targetText: null\`) or specific text deletion (\`targetText: 'text to delete'\`).
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
    *   Example acknowledgment if documents are found: "Okay, I found some documents related to your query. You can see them listed below, and use the 'Tag Document' button next to each to add it to our context."
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
        uploadedImagePathFromRequest, // <-- ADD: Extract uploadedImagePath from requestData
        taggedDocumentIds, // <-- NEW: Extract taggedDocumentIds from requestData
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

    // --- NEW: Fetch searchable_content for tagged documents ---
    let taggedDocumentsContent: string = '';
    if (Array.isArray(taggedDocumentIds) && taggedDocumentIds.length > 0) {
        console.log(`[API Chat] Processing ${taggedDocumentIds.length} tagged document IDs:`, taggedDocumentIds);
        
        try {
            // Fetch documents with searchable_content and name, filtering by the IDs and ensuring user has access
            const { data: taggedDocuments, error: fetchError } = await supabase
                .from('documents')
                .select('id, name, searchable_content')
                .in('id', taggedDocumentIds)
                .throwOnError();
                
            if (fetchError) {
                console.error('[API Chat] Error fetching tagged documents:', fetchError);
                // Continue without the tagged documents instead of failing the request
            } else if (taggedDocuments && taggedDocuments.length > 0) {
                console.log(`[API Chat] Successfully fetched ${taggedDocuments.length} tagged documents`);
                
                // Format the content as specified in the PRD
                taggedDocumentsContent = taggedDocuments.map(doc => {
                    // Default to empty string if searchable_content is null, ensuring safe string operations
                    const content = doc.searchable_content || '';
                    return `[Content from document: ${doc.name}]\n${content}`;
                }).join('\n---\n');
                
                console.log('[API Chat] Prepared tagged documents content');
            } else {
                console.warn('[API Chat] No tagged documents found or user lacks access to the specified documents');
            }
        } catch (error) {
            console.error('[API Chat] Unexpected error while fetching tagged documents:', error);
            // Continue without the tagged documents instead of failing the request
        }
    }
    // --- END NEW ---

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

        // Define types for the processed parts
        interface BasePart {
          type: string;
          [key: string]: any; // Allow other properties from original part
        }
        interface TextPart extends BasePart {
          type: 'text';
          text: string;
        }
        interface ImagePartProcessed extends BasePart {
          type: 'image';
          image: string | null; // Path or null if error
          error?: string;
        }
        type ProcessedPart = TextPart | ImagePartProcessed;

        let userContentParts: ProcessedPart[] = []; // Initialize with the correct type
        let imagePartProcessed = false; // Flag to ensure only one image part is added

        // 1. Prioritize parts array IF it exists
        if (Array.isArray(lastClientMessage.parts) && lastClientMessage.parts.length > 0) {
            console.log(`[API Chat Save User Msg] Processing 'parts' array received from client.`);
            // Map and then filter
            userContentParts = lastClientMessage.parts.map((part: any): ProcessedPart | null => { // Add return type annotation to map
                 // --- REVERTED IMAGE PART LOGIC ---
                 if (part.type === 'image' && typeof part.image === 'string' && !imagePartProcessed) {
                    // Assuming part.image is the signed URL string from the client
                    console.log(`[API Chat Save User Msg] Found image part in array, attempting to extract path from URL: ${part.image}`);
                    imagePartProcessed = true; // Process only the first image part found
                    try {
                        const imageUrl = new URL(part.image);
                        // Extract path assuming Supabase storage URL structure
                        const pathSegments = imageUrl.pathname.split('/');
                        const bucketName = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents';
                        const bucketNameIndex = pathSegments.indexOf(bucketName);

                        if (bucketNameIndex !== -1 && pathSegments.length > bucketNameIndex + 1) {
                             const extractedPath = pathSegments.slice(bucketNameIndex + 1).join('/');
                             console.log(`[API Chat Save User Msg] Extracted storage path: ${extractedPath}`);
                            // Ensure the returned object conforms to ImagePartProcessed
                            return { ...part, type: 'image', image: extractedPath };
                        } else {
                             console.warn(`[API Chat Save User Msg] Could not extract valid storage path from ImagePart URL structure: ${part.image}`);
                            // Ensure the returned object conforms to ImagePartProcessed
                            return { ...part, type: 'image', image: null, error: 'Invalid image URL structure' }; // Mark as invalid
                        }
                    } catch (e) {
                        console.warn(`[API Chat Save User Msg] Failed to parse URL in ImagePart, marking as invalid:`, part.image, e);
                        // Ensure the returned object conforms to ImagePartProcessed
                        return { ...part, type: 'image', image: null, error: 'Invalid image URL' }; // Mark as invalid
                    }
                 // --- END REVERTED IMAGE PART LOGIC ---
                 } else if (part.type === 'text') {
                     // Ensure the returned object conforms to TextPart
                     return { ...part, type: 'text', text: part.text }; // Explicitly include text
                 } else {
                      console.warn(`[API Chat Save User Msg] Ignoring unexpected part type in user message parts array: ${part.type}`);
                      return null; // Ignore other unexpected parts like nested images
                 }
            // Add type annotation and type predicate to filter
            // Explicitly type the input parameter 'part' as well
            }).filter((part: ProcessedPart | null): part is ProcessedPart => part !== null); // Remove nulls and assert type

            // If parts existed but we didn't process an image (e.g., only text parts were sent),
            // ensure text content is captured if the top-level content was used.
            if (!imagePartProcessed && typeof lastClientMessage.content === 'string' && lastClientMessage.content.trim()) {
                // Explicitly type 'p' in the .some() callback
                if (!userContentParts.some((p: ProcessedPart) => p.type === 'text')) { // Avoid duplicating text if already in parts
                     console.log('[API Chat Save User Msg] Adding text from content string as parts array only had other types.');
                     // Ensure the pushed object conforms to TextPart
                     userContentParts.push({ type: 'text', text: lastClientMessage.content.trim() });
                }
            }

        }
        // 2. Fallback: If no parts array, use content string
        else if (typeof lastClientMessage.content === 'string' && lastClientMessage.content.trim()) {
            console.warn('[API Chat Save User Msg] User message parts array missing or empty, using content string.');
            // Ensure the pushed object conforms to TextPart
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
        ...editorTools, // Now includes modifyTable and createChecklist
        webSearch: rateLimitedWebSearch,
        searchAndTagDocumentsTool: searchAndTagDocumentsTool,
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

    // Add system message
    messages.push({
        role: 'system',
        content: taskHint === 'summarize_and_cite_outline'
            ? systemPrompt + summarizationStrategyPrompt
            : systemPrompt
    });

    // --- NEW: Add tagged documents context if available ---
    if (taggedDocumentsContent) {
        // Insert the tagged documents content as a user message before the last actual user message
        // This happens before the normal message processing loop, ensuring it's inserted at the right position
        const taggedDocumentsMessage: CoreMessage = {
            role: 'user',
            content: `[Tagged Document Context]\n${taggedDocumentsContent}`
        };
        
        // If the client has sent messages, insert the taggedDocumentContent before the latest one
        if (clientMessages.length > 0) {
            // Since we'll be processing the original messages below, we add this to the output array now
            messages.push(taggedDocumentsMessage);
            console.log('[API Chat] Added tagged documents context message');
        }
    }
    // --- END NEW ---

    // Process remaining messages (keeping most of the original processing logic)
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

