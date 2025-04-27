import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js'; // Import the standard client for admin usage
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Set a default expiration time for signed URLs (e.g., 1 hour)
const SIGNED_URL_EXPIRES_IN = 60 * 60;

// Helper to get admin credentials (ensure these env vars are set)
function getSupabaseAdminCredentials() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase admin credentials in environment variables.');
    }
    return { supabaseUrl, supabaseServiceKey };
}

export async function POST(request: NextRequest) {
    const supabaseUserClient = createSupabaseServerClient(); // Client for user auth check
    try {
        // 1. Authenticate the user (using user client)
        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
        if (userError || !user) {
            console.error('[API Signed Read URL] Auth Error:', userError);
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // 2. Get filePath from body
        const { filePath } = await request.json();
        if (!filePath || typeof filePath !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid filePath' }, { status: 400 });
        }

        // 3. Create Admin Client for storage operation
        const { supabaseUrl, supabaseServiceKey } = getSupabaseAdminCredentials();
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // 4. Call Supabase storage with Admin Client
        console.log(`[API Signed Read URL] Attempting to create signed URL for path: ${filePath} using admin client.`);
        const { data, error } = await supabaseAdmin.storage
            .from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'documents')
            .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN);

        // 5. Handle Supabase error
        if (error) {
            console.error(`[API Signed Read URL] Supabase Error creating signed URL for ${filePath}:`, error);
            // Add more specific logging
            if (error.message.includes('Object not found')) {
                 console.error(`[API Signed Read URL] Specific error: Object not found at path ${filePath}. Check if the upload path matches the read path.`);
                 return NextResponse.json({ error: 'Failed to create signed URL', details: 'Object not found.' }, { status: 404 }); // Return 404 if object not found
            }
            return NextResponse.json({ error: 'Failed to create signed URL', details: error.message }, { status: 500 });
        }

        // 6. Handle missing data
        if (!data?.signedUrl) {
             console.error(`[API Signed Read URL] No signed URL data returned from Supabase for ${filePath}, although no error was reported.`);
             return NextResponse.json({ error: 'Failed to generate signed URL data (no URL in response)' }, { status: 500 });
        }

        // 7. Success
        console.log(`[API Signed Read URL] Successfully generated signed URL for ${filePath}`);
        return NextResponse.json({ signedUrl: data.signedUrl });

    } catch (error: any) {
        console.error('[API Signed Read URL] Unexpected error in handler:', error);
         // Check if it's the admin credentials error
         if (error.message.includes('Missing Supabase admin credentials')) {
             return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
         }
        return NextResponse.json({ error: 'An unexpected error occurred', details: error.message }, { status: 500 });
    }
} 