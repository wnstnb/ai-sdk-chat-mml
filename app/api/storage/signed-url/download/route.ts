import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Helper function to get Supabase URL and Service Key
function getSupabaseCredentials() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase URL or Service Key is missing in environment variables.');
        throw new Error('Server configuration error.');
    }
    return { supabaseUrl, supabaseServiceKey };
}

const SIGNED_URL_EXPIRES_IN = 60 * 5; // 5 minutes expiration, same as in chat API
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents'; // Use env var or default

export async function POST(req: Request) {
    try {
        // 1. Check user authentication
        const supabaseUserClient = createSupabaseServerClient();
        const { data: { session }, error: sessionError } = await supabaseUserClient.auth.getSession();

        if (sessionError || !session) {
            console.error('[API Signed Download URL] Authentication error:', sessionError);
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const userId = session.user.id;

        // 2. Get file path from request body
        const { filePath } = await req.json();
        if (!filePath || typeof filePath !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid filePath' }, { status: 400 });
        }

        // Basic validation: Ensure the path belongs to the authenticated user (prevent accessing others' files)
        if (!filePath.startsWith(`${userId}/`)) {
             console.warn(`[API Signed Download URL] User ${userId} attempted to access unauthorized path: ${filePath}`);
             return NextResponse.json({ error: 'Forbidden: Access denied to this file path.' }, { status: 403 });
        }

        // 3. Initialize Supabase Admin Client
        const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // 4. Generate Signed Download URL
        console.log(`[API Signed Download URL] Generating download URL for path: ${filePath} in bucket: ${BUCKET_NAME}`);

        const { data, error } = await supabaseAdmin
            .storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN);

        if (error) {
            console.error(`[API Signed Download URL] Error creating signed URL for path ${filePath}:`, error);
            // --> Log the specific Supabase error status if available
            const status = (error as any).status || 500;
            return NextResponse.json({ error: 'Failed to create signed URL', details: error.message }, { status });
        }

        if (!data || !data.signedUrl) {
             console.error(`[API Signed Download URL] No signed URL data returned for path ${filePath}.`);
             return NextResponse.json({ error: 'Failed to generate signed URL data.' }, { status: 500 });
        }

        console.log(`[API Signed Download URL] Successfully generated download URL for path: ${filePath}`);

        // 5. Return the signed URL
        return NextResponse.json({ signedUrl: data.signedUrl });

    } catch (error: any) {
        console.error('[API Signed Download URL] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 