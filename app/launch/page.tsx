'use client';

import React, { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
// Import FileManager as per documentation
import { FileManager } from '@cubone/react-file-manager'; 
// Revert CSS path to the file confirmed to exist in node_modules
import '@cubone/react-file-manager/dist/react-file-manager.css'; 
import { Document, Folder } from '@/types/supabase'; // Import types
import { ChatInputUI } from '@/components/editor/ChatInputUI'; // Import the chat input UI
// import { ModelSelector } from '@/components/ModelSelector'; // Import if needed directly, ChatInputUI uses it
// Import the new file manager component
import NewFileManager from '@/components/file-manager/NewFileManager';
import { usePreferenceStore } from '@/lib/stores/preferenceStore'; // ADDED: Import preference store

// --- NEW: Import Omnibar ---
import { Omnibar } from '@/components/search/Omnibar';

// Define the structure expected by Cubone File Manager (matching docs)
type CuboneFileType = {
    id?: string;
    name: string;
    isDirectory: boolean;
    path: string;
    updatedAt?: string; // Optional
    size?: number; // Optional
};

// Helper to map our DB structure to Cubone's expected structure
const mapToCuboneFiles = (documents: Document[], folders: Folder[]): CuboneFileType[] => {
    // Using names for paths to allow rendering, but adding UUID to 'id' field
    const mappedFolders: CuboneFileType[] = folders
        .filter(f => f && typeof f.name === 'string' && f.name.trim() !== '') // Ensure folder name is valid
        .map(f => ({
            id: f.id, // <-- Populate ID
            name: f.name,
            isDirectory: true,
            path: `/${f.name}`, // Use name for path
            updatedAt: f.updated_at,
        }));
     const mappedDocuments: CuboneFileType[] = documents
        .filter(d => d && typeof d.name === 'string' && d.name.trim() !== '') // Ensure document name is valid
        .map(d => ({
            id: d.id, // <-- Populate ID
            name: d.name,
            isDirectory: false,
            path: `/${d.name}`, // Use name for path
            updatedAt: d.updated_at,
        }));

    return [...mappedFolders, ...mappedDocuments];
};

// Hardcoded test data to isolate rendering issue
// const testFiles: CuboneFileType[] = [
//     { name: "Test Document 1.txt", isDirectory: false, path: "/test-doc-uuid-1", updatedAt: new Date().toISOString() },
//     { name: "Test Folder A", isDirectory: true, path: "/test-folder-uuid-a", updatedAt: new Date().toISOString() },
//     { name: "Another Doc.md", isDirectory: false, path: "/test-doc-uuid-2", updatedAt: new Date().toISOString() }
// ];

// Define a default model fallback (used if store isn't ready)
const defaultModelFallback = 'gemini-1.5-flash';

export default function LaunchPage() {
  const router = useRouter();
  // --- Preference Store --- ADDED
  const {
      default_model: preferredModel,
      isInitialized: isPreferencesInitialized,
  } = usePreferenceStore();

  // --- State for Chat Input ---
  const [input, setInput] = useState(''); // Replaces initialInputValue
  // UPDATED: Initialize model state using preference store
  const [model, setModel] = useState<string>(() => {
      if (isPreferencesInitialized && preferredModel) {
          return preferredModel;
      } 
      // If store isn't ready yet, use the hardcoded fallback for initial render
      return defaultModelFallback;
  }); 
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false); // Needed for ChatInputUI props
  const [uploadError, setUploadError] = useState<string | null>(null); // Needed for ChatInputUI props
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null); // Needed for ChatInputUI props
  const formRef = useRef<HTMLFormElement>(null); // Ref for the form

  // --- State for File Manager & Page ---
  const [cuboneFiles, setCuboneFiles] = useState<CuboneFileType[]>([]); 
  const [isLoading, setIsLoading] = useState(true); // For initial data fetch
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // For launch action

  // --- State for Typing Effect ---
  const [displayedText, setDisplayedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const fullText = "What do you want to focus on?";
  const typingSpeed = 40; // milliseconds per character

  // --- NEW: State for Audio Recording ---
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingTimerId, setRecordingTimerId] = useState<NodeJS.Timeout | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState(false);
  // --- END: State for Audio Recording ---

  // ADDED: Effect to update local model state if preference loads *after* initial render
  useEffect(() => {
      if (isPreferencesInitialized && preferredModel && model !== preferredModel) {
           console.log(`[LaunchPage] Preference store initialized. Setting model state to preferred: ${preferredModel}`);
           setModel(preferredModel);
      }
      // Only run when the preference becomes available or changes.
      // Don't include `model` in deps to avoid loops.
  }, [isPreferencesInitialized, preferredModel]);

  // Fetch initial file/folder data
  const fetchData = useCallback(async () => {
    console.log("[LaunchPage] Attempting to fetch data..."); // Log start
    setIsLoading(true);
    setError(null);
    try {
      console.log("[LaunchPage] Calling fetch('/api/file-manager')..."); // Log before fetch
      const response = await fetch('/api/file-manager');
      console.log("[LaunchPage] Fetch response status:", response.status); // Log status

      if (!response.ok) {
        let errorData = { error: { message: `HTTP error ${response.status}`}};
        try {
          errorData = await response.json(); // Try to parse error JSON
        } catch (parseError) {
          console.error("[LaunchPage] Failed to parse error response JSON:", parseError);
        }
        throw new Error(errorData.error?.message || `Failed to fetch data (${response.status})`);
      }
      const { data }: { data: { documents: Document[], folders: Folder[] } } = await response.json();
      console.log("[LaunchPage] Fetched data:", data); // Log received data

      // Map fetched data to CuboneFile structure using the helper
      const mappedData = mapToCuboneFiles(data.documents, data.folders);
      console.log("[LaunchPage] Mapped data for FileManager:", mappedData); // Log mapped data
      setCuboneFiles(mappedData);

    } catch (err: any) {
      console.error("[LaunchPage] Error inside fetchData:", err); // Log fetch error
      setError(err.message || 'An unknown error occurred while fetching files.');
      // Reset input state on error?
      // setInput(''); 
    } finally {
      setIsLoading(false);
      console.log("[LaunchPage] Finished fetchData execution."); // Log end
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    console.log("[LaunchPage] useEffect triggered to call fetchData."); // Log effect trigger
    fetchData();
  }, [fetchData]);

  // Effect for typing animation
  useEffect(() => {
    let index = 0;
    setIsTypingComplete(false);
    setDisplayedText(''); // Reset text on mount/re-render

    const typeCharacter = () => {
        if (index < fullText.length) {
            const charToAdd = fullText.charAt(index);
            // console.log(`[Typing Effect] Index: ${index}, Char: ${charToAdd}`); // <-- Add logging
            setDisplayedText((prev) => prev + charToAdd);
            index++;
            setTimeout(typeCharacter, typingSpeed);
        } else {
            console.log("[Typing Effect] Typing complete."); // <-- Add logging
            setIsTypingComplete(true); // Typing finished
        }
    };

    // Start typing after a short delay
    console.log("[Typing Effect] Starting typing..."); // <-- Add logging
    const timeoutId = setTimeout(typeCharacter, 500);

    // Cleanup function to clear timeout if component unmounts
    return () => {
        console.log("[Typing Effect] Cleanup effect."); // <-- Add logging
        clearTimeout(timeoutId);
    }
  }, [fullText, typingSpeed]); // Rerun if text or speed changes (though they are constant here)

  // Focus the chat input by default on mount 
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []); // REMOVED: activeView dependency

  // --- Handlers for Chat Input ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Placeholder file handlers (can be implemented later if needed on launch)
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.warn("File change triggered on Launch page - not implemented yet.");
    toast.info("File attachments are not supported when starting a new document yet.");
    if (event.target) event.target.value = ''; // Reset file input
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    console.warn("Paste triggered on Launch page - not implemented yet.");
     // Basic check to prevent image paste for now
     const items = event.clipboardData?.items;
     if (items) {
        const containsFiles = Array.from(items).some(item => item.kind === 'file');
        if (containsFiles) {
            event.preventDefault(); // Prevent default paste behavior if files are detected
            toast.info("Pasting files is not supported when starting a new document yet.");
        }
     }
  };

  const handleUploadClick = () => {
    console.warn("Upload click triggered on Launch page - not implemented yet.");
    toast.info("File attachments are not supported when starting a new document yet.");
  };

  // Handle Enter key submission
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isSubmitting) {
        event.preventDefault();
        // Only submit if input is not empty OR if recording (prevents accidental submits while recording)
        if (input.trim() && !isRecording) {
            formRef.current?.requestSubmit(); // Trigger form submission
        }
    }
  };

  // --- NEW: Audio Recording Handlers ---
  // Process recorded audio (called by recorder onstop)
  const handleProcessRecordedAudio = useCallback(async () => {
    if (audioChunks.length === 0) {
        console.warn("No audio chunks recorded.");
        toast.info("No audio detected.");
        setIsTranscribing(false); // Ensure state is reset
        return;
    }

    // Check size (e.g., < 1KB might indicate silence)
    const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    if (totalSize < 1024) { // 1KB threshold
        console.warn("Recorded audio size is very small, likely silence:", totalSize);
        toast.info("No significant audio detected.");
        setAudioChunks([]); // Clear chunks
        setIsTranscribing(false);
        return;
    }

    setIsTranscribing(true);
    const audioBlob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
    setAudioChunks([]); // Clear chunks after creating blob

    // Clean up media tracks and recorder instance
    if (mediaRecorder) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        setMediaRecorder(null);
    }

    const formData = new FormData();
    formData.append('audioFile', audioBlob, 'recording.webm'); // Filename can be fixed

    try {
        console.log("Sending audio to /api/chat/transcribe");
        const response = await fetch('/api/chat/transcribe', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Transcription API error:", response.status, errorText);
            throw new Error(`Transcription failed: ${response.statusText || 'Server error'}`);
        }

        const result = await response.json();
        console.log("Transcription result:", result);

        if (result.transcription) {
            // ONLY set the input field on the launch page
            setInput(result.transcription);
            // Do NOT call handleLaunchSubmit here - user needs to click Send/Enter
            toast.success("Audio transcribed!");
        } else {
            throw new Error("Transcription returned no text.");
        }
    } catch (error: any) {
        console.error('Error during transcription request:', error);
        toast.error(`Transcription Error: ${error.message || 'Could not transcribe audio.'}`);
    } finally {
        setIsTranscribing(false);
    }
  }, [audioChunks, mediaRecorder]); // Dependencies

  // Stop recording handler
  const handleStopRecording = useCallback((timedOut = false) => {
    if (recordingTimerId) {
        clearTimeout(recordingTimerId);
        setRecordingTimerId(null);
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        console.log("Stopping recording...");
        mediaRecorder.stop(); // This will trigger the 'onstop' event -> handleProcessRecordedAudio
        setIsRecording(false);
        if (timedOut) {
            toast.info("Recording stopped after 30 seconds.");
        }
    } else {
        console.warn("Stop recording called but recorder not active or found.");
        setIsRecording(false); // Ensure state is reset
    }
  }, [mediaRecorder, recordingTimerId]); // Dependencies

  // Start recording handler
  const handleStartRecording = useCallback(async () => {
    console.log("Attempting to start recording...");
    setMicPermissionError(false); // Reset permission error on new attempt
    setInput(''); // Clear text input when starting recording

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("getUserMedia not supported on this browser.");
        toast.error("Audio recording is not supported on this browser.");
        setMicPermissionError(true); // Set error state
        return;
    }

    try {
        console.log("Requesting microphone permission...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Microphone permission granted.");

        // Determine MIME type
        const options = { mimeType: '' };
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options.mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            options.mimeType = 'audio/ogg;codecs=opus';
        }
        console.log("Using MIME type:", options.mimeType || "Browser default");

        const recorder = new MediaRecorder(stream, options.mimeType ? options : undefined);
        setMediaRecorder(recorder); // Store recorder instance
        setAudioChunks([]); // Clear previous chunks

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                // console.log("Audio data available:", event.data.size);
                setAudioChunks((prev) => [...prev, event.data]);
            }
        };

        recorder.onstop = () => {
            console.log("MediaRecorder stopped naturally.");
            // Use the specific handler for processing
            handleProcessRecordedAudio();
        };

        recorder.onerror = (event) => {
            console.error("MediaRecorder error:", event);
            toast.error("An error occurred during recording.");
            handleStopRecording(); // Attempt to clean up
            setMicPermissionError(true); // Indicate potential issue
        }

        recorder.start();
        console.log("Recording started.");
        setIsRecording(true);

        // Start 30-second timer
        const timerId = setTimeout(() => {
            console.log("Recording timer expired.");
            handleStopRecording(true); // Pass true for timed out
        }, 30000); // 30 seconds
        setRecordingTimerId(timerId);

    } catch (err) {
        console.error("Error getting user media or starting recorder:", err);
        if ((err as Error).name === 'NotAllowedError' || (err as Error).name === 'PermissionDeniedError') {
            toast.error("Microphone permission denied. Please allow access in your browser settings.");
        } else if ((err as Error).name === 'NotFoundError' || (err as Error).name === 'DevicesNotFoundError') {
             toast.error("No microphone found. Please ensure a microphone is connected and enabled.");
        } else {
            toast.error("Could not start recording. Please ensure microphone access is allowed.");
        }
        setMicPermissionError(true);
    }
  }, [handleProcessRecordedAudio, handleStopRecording]); // Dependencies
  // --- END: Audio Recording Handlers ---

  // --- Placeholder clearPreview function for Launch Page --- 
  const clearPreview = useCallback(() => {
      // File uploads are not fully implemented on launch, so this can be empty
      console.log("[LaunchPage] clearPreview called (no-op)."); 
      // Reset any related state if necessary, though likely none here
      setFiles(null);
      setUploadedImagePath(null);
  }, []);
  // --- END Placeholder ---

  // --- Handler for Launch Submission (triggered by form onSubmit) ---
  const handleLaunchSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault(); // Prevent default form submission
    if ((!input.trim() && !isRecording) || isSubmitting) return; // Prevent submit if empty, recording, or already submitting

    console.log("[LaunchPage] Submitting with initial content:", input);
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the text content from the 'input' state
        body: JSON.stringify({ initialContent: input.trim() }), 
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: `Failed to launch (${response.status})`} }));
        throw new Error(errorData.error?.message || `Failed to launch document (${response.status})`);
      }
      const { data }: { data: { documentId: string } } = await response.json();
      console.log("[LaunchPage] Document created, redirecting to:", `/editor/${data.documentId}`);
      
      // Pass initial message via query parameter
      const initialMsgQuery = encodeURIComponent(input.trim());
      router.push(`/editor/${data.documentId}?initialMsg=${initialMsgQuery}`);
      
      // Clear input after successful submission start
      setInput(''); 

    } catch (err: any) {
      console.error("Launch submit error:", err);
      setError(err.message || 'An unknown error occurred during launch.');
      setIsSubmitting(false); // Ensure submit button is re-enabled on error
    } 
    // No finally block to reset isSubmitting, handled in success/error paths
  };


  // --- Handlers for Cubone File Manager Actions ---
  const handleCreateFolder = useCallback(async (name: string /*, parentFolder: CuboneFileType | null */) => {
    console.log('Create Folder Request:', name /*, parentFolder?.path */);
    setError(null);
    try {
        // Determine parentId based on parentFolder if needed, assuming root for now
        const parentId = null; // Simplification: Assume creating in root for now
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parentFolderId: parentId }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Failed to create folder');
        }
        await fetchData(); // Refetch data after creation
    } catch (err: any) {
        setError(err.message);
    }
  }, [fetchData]);

  const handleRename = useCallback(async (file: CuboneFileType, newName: string) => {
    console.log('Rename Request:', file.path, newName);
    const id = file.id;
    if (!id) { setError("Could not rename: Item ID is missing."); return; }
    const apiPath = file.isDirectory ? `/api/folders/${id}` : `/api/documents/${id}`;
    try {
        const response = await fetch(apiPath, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }),
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message || 'Failed to rename item'); }
        await fetchData(); // Refetch
    } catch (err: any) { setError(err.message); }
  }, [fetchData]);

  const handleDelete = useCallback(async (filesToDelete: CuboneFileType[]) => {
      console.log('Delete Request:', filesToDelete.map(f => f.path));
      setError(null);
      const results = await Promise.allSettled(filesToDelete.map(async (file) => {
          const id = file.id;
          if (!id) { throw new Error(`Missing ID for ${file.name}`); }
          const apiPath = file.isDirectory ? `/api/folders/${id}` : `/api/documents/${id}`;
          const response = await fetch(apiPath, { method: 'DELETE' });
          if (!response.ok) { const err = await response.json().catch(() => ({ error: { message: `Failed to delete ${file.name}` } })); throw new Error(err.error?.message || `Failed to delete ${file.name}`); }
      }));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) { setError(`Failed to delete ${failed.length} item(s).`); failed.forEach((fail: any) => console.error(fail.reason)); }
      await fetchData(); // Refetch
  }, [fetchData]);

  const handleFileOpen = useCallback((file: CuboneFileType) => {
      console.log("File Open Request:", file.path, "ID:", file.id);
      if (!file.isDirectory) {
           const id = file.id;
          if (id) { router.push(`/editor/${id}`); }
          else { console.error("Could not extract ID from file path:", file.path); setError("Could not open file: Invalid path."); }
      } 
      // Logic for folder navigation within Cubone would go here
  }, [router]);

   const handlePasteCubone = useCallback(async (sourceFiles: CuboneFileType[], destinationFolder: CuboneFileType, operationType: "copy" | "move") => {
        console.log(`Cubone Paste Request: ${operationType}`, sourceFiles.map(f=>f.path), `to dest: ${destinationFolder.path}`);
        setError("Move/Copy/Paste not implemented yet.");
        // TODO: Implement Cubone move/copy API calls
        // await fetchData();
    }, []); // Removed fetchData dependency

  // --- Return JSX ---
  return (
    <div className="flex flex-col h-full p-4 bg-[--bg-secondary] text-[--text-color]">
      {/* Updated Heading with Conditional Content */}
      <h1 className="text-2xl font-semibold mb-4 text-center font-uncut-sans h-8"> {/* Added h-8 for stable height */}
        {isSubmitting ? (
          <span className="loading-text">
            Loading
            <span className="dot1">.</span>
            <span className="dot2">.</span>
            <span className="dot3">.</span>
          </span>
        ) : (
          <>
            <span className="typing-text">{displayedText}</span>
            <span className="cursor blinking"></span>
          </>
        )}
      </h1>

      {/* Main Content Area (Previously Conditional) */}
      <> 
        {/* Launch Input Form using ChatInputUI */}
        <form ref={formRef} onSubmit={handleLaunchSubmit} className="mb-6">
          {/* <label htmlFor="launch-input" className="sr-only">What do you want to focus on?</label> */}
          {/* We can hide the label since ChatInputUI has a placeholder */}
          <ChatInputUI
            files={files} // Pass null initially
            fileInputRef={fileInputRef} // Pass ref
            handleFileChange={handleFileChange} // Pass placeholder handler
            inputRef={inputRef} // Pass ref
            input={input} // Pass input state
            handleInputChange={handleInputChange} // Pass handler
            handleKeyDown={handleKeyDown} // Pass handler
            handlePaste={handlePaste} // Pass placeholder handler
            model={model} // Pass model state
            setModel={setModel} // Pass model setter
            handleUploadClick={handleUploadClick} // Pass placeholder handler
            isLoading={isSubmitting} // Use isSubmitting to disable input during launch
            isUploading={isUploading} // Pass state (false initially)
            uploadError={uploadError} // Pass state (null initially)
            uploadedImagePath={uploadedImagePath} // Pass state (null initially)
            // --- NEW: Pass Audio Props ---
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            micPermissionError={micPermissionError}
            startRecording={handleStartRecording}
            stopRecording={handleStopRecording}
            clearPreview={clearPreview}
            
            // --- END: Pass Audio Props ---
            // Removed onStop prop as it's not defined here and ChatInputUI doesn't need it directly for launch submit
          />
          {/* The submit button is now inside ChatInputUI */}
        </form>
        
        {/* Error Message Display (Only show errors relevant to chat/launch?) */}
        {error && <div className="mb-4 p-2 text-red-700 bg-red-100 border border-red-400 rounded text-center">{error}</div>}

        {/* --- MOVED FROM newFileManager VIEW --- */}
        {/* Add Omnibar */}
        <div className="mb-4">
          <Omnibar />
        </div>

        {/* Render the actual NewFileManager component */}
        <div className="flex-grow overflow-hidden border border-[--border-color] rounded-md shadow-sm">
          <NewFileManager />
        </div>
        {/* --- END MOVED SECTION --- */}
      </>
    </div>
  );
} 