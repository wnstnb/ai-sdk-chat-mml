import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid'; // Need to install uuid: npm install uuid @types/uuid
import { createClient } from '@supabase/supabase-js'; // Import admin client if needed for placeholder

const UPLOAD_URL_EXPIRY = 60 * 5; // Signed URLs expire in 5 minutes
const BUCKET_NAME = 'message-images'; // Ensure this matches your bucket name

// Helper function to get Supabase URL and Key (replace with your actual env variables)
function getSupabaseCredentials() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Use service key for placeholder upload if RLS prevents user client
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase URL or Service Key is missing in environment variables.');
        throw new Error('Server configuration error.');
    }
    return { supabaseUrl, supabaseServiceKey };
}

// Helper function
async function getUserOrError(supabase: ReturnType<typeof createSupabaseServerClient>) {
    // Use supabase.auth.getUser() as recommended by Supabase logs
    const { data: { user }, error: getUserError } = await supabase.auth.getUser();
    if (getUserError) {
        console.error('Get User Error:', getUserError.message);
        // Distinguish between actual server error and just no authenticated user
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
    const { supabaseUrl, supabaseServiceKey } = getSupabaseCredentials();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { userId, errorResponse } = await getUserOrError(supabaseUserClient);
        if (errorResponse) return errorResponse;

        // --- REMOVED: Diagnostic Bucket List --- 
        // console.log("[Upload Signed URL] Attempting to list buckets...");
        // ... list buckets logic removed ...

        // Parse Request Body
        let body;
        try { body = await request.json(); } catch (e) { return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 }); }
        const { fileName, contentType } = body;
        if (!fileName || typeof fileName !== 'string') { return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'fileName is required.' } }, { status: 400 }); }
        if (!contentType || typeof contentType !== 'string') { return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'contentType is required.' } }, { status: 400 }); }

        // Generate file path
        const uniqueFileName = `${uuidv4()}-${fileName.replace(/\s+/g, '_')}`;
        const filePath = `${userId}/${uniqueFileName}`;

        // --- REMOVED: Placeholder file upload step --- 
        // console.log(`[Upload Signed URL] Attempting placeholder upload to: ${filePath}`);
        // ... placeholder upload logic removed ...
        // console.log(`[Upload Signed URL] Placeholder step skipped.`);

        // Create signed URL directly (assuming SELECT policy allows this now)
        console.log(`[Upload Signed URL] Attempting to create signed UPLOAD URL for: ${filePath}`);
        // This function is specifically for uploads and might handle permissions/object creation differently
        const { data, error: urlError } = await supabaseUserClient.storage 
            .from(BUCKET_NAME) 
            .createSignedUploadUrl(filePath); // Use the dedicated upload URL function
            // Note: Expiry is typically handled by storage settings for upload URLs, not passed here.

         if (urlError) {
             console.error(`Failed to create signed UPLOAD URL for path ${filePath} (using user client):`, urlError.message);
              // Potential errors: RLS violation (needs INSERT policy), bucket config issue.
              return NextResponse.json({ error: { code: 'STORAGE_ERROR', message: `Failed to create signed upload URL: ${urlError.message}` } }, { status: 500 });
         }

        // Return the signed URL and the path
        // The structure returned by createSignedUploadUrl is different:
        // { data: { signedUrl, path, token }, error: null }
        // We need to return the signedUrl (which includes the token)
        console.log(`[Upload Signed URL] Successfully created signed upload URL for: ${filePath}`);
        return NextResponse.json({ data: { signedUrl: data.signedUrl, path: data.path } }, { status: 200 }); // path comes from data now

    } catch (error: any) {
        console.error('Signed Upload URL POST Error:', error.message);
        return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
    }
} 