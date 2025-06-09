interface WhisperDetails {
  cost_estimate?: number;
  file_size_bytes?: number;
  file_type?: string;
  processing_time_ms?: number | null;
}

interface TranscriptionResponse {
  transcription: string;
  whisperDetails?: WhisperDetails;
  error?: string;
}

/**
 * Sends an audio blob to the backend API for transcription.
 * @param audioBlob The audio data to transcribe.
 * @param fileName Optional name for the audio file.
 * @returns A promise that resolves to the transcription text.
 * @throws Will throw an error if transcription fails or the API returns an error.
 */
export async function transcribeAudio(audioBlob: Blob, fileName: string = 'audio_recording.wav'): Promise<string> {
  if (!audioBlob || audioBlob.size === 0) {
    console.error("[AudioTranscriptionService] Invalid or empty audio blob provided.");
    throw new Error("Cannot transcribe empty audio blob.");
  }

  const formData = new FormData();
  formData.append('audioFile', audioBlob, fileName);

  console.log(`[AudioTranscriptionService] Sending audio blob (size: ${audioBlob.size}, type: ${audioBlob.type}, name: ${fileName}) to /api/chat/transcribe`);

  try {
    const response = await fetch('/api/chat/transcribe', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorText = `Transcription API request failed with status ${response.status}`;
      try {
        const errorResult: TranscriptionResponse = await response.json();
        if (errorResult.error) {
          errorText = errorResult.error;
        }
      } catch (e) {
        // Could not parse JSON error, use status text or default message
        errorText = response.statusText || errorText;
      }
      console.error(`[AudioTranscriptionService] Transcription API error: ${errorText}`);
      throw new Error(errorText);
    }

    const result: TranscriptionResponse = await response.json();
    console.log("[AudioTranscriptionService] Transcription API response data:", result);

    if (result.transcription && typeof result.transcription === 'string') {
      console.log(`[AudioTranscriptionService] Transcription successful. Length: ${result.transcription.length}`);
      return result.transcription;
    } else if (result.error) {
      console.error("[AudioTranscriptionService] Transcription API returned an error in the response body:", result.error);
      throw new Error(result.error);
    } else {
      console.error("[AudioTranscriptionService] Invalid transcription response format. Missing transcription text.", result);
      throw new Error("Received invalid transcription format from API.");
    }
  } catch (error: any) {
    console.error("[AudioTranscriptionService] Error during transcription request execution:", error);
    // Re-throw the error, ensuring it's an Error object
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error.message || "An unknown error occurred during transcription."));
  }
} 