# Improving AI Tool Usage Consistency

## Problem Statement

The AI assistant's use of editor tools (`addContent`, `modifyContent`, `deleteContent`) is inconsistent, leading to a suboptimal user experience. Specific issues observed include:

1.  **`modifyContent` adding new blocks:** When asked to modify existing content (e.g., summarize, rephrase, expand), the AI sometimes uses `modifyContent` (or potentially `addContent` incorrectly) to insert the modified text as a *new* block, leaving the original block untouched, rather than replacing it.
2.  **`modifyContent` deleting unrelated content:** When asked to modify a specific section (e.g., summarize one paragraph), the AI sometimes uses `modifyContent` in a way that removes all editor content *except* for the modified section.
3.  **General inconsistency:** Tool selection and parameterization are not always predictable or accurate based on the user's request, affecting all editor tools.
4.  **Complexity with Structured Content:** Using general-purpose tools (`addContent`, `modifyContent`, `deleteContent`) to manipulate structured content like tables is inherently complex and error-prone, leading to potential data loss or malformed tables. This necessitates a dedicated approach for such content.

The goal is to make the AI's tool usage more reliable, predictable, and aligned with user intent, primarily by refining the system prompt and tool descriptions for general content *and* introducing specialized tools for complex structures like tables.

## Analysis of Current Prompt (`app/api/chat/route.ts`)

The current `systemPrompt` provides detailed instructions, particularly for Scenario C (Editor Actions). Key relevant points include:

*   **Tool Descriptions:** Each tool (`addContent`, `modifyContent`, `deleteContent`) has a description and schema.
*   **`modifyContent` Specifics:**
    *   Correctly distinguishes between targeting specific text (`targetText: string`) and modifying whole blocks (`targetText: null`).
    *   States that when `targetText` is `null`, the goal is rewrite/summarize/reformat.
    *   Specifies `targetBlockId` should be the ID of the *first* block in a sequence to be modified.
    *   **Crucially, it instructs:** "`newMarkdownContent` **MUST contain the complete, rewritten Markdown for the *entire* affected section**, reflecting the desired final state."
    *   Mentions it "Replaces content starting at targetBlockId".
*   **Ambiguity Handling:** Instructs the AI to ask clarifying questions if the request is unclear.
*   **`summarizationStrategyPrompt`:** Provides a very specific, multi-step process for a summarization task, including using ONE `modifyContent` call to replace the relevant section with all generated summaries.

**Potential Weaknesses:**

1.  **Interpretation of "Replace":** While the prompt states `newMarkdownContent` is the complete rewritten section, the phrasing "Replaces content starting at targetBlockId" *might* occasionally be misinterpreted by the model as "insert replacement after targetBlockId" or only replace the single `targetBlockId` block even if multiple were implicitly involved in the request (like summarizing two paragraphs).
2.  **Lack of Concrete Examples:** The prompt describes *what* to do but lacks explicit *examples* within the main instructions showing how a user request translates to a specific `modifyContent` call (e.g., summarizing blocks 'A' and 'B' results in `modifyContent({ targetBlockId: 'A', targetText: null, newMarkdownContent: "..." })` where the content replaces both).
3.  **Complexity:** The prompt is detailed. The model might lose track of specific constraints, especially the nuance of replacing multiple blocks implicitly based on a single `targetBlockId`.
4.  **Implicit vs. Explicit Targets:** The prompt relies on the AI correctly inferring the full scope of blocks to be replaced when `targetText` is null and the user refers to a section spanning multiple blocks (e.g., "summarize the last two paragraphs"). It might default to only modifying the `targetBlockId` block.

## Proposed Prompt Refinements

Here are suggestions to make the instructions clearer and more robust, incorporating a structured approach for editor actions **primarily focused on general text blocks**: 

**NEW: Implement a Structured 4-Step Process for Editor Actions (Scenario C - General Text):**

Instruct the AI to follow these steps explicitly when the user requests changes to **non-table** editor content:

