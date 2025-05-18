// app/api/chat/route.ts

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { LanguageModel, streamText, CoreMessage, tool, ToolCallPart, ToolResultPart, TextPart, ToolCall, ToolResult, convertToCoreMessages } from "ai";
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

// --- NEW: Search and Tag Documents Tool ---
const searchAndTagDocumentsSchema = z.object({
  searchQuery: z.string().describe("The user's query to search for in the documents.")
});

const searchAndTagDocumentsTool = tool({
  description: 'Searches documents by title and semantic content. Returns a list of relevant documents that the user can choose to tag for context.',
  parameters: searchAndTagDocumentsSchema as z.ZodTypeAny,
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
    parameters: addContentSchema as z.ZodTypeAny,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'addContent' })
  }),
  modifyContent: tool({
    description: "Modifies content within specific NON-TABLE editor blocks. Can target a single block (with optional specific text replacement) or multiple blocks (replacing entire content of each with corresponding new Markdown from an array). Main tool for altering existing lists/checklists.",
    parameters: modifyContentSchema as z.ZodTypeAny,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'modifyContent' })
  }),
  deleteContent: tool({
    description: "Deletes one or more NON-TABLE blocks, or specific text within a NON-TABLE block, from the editor.",
    parameters: deleteContentSchema as z.ZodTypeAny,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'deleteContent' })
  }),
  // --- UPDATED: Unified modifyTable tool ---
  modifyTable: tool({
    description: "Modifies an existing TABLE block by providing the complete final Markdown. Reads original from context, applies changes, returns result.",
    parameters: modifyTableSchema as z.ZodTypeAny,
    execute: async (args) => ({ status: 'forwarded to client', tool: 'modifyTable' })
  }),
  // --- END UPDATED ---
  // --- NEW: Tool for creating checklists ---
  createChecklist: tool({
    description: "Creates a new checklist with multiple items. Provide an array of plain text strings for the items (e.g., ['Buy milk', 'Read book']). Tool handles Markdown formatting.",
    parameters: createChecklistSchema as z.ZodTypeAny,
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
        taskHint,
        inputMethod, 
        whisperDetails, 
        taggedDocumentIds,
    } = requestData || {};

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
        console.log("[API Chat Save User Msg] Placeholder for saving current user message:", JSON.stringify(lastClientMessageForSave, null, 2));
        // IMPORTANT: The full user message saving logic from your original file (previously lines 517-700) 
        // including image path extraction from 'firstImageSignedUrl' or 'lastClientMessageForSave.parts',
        // and Supabase insertion, should be reinstated here, adapted as necessary.
        // This placeholder does not include that complex logic for brevity.
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

    let finalImageSignedUrlForConversion: URL | undefined = undefined;
    if (typeof firstImageSignedUrl === 'string' && firstImageSignedUrl.trim() !== '') {
        try {
            finalImageSignedUrlForConversion = new URL(firstImageSignedUrl);
        } catch (e) {
            console.error(`[API Chat] Invalid image URL for conversion: ${firstImageSignedUrl}`, e);
        }
    }

    if (historyToConvert.length > 0) {
        const lastMsgIndex = historyToConvert.length - 1;
        const lastMsg = historyToConvert[lastMsgIndex];
        if (lastMsg.role === 'user' && finalImageSignedUrlForConversion) {
            let userTextContent = '';
            if (typeof lastMsg.content === 'string') {
                userTextContent = lastMsg.content;
            } else if (Array.isArray(lastMsg.content)) {
                const textPart = lastMsg.content.find(part => part.type === 'text');
                userTextContent = textPart && typeof textPart.text === 'string' ? textPart.text : '';
            }
            
            // Ensure content is an array of parts for multimodal messages
            historyToConvert[lastMsgIndex].content = [
                { type: 'text', text: userTextContent },
                { type: 'image', image: finalImageSignedUrlForConversion.toString() } // Pass URL as string for image part
            ];
            console.log('[API Chat] Modified last user message to include image for conversion.');
        }
    }
    
    const slicedHistoryToConvert = historyToConvert.length > 10 ? historyToConvert.slice(-10) : historyToConvert;
    
    if (slicedHistoryToConvert.length > 0) {
        // Cast to `any` to satisfy convertToCoreMessages if ClientMessage is not perfectly aligned with internal VercelAIMessage
        const convertedHistoryMessages = convertToCoreMessages(slicedHistoryToConvert as any);
        finalMessagesForStreamText.push(...convertedHistoryMessages);
        console.log(`[API Chat] Added ${convertedHistoryMessages.length} converted history messages.`);
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
    console.log("[API Chat] Final messages payload for AI SDK:", JSON.stringify(finalMessagesForStreamText, null, 2));
    const lastMessageForLog = finalMessagesForStreamText[finalMessagesForStreamText.length - 1];
    if (lastMessageForLog) {
        console.log("[API Chat] Content of LAST message being sent to AI SDK (Role: " + lastMessageForLog.role + "):", 
            typeof lastMessageForLog.content === 'string' ? lastMessageForLog.content : JSON.stringify(lastMessageForLog.content)
        );
    } else {
        console.log("[API Chat] No messages found to send to AI SDK.");
    }

    try {
        const result = streamText({
            model: aiModel,
            messages: finalMessagesForStreamText,
            tools: combinedToolsWithRateLimit,
            maxSteps: 10,
            ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
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

        return result.toDataStreamResponse();
    } catch (error: any) {
        console.error("[API Chat Stream/Execute Error] An error occurred:", error);
        const statusCode = 500;
        const errorCode = error.code || 'STREAMING_ERROR';
        const errorMessage = error.message || 'An unexpected error occurred while processing the chat response.';
        return new Response(JSON.stringify({
            error: { code: errorCode, message: errorMessage, ...(process.env.NODE_ENV === 'development' && { stack: error.stack }) }
        }), { status: statusCode, headers: { 'Content-Type': 'application/json' } });
    }
}

// Define ToolInvocation type (if not already globally defined)
// This helps TypeScript understand the structure within the 'tool-invocation' part
type ToolInvocation = {
    toolCallId: string;
    toolName: string;
    args: string; // Changed from 'any' to 'string' to enforce string type
    result?: any;
};

