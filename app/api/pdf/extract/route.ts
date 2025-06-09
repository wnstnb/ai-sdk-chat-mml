import { NextRequest, NextResponse } from 'next/server';
import { PDFProcessingService } from '@/app/services/PDFProcessingService'; // Adjusted import path
import { isURL } from 'validator'; // Added import

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  // const origin = request.headers.get('origin'); // No longer needed
  // const corsHeaders = getCorsHeaders(origin); // No longer needed, headers set globally

  // const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'; // IP for checkRateLimit, no longer needed here
  // if (!checkRateLimit(ip)) { // Removed old rate limit check
  //   return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  // }

  try {
    const body = await request.json();
    const { fileBlobBase64, sourceUrl } = body;

    if (!fileBlobBase64 && !sourceUrl) {
      return NextResponse.json({ error: 'Either fileBlobBase64 or sourceUrl must be provided.' }, { status: 400 });
    }
    if (fileBlobBase64 && sourceUrl) {
      return NextResponse.json({ error: 'Provide either fileBlobBase64 or sourceUrl, not both.' }, { status: 400 });
    }

    const pdfService = new PDFProcessingService();
    let extractedText: string;

    if (fileBlobBase64) {
      if (typeof fileBlobBase64 !== 'string') {
        return NextResponse.json({ error: 'fileBlobBase64 must be a base64 encoded string.' }, { status: 400 });
      }
      const pdfBuffer = Buffer.from(fileBlobBase64, 'base64');
      extractedText = await pdfService.extractText(pdfBuffer, 'buffer');
    } else if (sourceUrl) {
      if (typeof sourceUrl !== 'string') {
        return NextResponse.json({ error: 'sourceUrl must be a string.' }, { status: 400 });
      }
      // Validate sourceUrl
      if (!isURL(sourceUrl, {
        protocols: ['http', 'https'],
        require_protocol: true,
        require_host: true,
        require_valid_protocol: true,
        disallow_auth: true, // Do not allow username/password in URL
        // TODO: Consider adding require_tld: true if it makes sense for PDF sources
      })) {
        return NextResponse.json({ error: 'Invalid or unsupported sourceUrl format. Please provide a valid HTTP/HTTPS URL.' }, { status: 400 });
      }
      extractedText = await pdfService.extractText(sourceUrl, 'url');
    } else {
      // This case should be caught by the initial check, but as a safeguard:
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }

    return NextResponse.json({ extractedText });

  } catch (error) {
    console.error('[API /pdf/extract] Error:', error);
    let errorMessage = 'An unknown error occurred during PDF extraction.';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
      if (errorMessage.includes("File size exceeds the limit")) {
        statusCode = 413; // Payload Too Large
        errorMessage = `The PDF file is too large. Maximum allowed size is ${25}MB.`; // Keep consistent with frontend
      } else if (errorMessage.includes("Invalid file type: URL must point to a PDF document")) {
        statusCode = 415; // Unsupported Media Type
        // The service layer error message is already quite user-friendly:
        // e.g., "Invalid file type: URL must point to a PDF document. Received Content-Type: image/png"
      } else if (errorMessage.includes("Failed to fetch PDF from URL")) {
        statusCode = 400; // Bad Request (as the URL might be invalid or inaccessible)
        errorMessage = "Could not retrieve the PDF from the provided URL. Please check the URL and try again.";
      } else if (errorMessage.includes("Could not retrieve PDF from URL")) {
        statusCode = 400;
        errorMessage = "Could not retrieve the PDF from the provided URL. Please check the URL and try again.";
      } else if (errorMessage.includes("Invalid pdfSource: Expected a URL string")) {
        statusCode = 400;
        errorMessage = "The provided source URL is invalid.";
      } else if (errorMessage.includes("Gemini API key is not provided")) {
        statusCode = 503; // Service Unavailable (or 500)
        errorMessage = "The PDF processing service is currently unavailable due to a configuration issue. Please try again later.";
      } else if (errorMessage.includes("Gemini API error")) {
        statusCode = 502; // Bad Gateway
        errorMessage = "The PDF processing service encountered an error. Please try again.";
      } else if (errorMessage.includes("No content generated or response was empty") || errorMessage.includes("No parts found in the generated content")) {
        statusCode = 500;
        errorMessage = "The PDF processing service could not extract text from this PDF.";
      }
      // For generic errors from the service or unknown errors, retain the original message or a generic one.
    }
    
    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
} 