export async function generateNotesFromTranscript(transcript: string): Promise<{ notes?: string; error?: string }> {
  console.log('[Client NotesService] Attempting to generate notes for transcript of length:', transcript.length);
  try {
    const response = await fetch('/api/generate-notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcript }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Client NotesService] API error:', data.error || `Status: ${response.status}`);
      return { error: data.error || `Failed to generate notes. Status: ${response.status}` };
    }

    console.log('[Client NotesService] Successfully fetched notes.');
    return { notes: data.notes };
  } catch (error: any) {
    console.error('[Client NotesService] Fetch or JSON parsing error:', error);
    return { error: error.message || 'An unexpected error occurred while generating notes.' };
  }
} 