export const generateNotesFromTranscript = async (transcript: string, timestamp?: string): Promise<{ notes?: string | null; error?: string | null; }> => {
  console.log('[Client NotesService] Attempting to generate notes for transcript of length:', transcript.length);
  if (!transcript || transcript.trim() === "") {
    return { error: "Transcript is empty." };
  }
  try {
    const response = await fetch('/api/generate-notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcript, timestamp }),
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
};

export const prettifyTranscript = async (transcript: string, timestamp?: string): Promise<{ notes?: string | null; error?: string | null; }> => {
  console.log('[Client NotesService] Attempting to prettify transcript of length:', transcript.length);
  if (!transcript || transcript.trim() === "") {
    return { error: "Transcript is empty." };
  }
  try {
    const response = await fetch('/api/prettify-transcript', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcript, timestamp }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Client NotesService] API error (prettify):', data.error || `Status: ${response.status}`);
      return { error: data.error || `Failed to prettify transcript. Status: ${response.status}` };
    }

    console.log('[Client NotesService] Successfully fetched prettified transcript.');
    // Assuming the backend returns the prettified content in a field named 'prettifiedTranscript' or 'notes'
    return { notes: data.notes || data.prettifiedTranscript }; 
  } catch (error: any) {
    console.error('[Client NotesService] Fetch or JSON parsing error (prettify):', error);
    return { error: error.message || 'An unexpected error occurred while prettifying transcript.' };
  }
}; 