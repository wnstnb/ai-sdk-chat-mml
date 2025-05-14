import { NextRequest, NextResponse } from 'next/server';
import { searchByTitle, searchByEmbeddings, searchByContentBM25, combineAndRankResults } from '@/lib/ai/searchService';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// NOTE: This route is specifically for chat document tagging.

// Remove unused Gemini API constants
// const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
// const GEMINI_EMBEDDING_MODEL = 'models/text-embedding-004';
// const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

export const runtime = 'edge'; // Optional: Use edge runtime if preferred

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const docIdsString = searchParams.get('docIds');

    if (!query && !docIdsString) {
        return NextResponse.json({ error: "Either search term ('q') or document IDs ('docIds') parameter is required" }, { status: 400 });
    }
    // Remove unused API key check
    // if (!GEMINI_API_KEY) {
    //     console.error("GEMINI_API_KEY environment variable not set for chat-tag-search route.");
    //     return NextResponse.json({ error: 'Server configuration error: Missing API Key' }, { status: 500 });
    // }

    // Ensure user is authenticated (optional but recommended)
    const supabase = createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error('Chat Tag Search Auth Error:', authError?.message);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Explicitly check for null or empty query *before* using it
        if (!query) {
            return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
        }

        // Now TypeScript knows query is a string here
        // Perform all three searches in parallel
        const [titleMatches, semanticMatches, contentMatches] = await Promise.all([
            searchByTitle(query),
            searchByEmbeddings(query),
            searchByContentBM25(query) // NEW: Add content search
        ]);

        // Combine and rank the results
        const combinedResults = combineAndRankResults(
            titleMatches,
            semanticMatches,
            contentMatches // NEW: Pass content matches
        );

        // Format results for the frontend
        const formattedDocuments = combinedResults.map(doc => ({
            id: doc.id,
            name: doc.name,
            // Add any other fields needed by DocumentSearchInput.tsx
        }));

        return NextResponse.json({ documents: formattedDocuments });

    } catch (error: any) {
        console.error('Error during document search:', error);
        return NextResponse.json({ error: 'Failed to search documents', details: error.message }, { status: 500 });
    }
} 