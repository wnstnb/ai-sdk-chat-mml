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
  "o3": () => openai("o3"),
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

**!CRITICAL: Block ID Handling:** 
- Do not mention raw block IDs (e.g., 'id-xyz') *to the user* in your conversational responses. 
- However, you MUST use the correct block IDs internally and when specifying targets for tool calls.
- **NEVER invent, guess, or hallucinate block IDs.** You can ONLY use block IDs that are explicitly provided in the \`editorBlocksContext\`. 
- If you cannot find the appropriate block ID in the provided context for a user's request, ask the user to clarify which specific content they want to modify rather than guessing an ID.

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
    const finalMessagesForAIAssembly: CoreMessage[] = []; // Use a temporary assembly array

    // 1. Add System Prompt(s)
    finalMessagesForAIAssembly.push({
        role: 'system',
        content: taskHint === 'summarize_and_cite_outline'
            ? systemPrompt + summarizationStrategyPrompt
            : systemPrompt
    });
    console.log('[API Chat] Added main system prompt.');

    // 2. Add Tagged Documents Context (if available) - as SYSTEM
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
            finalMessagesForAIAssembly.push({
                role: 'system', 
                content: `IMPORTANT CONTEXT FROM TAGGED DOCUMENTS:\n${taggedDocumentsContentString}`
            });
            console.log('[API Chat] Added tagged documents context as system message.');
        }
    }

    // 3. Add Conversation Summary Context (if available) - as SYSTEM
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
        finalMessagesForAIAssembly.push({ role: 'system', content: summaryContent });
        console.log('[API Chat Summary Context] Added conversation summary context message.');
    }

    // --- Process client messages, integrate context, and add to final assembly ---

    // Make a deep copy of original client messages to avoid mutating the request body.
    const clientMessagesCopy: ClientMessage[] = JSON.parse(JSON.stringify(originalClientMessages));

    // 1. Clean up incomplete tool calls from the copied history
    console.log('[API Chat] Cleaning up incomplete tool calls in message history...');
    const cleanedHistory: ClientMessage[] = clientMessagesCopy.map((message, index) => {
        let modifiedMessage = { ...message };
        let wasModified = false;
        
        if (message.role === 'assistant' && Array.isArray(message.content)) {
            const hasIncompleteToolCalls = message.content.some(part => part.type === 'tool-call' && !part.result);
            if (hasIncompleteToolCalls) {
                const filteredContent = message.content.filter(part => !(part.type === 'tool-call' && !part.result));
                modifiedMessage.content = filteredContent.length > 0 ? filteredContent : 'I was processing your request but the operation was interrupted. Please try again.';
                wasModified = true;
            }
        }
        if (message.toolInvocations && Array.isArray(message.toolInvocations)) {
            const hasIncompleteInvocations = message.toolInvocations.some(inv => !inv.result);
            if (hasIncompleteInvocations) {
                const filteredInvocations = message.toolInvocations.filter(inv => !!inv.result);
                modifiedMessage.toolInvocations = filteredInvocations.length > 0 ? filteredInvocations : undefined;
                wasModified = true;
            }
        }
        if (message.parts && Array.isArray(message.parts)) {
            const hasIncompletePartCalls = message.parts.some(part => part.type === 'tool-call' && !part.result);
            if (hasIncompletePartCalls) {
                const filteredParts = message.parts.filter(part => !(part.type === 'tool-call' && !part.result));
                modifiedMessage.parts = filteredParts.length > 0 ? filteredParts : undefined;
                wasModified = true;
            }
        }
        if (wasModified) {
            console.log(`[API Chat] Modified message ${index} due to incomplete tool calls.`);
        }
        return modifiedMessage;
    });
    console.log('[API Chat] Message cleanup completed.');

    // 2. Prepare image part if firstImageSignedUrl is present
    console.log("=== [API Chat] IMAGE FOR AI PROCESSING START === ");
    let imagePartForAI: ImagePart | null = null;
    if (typeof firstImageSignedUrl === 'string' && firstImageSignedUrl.trim() !== '') {
        console.log('[API Chat Image Processing] Processing image for AI consumption...');
        try {
            const parsedSignedUrl = new URL(firstImageSignedUrl);
            console.log('✅ [API Chat Image Processing] Successfully parsed signed URL');
            const response = await fetch(parsedSignedUrl.href);
            if (!response.ok) {
                console.error(`[API Chat Image Processing] Failed to fetch image: ${response.status} ${response.statusText}`);
                throw new Error(`HTTP error ${response.status}`);
            }
            const imageBuffer = await response.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString('base64');
            let detectedMimeType = firstImageContentType || response.headers.get('content-type') || 'image/jpeg';
            if (!detectedMimeType.startsWith('image/')) {
                detectedMimeType = 'image/jpeg';
            }
            imagePartForAI = { type: 'image', image: `data:${detectedMimeType};base64,${base64Image}`, mimeType: detectedMimeType };
            console.log('✅ [API Chat Image Processing] Successfully fetched and converted image to base64 for AI.');
            } catch (error) {
            console.error('❌ [API Chat Image Processing] Error fetching or converting image:', error);
                    imagePartForAI = null;
        }
    } else {
        console.log('[API Chat Image Processing] No firstImageSignedUrl provided, or it was empty.');
    }
    console.log("=== [API Chat] IMAGE FOR AI PROCESSING END === ");

    // 3. Separate the last user message and the rest of the history
    let lastUserMessageFromHistory: ClientMessage | null = null;
    const historyWithoutLastUserMessage: ClientMessage[] = [];

    if (cleanedHistory.length > 0) {
        const potentialLastUserMessage = cleanedHistory[cleanedHistory.length - 1];
        if (potentialLastUserMessage.role === 'user') {
            lastUserMessageFromHistory = { ...potentialLastUserMessage }; // Deep copy
            historyWithoutLastUserMessage.push(...cleanedHistory.slice(0, -1));
            } else {
            historyWithoutLastUserMessage.push(...cleanedHistory);
        }
    }

    // 4. Add the historical messages (all messages except the last user message, if it exists)
    if (historyWithoutLastUserMessage.length > 0) {
        const coreCompatibleHistory = historyWithoutLastUserMessage.map(msg => {
            // Explicitly map to properties expected by CoreMessage or Omit<Message, 'id'>
            const mappedMsg: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string | Array<any>; tool_calls?: any; tool_results?: any; } = {
                role: msg.role as 'user' | 'assistant' | 'system' | 'tool', // Cast if ClientMessage role is wider
                content: msg.content as string | Array<any> // Ensure content aligns with CoreMessagePart[] if array
            };
            // Add tool_calls if they exist and are valid for 'assistant' role
            if (msg.role === 'assistant' && (msg as any).tool_calls) { // Assuming tool_calls is the correct property name from ClientMessage
                mappedMsg.tool_calls = (msg as any).tool_calls;
            }
            // Add tool_results if they exist and are valid for 'tool' role
            if (msg.role === 'tool' && (msg as any).tool_results) { // Assuming tool_results is the correct property name from ClientMessage
                 mappedMsg.tool_results = (msg as any).tool_results;
            }
            return mappedMsg;
        });
        finalMessagesForAIAssembly.push(...convertToCoreMessages(coreCompatibleHistory as any));
        console.log(`[API Chat] Added ${historyWithoutLastUserMessage.length} historical messages.`);
         }

    // 5. Inject Editor Context (if it exists) as a *user-role message* BEFORE the actual last user message
    if (editorBlocksContext && Array.isArray(editorBlocksContext) && editorBlocksContext.length > 0) {
        const contextSnippets = editorBlocksContext.map((block: any) => {
            const content = block.contentSnippet || `Block Type: ${block.type}`;
            return `- [ID: ${block.id}] ${content}`;
        });
        const contextString = contextSnippets.join('\n');
        const editorContextUserMessageContent = `Here is the current content of the editor for my reference (DO NOT display this verbatim in your response, use it as context only):
