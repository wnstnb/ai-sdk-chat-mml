// Placeholder for /api/web-scrape route
// This endpoint will handle requests from the frontend to scrape web content using EXA.AI.

import { NextRequest, NextResponse } from 'next/server';
import Exa from 'exa-js'; // Import Exa

// Instantiate Exa with API key from environment variables
const exa = new Exa(process.env.EXA_API_KEY);

export async function POST(request: NextRequest) {
  const startTime = Date.now(); // Record start time
  let urls: any[] | undefined; // Declare here for wider scope
  let processingType: string | undefined; // Declare here for wider scope

  try {
    const body = await request.json();
    urls = body.urls; // Assign to wider scope variable
    processingType = body.processingType; // Assign to wider scope variable

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'URLs are required and must be a non-empty array.' }, { status: 400 });
    }

    // Add check for each URL being a string
    if (urls.some(url => typeof url !== 'string')) {
      return NextResponse.json({ error: 'All items in the URLs array must be strings.' }, { status: 400 });
    }

    if (!processingType || (processingType !== 'full_text' && processingType !== 'summarize')) {
      return NextResponse.json({ error: 'Invalid processing type.' }, { status: 400 });
    }

    console.log('Received request for /api/web-scrape:', { urls, processingType });

    // --- EXA.AI Integration Start ---
    let exaResults;
    try {
      // Determine options for Exa based on processingType
      const exaOptions: any = {
        highlights: true, // Default to include highlights
      };

      if (processingType === 'full_text') {
        exaOptions.text = true;
      } else if (processingType === 'summarize') {
        // Basic summary, can be customized further as needed
        exaOptions.summary = {
          query: "Provide a concise summary of the key information.", // Generic summary query
          numSentences: 5, // Default number of sentences for summary
          // schema: { type: "string", description: "A concise summary of the document content." }
        };
        // To get only summary and highlights, don't request full text explicitly
        // exaOptions.text = false; // or { maxCharacters: 1 } if summary needs some text context but not full
      }

      // The getContents method expects an array of URLs
      const response = await exa.getContents(urls, exaOptions);
      exaResults = response.results; // Assuming results are in response.results, adjust based on exa-js actual response structure

    } catch (exaError: any) {
      console.error('EXA.AI API Error:', exaError);
      const endTime = Date.now(); // Record end time even on error
      return NextResponse.json({
        status: 'error',
        message: 'Error fetching content from EXA.AI',
        details: exaError.message,
        inputParameters: { urls, processingType },
        processingTimeMs: endTime - startTime,
      }, { status: 500 });
    }
    // --- EXA.AI Integration End ---

    const endTime = Date.now(); // Record end time on success
    const processingTimeMs = endTime - startTime;

    return NextResponse.json({ 
      status: 'success',
      message: 'Successfully scraped content from URLs.',
      inputParameters: { urls, processingType },
      processingTimeMs: processingTimeMs,
      data: exaResults
    });

  } catch (error: any) {
    console.error('Error in /api/web-scrape:', error);
    const endTime = Date.now(); // Record end time for general errors
    
    // Remove the problematic re-parse attempt for request.json()
    // const bodyForError = await request.json(); // This was problematic

    if (error instanceof SyntaxError) {
      return NextResponse.json({
        status: 'error',
        message: 'Invalid JSON in request body',
        details: error.message,
        // inputParameters will be undefined here as body parsing failed, which is correct
        processingTimeMs: endTime - startTime,
      }, { status: 400 });
    }
    
    // For other internal server errors, include inputParameters if available
    return NextResponse.json({
      status: 'error',
      message: 'Internal Server Error',
      details: error.message,
      inputParameters: (urls && processingType !== undefined) ? { urls, processingType } : undefined,
      processingTimeMs: endTime - startTime,
    }, { status: 500 });
  }
} 