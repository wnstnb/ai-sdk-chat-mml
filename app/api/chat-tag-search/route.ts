import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// NOTE: This route is specifically for chat document tagging.

// Remove unused Gemini API constants
// const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
// const GEMINI_EMBEDDING_MODEL = 'models/text-embedding-004';
// const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const searchTerm = searchParams.get('q');
    const docIdsString = searchParams.get('docIds');

    if (!searchTerm && !docIdsString) {
        return NextResponse.json({ error: "Either search term ('q') or document IDs ('docIds') parameter is required" }, { status: 400 });
    }
    // Remove unused API key check
    // if (!GEMINI_API_KEY) {
    //     console.error("GEMINI_API_KEY environment variable not set for chat-tag-search route.");
    //     return NextResponse.json({ error: 'Server configuration error: Missing API Key' }, { status: 500 });
    // }

    const cookieStore = cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
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
        const { data: { user }, error: sessionError } = await supabase.auth.getUser();

        if (sessionError) {
            console.error('Chat Tag Search Auth Error (getUser):', sessionError);
            return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
        }
        if (!user) {
            console.error('Chat Tag Search Auth Error: No user session found.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = user.id;
        console.log(`[API Chat Tag Search] User ${userId} searching for: "${searchTerm}"`);

        // Remove semantic search logic
        // console.log(`[API Chat Tag Search] Generating query embedding for: "${searchTerm}"...`);
        // const embedApiResponse = await fetch(GEMINI_API_URL, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         content: { parts: [{ text: searchTerm }] },
        //     }),
        // });

        // if (!embedApiResponse.ok) {
        //     const errorBody = await embedApiResponse.text();
        //     console.error("[API Chat Tag Search] Gemini API Error Response (Query Embedding):", errorBody);
        //     throw new Error(`Gemini query embedding request failed with status ${embedApiResponse.status}`);
        // }

        // const embedApiData = await embedApiResponse.json();

        // if (!embedApiData.embedding?.values) {
        //     console.error("[API Chat Tag Search] Invalid response structure from Gemini API (Query Embedding):", embedApiData);
        //     throw new Error("Invalid response structure from Gemini API (Query Embedding): embedding.values missing.");
        // }
        // const queryEmbedding = embedApiData.embedding.values;
        // console.log(`[API Chat Tag Search] Query embedding generated.`);

        let query = supabase.from('documents').select('id, name');

        if (docIdsString) {
            const ids = docIdsString.split(',').filter(id => id.trim() !== '');
            if (ids.length === 0) {
                return NextResponse.json({ documents: [] }); // No valid IDs provided
            }
            console.log(`[API Chat Tag Search] User ${userId} fetching by IDs:`, ids);
            query = query.in('id', ids);
        } else if (searchTerm) {
            console.log(`[API Chat Tag Search] User ${userId} searching for name: "${searchTerm}"`);
            query = query.ilike('name', `%${searchTerm}%`).limit(10); // Limit results for name search
        } else {
            // Should not happen due to the check at the beginning, but as a fallback:
            return NextResponse.json({ documents: [] }); 
        }
        
        const { data: documents, error: dbError } = await query
            .eq('user_id', userId); // Ensure RLS is applied for both cases

        if (dbError) {
            console.error('[API Chat Tag Search] Database Query Error:', dbError);
            throw new Error(`Database query failed: ${dbError.message}`);
        }

        console.log(`[API Chat Tag Search] Found ${documents?.length ?? 0} documents.`);
        return NextResponse.json({ documents: documents || [] });

    } catch (error) {
        console.error('[API Chat Tag Search] Overall Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to perform search';
        return NextResponse.json({ error: 'Failed to perform chat tag search', details: errorMessage }, { status: 500 });
    }
} 