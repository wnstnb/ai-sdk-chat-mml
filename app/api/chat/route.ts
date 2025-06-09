// app/api/chat/route.ts

import { NextRequest } from 'next/server';
import { streamText, tool, CoreMessage, TextPart, ImagePart, ToolCallPart, ToolResultPart, convertToCoreMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import crypto from 'crypto'; // Import crypto for UUID generation
import { serverTools } from '@/lib/tools/server-tools';
import { delay } from '@/lib/utils/delay'; // Import delay function

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

// Define Zod schemas for the CLIENT-SIDE editor tools
// These will be used for client-side tool dispatching
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

const modifyTableSchema = z.object({
    tableBlockId: z.string().describe("The ID of the table block to modify."),
    newTableMarkdown: z.string().describe("The COMPLETE, final Markdown content for the entire table after the requested modifications have been applied by the AI."),
});

const createChecklistSchema = z.object({
  items: z.array(z.string()).describe("An array of plain text strings, where each string is the content for a new checklist item. The tool will handle Markdown formatting (e.g., prepending '* [ ]'). Do NOT include Markdown like '*[ ]' in these strings."),
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert the new checklist after. If null, the checklist is appended to the document or inserted at the current selection."),
});

// CLIENT-SIDE TOOL DEFINITIONS (no execute functions - dispatched to client)
const clientSideTools = {
  addContent: tool({
    description: "Adds new general Markdown content (e.g., paragraphs, headings, simple bullet/numbered lists, or single list/checklist items). For multi-item checklists, use createChecklist.",
    parameters: addContentSchema,
    // No execute function - handled client-side
  }),
  modifyContent: tool({
    description: "Modifies content within specific NON-TABLE editor blocks. Can target a single block (with optional specific text replacement) or multiple blocks (replacing entire content of each with corresponding new Markdown from an array). Main tool for altering existing lists/checklists.",
    parameters: modifyContentSchema,
    // No execute function - handled client-side
  }),
  deleteContent: tool({
    description: "Deletes one or more NON-TABLE blocks, or specific text within a NON-TABLE block, from the editor.",
    parameters: deleteContentSchema,
    // No execute function - handled client-side
  }),
  modifyTable: tool({
    description: "Modifies an existing TABLE block by providing the complete final Markdown. Reads original from context, applies changes, returns result.",
    parameters: modifyTableSchema,
    // No execute function - handled client-side
  }),
  createChecklist: tool({
    description: "Creates a new checklist with multiple items. Provide an array of plain text strings for the items (e.g., ['Buy milk', 'Read book']). Tool handles Markdown formatting.",
    parameters: createChecklistSchema,
    // No execute function - handled client-side
  }),
};

// SERVER-SIDE EDITOR TOOLS (for Gemini) - with execute functions
const serverSideEditorTools = {
  addContent: tool({
    description: "Adds new general Markdown content (e.g., paragraphs, headings, simple bullet/numbered lists, or single list/checklist items). For multi-item checklists, use createChecklist.",
    parameters: addContentSchema,
    execute: async ({ markdownContent, targetBlockId }) => {
      // Return structured instruction for frontend to execute
      return {
        action: 'addContent',
        instruction: 'Add the following content to the editor',
        markdownContent,
        targetBlockId,
        success: true,
        message: `Added content: ${markdownContent.substring(0, 50)}...`
      };
    },
  }),
  modifyContent: tool({
    description: "Modifies content within specific NON-TABLE editor blocks. Can target a single block (with optional specific text replacement) or multiple blocks (replacing entire content of each with corresponding new Markdown from an array). Main tool for altering existing lists/checklists.",
    parameters: modifyContentSchema,
    execute: async ({ targetBlockId, targetText, newMarkdownContent }) => {
      // Return structured instruction for frontend to execute
      return {
        action: 'modifyContent',
        instruction: 'Modify the specified block content',
        targetBlockId,
        targetText,
        newMarkdownContent,
        success: true,
        message: `Modified block ${targetBlockId}`
      };
    },
  }),
  deleteContent: tool({
    description: "Deletes one or more NON-TABLE blocks, or specific text within a NON-TABLE block, from the editor.",
    parameters: deleteContentSchema,
    execute: async ({ targetBlockId, targetText }) => {
      // Return structured instruction for frontend to execute
      return {
        action: 'deleteContent',
        instruction: 'Delete the specified content from editor',
        targetBlockId,
        targetText,
        success: true,
        message: `Deleted content from block ${targetBlockId}`
      };
    },
  }),
  modifyTable: tool({
    description: "Modifies an existing TABLE block by providing the complete final Markdown. Reads original from context, applies changes, returns result.",
    parameters: modifyTableSchema,
    execute: async ({ tableBlockId, newTableMarkdown }) => {
      // Return structured instruction for frontend to execute
      return {
        action: 'modifyTable',
        instruction: 'Update the table with new markdown content',
        tableBlockId,
        newTableMarkdown,
        success: true,
        message: `Updated table ${tableBlockId}`
      };
    },
  }),
  createChecklist: tool({
    description: "Creates a new checklist with multiple items. Provide an array of plain text strings for the items (e.g., ['Buy milk', 'Read book']). Tool handles Markdown formatting.",
    parameters: createChecklistSchema,
    execute: async ({ items, targetBlockId }) => {
      // Return structured instruction for frontend to execute
      return {
        action: 'createChecklist',
        instruction: 'Create a new checklist with the specified items',
        items,
        targetBlockId,
        success: true,
        message: `Created checklist with ${items.length} items`
      };
    },
  }),
};

// Define the model configuration map
const modelProviders: Record<string, () => LanguageModel> = {
    "gpt-4.1": () => openai("gpt-4.1"),
  "gpt-4o": () => openai("gpt-4o"),
  "o4-mini": () => openai("o4-mini"),
//   "gemini-2.5-flash-preview-05-20": () => google("gemini-2.5-flash-preview-05-20"),
//   "gemini-2.5-pro-preview-05-06": () => google("gemini-2.5-pro-preview-05-06"),
  "claude-3-7-sonnet-latest": () => anthropic("claude-3-7-sonnet-latest"),
  "claude-3-5-sonnet-latest": () => anthropic("claude-3-5-sonnet-latest"),
//   "gemini-2.0-flash": () => google("gemini-2.0-flash"),
};

// Define the default model ID
const defaultModelId = "gpt-4.1";

// System Prompt updated for Tool Calling, Web Search, and direct Table Markdown modification
const systemPrompt = `# SYSTEM PROMPT: Collaborative Editor AI Assistant

**IMPORTANT: When a user explicitly asks you to add, modify, or delete specific content in the editor (e.g., "add X to the document", "remove Y", "change Z to W"), you MUST use the appropriate tool to execute the action. However, for general conversation, questions about content, or unclear requests, engage naturally and ask for clarification when needed.**

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
    // No execute function - handled client-side
  }),
  modifyContent: tool({
    description: "Modifies content within specific NON-TABLE editor blocks. Can target a single block (with optional specific text replacement) or multiple blocks (replacing entire content of each with corresponding new Markdown from an array). Main tool for altering existing lists/checklists.",
    parameters: modifyContentSchema,
    // No execute function - handled client-side
  }),
  deleteContent: tool({
    description: "Deletes one or more NON-TABLE blocks, or specific text within a NON-TABLE block, from the editor.",
    parameters: deleteContentSchema,
    // No execute function - handled client-side
  }),
  // --- UPDATED: Unified modifyTable tool ---
  modifyTable: tool({
    description: "Modifies an existing TABLE block by providing the complete final Markdown. Reads original from context, applies changes, returns result.",
    parameters: modifyTableSchema,
    // No execute function - handled client-side
  }),
  // --- END UPDATED ---
  // --- NEW: Tool for creating checklists ---
  createChecklist: tool({
    description: "Creates a new checklist with multiple items. Provide an array of plain text strings for the items (e.g., ['Buy milk', 'Read book']). Tool handles Markdown formatting.",
    parameters: createChecklistSchema,
    // No execute function - handled client-side
  }),
  // --- END NEW ---
};

// Define the tools for the AI model, combining editor and web search
const combinedTools = {
  ...clientSideTools, // Client-side editor tools (no execute functions)
  ...serverTools, // Server-side tools (webSearch, searchAndTagDocumentsTool)
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

    // === ENHANCED DEBUGGING FOR DOCUMENT ID ISSUES ===
    console.log("=== [API Chat] DOCUMENT ID DEBUGGING START ===");
    console.log("[API Chat] Document ID validation:");
    console.log("  - requestData exists:", !!requestData);
    console.log("  - requestData type:", typeof requestData);
    console.log("  - requestData keys:", requestData ? Object.keys(requestData) : 'null');
    console.log("  - documentId value:", documentId);
    console.log("  - documentId type:", typeof documentId);
    console.log("  - documentId length:", typeof documentId === 'string' ? documentId.length : 'N/A');
    console.log("  - documentId truthy:", !!documentId);
    console.log("  - editorContext exists:", !!editorBlocksContext);
    console.log("  - model from data:", modelIdFromData);
    console.log("=== [API Chat] DOCUMENT ID DEBUGGING END ===");

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
        console.error("[API Chat] DocumentId validation failed:");
        console.error("  - documentId received:", JSON.stringify(documentId));
        console.error("  - documentId type:", typeof documentId);
        console.error("  - requestData received:", JSON.stringify(requestData));
        const errorMessage = `Missing or invalid documentId in request data. Received: ${JSON.stringify(documentId)} (type: ${typeof documentId})`;
        return new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: errorMessage } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
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

    // --- BEGIN: Save Last Client Message (User or Tool Result) ---
    const lastClientMessageForSave = originalClientMessages.length > 0 ? originalClientMessages[originalClientMessages.length - 1] : null;

    // We save the last message if it's from 'user' (their new input)
    // OR if it's from 'tool' (a result from a client-side tool execution).
    if (lastClientMessageForSave && (lastClientMessageForSave.role === 'user' || lastClientMessageForSave.role === 'tool')) {
        console.log(`=== [API Chat Save Msg] Saving last client message (Role: ${lastClientMessageForSave.role}) START ===`);
        console.log("[API Chat Save Msg] Last client message for save:");
        console.log("  - Message ID:", lastClientMessageForSave.id);
        console.log("  - Message role:", lastClientMessageForSave.role);
        console.log("  - Message content type:", typeof lastClientMessageForSave.content);
        console.log("  - Message content raw:", JSON.stringify(lastClientMessageForSave.content, null, 2));
        console.log("  - Message metadata:", lastClientMessageForSave.metadata);

        if (lastClientMessageForSave.role === 'user') {
            console.log("[API Chat Save Msg] Available request data for image processing (user message):");
            console.log("  - firstImageSignedUrl:", firstImageSignedUrl);
            console.log("  - typeof firstImageSignedUrl:", typeof firstImageSignedUrl);
            console.log("  - inputMethod:", inputMethod);
        }
        console.log("=== [API Chat Save Msg] DIAGNOSIS END ===");

        try {
            let contentForDb: CoreMessage['content'] = [];
            const clientContent = lastClientMessageForSave.content;

            if (lastClientMessageForSave.role === 'user') {
                console.log("[API Chat Save Msg] Processing USER message content...");
                if (typeof clientContent === 'string') {
                    contentForDb = [{ type: 'text', text: clientContent }];
                } else if (Array.isArray(clientContent)) {
                    contentForDb = clientContent
                        .map((part: any) => {
                            if (part.type === 'image' && (typeof part.image === 'string' || part.image instanceof URL)) {
                                let imageValue: string | URL = part.image;
                                if (typeof part.image === 'string') {
                                    try {
                                        const imageUrl = new URL(part.image);
                                        const pathSegments = imageUrl.pathname.split('/');
                                        const bucketName = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents';
                                        const bucketNameIndex = pathSegments.findIndex(segment => segment === bucketName);
                                        if (bucketNameIndex !== -1 && bucketNameIndex < pathSegments.length - 1) {
                                            imageValue = pathSegments.slice(bucketNameIndex + 1).join('/');
                                        }
                                    } catch (e) { 
                                        console.warn(`[API Chat Save Msg] Could not parse image URL for user message part: ${part.image}. Using original value.`, e);
                                    }
                                }
                                const imagePart: ImagePart = { type: 'image', image: imageValue };
                                if (typeof part.mimeType === 'string') imagePart.mimeType = part.mimeType;
                                return imagePart;
                            } else if (part.type === 'text' && typeof part.text === 'string') {
                                return { type: 'text', text: part.text } as TextPart;
                            }
                            console.warn(`[API Chat Save Msg] Unrecognized or malformed part in user message content: ${part.type}. Skipping.`, part);
                            return null;
                        })
                        .filter(p => p !== null) as Array<TextPart | ImagePart>;
                } else {
                    console.warn("[API Chat Save Msg] User message content is not a string or array. Saving as empty text part. Content:", clientContent);
                    contentForDb = [{ type: 'text', text: '' }];
                }

                // Add uploaded image from requestData if applicable (for user messages)
                if (uploadedImagePath) {
                    const imageAlreadyAdded = contentForDb.some(part => part.type === 'image' && part.image === uploadedImagePath);
                    if (!imageAlreadyAdded) {
                        const uploadedImagePart: ImagePart = { type: 'image', image: uploadedImagePath };
                        if (firstImageContentType) uploadedImagePart.mimeType = firstImageContentType;
                        (contentForDb as Array<TextPart | ImagePart>).push(uploadedImagePart);
                        console.log("✅ [API Chat Save Msg] Added uploaded ImagePart (from uploadedImagePath) to user message contentForDb");
                    }
                } else if (firstImageSignedUrl && typeof firstImageSignedUrl === 'string') {
                    try {
                        const signedUrl = new URL(firstImageSignedUrl);
                        const pathSegments = signedUrl.pathname.split('/');
                        // Ensure this bucket name is correct for images directly uploaded with chat messages
                        const bucketName = 'message-images'; 
                        const bucketIndex = pathSegments.findIndex(segment => segment === bucketName);
                        let imageValueForDb = firstImageSignedUrl;
                        if (bucketIndex !== -1 && bucketIndex < pathSegments.length - 1) {
                            imageValueForDb = pathSegments.slice(bucketIndex + 1).join('/');
                        }
                        const imageAlreadyAdded = contentForDb.some(part => part.type === 'image' && part.image === imageValueForDb);
                        if (!imageAlreadyAdded) {
                            const uploadedImagePart: ImagePart = { type: 'image', image: imageValueForDb };
                            if (firstImageContentType) uploadedImagePart.mimeType = firstImageContentType;
                            (contentForDb as Array<TextPart | ImagePart>).push(uploadedImagePart);
                            console.log("✅ [API Chat Save Msg] Added uploaded ImagePart (from firstImageSignedUrl) to user message contentForDb");
                        }
                    } catch (urlError) {
                        console.warn("[API Chat Save Msg] Failed to parse firstImageSignedUrl for user message, skipping image:", urlError);
                    }
                }
                if (contentForDb.length === 0) {
                    contentForDb = [{ type: 'text', text: typeof clientContent === 'string' ? clientContent : '' }];
                }

            } else if (lastClientMessageForSave.role === 'tool') {
                console.log("[API Chat Save Msg] Processing TOOL message content...");
                // For tool messages, content should be an array of ToolResultPart
                // e.g., [{ type: 'tool-result', toolCallId: '...', toolName: '...', result: {...} }]
                if (Array.isArray(clientContent)) {
                    contentForDb = clientContent.map((part: any) => {
                        if (part.type === 'tool-result' && part.toolCallId && typeof part.toolCallId === 'string' && part.toolName && typeof part.toolName === 'string') {
                            // Ensure 'result' exists, even if it's null or undefined, as it's expected by CoreMessage type
                            return {
                                type: 'tool-result',
                                toolCallId: part.toolCallId,
                                toolName: part.toolName,
                                result: part.result // result can be any JSON-serializable data, or undefined/null
                            } as ToolResultPart;
                        }
                        console.warn("[API Chat Save Msg] Malformed tool-result part in tool message content:", part);
                        return null;
                    }).filter(p => p !== null) as ToolResultPart[];
                    
                    if (contentForDb.length === 0 && clientContent.length > 0) {
                         console.warn("[API Chat Save Msg] All tool-result parts were malformed. Original clientContent:", clientContent);
                         // This state is problematic for AI SDK. Saving as empty content might still lead to issues.
                         // For now, it will be an empty array, which should be handled by convertToCoreMessages if it occurs.
                    } else if (contentForDb.length === 0 && clientContent.length === 0) {
                        console.warn("[API Chat Save Msg] Tool message had an empty content array. Saving as such.");
                    }
                } else {
                    console.warn("[API Chat Save Msg] Tool message content is not an array as expected. Content:", clientContent);
                    // This is highly unexpected. Tool results must be an array of ToolResultPart.
                    // To prevent downstream errors with DB expecting an array, save as empty array.
                    contentForDb = []; 
                }
            }

            console.log("[API Chat Save Msg] Final contentForDb before DB insert:", JSON.stringify(contentForDb, null, 2));

            // Ensure contentForDb is never empty for user messages after all processing.
            if (lastClientMessageForSave.role === 'user' && contentForDb.length === 0) {
                 console.warn("[API Chat Save Msg] User message contentForDb is empty after processing. Setting to default empty text part.");
                 contentForDb = [{ type: 'text', text: '' }];
            }
            // For tool messages, contentForDb could be an empty array if clientContent was empty or all parts were malformed.
            // This might be acceptable if no tool results were genuinely intended to be sent.

            const messageToInsert = {
                document_id: documentId,
                user_id: userId,
                role: lastClientMessageForSave.role as 'user' | 'tool', // Cast role
                content: contentForDb, 
                metadata: lastClientMessageForSave.metadata || (lastClientMessageForSave.role === 'user' && requestData.inputMethod) 
                    ? { input_method: requestData.inputMethod, ...(lastClientMessageForSave.metadata || {}) } 
                    : lastClientMessageForSave.metadata,
            };

            console.log("[API Chat Save Msg] Message object for DB:", JSON.stringify(messageToInsert, null, 2));

            const { data: savedMessage, error: insertError } = await supabase
                .from('messages')
                .insert(messageToInsert)
                .select()
                .single();

            if (insertError) {
                console.error('[API Chat Save Msg] Error saving message:', insertError.message, insertError.details, insertError.hint);
            } else {
                console.log('[API Chat Save Msg] Message saved successfully. ID:', savedMessage?.id);
                if (savedMessage?.content) {
                    console.log('[API Chat Save Msg] Verification - Content saved to DB:');
                    if (Array.isArray(savedMessage.content)) {
                        savedMessage.content.forEach((part: any, index: number) => {
                            console.log(`  - Part ${index}: type=${part.type}, toolCallId=${part.toolCallId}, toolName=${part.toolName}, hasResult=${part.result !== undefined}, hasImage=${!!part.image}, hasText=${!!part.text}`);
                        });
                    } else {
                        console.log('  - Content is not an array:', typeof savedMessage.content);
                    }
                }
            }
        } catch (e: any) {
            console.error('[API Chat Save Msg] Unexpected error trying to save message:', e.message, e.stack);
        }
        console.log(`=== [API Chat Save Msg] Saving last client message (Role: ${lastClientMessageForSave.role}) END ===`);
    }
    // --- END: Save Last Client Message ---

    // --- BEGIN: Handle Audio Transcription Tool Call Logging ---
    if (inputMethod === 'audio' && whisperDetails) {
        console.log('[API Chat Audio] Processing audio transcription tool call logging...');
        console.log('[API Chat Audio] Audio metadata:', { inputMethod, whisperDetails });
        
        try {
            // Create a tool call entry for the audio transcription
            const audioToolCall = {
                user_id: userId,
                document_id: documentId,
                tool_name: 'whisper_transcription',
                arguments: JSON.stringify({
                    model: 'whisper-1',
                    input_method: 'audio',
                    file_size_bytes: whisperDetails.file_size_bytes || 0,
                    file_type: whisperDetails.file_type || 'audio/webm'
                }),
                result: JSON.stringify({
                    transcription: lastClientMessageForSave?.content || '',
                    cost_estimate: whisperDetails.cost_estimate || 0,
                    file_size_bytes: whisperDetails.file_size_bytes || 0,
                    processing_time_ms: whisperDetails.processing_time_ms || null
                }),
                cost: whisperDetails.cost_estimate || 0,
                tokens_input: Math.ceil((whisperDetails.file_size_bytes || 0) / 1000), // Approximate input tokens based on file size
                tokens_output: 0, // Audio transcription doesn't produce output tokens
                created_at: new Date().toISOString()
            };

            console.log('[API Chat Audio] Inserting audio tool call:', audioToolCall);
            const { data: toolCallData, error: toolCallError } = await supabase
                .from('tool_calls')
                .insert(audioToolCall)
                .select()
                .single();

            if (toolCallError) {
                console.error('[API Chat Audio] Error saving audio tool call:', toolCallError);
                // Don't block the chat flow, just log the error
            } else {
                console.log('[API Chat Audio] Audio tool call saved successfully. ID:', toolCallData?.id);
            }
        } catch (audioError) {
            console.error('[API Chat Audio] Unexpected error during audio tool call logging:', audioError);
            // Don't block the chat flow, just log the error
        }
    } else if (inputMethod === 'audio') {
        console.warn('[API Chat Audio] Audio input method detected but whisperDetails missing');
    }
    // --- END: Handle Audio Transcription Tool Call Logging ---

    const modelId = typeof modelIdFromData === 'string' && modelIdFromData in modelProviders
        ? modelIdFromData
        : defaultModelId;
    const getModelProvider = modelProviders[modelId];
    const aiModel = getModelProvider();

    // Rate limiting wrapper for the webSearch tool only (server tools need rate limiting)
    const rateLimitedWebSearch = tool({
      description: 'Search the web for up-to-date information using Exa AI',
      parameters: z.object({
        query: z.string().min(1).max(100).describe('The search query'),
      }),
      execute: async (args, options) => {
        await delay(1000); // 1 second delay between web searches
        // Call the webSearchTool directly with both parameters
        return await serverTools.webSearch.execute!(args, options);
      }
    });

    const combinedToolsWithRateLimit = {
      ...clientSideTools,
      webSearch: rateLimitedWebSearch,
      searchAndTagDocumentsTool: serverTools.searchAndTagDocumentsTool,
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
    
    // === ENHANCED DEBUG: Analyze message structure ===
    console.log('[API Chat] === DETAILED MESSAGE STRUCTURE ANALYSIS ===');
    historyToConvert.forEach((message, index) => {
        console.log(`[API Chat] Message ${index}:`);
        console.log(`  - Role: ${message.role}`);
        console.log(`  - Content type: ${typeof message.content}`);
        console.log(`  - Content is array: ${Array.isArray(message.content)}`);
        console.log(`  - Has toolInvocations: ${!!message.toolInvocations}`);
        console.log(`  - Has parts: ${!!message.parts}`);
        
        if (Array.isArray(message.content)) {
            console.log(`  - Content parts count: ${message.content.length}`);
            message.content.forEach((part, partIndex) => {
                console.log(`    Part ${partIndex}: type=${part.type}, hasResult=${!!part.result}, toolCallId=${part.toolCallId || 'none'}, toolName=${part.toolName || 'none'}`);
            });
        }
        
        if (message.toolInvocations) {
            console.log(`  - ToolInvocations count: ${message.toolInvocations.length}`);
            message.toolInvocations.forEach((inv, invIndex) => {
                console.log(`    Invocation ${invIndex}: toolName=${inv.toolName}, hasResult=${!!inv.result}, state=${inv.state || 'none'}`);
            });
        }
        
        if (message.parts) {
            console.log(`  - Parts count: ${message.parts.length}`);
            message.parts.forEach((part, partIndex) => {
                console.log(`    Part ${partIndex}: type=${part.type}`);
            });
        }
    });
    console.log('[API Chat] === END MESSAGE STRUCTURE ANALYSIS ===');
    
    // === ENHANCED FIX: Clean up incomplete tool calls before conversion ===
    console.log('[API Chat] Cleaning up incomplete tool calls in message history...');
    const cleanedHistory = historyToConvert.map((message, index) => {
        let modifiedMessage = { ...message };
        let wasModified = false;
        
        // Handle tool calls in content array
        if (message.role === 'assistant' && Array.isArray(message.content)) {
            const hasIncompleteToolCalls = message.content.some(part => 
                part.type === 'tool-call' && !part.result
            );
            
            if (hasIncompleteToolCalls) {
                console.log(`[API Chat] Found incomplete tool calls in content array for message ${index}`);
                const filteredContent = message.content.filter(part => {
                    if (part.type === 'tool-call' && !part.result) {
                        console.log(`[API Chat] Removing incomplete tool call from content: ${part.toolName} (${part.toolCallId})`);
                        return false;
                    }
                    return true;
                });
                
                if (filteredContent.length === 0) {
                    console.log(`[API Chat] No content left after filtering, converting to simple text message`);
                    modifiedMessage.content = 'I was processing your request but the operation was interrupted. Please try again.';
                } else {
                    modifiedMessage.content = filteredContent;
                }
                wasModified = true;
            }
        }
        
        // Handle toolInvocations array
        if (message.toolInvocations && Array.isArray(message.toolInvocations)) {
            const hasIncompleteInvocations = message.toolInvocations.some(inv => !inv.result);
            
            if (hasIncompleteInvocations) {
                console.log(`[API Chat] Found incomplete tool invocations for message ${index}`);
                const filteredInvocations = message.toolInvocations.filter(inv => {
                    if (!inv.result) {
                        console.log(`[API Chat] Removing incomplete tool invocation: ${inv.toolName} (${inv.toolCallId})`);
                        return false;
                    }
                    return true;
                });
                
                modifiedMessage.toolInvocations = filteredInvocations.length > 0 ? filteredInvocations : undefined;
                wasModified = true;
            }
        }
        
        // Handle parts array
        if (message.parts && Array.isArray(message.parts)) {
            const hasIncompletePartCalls = message.parts.some(part => 
                part.type === 'tool-call' && !part.result
            );
            
            if (hasIncompletePartCalls) {
                console.log(`[API Chat] Found incomplete tool calls in parts array for message ${index}`);
                const filteredParts = message.parts.filter(part => {
                    if (part.type === 'tool-call' && !part.result) {
                        console.log(`[API Chat] Removing incomplete tool call from parts: ${part.toolName} (${part.toolCallId})`);
                        return false;
                    }
                    return true;
                });
                
                modifiedMessage.parts = filteredParts.length > 0 ? filteredParts : undefined;
                wasModified = true;
            }
        }
        
        if (wasModified) {
            console.log(`[API Chat] Modified message ${index} to remove incomplete tool calls`);
        }
        
        return modifiedMessage;
    });
    
    console.log(`[API Chat] Message cleanup completed`);
    // === END ENHANCED FIX === 

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

    const slicedHistoryToConvert = cleanedHistory.length > 10 ? cleanedHistory.slice(-10) : cleanedHistory;
    
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
        let convertedHistoryMessages: any[] = [];
        try {
            console.log("[API Chat] Attempting convertToCoreMessages...");
            convertedHistoryMessages = convertToCoreMessages(slicedHistoryToConvert as any);
            console.log("[API Chat] ✅ convertToCoreMessages succeeded");
        } catch (conversionError: any) {
            console.error("[API Chat] ❌ convertToCoreMessages failed:", conversionError);
            console.error("  - Error type:", conversionError.constructor?.name);
            console.error("  - Error message:", conversionError.message);
            console.error("  - Error stack:", conversionError.stack);
            
            // Fallback: Skip problematic messages and try again with a safer subset
            if (conversionError.message?.includes('ToolInvocation must have a result')) {
                console.log("[API Chat] 🔧 Attempting fallback: removing messages with incomplete tool calls...");
                
                // Create a safer version by filtering out messages that might have incomplete tool calls
                const safeMessages = slicedHistoryToConvert.filter((msg, index) => {
                    // Skip assistant messages that might have incomplete tool calls
                    if (msg.role === 'assistant') {
                        const hasIncompleteToolCalls = 
                            (Array.isArray(msg.content) && msg.content.some((part: any) => 
                                part.type === 'tool-call' && !part.result
                            )) ||
                            (msg.toolInvocations && msg.toolInvocations.some((inv: any) => 
                                !inv.result && inv.state !== 'result'
                            )) ||
                            (msg.parts && msg.parts.some((part: any) => 
                                part.type === 'tool-call' && !part.result
                            ));
                        
                        if (hasIncompleteToolCalls) {
                            console.log(`[API Chat] Filtering out assistant message ${index} with incomplete tool calls`);
                            return false;
                        }
                    }
                    
                    // Skip tool messages that might be incomplete
                    if (msg.role === 'tool') {
                        const hasIncompleteResults = Array.isArray(msg.content) && 
                            msg.content.some((part: any) => 
                                part.type === 'tool-result' && (part.result === undefined || part.result === null)
                            );
                        
                        if (hasIncompleteResults) {
                            console.log(`[API Chat] Filtering out tool message ${index} with incomplete results`);
                            return false;
                        }
                    }
                    
                    return true;
                });
                
                if (safeMessages.length > 0 && safeMessages.length < slicedHistoryToConvert.length) {
                    try {
                        console.log(`[API Chat] Fallback: trying convertToCoreMessages with ${safeMessages.length}/${slicedHistoryToConvert.length} messages...`);
                        convertedHistoryMessages = convertToCoreMessages(safeMessages as any);
                        console.log("[API Chat] ✅ Fallback conversion succeeded");
                    } catch (fallbackError: any) {
                        console.error("[API Chat] ❌ Fallback conversion also failed:", fallbackError);
                        console.log("[API Chat] 🔧 Using empty history as last resort");
                        convertedHistoryMessages = [];
                    }
                } else {
                    console.log("[API Chat] 🔧 No safe messages found or no filtering needed, using empty history");
                    convertedHistoryMessages = [];
                }
            } else {
                console.log("[API Chat] 🔧 Non-tool-call error, using empty history as fallback");
                convertedHistoryMessages = [];
            }
        }
        
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
                lastConvertedMsg.content.forEach((part: any, idx: number) => {
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

            // Add editor context AFTER the last user message, not before
            finalMessagesForStreamText.push(editorContextCoreMessage);
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
    console.log("[API Chat] IMPLEMENTING: Provider-Specific Tool Architecture");
    
    // Provider-specific tool configuration
    const isGeminiModel = modelId.toLowerCase().includes('gemini');
    const isOpenAIModel = modelId.toLowerCase().includes('gpt') || modelId.toLowerCase().includes('openai');
    const isClaudeModel = modelId.toLowerCase().includes('claude') || modelId.toLowerCase().includes('anthropic');
    
    console.log("[API Chat] Provider detection:", { modelId, isGeminiModel, isOpenAIModel, isClaudeModel });
    
    // Define server-side tools (all have execute functions)
    const serverOnlyToolsForStream = {
        webSearch: rateLimitedWebSearch,
        searchAndTagDocumentsTool: serverTools.searchAndTagDocumentsTool,
    };
    
    // Mixed tools for OpenAI (server tools + client tools for onToolCall)
    const openaiMixedTools = {
        ...serverOnlyToolsForStream,
        ...clientSideTools,  // Client-side tools handled by onToolCall callback
    };
    
    // Provider-specific tool selection
    let toolsToUse;
    
    // ENABLE ALL TOOLS FOR ALL MODELS (per user request)
    const allToolsEnabled = {
        ...serverOnlyToolsForStream,
        ...clientSideTools,  // All editor tools
    };
    
    if (isGeminiModel) {
        // Enable all tools for Gemini models (user requested all tools enabled)
        toolsToUse = allToolsEnabled;
        console.log("[API Chat] GEMINI: All tools ENABLED - per user request");
    } else if (isOpenAIModel) {
        toolsToUse = allToolsEnabled;
        console.log("[API Chat] OPENAI: All tools ENABLED");
    } else if (isClaudeModel) {
        toolsToUse = allToolsEnabled;
        console.log("[API Chat] CLAUDE: All tools ENABLED");
    } else {
        // Default fallback - enable all tools
        toolsToUse = allToolsEnabled;
        console.log("[API Chat] UNKNOWN MODEL: All tools ENABLED");
    }
    
    console.log("[API Chat] Final tools configuration:", { 
        provider: isGeminiModel ? 'Gemini' : isOpenAIModel ? 'OpenAI' : isClaudeModel ? 'Claude' : 'Unknown',
        toolsEnabled: !!toolsToUse,
        toolCount: toolsToUse ? Object.keys(toolsToUse).length : 0, 
        tools: toolsToUse ? Object.keys(toolsToUse) : []
    });
    
    const result = streamText({
        model: aiModel,
        messages: finalMessagesForStreamText,
        ...(toolsToUse && { tools: toolsToUse }), // Only include tools if toolsToUse is defined
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
            console.log("[onFinish] Stream finished. Usage:", JSON.stringify(usage));
            console.log("[onFinish] Response object:", JSON.stringify(response, null, 2));
            console.log("[onFinish] Response.messages:", response.messages?.map(msg => ({
                role: msg.role,
                content: msg.content
            })));
            
            // === EXISTING SAVING LOGIC ===
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

