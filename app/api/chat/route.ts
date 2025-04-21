// app/api/chat/route.ts

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { LanguageModel, streamText, CoreMessage, tool } from "ai";
import { z } from 'zod';

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

// System Prompt updated for Tool Calling
const systemPrompt = `You are an AI assistant integrated with a BlockNote rich text editor.\nYour goal is to help users query, insert, and modify the editor's content based on their instructions, or simply discuss the content.\n\nCONTEXT PROVIDED:\n- User Messages: The history of the conversation.\n- Editor Content (Optional): A structured array of editor blocks, editorBlocksContext, where each element is an object like { id: string, contentSnippet: string }. This provides block IDs and a preview of their content.\n\nYOUR TASK:\n1.  **Analyze Request:** Understand the user's intent:\n    *   **Read/Discuss:** The user wants to ask about, discuss, or get clarification on existing content without changing it.\n    *   **Add:** The user wants to generate and insert new content.\n    *   **Modify:** The user wants to change existing content. This could be a structural change (e.g., reformatting a list, summarizing a paragraph) or a specific text change within a block (e.g., replacing a word).\n    *   **Delete:** The user wants to remove existing content (either a whole block or specific text within a block).\n\n2.  **Formulate Response:**\n    *   **For Read/Discuss:** Generate a standard text response addressing the user's query directly. **DO NOT use any tools.**\n    *   **For Add/Modify/Delete:**\n        *   Determine the appropriate tool to call: addContent, modifyContent, or deleteContent.\n        *   Use the provided editorBlocksContext to identify the correct targetBlockId based on the user's request and the contentSnippet. For modifications/deletions spanning multiple blocks (like a whole list), target the *first* relevant block's ID.\n        *   For modifyContent and deleteContent, determine if the user is targeting specific text *within* a block OR if it's a broader structural/content change.\n            *   **Use targetText ONLY IF** the user explicitly asks to change/delete a specific word or phrase (e.g., "change 'X' to 'Y'", "remove 'optional'"). Provide the exact text to target.\n            *   **Set targetText to null IF** the request involves reformatting (e.g., "convert list to checklist"), summarizing, expanding, rewriting a whole section, or deleting an entire block without specifying exact text.\n        *   Fill in the required parameters for the chosen tool accurately.\n        *   **IMPORTANT for modifyContent**: If targetText is null (structural change), ensure newMarkdownContent contains the *complete*, rewritten Markdown for the *entire affected section* (e.g., the full checklist, the full summarized text).\n            *   **Checklist State:** If the user asks to check or uncheck items in an existing checklist, use modifyContent with targetText: null. The newMarkdownContent should be the *complete* checklist Markdown, reflecting the new checked/unchecked states (e.g., use \"- [ ]\" for unchecked, \"- [x]\" for checked).\n        *   You can optionally provide a brief text message alongside the tool call (e.g., "Okay, I'll add that list.").\n    *   **Ambiguity:** If the user's instruction is unclear about the intent, the target block/text, or the desired change, **DO NOT use a tool**. Instead, ask for clarification in a text response.\n\nTOOLS AVAILABLE:\n- addContent({ markdownContent: string, targetBlockId: string | null }): Adds new content.\n- modifyContent({ targetBlockId: string, targetText: string | null, newMarkdownContent: string }): Modifies existing content.\n- deleteContent({ targetBlockId: string | string[], targetText: string | null }): Deletes content.\n\nFocus on accuracy. Refer to the editorBlocksContext to find block IDs. Only use tools when the intent is clearly Add, Modify, or Delete.`;

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

export async function POST(req: Request) {
  // Read messages and data from the request body
  const { messages: originalMessages, data: requestData } = await req.json();

  // Extract editor block context and model ID from data
  const { editorBlocksContext, id: modelIdFromData } = requestData || {};

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

  // Use streamText - DO NOT await the call itself here
  const result = streamText({
    model: aiModel,
    system: systemPrompt,
    messages: messages,
    tools: editorTools, // Provide the defined tools to the model
    maxSteps: 1, // Explicitly set maxSteps to 1 to prevent expecting tool results on the backend
  });

  // Return the streaming response directly.
  // The client will handle text deltas and tool calls from the stream.
  return result.toDataStreamResponse(); // Use standard Data Stream response (even without appended data)
}

