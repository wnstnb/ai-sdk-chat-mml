import OpenAI from 'openai';

// Optional: Set the runtime to edge for best performance, though not required
// export const runtime = 'edge';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'Transcript is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const systemPrompt = `You are an attentive listener and meticulous note-taker. This is a raw audio transcript. Your task is to correct typos, misspellings, and transcription errors so the text is easy to read and accurately reflects what was said. Do not summarize or rephrase. Preserve the intent and tone of the speaker. Your goal is a clean, readable transcript that remains faithful to the original words. Remove markers like "--- Recording Started ---" and similar ones, as they are just references on when the speaker started and stopped.`;

    // Request the OpenAI API for a completion
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1', // Or your preferred model
      stream: false, // We want the full response for prettification, not a stream
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      temperature: 0.3, // Lower temperature for more deterministic output
      max_tokens: Math.floor(transcript.length * 1.5), // Estimate tokens, allow for some expansion
    });

    const prettifiedText = response.choices[0]?.message?.content;

    if (!prettifiedText) {
      return new Response(JSON.stringify({ error: 'Failed to get a valid response from AI' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify({ notes: prettifiedText }), { // Sending back as 'notes' to match frontend expectation
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });

  } catch (error: any) {
    console.error('[API Prettify Error]', error);
    let errorMessage = 'An unknown error occurred';
    if (error.message) {
      errorMessage = error.message;
    }
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage = error.response.data.error.message || errorMessage;
    }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
} 