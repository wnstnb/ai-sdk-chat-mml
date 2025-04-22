import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid'; // Need to install uuid: npm install uuid @types/uuid

const UPLOAD_URL_EXPIRY = 60 * 5; // Signed URLs expire in 5 minutes
const BUCKET_NAME = 'message_images'; // Ensure this matches your bucket name

// Helper function
async function getUserOrError(supabase: ReturnType<typeof createSupabaseServerClient>) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('Session Error:', sessionError.message);
    return { errorResponse: NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Failed to get session.' } }, { status: 500 }) };
  }
  if (!session) {
    return { errorResponse: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'User not authenticated.' } }, { status: 401 }) };
  }
  return { userId: session.user.id };
}

export async function POST(request: Request) {
    const cookieStore = cookies();
    const supabase = createSupabaseServerClient();

    try {
        const { userId, errorResponse } = await getUserOrError(supabase);
        if (errorResponse) return errorResponse;

        // Parse Request Body
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON body.' } }, { status: 400 });
        }
        const { fileName, contentType } = body;

        // Validate input
        if (!fileName || typeof fileName !== 'string') {
            return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'fileName is required and must be a string.' } }, { status: 400 });
        }
         if (!contentType || typeof contentType !== 'string') {
             return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'contentType is required and must be a string.' } }, { status: 400 });
         }

        // Generate a unique path for the file within the user's "folder"
        const uniqueFileName = `${uuidv4()}-${fileName.replace(/\s+/g, '_')}`; // Basic sanitization + UUID
        const filePath = `${userId}/${uniqueFileName}`;

        // Create signed URL for upload (PUT request)
        const { data, error: urlError } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, UPLOAD_URL_EXPIRY, {
                // Set content type for the upload request header validation
                // Note: Supabase client JS v2 doesn't directly set Content-Type via signed URL options.
                // The client performing the PUT must set the 'Content-Type' header correctly.
                // We primarily use contentType here for potential future checks or metadata.
            });

         if (urlError) {
             console.error(`Failed to create signed upload URL for path ${filePath}:`, urlError.message);
              return NextResponse.json({ error: { code: 'STORAGE_ERROR', message: `Failed to create signed upload URL: ${urlError.message}` } }, { status: 500 });
         }

        // Return the signed URL and the path (which needs to be stored in the message later)
        return NextResponse.json({ data: { signedUrl: data.signedUrl, path: filePath } }, { status: 200 });

    } catch (error: any) {
        console.error('Signed Upload URL POST Error:', error.message);
        return NextResponse.json({ error: { code: 'SERVER_ERROR', message: `An unexpected error occurred: ${error.message}` } }, { status: 500 });
    }
} 