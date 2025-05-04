import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Helper function to get Supabase Admin Credentials
function getSupabaseCredentials() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase URL or Service Key is missing in environment variables.');
        throw new Error('Server configuration error.');
    }
    return { supabaseUrl, supabaseServiceKey };
}

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents';

export async function DELETE(req: Request) {
    console.log('[API Storage Delete] Received DELETE request');
    try {
        // 1. Check user authentication
        const supabaseUserClient = createSupabaseServerClient();
        const { data: { session }, error: sessionError } = await supabaseUserClient.auth.getSession();

        if (sessionError || !session) {
            console.error('[API Storage Delete] Authentication error:', sessionError);
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`[API Storage Delete] User authenticated: ${userId}`);

        // 2. Get file path from request body
        let filePath: string | undefined;
        try {
            const body = await req.json();
            filePath = body.filePath;
            if (!filePath || typeof filePath !== 'string') {
                return NextResponse.json({ error: 'Missing or invalid filePath in body' }, { status: 400 });
            }
            console.log(`[API Storage Delete] Request to delete filePath: ${filePath}`);
        } catch (e) {
            console.error('[API Storage Delete] Error parsing request body:', e);
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        // 3. Validate Authorization: Ensure the path belongs to the authenticated user
        if (!filePath.startsWith(`${userId}/`)) {
             console.warn(`[API Storage Delete] Forbidden attempt by user ${userId} to delete path: ${filePath}`);
             return NextResponse.json({ error: 'Forbidden: Access denied to this file path.' }, { status: 403 });
        }
        console.log(`[API Storage Delete] Authorization check passed for user ${userId} and path ${filePath}`);

        // 4. Initialize Supabase Admin Client
        const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // 5. Attempt to delete the file from storage
        console.log(`[API Storage Delete] Attempting to remove file from bucket '${BUCKET_NAME}': ${filePath}`);
        const { data, error: deleteError } = await supabaseAdmin
            .storage
            .from(BUCKET_NAME)
            .remove([filePath]); // remove expects an array of paths

        if (deleteError) {
            console.error(`[API Storage Delete] Supabase storage error deleting ${filePath}:`, deleteError);
            // Check if it was a 'Not found' error - maybe already deleted?
            // Supabase JS v2 might return error status 400 or others for not found, need to check specific error
            if (deleteError.message?.includes('Not found')) { 
                 console.log(`[API Storage Delete] File ${filePath} not found, possibly already deleted. Treating as success.`);
                 // Optionally return success even if not found, as the desired state (file gone) is achieved
                 return NextResponse.json({ message: 'File not found or already deleted.' }, { status: 200 });
            } 
            // Return generic error for other storage issues
            return NextResponse.json({ error: 'Failed to delete file from storage', details: deleteError.message }, { status: 500 });
        }

        console.log(`[API Storage Delete] Successfully deleted file: ${filePath}`, data);

        // 6. Return success response
        return NextResponse.json({ message: 'File deleted successfully' }, { status: 200 });

    } catch (error: any) {
        console.error('[API Storage Delete] Unexpected error in handler:', error);
        // Handle potential credential errors
        if (error.message?.includes('Server configuration error')) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 