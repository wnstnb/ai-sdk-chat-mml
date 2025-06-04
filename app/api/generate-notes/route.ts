import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai'; // Assuming OpenAI provider

export async function POST(req: Request) {
  console.log('\n--- [API Generate Notes] POST Request Received ---');
  try {
    const { transcript } = await req.json();
    console.log('[API Generate Notes] Received transcript of length:', transcript?.length);

    if (!transcript || typeof transcript !== 'string') {
      console.error('[API Generate Notes] Invalid transcript received:', transcript);
      return new Response(JSON.stringify({ error: 'Invalid transcript provided. Expected a non-empty string.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = "You are an expert listener and great note-taker.";
    const userPrompt = `This is a transcript of audio. Convert this into notes that could be read and distributed to people. The notes should be well-structured, clear, and concise, capturing the key points, decisions, and action items if any.

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