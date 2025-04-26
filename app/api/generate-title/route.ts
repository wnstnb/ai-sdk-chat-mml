import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google'; // Use the Vercel AI SDK Google provider
import { generateText } from 'ai';

// Define the specific model ID
const MODEL_ID = 'gemini-2.0-flash'; // Stick with flash for speed

// System Prompt for title generation
const systemPrompt = `Generate a concise and relevant title (5-15 words max) for a document starting with the following text. Output only the title itself, with no extra formatting or labels, and no surrounding quotes.`;

export async function POST(req: Request) {
    try {
        const { content: editorContentSnippet } = await req.json();

        if (!editorContentSnippet) {
            return NextResponse.json(
                { error: 'Missing editor content snippet' },
                { status: 400 }
            );
        }

        // Instantiate the Google Generative AI model via Vercel AI SDK
        const model = google(MODEL_ID);

        // Generate the title using the AI SDK
        const { text: generatedTitle, finishReason } = await generateText({
            model: model,
            system: systemPrompt,
            prompt: `Document Snippet:

---
${editorContentSnippet}
---`,
            // Optional: Add parameters like maxTokens if needed
            // maxTokens: 25, // Limit title length server-side?
        });

        if (finishReason === 'error' || !generatedTitle) {
            console.error('[generate-title] AI generation failed or returned empty.', { finishReason });
            return NextResponse.json({ error: 'Failed to generate title.' }, { status: 500 });
        }

        // Clean up the title (remove potential quotes, extra whitespace)
        const cleanedTitle = generatedTitle.replace(/^["\s]+|["\s]+$/g, '').trim(); // More robust cleaning

        // Return the generated title
        return NextResponse.json({ title: cleanedTitle });

    } catch (error) {
        console.error('Error generating title:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Failed to generate title: ${errorMessage}` },
            { status: 500 }
        );
    }
}

// Optional: Add Edge Runtime configuration if preferred
// export const runtime = 'edge'; 