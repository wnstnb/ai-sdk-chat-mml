import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai'; // Assuming OpenAI provider

export async function POST(req: Request) {
  console.log('\n--- [API Generate Notes] POST Request Received ---');
  try {
    const { transcript, timestamp } = await req.json();
    console.log('[API Generate Notes] Received transcript of length:', transcript?.length);
    console.log('[API Generate Notes] Received timestamp:', timestamp);

    if (!transcript || typeof transcript !== 'string') {
      console.error('[API Generate Notes] Invalid transcript received:', transcript);
      return new Response(JSON.stringify({ error: 'Invalid transcript provided. Expected a non-empty string.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = "You are an expert listener and a great note-taker. You take transcripts of audio conversations, understand what is being discussed, and produce well-structured, clear, and concise notes. Your notes capture key points, decisions, and any action items. Focus on clarity and usefulness for someone who did not attend the conversation. You must format your output using ONLY the following markdown syntax that is compatible with BlockNote editor:\n\n- Use # ## ### #### ##### for headings (with space after #). Use less than 5 levels of headings.\n- Use * for bullet points (with space after *)\n- Use 1. 2. 3. for numbered lists (with space after number)\n- Use **text** for bold\n- Use *text* for italic\n- Use `code` for inline code\n- Use ``` for code blocks\n- Use > for blockquotes (with space after >)\n- Use --- for horizontal rules\n- Use [text](url) for links\n- Use proper spacing: blank lines between different block elements\n- For nested lists, indent with 2 spaces per level\n\nDO NOT use any other markdown syntax. Keep formatting simple and clean.";
    const timestampContext = timestamp ? `\n\nRecording Date/Time: ${timestamp}` : '';
    const userPrompt = `This is a transcript of audio. Convert this into notes that could be read and distributed to people. The notes should be well-structured, clear, and concise, capturing the key points, decisions, and action items if any.${timestampContext}

Transcript:
${transcript}`;

    console.log('[API Generate Notes] System Prompt:', systemPrompt);
    console.log('[API Generate Notes] User Prompt (first 100 chars of transcript):', userPrompt.substring(0, userPrompt.indexOf('Transcript:\n') + 100) + "...");

    const result = await generateText({
      model: openai('gpt-4.1'), // Using gpt-4.1 as a specific model
      system: systemPrompt,
      prompt: userPrompt,
      // Optional: Add parameters like maxTokens, temperature if needed
      // maxTokens: 800,
      // temperature: 0.7,
    });

    const generatedNotes = result.text;
    console.log('[API Generate Notes] Raw generatedNotes from AI:', generatedNotes);

    return new Response(JSON.stringify({ notes: generatedNotes }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[API Generate Notes] Error generating notes:', error);
    // Consider more specific error handling based on error types
    let errorMessage = 'Failed to generate notes.';
    if (error.message) {
      errorMessage += ` Details: ${error.message}`;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 