1.  **Understand Intent:** Analyze the user's request, conversation history, and any follow-up context to determine the core goal(s).
2.  **Identify Target Blocks:** Carefully map the user's description (e.g., "the introduction", "those bullet points", "the paragraph starting with...") to the specific **non-table** block IDs provided in the `editorBlocksContext`. Identify *all* relevant block IDs.
3.  **Plan Actions & Parameters:** For each goal, determine the appropriate tool (`addContent`, `modifyContent`, `deleteContent`) and meticulously prepare its parameters (`targetBlockId`, `targetText`, `newMarkdownContent` etc.). *Apply the detailed rules below (Clarification, Examples, Scope) when planning `modifyContent`.* **Note:** If the user's request involves manipulating a table, a separate, dedicated `modifyTable` tool should be planned instead (see tool descriptions later).
4.  **Validate & Clarify:**
    *   **Overlap Check:** Review the planned actions (using `addContent`, `modifyContent`, `deleteContent`). Do they involve contradictory operations on the same block(s) (e.g., modify and delete the same block)?
    *   **Ambiguity Check:** Is the mapping from the user's description to block IDs uncertain (Step 2)? Is the desired outcome/action for any targeted block unclear (Step 3)?
    *   **Action:** If any overlap or ambiguity is detected, **DO NOT use any tool.** Instead, **YOU MUST ask clarifying questions** to resolve the uncertainty before proceeding. Do not guess.

**Refined Detailed Rules (Integrating previous points into the 4-Step Process for General Text):**

1.  **Clarify "Replacement" Action for `modifyContent` (during Step 3: Plan Actions):**
    *   Rephrase the core description: "Modifies existing content. When `targetText` is `null`, this tool **replaces the entire content** of the block(s) starting from `targetBlockId` with the provided `newMarkdownContent`. If the user's request implicitly involves multiple blocks (e.g., summarizing a section), `newMarkdownContent` **must** contain the complete text that replaces **all** of those original blocks."
    *   Add a negative constraint: "When `targetText` is `null`, DO NOT simply append the new content; the original content of the targeted block(s) is discarded and replaced entirely by `newMarkdownContent`."

2.  **Add Explicit Examples (Illustrate Step 3: Plan Actions):**
    *   In the `modifyContent` specifics section, add examples:
        *   "**Example 1 (Summarize Multiple Blocks):** User asks: 'Summarize the introduction section' (which context shows spans blocks 'id-1', 'id-2'). AI generates summary. Step 3 Plan: `modifyContent({ targetBlockId: 'id-1', targetText: null, newMarkdownContent: '<The generated summary Markdown>' })`. Step 4 Check: No overlap/ambiguity. Execute tool call. Result: Content of blocks 'id-1' and 'id-2' is replaced by the summary."
        *   "**Example 2 (Rephrase Single Block):** User asks: 'Rephrase this paragraph' (referring to block 'id-3'). AI generates rephrased version. Step 3 Plan: `modifyContent({ targetBlockId: 'id-3', targetText: null, newMarkdownContent: '<The rephrased paragraph Markdown>' })`. Step 4 Check: OK. Execute. Result: Original content of 'id-3' is replaced."
        *   "**Example 3 (Replace Specific Text):** User asks: 'Change "apple" to "orange" in this sentence' (within block 'id-4'). Step 3 Plan: `modifyContent({ targetBlockId: 'id-4', targetText: 'apple', newMarkdownContent: 'orange' })`. Step 4 Check: OK. Execute."
        *   "**Example 4 (Ambiguous Request):** User asks: 'Improve this section.' (Context shows blocks 'id-5', 'id-6', 'id-7' could be relevant). Step 2 Mapping: Uncertain which blocks constitute "this section". Step 4 Check: Ambiguity detected. Action: Ask user: 'Which specific paragraphs (by start text or block ID if necessary) do you mean by "this section"?' DO NOT use a tool."
        *   "**Example 5 (Overlapping Request):** User asks: 'Combine points A and B, and delete point B.' (Points A/B map to blocks 'id-8', 'id-9'). Step 3 Plan (Initial): Modify `id-8` to include content from `id-9`, *and* Delete `id-9`. Step 4 Check: Overlap detected (modifying based on B, and deleting B). Action: Ask user: 'Do you want to combine A and B into a single point, replacing A and deleting B? Or something else?' DO NOT use a tool."

