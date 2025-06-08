import { NextRequest, NextResponse } from 'next/server';
import { PDFProcessingService } from '@/app/services/PDFProcessingService'; // Adjusted import path
import { checkRateLimit } from '@/lib/utils/rate-limiter'; // Import rate limiter

const getCorsHeaders = (origin?: string | null) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  // For simplicity, allow any origin. In production, restrict this to your frontend domain.
  // const allowedOrigin = process.env.ALLOWED_ORIGIN || (origin || '*'); // Example: use env var
  headers['Access-Control-Allow-Origin'] = origin || '*'; // Reflect origin or allow all
  return headers;
};

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { headers: getCorsHeaders(origin), status: 204 });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text must be provided and be a non-empty string.' }, { status: 400, headers: corsHeaders });
    }

    const pdfService = new PDFProcessingService();
    const summarizedText = await pdfService.summarizeText(text);

    return NextResponse.json({ summarizedText }, { headers: corsHeaders });

  } catch (error) {
    console.error('[API /pdf/summarize] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during text summarization.';
    let publicErrorMessage = errorMessage;
    let statusCode = 500;

    if (errorMessage.includes("Gemini API key is not provided")) {
      publicErrorMessage = "Server configuration error.";
    }
    // Add other specific error checks if needed
    return NextResponse.json({ error: publicErrorMessage }, { status: statusCode, headers: corsHeaders });
  }
} 