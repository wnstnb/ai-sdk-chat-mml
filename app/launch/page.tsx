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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"; // Add Card imports
import Link from 'next/link'; // Import Link for navigation
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Add Tabs imports
import { Button } from "@/components/ui/button"; // ADDED: Import Button component
// ADDED: Import Lucide icons
import { FilePlus, AudioWaveform, Shovel, BookOpenText } from 'lucide-react';
// ADDED: Import useModalStore
import { useModalStore } from '@/stores/useModalStore';

// --- NEW: Import Omnibar ---
import { Omnibar } from '@/components/search/Omnibar';
// --- NEW: Import X icon for pills ---
import { X } from 'lucide-react'; 
// --- NEW: Import DocumentCardGrid component ---
import DocumentCardGrid from '@/components/file-manager/DocumentCardGrid';

// --- NEW: Import TaggedDocument type ---
import type { TaggedDocument } from '@/lib/types';
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions'; // <<< ADDED: Import type

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
  // ADDED: Get openNewDocumentModal from the store
  const { openNewDocumentModal } = useModalStore();

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

  // --- NEW: State for tagged documents ---
  const [taggedDocuments, setTaggedDocuments] = useState<TaggedDocument[]>([]);
  // --- END NEW ---

  // --- State for File Manager & Page ---
  const [cuboneFiles, setCuboneFiles] = useState<CuboneFileType[]>([]); 
  const [isLoading, setIsLoading] = useState(true); // For initial data fetch
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // For launch action
  // --- NEW: State for Recent Documents (Placeholder) ---
  // const [recentDocuments, setRecentDocuments] = useState<Document[]>([]); // Placeholder state - REMOVED
  const [isLoadingRecent, setIsLoadingRecent] = useState(true); // Placeholder loading state - REMOVED

  // --- NEW: State for Audio Recording ---
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingTimerId, setRecordingTimerId] = useState<NodeJS.Timeout | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState(false);
  // --- NEW: State for Recording Duration ---
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [displayTimerId, setDisplayTimerId] = useState<NodeJS.Timeout | null>(null);
  // --- END: State for Audio Recording ---

  // --- NEW: State & Refs for Audio Visualization ---
  const [audioTimeDomainData, setAudioTimeDomainData] = useState<AudioTimeDomainData>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null); // To store requestAnimationFrame ID
  const dataArrayRef = useRef<Uint8Array | null>(null); // To store the array for data retrieval
  const isRecordingRef = useRef(false); // Ref to track recording state for animation loop
  // --- END: Audio Visualization ---

  // --- NEW: Ref to prevent rapid re-entry into start recording ---
  const isStartingRecordingRef = useRef(false);
  // --- END: NEW Ref ---

  // After the existing refs for visualisation (audioTimeDomainData etc.) insert:
  const SILENCE_THRESHOLD = 0.02;
  const SILENCE_DURATION_MS = 1500;
  const lastSoundTimeRef = useRef<number>(0);
  const soundDetectedRef = useRef<boolean>(false);
  const recordingStartTimeRef = useRef<number>(0);

  // Add below isRecordingRef
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // --- NEW: Default active tab state ---
  const [activeTab, setActiveTab] = useState("preview-cards"); // Default to "preview-cards"

  // ADDED: Effect to update local model state if preference loads *after* initial render
  useEffect(() => {
      if (isPreferencesInitialized && preferredModel && model !== preferredModel) {
           console.log(`[LaunchPage] Preference store initialized. Setting model state to preferred: ${preferredModel}`);
           setModel(preferredModel);
      }
      // Only run when the preference becomes available or changes.
      // Don't include `model` in deps to avoid loops.
  }, [isPreferencesInitialized, preferredModel]);

  // Fetch initial file/folder data (for file manager)
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

  // --- NEW: Fetch Recent Documents --- 
  /* REMOVED fetchRecentDocuments function
  const fetchRecentDocuments = useCallback(async () => {
      console.log("[LaunchPage] Attempting to fetch recent documents...");
      setIsLoadingRecent(true);
      try {
          // TODO: Replace with actual API endpoint call
          console.warn("[LaunchPage] Fetching recent documents - using placeholder data.");
          // Simulate API call delay
          await new Promise(resolve => setTimeout(resolve, 800)); 
          // Placeholder data (replace with actual fetch logic)
          const placeholderRecent: Document[] = [
              { id: 'doc-1', name: 'Meeting Notes Q2', updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), created_at: '', user_id: '', content: null, metadata: {} },
              { id: 'doc-2', name: 'Project Proposal v3', updated_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(), created_at: '', user_id: '', content: null, metadata: {} },
              { id: 'doc-3', name: 'Draft Blog Post - AI', updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), created_at: '', user_id: '', content: null, metadata: {} },
          ];
          setRecentDocuments(placeholderRecent);
          setError(null); // Clear previous errors if successful
      } catch (err: any) {
          console.error("[LaunchPage] Error fetching recent documents:", err);
          setError('Failed to load recent documents.'); // Set specific error or reuse general one
          setRecentDocuments([]); // Clear data on error
      } finally {
          setIsLoadingRecent(false);
          console.log("[LaunchPage] Finished fetchRecentDocuments execution.");
      }
  }, []);
  */

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    console.log("[LaunchPage] useEffect triggered to call fetchData & fetchRecentDocuments."); // Log effect trigger
    fetchData();
    // fetchRecentDocuments(); // Fetch recent docs as well - REMOVED
  }, [fetchData]); // Add fetchRecentDocuments dependency - REMOVED

  // Focus the chat input by default on mount 
  useEffect(() => {
    if (inputRef.current && activeTab === "new-document") { // Only focus if new-document tab is active
      inputRef.current.focus();
    }
  }, [activeTab]); // Depend on activeTab

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

  // --- NEW: Visualize function ---
  const visualize = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current || !isRecordingRef.current) {
      // Stop the loop if analyser isn't ready or recording stopped
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
    // Update state with a *copy* of the data to trigger re-render
    setAudioTimeDomainData(new Uint8Array(dataArrayRef.current));

    // Continue the loop
    animationFrameRef.current = requestAnimationFrame(visualize);

    // --- Silence detection ---
    let sumSq = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const v = (dataArrayRef.current[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / dataArrayRef.current.length);
    const now = Date.now();
    if (rms > SILENCE_THRESHOLD) {
      soundDetectedRef.current = true;
      lastSoundTimeRef.current = now;
    } else if (now - lastSoundTimeRef.current > SILENCE_DURATION_MS && isRecordingRef.current) {
      console.log('[visualize] Silence >1.5s, auto stop.');
      handleStopRecording(false);
      return;
    }
  }, []); // No dependencies needed as it reads refs

  // Process recorded audio (called by recorder onstop)
  const handleProcessRecordedAudio = useCallback(async () => {
    // Reset flag for next recording
    soundDetectedRef.current = false;
    // Use a functional update for audioChunks to ensure we get the latest state
    let processed = false; // Flag to ensure processing runs only once if called multiple times
    setAudioChunks(currentChunks => {
        if (processed || currentChunks.length === 0) {
            if (!processed) { // Only log/toast if this is the first check and chunks are empty
                console.warn("No audio chunks recorded (or already processed).");
                toast.info("No audio detected.");
                setIsTranscribing(false); // Ensure state is reset
            }
            return currentChunks; // Return unchanged state
        }
        processed = true; // Mark as processed

        // Check size (e.g., < 1KB might indicate silence)
        const totalSize = currentChunks.reduce((sum, chunk) => sum + chunk.size, 0);
        if (totalSize < 1024) { // 1KB threshold
            console.warn("Recorded audio size is very small, likely silence:", totalSize);
            toast.info("No significant audio detected.");
            setIsTranscribing(false);
            return []; // Clear chunks
        }

        setIsTranscribing(true);
        // Use currentChunks directly instead of relying on potentially stale state
        let audioBlob: Blob;
        let mimeType: string | undefined;

        // Try to get mimeType from the recorder if available
        mimeType = mediaRecorderRef.current?.mimeType || mediaRecorder?.mimeType;
        const effectiveMimeType = mimeType || 'audio/webm'; // Default to webm if not available
        console.log(`Creating Blob with effective mimeType: ${effectiveMimeType}`);
        audioBlob = new Blob(currentChunks, { type: effectiveMimeType });

        const formData = new FormData();
        formData.append('audioFile', audioBlob, 'recording.webm');

        // Async logic needs to be outside the setter function
        (async () => {
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
                    const transcribedText = result.transcription; // Store text
                    setInput(transcribedText); // Update UI state
                    toast.success("Audio transcribed!");

                    // --- ADDED: Automatically trigger submission --- 
                    console.log("[LaunchPage] Transcription successful, triggering launch submit...");
                    // Use a small delay to allow UI update before potential navigation
                    setTimeout(() => {
                        handleLaunchSubmit(null, transcribedText);
                    }, 50); // 50ms delay
                    // --- END ADDED --- 

                } else {
                    throw new Error("Transcription returned no text.");
                }
            } catch (error: any) {
                console.error('Error during transcription request:', error);
                toast.error(`Transcription Error: ${error.message || 'Could not transcribe audio.'}`);
            } finally {
                setIsTranscribing(false);
            }
        })(); // Immediately invoke the async function

        return []; // Clear chunks after processing is initiated
    });

  }, [mediaRecorder]); // Keep mediaRecorder dependency for mimeType, but handle its cleanup elsewhere

  // Stop recording handler
  const handleStopRecording = useCallback((timedOut = false) => {
    if (recordingTimerId) {
        clearTimeout(recordingTimerId);
        setRecordingTimerId(null);
    }
    // --- NEW: Clear display timer ---
    if (displayTimerId) {
        clearInterval(displayTimerId);
        setDisplayTimerId(null);
    }
    // --- END: Clear display timer ---
    const activeRecorder = mediaRecorderRef.current || mediaRecorder;
    if (activeRecorder && activeRecorder.state === 'recording') {
        console.log("Stopping MediaRecorder via ref...");
        activeRecorder.stop();
        setIsRecording(false);
        if (timedOut) toast.info("Recording stopped automatically after 30 seconds.");
    } else {
        console.log("Recorder already stopped or null.");
        setIsRecording(false);
        if (mediaRecorderRef.current?.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
        mediaRecorderRef.current = null;
        setMediaRecorder(null);
    }
  }, [mediaRecorder, recordingTimerId, displayTimerId]); // Dependencies

  // Start recording handler
  const handleStartRecording = useCallback(async () => {
    if (isStartingRecordingRef.current) {
      console.log("[LaunchPage] Start recording already in progress, ignoring.");
      return;
    }
    isStartingRecordingRef.current = true;

    try {
      console.log("Attempting to start recording...");
      setMicPermissionError(false);
      setInput('');
      // --- NEW: Reset recording duration ---
      setRecordingDuration(0);
      if (displayTimerId) { // Clear any existing display timer
          clearInterval(displayTimerId);
          setDisplayTimerId(null);
      }
      // --- END: Reset recording duration ---

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("getUserMedia not supported on this browser.");
        toast.error("Audio recording is not supported on this browser.");
        setMicPermissionError(true);
        // isStartingRecordingRef.current will be reset in finally
        return;
      }

      // --- Reset visualization state on new attempt ---
      setAudioTimeDomainData(null);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      audioSourceNodeRef.current?.disconnect();
      analyserRef.current?.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          await audioContextRef.current.close().catch(console.error); // Ensure previous context is closed
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      audioSourceNodeRef.current = null;
      dataArrayRef.current = null;


      try { // Inner try for media operations, original try block
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

        // --- Initialize Audio Context and Analyser ---
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048; // Standard FFT size
        audioSourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
        audioSourceNodeRef.current.connect(analyserRef.current);
        // We don't connect analyser to destination as we only need data analysis
        dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        // --- End Initialization ---

        const recorder = new MediaRecorder(stream, options.mimeType ? options : undefined);
        setAudioChunks([]); // Clear previous chunks *before* setting handlers

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            setAudioChunks((prev) => [...prev, event.data]);
          }
        };

        recorder.onstop = () => {
          console.log("MediaRecorder stopped naturally.");
          // --- Cleanup Visualization ---
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
          audioSourceNodeRef.current?.disconnect();
          analyserRef.current?.disconnect();
          if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
              audioContextRef.current.close().catch(console.error);
          }
          setAudioTimeDomainData(null); // Reset visualization data
          // Reset refs AFTER cleanup
          audioContextRef.current = null;
          analyserRef.current = null;
          audioSourceNodeRef.current = null;
          dataArrayRef.current = null;
          // --- End Cleanup ---

          // Call the processing function directly
          handleProcessRecordedAudio();

          // Clean up stream tracks and recorder state *after* processing is initiated
          try {
            stream.getTracks().forEach(track => track.stop());
            console.log("Media stream tracks stopped.");
          } catch (e) {
            console.error("Error stopping media stream tracks:", e);
          }
          setMediaRecorder(null); // Clear the recorder state variable
          mediaRecorderRef.current = null;
        };

        recorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          toast.error("An error occurred during recording.");
          handleStopRecording(); // Attempt to clean up (includes viz cleanup)
          setMicPermissionError(true);
        };

        // Now set the mediaRecorder state *after* handlers are defined
        setMediaRecorder(recorder);

        recorder.start();
        console.log("Recording started.");
        setIsRecording(true);
        isRecordingRef.current = true; // Set ref for animation loop

        // --- Start Visualization ---
        animationFrameRef.current = requestAnimationFrame(visualize); // Start the animation loop

        // --- NEW: Start display timer ---
        setDisplayTimerId(setInterval(() => {
            setRecordingDuration(prevDuration => prevDuration + 1);
        }, 1000));
        // --- END: Start display timer ---

        // Start 30-second timer
        const timerId = setTimeout(() => {
          console.log("Recording timer expired.");
          handleStopRecording(true); // Pass true for timed out
        }, 30000);
        setRecordingTimerId(timerId);

        // In handleStartRecording, right after `isRecordingRef.current = true;`
        recordingStartTimeRef.current = Date.now();
        lastSoundTimeRef.current = recordingStartTimeRef.current;
        soundDetectedRef.current = false;

        // In handleStartRecording, after const recorder = new MediaRecorder(...)
        mediaRecorderRef.current = recorder;

      } catch (err) { // Catch for media operations
          console.error("Error getting user media or starting recorder:", err);
          if ((err as Error).name === 'NotAllowedError' || (err as Error).name === 'PermissionDeniedError') {
              toast.error("Microphone permission denied. Please allow access in your browser settings.");
          } else if ((err as Error).name === 'NotFoundError' || (err as Error).name === 'DevicesNotFoundError') {
               toast.error("No microphone found. Please ensure a microphone is connected and enabled.");
          } else {
              toast.error("Could not start recording. Please ensure microphone access is allowed.");
          }
          setMicPermissionError(true);
          // Ensure cleanup if error occurs during setup
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          audioSourceNodeRef.current?.disconnect();
          analyserRef.current?.disconnect();
          if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
               audioContextRef.current.close().catch(console.error);
          }
          setAudioTimeDomainData(null);
          audioContextRef.current = null;
          analyserRef.current = null;
          audioSourceNodeRef.current = null;
          animationFrameRef.current = null;
          dataArrayRef.current = null;
      }
    } finally {
      isStartingRecordingRef.current = false;
    }
  }, [handleProcessRecordedAudio, handleStopRecording, visualize, displayTimerId]);
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

  // --- Handler for Launch Submission (triggered by form onSubmit or audio) ---
  const handleLaunchSubmit = async (
      event?: React.FormEvent<HTMLFormElement> | null, // Allow null for direct calls
      forcedContent?: string // Optional content from audio transcription
  ) => {
    if (event) event.preventDefault(); // Prevent default form submission if triggered by event
    
    // Use forcedContent if provided, otherwise use state. Trim only if using state.
    const contentToSubmit = forcedContent ?? input.trim();

    // Check if content is valid or if already submitting/recording
    // Allow submission even if input state is empty IF forcedContent is provided
    if ((!contentToSubmit && !forcedContent && !isRecording) || isSubmitting) {
        console.log("[handleLaunchSubmit] Submission prevented. Conditions not met.", { contentToSubmit, forcedContent, isRecording, isSubmitting });
        return;
    }

    console.log("[LaunchPage] Submitting with content:", contentToSubmit);
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the determined content
        body: JSON.stringify({ 
            initialContent: contentToSubmit,
            // --- NEW: Add taggedDocumentIds to the payload --- 
            taggedDocumentIds: taggedDocuments.map(doc => doc.id),
            // --- END NEW ---
        }), 
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: `Failed to launch (${response.status})`} }));
        throw new Error(errorData.error?.message || `Failed to launch document (${response.status})`);
      }
      const { data }: { data: { documentId: string, taggedDocumentIds?: string[] } } = await response.json();
      console.log("[LaunchPage] Document created, redirecting to:", `/editor/${data.documentId}`);
      
      // Pass initial message via query parameter (using the submitted content)
      let redirectUrl = `/editor/${data.documentId}?initialMsg=${encodeURIComponent(contentToSubmit)}`; 

      // --- NEW: Add taggedDocumentIds to redirect URL --- 
      if (data.taggedDocumentIds && data.taggedDocumentIds.length > 0) {
        redirectUrl += `&taggedDocIds=${data.taggedDocumentIds.join(',')}`;
      }
      // --- END NEW ---
      
      router.push(redirectUrl);
      
      // Clear input only if submission wasn't forced (i.e., came from form event/enter key)
      // If forcedContent exists (from audio), the page will navigate away anyway.
      if (!forcedContent) {
         setInput(''); 
      }

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
    <div className="flex flex-col h-screen bg-[--bg-primary] text-[--text-color] overflow-hidden">
      {/* Header Area - Kept minimal for now - REMOVED
      <header className="p-4 border-b border-[--border-color] flex items-center justify-between print-hide">
        <h1 className="text-xl font-semibold">Launch Pad</h1>
      </header>
      */}

      {/* Main Content Area */}
      <div className="flex-grow overflow-y-auto">
        {/* Tabs component's value and onValueChange are no longer needed if only one content is shown */}
        {/* Also, TabsList is removed */}
        <div className="pt-2 px-2 md:pt-4 md:px-4 h-full flex flex-col">
          {/* <TabsList className="mb-4 print-hide grid w-full grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="preview-cards">Preview Cards</TabsTrigger>
            <TabsTrigger value="new-document">New Document</TabsTrigger>
            <TabsTrigger value="recent-files">Recent Files</TabsTrigger>
            <TabsTrigger value="file-manager">File Manager</TabsTrigger>
          </TabsList> */}

          {/* REMOVED Tab Content for "New Document" */}
          {/* <TabsContent value="new-document" className="flex-grow flex flex-col outline-none ring-0 focus:ring-0 focus:outline-none" tabIndex={-1}> ... </TabsContent> */}

          {/* REMOVED Tab Content for "Recent Files" */}
          {/* <TabsContent value="recent-files" className="flex-grow outline-none ring-0 focus:ring-0 focus:outline-none" tabIndex={-1}> ... </TabsContent> */}

          {/* REMOVED Tab Content for "File Manager" */}
          {/* <TabsContent value="file-manager" className="flex-grow h-full outline-none ring-0 focus:ring-0 focus:outline-none" tabIndex={-1}> ... </TabsContent> */}

          {/* Tab: Preview Cards - Existing File Browser / Document Grid */}
          {/* The TabsContent wrapper might be removable if it's the only content */}
          <div className="mt-0 border-0 p-0 flex-grow">
            {/* UPDATED BUTTONS CONTAINER - Min 2x2 grid, 1x4 on lg, with glass effect, rounded-lg, shadow-md, and hover effects */}
            <div className="py-6 grid grid-cols-2 gap-3 max-w-xs mx-auto lg:flex lg:flex-row lg:justify-around lg:w-full lg:max-w-2xl lg:mx-auto lg:space-y-0">
              <Button 
                variant="secondary"
                className="flex flex-col items-center justify-center p-3 w-32 h-32 lg:w-36 lg:h-36 bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/50 rounded-lg shadow-md transition-all duration-300 ease-in-out motion-reduce:transition-none hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none will-change-[transform,box-shadow,opacity]"
                onClick={openNewDocumentModal} 
              >
                <FilePlus className="mb-1.5 h-9 w-9 lg:h-10 lg:w-10 lg:mb-2 text-gray-700 dark:text-gray-300" />
                <span className="text-center text-sm lg:text-base text-gray-700 dark:text-gray-300 w-full">New Note</span>
              </Button>
              <Button 
                variant="secondary" 
                className="flex flex-col items-center justify-center p-3 w-32 h-32 lg:w-36 lg:h-36 bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/50 rounded-lg shadow-md transition-all duration-300 ease-in-out motion-reduce:transition-none hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none will-change-[transform,box-shadow,opacity]"
              >
                <AudioWaveform className="mb-1.5 h-9 w-9 lg:h-10 lg:w-10 lg:mb-2 text-gray-700 dark:text-gray-300" />
                <span className="text-center text-sm lg:text-base text-gray-700 dark:text-gray-300 w-full">Voice Summary<br />(WIP)</span>
              </Button>
              <Button 
                variant="secondary" 
                className="flex flex-col items-center justify-center p-3 w-32 h-32 lg:w-36 lg:h-36 bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/50 rounded-lg shadow-md transition-all duration-300 ease-in-out motion-reduce:transition-none hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none will-change-[transform,box-shadow,opacity]"
              >
                <Shovel className="mb-1.5 h-9 w-9 lg:h-10 lg:w-10 lg:mb-2 text-gray-700 dark:text-gray-300" />
                <span className="text-center text-sm lg:text-base text-gray-700 dark:text-gray-300 w-full">Web Scrape<br />(WIP)</span>
              </Button>
              <Button 
                variant="secondary" 
                className="flex flex-col items-center justify-center p-3 w-32 h-32 lg:w-36 lg:h-36 bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/50 rounded-lg shadow-md transition-all duration-300 ease-in-out motion-reduce:transition-none hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none will-change-[transform,box-shadow,opacity]"
              >
                <BookOpenText className="mb-1.5 h-9 w-9 lg:h-10 lg:w-10 lg:mb-2 text-gray-700 dark:text-gray-300" />
                <span className="text-center text-sm lg:text-base text-gray-700 dark:text-gray-300 w-full">PDF Summary<br />(WIP)</span>
              </Button>
            </div>
            {/* END UPDATED BUTTONS CONTAINER */}
            
            {/* Existing Document Card Grid - Placeholder */}
            <DocumentCardGrid />
          </div>

        </div>
      </div>
    </div>
  );
} 