\`\`\`markdown
${contextString}
\`\`\`
What follows is my actual immediate question or instruction.`;
        
        finalMessagesForAIAssembly.push({
                role: 'user', 
            content: editorContextUserMessageContent
        });
        console.log('[API Chat] Added editor context as a preceding user message.');
            } else {
        console.log('[API Chat] No editor context provided or context was empty.');
    }

    // 6. Prepare and add the final user message (with image if applicable)
    if (lastUserMessageFromHistory) {
        if (imagePartForAI && lastUserMessageFromHistory.role === 'user') {
            const newContentParts: ({type: 'text', text: string} | {type: 'image', image: string, mimeType?: string})[] = [];
            if (typeof lastUserMessageFromHistory.content === 'string') {
                if (lastUserMessageFromHistory.content.trim() !== '') {
                    newContentParts.push({ type: 'text', text: lastUserMessageFromHistory.content });
                }
            } else if (Array.isArray(lastUserMessageFromHistory.content)) {
                lastUserMessageFromHistory.content.forEach(part => {
                    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '') {
                        newContentParts.push({ type: 'text', text: part.text });
                    }
                });
            }
            newContentParts.push({ type: 'image', image: imagePartForAI.image as string, mimeType: imagePartForAI.mimeType });
            if (newContentParts.length > 0) {
                lastUserMessageFromHistory.content = newContentParts;
                        } else {
                lastUserMessageFromHistory.content = ""; 
            }
            console.log('[API Chat] Image part processed for the last user message.');
        }
        if (lastUserMessageFromHistory.role === 'user' && Array.isArray(lastUserMessageFromHistory.content) && lastUserMessageFromHistory.content.length === 0) {
            console.warn("[API Chat] Last user message content was an empty array after all processing, setting to empty string to prevent errors.");
            lastUserMessageFromHistory.content = ""; // Prevent sending content: [] for a user message
        }

        finalMessagesForAIAssembly.push(...convertToCoreMessages([lastUserMessageFromHistory] as any));
        console.log('[API Chat] Added final user message to assembly.');
    }
    else {
        console.log('[API Chat] No final user message from history to add.');
    }

    const generationConfig: any = {}; // Define generationConfig

    // `finalMessagesForAIAssembly` is now the array of CoreMessages to send to streamText
    console.log(`[API Chat] Total messages prepared for AI: ${finalMessagesForAIAssembly.length}`);
    console.log("[API Chat] Final messages array before streamText:", JSON.stringify(finalMessagesForAIAssembly, null, 2));

    // Call streamText with the final messages and tools
    const result = await streamText({
        model: aiModel,
        messages: finalMessagesForAIAssembly, // Use the carefully assembled array
        tools: combinedToolsWithRateLimit, // Assuming combinedToolsWithRateLimit is defined correctly
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
                        assistantParts = message.content.filter((part: any): part is TextPart | ToolCallPart => part.type === 'text' || part.type === 'tool-call');
                    }
                    finalAssistantTurn.accumulatedParts.push(...assistantParts);
                } else if (message.role === 'tool') {
                    if (Array.isArray(message.content)) {
                        const results = message.content.filter((part: any): part is ToolResultPart => part.type === 'tool-result');
                        results.forEach(result => {
                            if (result.toolCallId) finalAssistantTurn.toolResults[result.toolCallId] = result.result;
                        });
                    }
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

