import { generateText, streamText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req: Request) {
  console.log('\n--- [API Generate Summary] POST Request Received ---');
  try {
    const { messages } = await req.json();
    console.log('[API Generate Summary] Received messages:', JSON.stringify(messages, null, 2));

    // Prompt for Summary Agent - copied from prds/summary_agent.md
    const systemPrompt = `
**Objective:** Generate a concise and informative summary of a conversation where a user interacts with an AI to edit a document. The summary should consist of two distinct parts: an Abstractive Summary and an Extractive Summary.

**Conversation Context:** The provided input will be a list of messages exchanged between a user and an AI. These messages will contain user instructions for document edits AND substantive discussion about the document\'s content.

**Key Instructions for Summarization:**

1.  **Prioritize Content Over Actions:** Your primary focus should be on summarizing the *content* being discussed, created, or modified within the document. Do **not** summarize the user\'s explicit editing commands or guidance to the AI (e.g., "change this sentence," "make this bold," "can you rephrase that?"). However, do consider the *subject matter* of those edits as part of the content.

2.  **Abstractive Summary:**
    * Provide a high-level, concise overview of the main topics discussed and the overall purpose or outcome of the conversation related to the document\'s content.
    * This summary should synthesize the information into new sentences.
    * **Length:** Strictly limit to **1-3 sentences**.

3.  **Extractive Summary:**
    * Identify and extract key points, arguments, decisions, and significant pieces of information directly from the conversation.
    * **Focus on:**
        * Topics the user explicitly states are important (e.g., "This is a key takeaway," "Make sure to include this").
        * Themes, keywords, or topics the user emphasizes, perhaps through repetition or by asking multiple clarifying questions about them.
        * Significant information or facts discussed.
    * Organize these points hierarchically if sub-points exist.

**Output Format:**

Your response **must** strictly adhere to the following format:

# Abstract Summary:
---
[Your abstract summary here, 1-3 sentences]

# Extractive Summary:
---
* Main point 1
    * Sub-point 1.1 (if applicable)
    * Sub-point 1.2 (if applicable)
* Main point 2
* Main point 3
    * Sub-point 3.1 (if applicable)

**Input:**

[Placeholder for the list of messages in the conversation]

    `;

    // Format messages for the prompt, mimicking the SQL output illustration
    const formattedMessages = messages.map((msg: any) => `|${msg.role}|${msg.content_text}|`).join('\n');
    const userPrompt = `Output:\n|role|content_text|\n|---|---|\n${formattedMessages}`;
    console.log('[API Generate Summary] System Prompt:', systemPrompt);
    console.log('[API Generate Summary] User Prompt (Formatted Messages):', userPrompt);

    const result = await generateText({
      model: google('gemini-1.5-flash-8b'),
      system: systemPrompt,
      prompt: userPrompt,
    });

    const generatedText = result.text;
    console.log('[API Generate Summary] Raw generatedText from AI:', generatedText);

    // Parse the generated text to extract summaries
    const abstractMatch = generatedText.match(/# Abstract Summary:\n---\n([\s\S]*?)# Extractive Summary:/);
    const extractiveMatch = generatedText.match(/# Extractive Summary:\n---\n([\s\S]*)/);

    const abstract_summary = abstractMatch ? abstractMatch[1].trim() : '';
    const extractive_summary = extractiveMatch ? extractiveMatch[1].trim() : '';
    console.log('[API Generate Summary] Parsed Abstract Summary:', abstract_summary);
    console.log('[API Generate Summary] Parsed Extractive Summary:', extractive_summary);

    return new Response(JSON.stringify({ abstract_summary, extractive_summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[API Generate Summary] Error generating summary:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate summary' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 