// app/api/generate-embedding/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'; // Use @supabase/ssr for user auth
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // Import plain client for Admin

// --- Environment Variables ---
const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GEMINI_EMBEDDING_MODEL = 'models/text-embedding-004';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

// --- Input Validation ---
interface RequestBody {
    documentId?: string;
}

export async function POST(request: Request) {
    // --- Configuration Checks ---
    if (!GEMINI_API_KEY) {
        console.error("[API Embed] Server configuration error: Missing GEMINI_API_KEY");
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("[API Embed] Server configuration error: Missing Supabase Admin credentials");
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // --- Request Body Validation ---
    let requestBody: RequestBody;
    try {
        requestBody = await request.json();
    } catch (e) {
        return NextResponse.json({ error: 'Invalid request body: Must be valid JSON' }, { status: 400 });
    }
    const { documentId } = requestBody;

    if (!documentId || typeof documentId !== 'string') {
        return NextResponse.json({ error: 'documentId (string) is required in the request body' }, { status: 400 });
    }
    console.log(`[API Embed] Received request for documentId: ${documentId}`);

    // --- Initialize Supabase Clients ---
    const cookieStore = cookies();
    // User client (for getting authenticated user ID)
    const supabaseUserClient = createServerClient(
        SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // Use Anon key for user client
        {
            cookies: {
                get(name: string) { return cookieStore.get(name)?.value },
                set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
                remove(name: string, options: CookieOptions) { cookieStore.delete({ name, ...options }) },
            },
        }
    );
    // Admin client (for bypassing RLS - requires manual security checks!)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        // 1. Get Authenticated User
        const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
        if (authError || !user) {
            console.error('[API Embed] Auth Error:', authError);
            return NextResponse.json({ error: 'Unauthorized - Authentication failed' }, { status: 401 });
        }
        const userId = user.id;
        console.log(`[API Embed] Authenticated user: ${userId}`);

        // 2. Fetch Document Content & Owner using Admin Client
        console.log(`[API Embed] Fetching document content using Admin client...`);
        const { data: documentData, error: fetchError } = await supabaseAdmin
            .from('documents')
            .select('searchable_content, user_id') // Select owner ID
            .eq('id', documentId)
            .single(); // Expect exactly one document

        if (fetchError) {
            console.error(`[API Embed] Error fetching document ${documentId}:`, fetchError);
            if (fetchError.code === 'PGRST116') { // Not found
                return NextResponse.json({ error: 'Document not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Failed to fetch document content' }, { status: 500 });
        }

        // 3. *** CRITICAL SECURITY CHECK ***: Verify Ownership
        if (documentData.user_id !== userId) {
            console.error(`[API Embed] SECURITY ALERT: User ${userId} attempted to generate embedding for document ${documentId} owned by ${documentData.user_id}`);
            return NextResponse.json({ error: 'Forbidden - Document does not belong to user' }, { status: 403 });
        }
        console.log(`[API Embed] Ownership verified for user ${userId} and document ${documentId}`);

        const searchable_content = documentData.searchable_content;

        // 4. Handle NULL/Empty Content - Delete existing embedding
        if (!searchable_content?.trim()) {
            console.log(`[API Embed] Document ${documentId} content is empty. Deleting existing embedding (if any)...`);
            const { error: deleteError } = await supabaseAdmin // Use Admin for delete
                .from('documents_embeddings')
                .delete()
                .match({ document_id: documentId }); // Match on document_id

            if (deleteError) {
                // Log error but don't fail the request, as the goal (no embedding for empty content) is achieved
                console.error(`[API Embed] Error deleting embedding for ${documentId}:`, deleteError);
            } else {
                 console.log(`[API Embed] Successfully ensured no embedding exists for empty document ${documentId}.`);
            }
            return NextResponse.json({ message: 'Embedding deleted or non-existent due to empty content.' }, { status: 200 });
        }

        // 5. Generate Embedding via Gemini API
        console.log(`[API Embed] Generating Gemini embedding for document ${documentId}...`);
        const embedApiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text: searchable_content }] },
                task_type: "RETRIEVAL_DOCUMENT", // Crucial for document embeddings
            }),
        });

        if (!embedApiResponse.ok) {
            const errorBody = await embedApiResponse.text();
            console.error("[API Embed] Gemini API Error Response (Document Embedding):", errorBody);
            // Consider more specific error handling based on Gemini status codes if needed
            throw new Error(`Gemini document embedding request failed with status ${embedApiResponse.status}`);
        }
        const embedApiData = await embedApiResponse.json();
        if (!embedApiData.embedding?.values) {
             console.error("[API Embed] Invalid response structure from Gemini API (Document Embedding):", embedApiData);
            throw new Error("Invalid response structure from Gemini API (Document Embedding): embedding.values missing.");
        }
        const embedding = embedApiData.embedding.values;
        console.log(`[API Embed] Gemini embedding generated for document ${documentId}.`);

        // 6. Upsert Embedding using Admin Client
        console.log(`[API Embed] Upserting embedding into documents_embeddings table...`);
        const { error: upsertError } = await supabaseAdmin
            .from('documents_embeddings')
            .upsert({
                document_id: documentId,
                user_id: userId, // Store user_id for potential RLS on this table later
                embedding: embedding,
            }, { onConflict: 'document_id' }); // Specify conflict column

        if (upsertError) {
            console.error('[API Embed] Upsert Error:', upsertError);
            throw new Error(`Failed to upsert embedding: ${upsertError.message}`);
        }

        console.log(`[API Embed] Successfully upserted embedding for document ${documentId}.`);
        return NextResponse.json({ success: true, message: 'Embedding generated and saved.' }, { status: 200 });

    } catch (error) {
        console.error(`[API Embed] Error processing embedding for document ${documentId}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate embedding';
        // Avoid leaking sensitive details
        return NextResponse.json({ error: 'Failed to generate embedding', details: errorMessage }, { status: 500 });
    }
} 