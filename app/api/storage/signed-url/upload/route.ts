import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid'; // Need to install uuid: npm install uuid @types/uuid
import { createClient } from '@supabase/supabase-js'; // Keep for admin client if needed elsewhere, but not for this route now

const UPLOAD_URL_EXPIRY = 60 * 5; // Expiry for UPLOAD URL (if needed by method)
const DOWNLOAD_URL_EXPIRY = 60 * 5; // Expiry for DOWNLOAD URL
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents'; // Use env var or default

// Helper function to get Supabase URL and Key (Only needed if using admin client)
// function getSupabaseCredentials() { ... } // Keep if needed elsewhere

// Helper function
async function getUserOrError(supabase: ReturnType<typeof createSupabaseServerClient>) {
    const { data: { user }, error: getUserError } = await supabase.auth.getUser();
    if (getUserError) {
        console.error('Get User Error:', getUserError.message);
        if (getUserError.message.includes('invalid JWT')) {
             return { errorResponse: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session.' } }, { status: 401 }) };
        }
        return { errorResponse: NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Failed to get user session.' } }, { status: 500 }) };
    }
    if (!user) {
        return { errorResponse: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'User not authenticated.' } }, { status: 401 }) };
    }
    return { userId: user.id };
}

export async function POST(request: Request) {
    const cookieStore = cookies();
    const supabaseUserClient = createSupabaseServerClient();
    // const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
    // const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { userId, errorResponse } = await getUserOrError(supabaseUserClient);
        if (errorResponse) return errorResponse;

        let body;
        try { body = await request.json(); } catch (e) { return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 }); }
        // --> REMOVED documentId extraction as it wasn't used
        const { fileName, contentType } = body;
        if (!fileName || typeof fileName !== 'string') { return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'fileName is required.' } }, { status: 400 }); }
        if (!contentType || typeof contentType !== 'string') { return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'contentType is required.' } }, { status: 400 }); }

        const uniqueFileName = `${uuidv4()}-${fileName.replace(/\s+/g, '_')}`;
        const filePath = `${userId}/${uniqueFileName}`;

        // Create signed UPLOAD URL using User Client
        console.log(`[Upload API] Attempting to create signed UPLOAD URL for: ${filePath} in bucket: ${BUCKET_NAME}`);
        const { data: uploadData, error: uploadUrlError } = await supabaseUserClient.storage
            .from(BUCKET_NAME)
            .createSignedUploadUrl(filePath);

         if (uploadUrlError) {
             console.error(`[Upload API] Failed to create signed UPLOAD URL for path ${filePath}:`, uploadUrlError.message);
              return NextResponse.json({ error: { code: 'STORAGE_ERROR', message: `Failed to create signed upload URL: ${uploadUrlError.message}` } }, { status: 500 });
         }

        // --- REMOVED Download URL Generation --- 

        // Return ONLY the upload URL and path
        console.log(`[Upload API] Successfully created UPLOAD URL for: ${filePath}`);
        return NextResponse.json({
             data: {
                 signedUrl: uploadData.signedUrl, // Use the correct property name returned by createSignedUploadUrl
                 path: uploadData.path
                }
            }, { status: 200 });

    } catch (error: any) {
        console.error('[Upload API] Signed Upload URL POST Error:', error.message);
        return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
    }
} 