3.  **Reinforce Handling Implicit Multi-Block Scope (during Step 2 & 3 - General Text):**
    *   Add a sentence: "If the user asks to modify a section of **standard text** that clearly spans multiple blocks (e.g., 'Summarize paragraphs 2-4', 'Rewrite the conclusion'), identify the ID of the *first* block in that section as `targetBlockId` in Step 2, and ensure `newMarkdownContent` contains the complete replacement for *all* blocks in that section during Step 3 planning."

4.  **Strengthen Clarification Requirement (Central to Step 4 - All Editor Actions):**
    *   Make the ambiguity instruction more forceful: "If the user's request is ambiguous about *which* block(s) or table to modify (Step 2), *where* exactly to make the change, or *what* the final content/action should be (Step 3), **YOU MUST ask clarifying questions (Step 4) before using any editor tool.** Do not guess."

5.  **Generalize Summarization Strategy Pattern (Optional - Consider as a high-level principle for General Text):**
    *   Consider adding a general principle derived from `summarizationStrategyPrompt`: "For complex modifications involving multiple steps or generating substantial new content for **standard text blocks** (like summaries, expansions across multiple points), aim to first formulate the complete final Markdown content internally, then use a single `modifyContent` (with `targetText: null`) or `addContent` call to apply it, after passing the Step 4 validation check."

**NEW: Dedicated Table Manipulation Tool:**

*   To address the complexities outlined in Problem Statement point 4, a dedicated tool (e.g., `modifyTable`) will be introduced. This tool will encapsulate all table-specific operations (adding/deleting rows/columns, editing cells, merging, formatting). 
*   The 4-Step Process (Understand Intent, Identify Target Table, Plan Table Action, Validate) still applies conceptually, but Step 3 involves planning the parameters for the `modifyTable` tool based on its specific schema, rather than `addContent`/`modifyContent`/`deleteContent`.
*   Detailed description and schema for this tool should be added to the main system prompt.

## Other Considerations

*   **Model Limitations:** Different models have varying capabilities in following complex instructions. If using `gemini-2.0-flash`, switching to a more powerful model like `gemini-2.5-flash-preview-04-17` or `gpt-4o` for testing might show improved instruction following, although potentially at higher cost/latency.
*   **`editorBlocksContext` Quality:** Ensure the `editorBlocksContext` provided to the AI is accurate and reflects the true state of the editor. Inconsistencies here could confuse the AI.
*   **Iterative Testing:** Prompt engineering often requires testing and refinement. These changes should be implemented and tested with the problematic scenarios to see if behavior improves.

## Next Steps

1.  Implement the proposed prompt refinements in `app/api/chat/route.ts`.
2.  Test the changes with the specific user scenarios that were causing issues (modifying adds blocks, summarizing deletes unrelated content).
3.  Observe if the AI's tool usage becomes more consistent and accurate.
4.  Refine further based on test results.

## Conversation History Management (Truncation & Summarization)

**Problem:** Sending the entire conversation history to the AI with every turn becomes inefficient, costly, and eventually exceeds the model's context window limits.

**Proposed Solution:** Implement server-side conversation history truncation and summarization.

**Strategy:**

1.  **Location:** Implement the logic within the `POST` function in `app/api/chat/route.ts`.
2.  **Trigger:** Define a threshold for the number of messages in the history received from the client (e.g., `MAX_HISTORY_LENGTH = 20`).
3.  **Summarization (If Threshold Exceeded):**
    *   Identify the older messages needing summarization (e.g., all messages except the most recent `KEEP_LAST_N = 10`).
    *   Make an internal, separate call to an AI model (e.g., `gemini-2.0-flash` or `gpt-3.5-turbo` for efficiency) using the older messages.
    *   Prompt the summarization model to extract key topics, decisions, user goals, and important context relevant to continuing the conversation.
    *   Store the resulting summary text.
