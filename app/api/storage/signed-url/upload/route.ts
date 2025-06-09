import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid'; // Need to install uuid: npm install uuid @types/uuid
import { createClient } from '@supabase/supabase-js'; // Keep for admin client if needed elsewhere, but not for this route now

const UPLOAD_URL_EXPIRY = 60 * 5; // Expiry for UPLOAD URL (if needed by method)
const DOWNLOAD_URL_EXPIRY = 60 * 5; // Expiry for DOWNLOAD URL
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'documents'; // Use env var or default
const MAX_GENERAL_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_CONTENT_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.oasis.opendocument.text', // .odt
  'application/vnd.oasis.opendocument.spreadsheet', // .ods
  'application/vnd.oasis.opendocument.presentation', // .odp
  // Text
  'text/plain',
  'text/markdown',
  'text/csv',
  // TODO: Add other types as needed by the application
];

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
        
        const { fileName, contentType, fileSize } = body; // Added fileSize

        if (!fileName || typeof fileName !== 'string' || fileName.trim() === '') { 
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'fileName is required and must be a non-empty string.' } }, { status: 400 }); 
        }
        if (!contentType || typeof contentType !== 'string') { 
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'contentType is required.' } }, { status: 400 }); 
        }
        if (fileSize === undefined || typeof fileSize !== 'number' || fileSize <= 0) {
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'fileSize is required and must be a positive number (bytes).' } }, { status: 400 });
        }

        // Validate fileSize
        if (fileSize > MAX_GENERAL_UPLOAD_SIZE_BYTES) {
            return NextResponse.json({ 
                error: { 
                    code: 'VALIDATION_ERROR', 
                    message: `File size (${(fileSize / (1024*1024)).toFixed(2)}MB) exceeds the maximum allowed limit of ${(MAX_GENERAL_UPLOAD_SIZE_BYTES / (1024*1024))}MB.` 
                } 
            }, { status: 413 }); // 413 Payload Too Large
        }

        // Validate contentType
        if (!ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase())) {
            return NextResponse.json({ 
                error: { 
                    code: 'VALIDATION_ERROR', 
                    message: `Unsupported file type: ${contentType}. Allowed types are: ${ALLOWED_CONTENT_TYPES.join(', ')}.`
                } 
            }, { status: 415 }); // 415 Unsupported Media Type
        }

        const uniqueFileName = `${uuidv4()}-${fileName.replace(/\s+/g, '_')}`.replace(/[^a-zA-Z0-9_.-]/g, ''); // Added stricter sanitization for uniqueFileName
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