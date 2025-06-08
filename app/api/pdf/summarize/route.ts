import { NextRequest, NextResponse } from 'next/server';
import { PDFProcessingService } from '@/app/services/PDFProcessingService'; // Adjusted import path
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
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text must be provided and be a non-empty string.' }, { status: 400 }); // Removed corsHeaders
    }

    const pdfService = new PDFProcessingService();
    const summarizedText = await pdfService.summarizeText(text);

    return NextResponse.json({ summarizedText }); // Removed corsHeaders

  } catch (error) {
    console.error('[API /pdf/summarize] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during text summarization.';
    let publicErrorMessage = errorMessage;
    let statusCode = 500;

    if (errorMessage.includes("Gemini API key is not provided")) {
      publicErrorMessage = "Server configuration error.";
    }
    // Add other specific error checks if needed
    return NextResponse.json({ error: publicErrorMessage }, { status: statusCode }); // Removed corsHeaders
  }
} 