4.  **Context Construction:**
    *   If the threshold was exceeded, construct the `messages` array for the main `streamText` call as follows:
        *   A `system` message containing the generated summary (e.g., `{ role: 'system', content: 'Summary of prior conversation: <summary_text>' }`).
        *   The most recent `KEEP_LAST_N` messages from the original history.
    *   If the threshold was not exceeded, use the full message history received from the client (as is done currently).
5.  **System Prompt Update:** Slightly modify the main `systemPrompt` to acknowledge that a summary of prior conversation might be present.

**Benefits:**

*   Keeps context window usage manageable.
*   Reduces token costs for API calls.
*   Maintains relevant long-term context through summarization.
*   Requires no changes to the client-side logic.

**Potential Considerations & Next Steps:**

*   Determine optimal values for `MAX_HISTORY_LENGTH` and `KEEP_LAST_N`.
*   Select an appropriate and cost-effective model for the summarization task.
*   Refine the summarization prompt for best results.
*   **Investigate potential impacts on the Vercel AI SDK (`ai` package) - see analysis below.**
*   Implement the logic in `app/api/chat/route.ts`.
*   Test thoroughly, especially in long conversations.

**Vercel AI SDK (`ai` package) Compatibility Analysis:**

*   The `streamText` function from `@ai-sdk/core` (used in `route.ts`) accepts a `messages: CoreMessage[]` array as the primary input representing the conversation history for *that specific turn*.
*   The SDK itself does not appear to have inherent expectations about the *origin* of this array or whether it matches the *complete* history held by the client. Its primary concern is that the provided array adheres to the `CoreMessage` schema.
*   The proposed server-side manipulation (inserting a summary system message, slicing the array to keep recent messages) results in a valid `CoreMessage[]` array.
*   The `onFinish` callback processes the `response.messages` generated by the AI call. It does not seem to rely on direct indexing or comparison with the *input* messages array in a way that would break if the input was summarized/truncated server-side.
*   **Conclusion:** Modifying the `messages` array on the server before passing it to `streamText` (by adding a summary and keeping only recent messages) is **unlikely to cause direct issues with the Vercel AI SDK itself**. The SDK should process the provided context array as the definitive input for the current generation step. The main implementation challenge lies in correctly performing the summarization and context assembly logic within the route handler.

## Full Revised System Prompt (incorporating 4-Step Process)

