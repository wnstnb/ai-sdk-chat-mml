import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, NextRequest } from 'next/server';
import { 
    searchByTitle, 
    searchByEmbeddings, 
    searchByContentBM25,
    combineAndRankResults 
} from '@/lib/ai/searchService';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// NOTE: This route runs as a standard Serverless Function (Node.js runtime).

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const GEMINI_EMBEDDING_MODEL = 'models/text-embedding-004';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query) {
        return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }
    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY environment variable not set for search route.");
        return NextResponse.json({ error: 'Server configuration error: Missing API Key' }, { status: 500 });
    }

    const cookieStore = cookies();
    // Use createServerClient from @supabase/ssr for server-side client creation
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                // Note: set and remove are not typically needed in GET handlers
                // but included here for completeness if adapted for POST/etc.
                set(name: string, value: string, options: CookieOptions) {
                    cookieStore.set({ name, value, ...options });
                },
                remove(name: string, options: CookieOptions) {
                    cookieStore.delete({ name, ...options });
                },
            },
        }
    );

    try {
        // 1. Get User Session
        const { data: { user }, error: sessionError } = await supabase.auth.getUser();

        if (sessionError) {
            console.error('Search Auth Error (getUser):', sessionError);
            return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
        }
        if (!user) {
            console.error('Search Auth Error: No user session found.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = user.id;
        console.log(`[API Search] User ${userId} searching for: "${query}"`);

        // 2. Generate query embedding using Gemini REST API
        console.log(`[API Search] Generating query embedding...`);
        const embedApiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text: query }] },
                // task_type: "SEMANTIC_SIMILARITY", // Crucial for query embeddings
            }),
        });

        if (!embedApiResponse.ok) {
            const errorBody = await embedApiResponse.text();
            console.error("[API Search] Gemini API Error Response (Query Embedding):", errorBody);
            throw new Error(`Gemini query embedding request failed with status ${embedApiResponse.status}`);
        }

        const embedApiData = await embedApiResponse.json();

        if (!embedApiData.embedding?.values) {
            console.error("[API Search] Invalid response structure from Gemini API (Query Embedding):", embedApiData);
            throw new Error("Invalid response structure from Gemini API (Query Embedding): embedding.values missing.");
        }
        const queryEmbedding = embedApiData.embedding.values;
        console.log(`[API Search] Query embedding generated.`);

        // 3. Perform semantic search using Supabase RPC ('match_documents' needs VECTOR(768))
        const matchThreshold = 0.6; // Example threshold - tune as needed
        const matchCount = 10;
        console.log(`[API Search] Calling RPC match_documents (threshold: ${matchThreshold}, count: ${matchCount})...`);

        const { data: documents, error: rpcError } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: matchThreshold,
            match_count: matchCount,
            user_id_input: userId // Pass user_id to ensure RLS-like filtering within the function
        });

        if (rpcError) {
            console.error('[API Search] RPC Error (match_documents):', rpcError);
            throw new Error(`Database search failed: ${rpcError.message}`);
        }

        console.log(`[API Search] Found ${documents?.length ?? 0} documents.`);
        return NextResponse.json(documents || [] );

    } catch (error) {
        console.error('[API Search] Overall Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to perform search';
        // Avoid leaking sensitive details in production responses
        return NextResponse.json({ error: 'Failed to perform search', details: errorMessage }, { status: 500 });
    }
}

export const runtime = 'edge';

export async function POST(request: NextRequest) {
    const supabase = createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query: string;
    try {
        const body = await request.json();
        query = body.query;
        if (typeof query !== 'string' || !query.trim()) {
            return NextResponse.json({ error: 'Search query must be a non-empty string' }, { status: 400 });
        }
    } catch (e) {
        return NextResponse.json({ error: 'Invalid request body or missing query' }, { status: 400 });
    }

    try {
        const [titleMatches, semanticMatches, contentMatches] = await Promise.all([
            searchByTitle(query),
            searchByEmbeddings(query),
            searchByContentBM25(query)
        ]);

        const combinedResults = combineAndRankResults(
            titleMatches, 
            semanticMatches, 
            contentMatches
        );

        // The Omnibar expects results with id, name, and optionally similarity (renamed to finalScore)
        // It also handles folder_id, but our search service doesn't provide that directly.
        // We can adapt this if folder_id is crucial and can be fetched.
        const formattedResults = combinedResults.map(doc => ({
            id: doc.id,
            name: doc.name,
            similarity: doc.finalScore, // Use finalScore as similarity for Omnibar
            folder_id: null, // Placeholder for folder_id
            summary: doc.summary // Pass summary if available
        }));

        return NextResponse.json(formattedResults);
    } catch (error: any) {
        console.error('Document search error:', error);
        return NextResponse.json({ error: 'Failed to search documents', details: error.message }, { status: 500 });
    }
} 