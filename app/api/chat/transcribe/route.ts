// app/api/chat/transcribe/route.ts
// Use the standard OpenAI client for audio, as AI SDK might not wrap it
import OpenAI from "openai"; 
import { NextRequest, NextResponse } from "next/server";

// Instantiate the standard OpenAI client
// Ensure OPENAI_API_KEY is set in your environment variables
const openaiClient = new OpenAI(); // API key is automatically read from process.env.OPENAI_API_KEY

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audioFile");

    // Basic validation
    if (!audioFile || !(audioFile instanceof Blob) || audioFile.size === 0) {
      console.error("[API Transcribe] Invalid or missing audio file in form data.");
      return NextResponse.json(
        { error: "Missing or invalid audio file." },
        { status: 400 }
      );
    }

    console.log(`[API Transcribe] Received audio file. Size: ${audioFile.size} bytes, Type: ${audioFile.type}`);

    // Call the Whisper API using the standard OpenAI client
    const transcription = await openaiClient.audio.transcriptions.create({
      file: audioFile as File, // Cast to File, required by the openai library
      model: "whisper-1",
    });

    // Estimate cost based on file size (approximation)
    // OpenAI charges $0.006 / minute. Estimating ~150kB per minute.
    // Note: This is a rough estimate. Actual duration isn't directly available from the file blob easily.
    const costEstimate = 0.006 * (audioFile.size / 150000);
    const whisperDetails = {
      // duration_ms: null, // Duration is not easily available here
      cost_estimate: costEstimate,
      file_size_bytes: audioFile.size,
      file_type: audioFile.type
    };

    console.log(`[API Transcribe] Transcription successful. Text length: ${transcription.text?.length || 0}. Estimated cost: $${costEstimate.toFixed(6)}`);

    // Return the transcription text and details
    return NextResponse.json({
      transcription: transcription.text,
      whisperDetails: whisperDetails,
    });

  } catch (error: any) {
    console.error("[API Transcribe] Error during transcription:", error);

    // Check for specific OpenAI API errors if possible
    let errorMessage = "Internal Server Error during transcription.";
    let statusCode = 500;

    // Handle OpenAI API errors specifically if possible
    if (error instanceof OpenAI.APIError) {
        errorMessage = error.message;
        statusCode = error.status || 500;
        console.error(`[API Transcribe] OpenAI API Error (${error.status}): ${error.message}`);
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
} 