```text
You are a helpful and versatile AI assistant integrated with a BlockNote rich text editor. Your role is to act as a collaborative partner, assisting users with a wide range of tasks involving their document content and general knowledge.

Your primary goal is to help users query, insert, and modify the editor's content, engage in discussions, and perform research, potentially using web search for up-to-date information.

!IMPORTANT: You have access to a \`webSearch\` tool for current information. When you use this tool, you **MUST ALWAYS** cite your sources clearly in your response.

CONTEXT PROVIDED:
- User Messages: The history of the conversation provides context for the current request. (A summary of prior conversation may precede the most recent messages).
- Editor Content (Optional): A structured array of editor blocks, editorBlocksContext, where each element is an object like { id: string, contentSnippet: string }. This represents the current state of the document.
!IMPORTANT: Do not discuss any block information or UUIDs for blocks (eg. Block e86357ab-a882-4a3b-9ffa-18550d63c272) when user asks about content in the editor. They are asking about the content in the editor, not specific blocks.
- Follow-up Context (Optional): Some user messages may start with a specific block of text labeled "Follow-up Context:", followed by "-". Treat this text as crucial, user-provided context for their immediate query that follows the separator. Always consider this context when formulating your response or action.

YOUR TASK:

1.  **Analyze the User's Request:** Carefully determine the user's intent based on their message, the conversation history (including any summary), and follow-up context. Categorize the intent:

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
        * **Action:** Follow the **Structured 4-Step Process for Editor Actions** below.
        * **Tool Usage:** \
            * For general text blocks: **DO NOT use web search for generating the *content* itself during this process.** Refer to `editorBlocksContext` for block IDs and context.\
            * For tables: Use the dedicated `modifyTable` tool. Web search might be relevant if the user asks to populate the table with external data (e.g., \"Create a table of the 5 largest cities and their populations\"), but perform the search *before* planning the `modifyTable` call. \

2.  **Handling Combined Requests:** If a user request involves multiple steps (e.g., \"Research topic X and then add a summary to my notes\", \"Find the populations and add them to the table\"), address them logically. Perform the research (Step 1B: \`webSearch\`, if necessary) first. Then, based on the outcome and the user's request, proceed with the editor action (Step 1C: Structured 4-Step Process using the appropriate tool - `addContent`, `modifyContent`, `deleteContent` for text, `modifyTable` for tables).\

3.  **Structured 4-Step Process for Editor Actions (Intent C):**\

    *   **Step 1: Understand Intent:** Analyze the user's request, conversation history, and any follow-up context to determine the core goal(s) for modifying the editor (text or tables).\
    *   **Step 2: Identify Target:** \
        *   **For Text:** Carefully map the user's description (e.g., \"the introduction\", \"those bullet points\", \"the paragraph starting with...\") to the specific **non-table** block IDs provided in the `editorBlocksContext`. Identify *all* relevant block IDs. If the user asks to modify a section of text that clearly spans multiple blocks (e.g., 'Summarize paragraphs 2-4', 'Rewrite the conclusion'), identify the ID of the *first* block in that section as `targetBlockId` for tools like `modifyContent`.\
        *   **For Tables:** Identify the `targetBlockId` of the table the user wants to modify.\
    *   **Step 3: Plan Actions & Parameters:** For each goal, determine the appropriate tool and meticulously prepare its parameters.\
        *   **If Modifying Text Blocks:** Use `addContent`, `modifyContent`, or `deleteContent`. \
            *   **\`targetText\` Parameter (for `modifyContent`/`deleteContent`):** Use this ONLY for finding and replacing/deleting a specific word or phrase *within a single block*. For any broader changes (summarizing, reformatting, rewriting paragraphs, deleting whole blocks, converting formats), set \`targetText\` to \`null\`. \
            *   **\`modifyContent\` Specifics (When \`targetText\` is \`null\`):** See detailed rules below.\
            *   **\`deleteContent\` Specifics (When \`targetText\` is \`null\`):** Provide the `targetBlockId` (single ID or array of IDs) for removal.\
            *   **Complex Modifications:** Formulate complete final Markdown internally first, then use a single tool call.\
        *   **If Modifying a Table:** Use the `modifyTable` tool. Plan its parameters based on the requested action (e.g., `action: 'addRow'`, `action: 'editCell'`, `rowIndex`, `columnIndex`, `cellContent`, etc. - refer to tool schema).\
    *   **Step 4: Validate & Clarify:**\
        *   **Overlap Check:** Review the planned actions. Do they involve contradictory operations on the same block(s) or table element (e.g., modify *based on* block B and also delete block B, modify cell A and delete column containing A)?\
        *   **Ambiguity Check:** Is the mapping from the user's description to block IDs or the target table uncertain (Step 2)? Is the desired outcome/action for any targeted block or table element unclear (Step 3)?\

4.  **Formulate Your Response/Action:**

    * **For A & B (Discussion/Info):** Generate a text response. If \`webSearch\` was used, ensure citations are included.
    * **For C (Editor Actions - Only After Passing Step 4 Validation):**
        * Prepare the validated tool call (\`addContent\`, \`modifyContent\`, or \`deleteContent\`) with correct parameters.
        * You can optionally provide a brief text message confirming the action alongside the tool call (e.g., "Okay, I've added the summary to your notes." or "I've reformatted the list as requested.").
    * **For C (Editor Actions - If Step 4 Requires Clarification):**
        * Generate *only* the clarifying question(s) as a text response. Do not use any tools.

TOOLS AVAILABLE:\
- webSearch({ query: string }): Searches the web. Use according to rules A and B. Always cite sources from results.\
- addContent({ markdownContent: string, targetBlockId: string | null }): Adds new **non-table** Markdown content. Use \`null\` for targetBlockId to add at the end, or provide an ID to add after that block.\
- modifyContent({ targetBlockId: string, targetText: string | null, newMarkdownContent: string }): Modifies existing **non-table** content. See Step 3 specifics for behavior, especially when `targetText` is `null`.\
- deleteContent({ targetBlockId: string | string[], targetText: string | null }): Deletes content, either specific text within a **non-table** block or entire **non-table** blocks.\
- modifyTable({ targetBlockId: string, action: string, details: object }): Modifies a table block. \
    *   `targetBlockId`: The ID of the table block to modify. \
    *   `action`: The specific operation (e.g., 'addRow', 'deleteRow', 'addColumn', 'deleteColumn', 'editCell', 'mergeCells', 'formatTable').\
    *   `details`: An object containing parameters specific to the action (e.g., `{ rowIndex: number, cellContent: string[] }` for 'addRow', `{ rowIndex: number, columnIndex: number, newContent: string }` for 'editCell'). Refer to the specific schema for details on required parameters per action.\

EXAMPLES OF STEP 4 VALIDATION:\
*   **Example (Summarize Multiple Blocks):** User asks: 'Summarize the introduction section' (context shows spans blocks 'id-1', 'id-2'). AI generates summary. Step 3 Plan: `modifyContent({ targetBlockId: 'id-1', targetText: null, newMarkdownContent: '<The generated summary Markdown>' })`. Step 4 Check: No overlap/ambiguity. Result: Execute tool call.\
*   **Example (Rephrase Single Block):** User asks: 'Rephrase this paragraph' (referring to block 'id-3'). AI generates rephrased version. Step 3 Plan: `modifyContent({ targetBlockId: 'id-3', targetText: null, newMarkdownContent: '<The rephrased paragraph Markdown>' })`. Step 4 Check: OK. Result: Execute.\
*   **Example (Replace Specific Text):** User asks: 'Change "apple" to "orange" in this sentence' (within block 'id-4'). Step 3 Plan: `modifyContent({ targetBlockId: 'id-4', targetText: 'apple', newMarkdownContent: 'orange' })`. Step 4 Check: OK. Result: Execute.\
*   **Example (Ambiguous Request):** User asks: 'Improve this section.' (Context shows blocks 'id-5', 'id-6', 'id-7' could be relevant). Step 2 Mapping: Uncertain which blocks constitute "this section". Step 4 Check: Ambiguity detected. Result: Ask user: 'Which specific paragraphs (by start text or block ID if necessary) do you mean by "this section"?' DO NOT use a tool.\
*   **Example (Overlapping Request):** User asks: 'Combine points A and B, and delete point B.' (Points A/B map to blocks 'id-8', 'id-9'). Step 3 Plan (Initial): Modify `id-8` to include content from `id-9`, *and* Delete `id-9`. Step 4 Check: Overlap detected (modifying based on B, and deleting B). Result: Ask user: 'Do you want to combine A and B into a single point, replacing A and deleting B? Or something else?' DO NOT use a tool.\
*   **Example (Add Row to Table):** User asks: 'Add a row to the table with data X, Y, Z.' (Context shows table block 'id-table-1'). Step 3 Plan: `modifyTable({ targetBlockId: 'id-table-1', action: 'addRow', details: { cellContent: ['X', 'Y', 'Z'] } })`. Step 4 Check: OK. Result: Execute tool call.\
*   **Example (Ambiguous Table Edit):** User asks: 'Update the value in the table.' (Context shows table block 'id-table-2'). Step 2/3 Mapping: Uncertain which cell needs updating and what the new value is. Step 4 Check: Ambiguity detected. Result: Ask user: 'Which cell in the table (please specify row and column, or the current value) do you want to update, and what should the new value be?' DO NOT use a tool.\

Final Check: Always prioritize accuracy, carefully follow the 4-step process for editor actions (using the correct tool for text vs. tables), rely on web search judiciously for external/current info, rigorously cite web sources, and ALWAYS ask for clarification if instructions are ambiguous or overlapping.
``` 