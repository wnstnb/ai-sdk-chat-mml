// Placeholder for /api/web-scrape route
// This endpoint will handle requests from the frontend to scrape web content using EXA.AI.

import { NextRequest, NextResponse } from 'next/server';
import Exa from 'exa-js'; // Import Exa
import { isURL } from 'validator'; // Added import

// Define the expected structure for frontend compatibility
interface ScrapedUrlResult {
  url: string;
  title?: string;
  content?: string;      // Mapped from Exa's text field
  rawHtml?: string;
  processedDate: string;
  error?: string;
  status: 'success' | 'error' | 'pending';
}

interface ScrapedDataResponse {
  results: ScrapedUrlResult[];
  overallError?: string;
  processingTimeMs: number;
  // inputParameters could be added here if desired for debugging, but not strictly in ScrapedData
  inputParameters?: { urls: string[]; processingType: string };
}

// Instantiate Exa with API key from environment variables
const exaApiKey = process.env.EXA_API_KEY;
if (!exaApiKey) {
  console.error("EXA_API_KEY environment variable is not set.");
  // Consider how to handle this globally if the app can't run without it
}
const exa = new Exa(exaApiKey);

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let urls: string[] | undefined;
  let processingType: string | undefined;

  try {
    const body = await request.json();
    urls = body.urls;
    processingType = body.processingType;

    if (!exaApiKey) {
      // This check is important here as Exa might be instantiated but unusable
      return NextResponse.json({
        results: urls?.map(url => ({
          url,
          status: 'error',
          error: 'Web scraping service is not configured correctly (EXA API key missing).',
          processedDate: new Date().toISOString(),
        })) || [],
        overallError: 'Web scraping service is not configured correctly (EXA API key missing).',
        processingTimeMs: Date.now() - startTime,
      } as ScrapedDataResponse, { status: 503 }); // Service Unavailable
    }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ 
        results: [],
        overallError: 'URLs are required and must be a non-empty array.', 
        processingTimeMs: Date.now() - startTime 
      } as ScrapedDataResponse, { status: 400 });
    }

    if (urls.some(url => typeof url !== 'string')) {
      return NextResponse.json({ 
        results: [],
        overallError: 'All items in the URLs array must be strings.',
        processingTimeMs: Date.now() - startTime
      } as ScrapedDataResponse, { status: 400 });
    }

    if (!processingType || (processingType !== 'full_text' && processingType !== 'summarize')) {
      return NextResponse.json({ 
        results: [],
        overallError: 'Invalid processing type.',
        processingTimeMs: Date.now() - startTime
      } as ScrapedDataResponse, { status: 400 });
    }

    // Validate URLs
    const invalidUrls = urls.filter(url => !isURL(url, { 
      protocols: ['http', 'https'], 
      require_protocol: true, 
      require_host: true, 
      require_valid_protocol: true,
      disallow_auth: true, // Do not allow username/password in URL
      // TODO: Consider adding require_tld: true if it makes sense for your use case
    }));

    if (invalidUrls.length > 0) {
      const errorMessages = invalidUrls.map(url => `Invalid or unsupported URL format: ${url}. Please provide a valid HTTP/HTTPS URL.`);
      return NextResponse.json({
        results: urls.map(url => ({
          url,
          status: 'error',
          error: invalidUrls.includes(url) ? `Invalid or unsupported URL format: ${url}. Please provide a valid HTTP/HTTPS URL.` : undefined,
          processedDate: new Date().toISOString(),
        })),
        overallError: `Invalid URLs provided: ${invalidUrls.join(', ')}. ${errorMessages.join(' ')}`,
        processingTimeMs: Date.now() - startTime,
      } as ScrapedDataResponse, { status: 400 });
    }

    console.log('Received request for /api/web-scrape:', { urls, processingType });

    let exaApiResponseResults;
    try {
      const exaOptions: any = {
        highlights: true, 
      };

      if (processingType === 'full_text') {
        exaOptions.text = true;
      } else if (processingType === 'summarize') {
        exaOptions.summary = {
          query: "Provide a concise summary of the key information.",
          numSentences: 5,
        };
      }

      const response = await exa.getContents(urls, exaOptions);
      exaApiResponseResults = response.results; 

    } catch (exaError: any) {
      console.error('EXA.AI API Error:', exaError);
      const endTime = Date.now();
      return NextResponse.json({
        results: urls.map(url => ({
          url: url,
          status: 'error' as 'error',
          error: `EXA.AI API Error: ${exaError.message}`,
          processedDate: new Date().toISOString(),
        })),
        overallError: `EXA.AI API Error: ${exaError.message}`,
        processingTimeMs: endTime - startTime,
        inputParameters: { urls, processingType },
      } as ScrapedDataResponse, { status: 500 });
    }

    const mappedResults: ScrapedUrlResult[] = exaApiResponseResults.map((exaResult: any) => {
      // Exa's result object might have its own 'error' field per URL
      const status = exaResult.error ? 'error' : (exaResult.text || exaResult.summary || exaResult.highlights ? 'success' : 'error');
      let content = exaResult.text; // Default to full text
      if (processingType === 'summarize' && exaResult.summary) {
        content = typeof exaResult.summary === 'string' ? exaResult.summary : JSON.stringify(exaResult.summary); // Or handle summary object better
      } else if (processingType === 'summarize' && !exaResult.summary && exaResult.highlights) {
        // Fallback for summary if only highlights are available
        content = exaResult.highlights.join('\n'); 
      }
      
      return {
        url: exaResult.url,
        title: exaResult.title,
        content: content, // Mapped from exaResult.text or exaResult.summary
        // rawHtml: undefined, // Exa's getContents with text:true usually doesn't provide raw HTML
        processedDate: new Date().toISOString(),
        error: exaResult.error, // Use Exa's per-URL error if present
        status: status, 
      };
    });

    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;

    return NextResponse.json({
      results: mappedResults,
      processingTimeMs: processingTimeMs,
      inputParameters: { urls, processingType }, // Optional: for debugging on frontend if needed
      // overallError can be set here if there's a partial failure not caught by Exa's main error handling
    } as ScrapedDataResponse);

  } catch (error: any) {
    console.error('Error in /api/web-scrape:', error);
    const endTime = Date.now();
    const errResponse: ScrapedDataResponse = {
      results: urls?.map(url => ({
          url: url,
          status: 'error' as 'error',
          error: error.message || 'An internal server error occurred.',
          processedDate: new Date().toISOString(),
        })) || [],
      overallError: error.message || 'Internal Server Error',
      processingTimeMs: endTime - startTime,
      inputParameters: (urls && processingType !== undefined) ? { urls, processingType } : undefined,
    };

    if (error instanceof SyntaxError) {
      errResponse.overallError = 'Invalid JSON in request body';
      return NextResponse.json(errResponse, { status: 400 });
    }
    
    return NextResponse.json(errResponse, { status: 500 });
  }
} 