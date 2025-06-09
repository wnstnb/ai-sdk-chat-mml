import { NextRequest, NextResponse } from 'next/server';
import { PDFProcessingService } from '@/app/services/PDFProcessingService'; // Adjusted import path
import { isURL } from 'validator';
// import { checkRateLimit } from '@/lib/utils/rate-limiter'; // Removed import

export async function OPTIONS(request: NextRequest) {
  // return new NextResponse(null, { headers: getCorsHeaders(request.headers.get('origin')), status: 204 }); // Handled by next.config.mjs
  return new NextResponse(null, { status: 204 }); // Standard OPTIONS response
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
      return NextResponse.json({ error: 'Either fileBlobBase64 or sourceUrl must be provided for summarization.' }, { status: 400 });
    }
    if (fileBlobBase64 && sourceUrl) {
      return NextResponse.json({ error: 'Provide either fileBlobBase64 or sourceUrl for summarization, not both.' }, { status: 400 });
    }

    const pdfService = new PDFProcessingService();
    let summarizedText: string;

    if (fileBlobBase64) {
      if (typeof fileBlobBase64 !== 'string') {
        return NextResponse.json({ error: 'fileBlobBase64 must be a base64 encoded string.' }, { status: 400 });
      }
      const pdfBuffer = Buffer.from(fileBlobBase64, 'base64');
      summarizedText = await pdfService.summarizePdf(pdfBuffer, 'buffer');
    } else if (sourceUrl) {
      if (typeof sourceUrl !== 'string' || !isURL(sourceUrl, { protocols: ['http', 'https'], require_protocol: true })) {
        return NextResponse.json({ error: 'Invalid or malformed sourceUrl. Must be a valid HTTP/HTTPS URL.' }, { status: 400 });
      }
      summarizedText = await pdfService.summarizePdf(sourceUrl, 'url');
    } else {
      // This case should be caught by the initial check, but as a safeguard:
      return NextResponse.json({ error: 'Invalid input for summarization.' }, { status: 400 });
    }

    return NextResponse.json({ summary: summarizedText }); // Changed from summarizedText to summary to match frontend expectation

  } catch (error) {
    console.error('[API /pdf/summarize] Error:', error);
    let errorMessage = 'An unknown error occurred during PDF summarization.';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
      // Map service layer errors to user-friendly messages and appropriate status codes
      if (errorMessage.includes("File size exceeds the limit")) {
        statusCode = 413; // Payload Too Large
        errorMessage = `The PDF file is too large. Maximum allowed size is ${25}MB.`;
      } else if (errorMessage.includes("Invalid file content: The uploaded file does not appear to be a valid PDF document")) {
        statusCode = 415; // Unsupported Media Type
      } else if (errorMessage.includes("Could not retrieve PDF from URL")) {
        statusCode = 400;
      } else if (errorMessage.includes("Invalid pdfSource: Expected a URL string") || errorMessage.includes("Invalid pdfSource: Expected a Buffer")) {
        statusCode = 400;
      } else if (errorMessage.includes("Gemini API key is not provided")) {
        statusCode = 503; 
        errorMessage = "The PDF processing service is currently unavailable due to a configuration issue.";
      } else if (errorMessage.includes("Gemini API error")) {
        statusCode = 502; 
        errorMessage = "The PDF summarization service encountered an error. Please try again.";
      } else if (errorMessage.includes("No summary generated from PDF") || errorMessage.includes("No parts found in the generated PDF summary") || errorMessage.includes("Summarization resulted in empty text")) {
        statusCode = 422; // Unprocessable Entity - PDF was valid, but no summary could be made
        errorMessage = "Could not summarize this PDF. The document might not contain summarizable content or there was an issue processing it with the AI.";
      }
    }
    return NextResponse.json({ error: errorMessage }, { status: statusCode }); // Removed corsHeaders
  }
} 