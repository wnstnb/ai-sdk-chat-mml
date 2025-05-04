import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat, type Message } from 'ai/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useFollowUpStore } from '@/lib/stores/followUpStore';
import type { BlockNoteEditor } from '@blocknote/core';
import { getInlineContentText } from '@/lib/editorUtils';

// Define the shape of the editor context data expected by the submit handler
interface EditorContextData {
    editorMarkdownContent?: string;
    editorBlocksContext?: { id: string; contentSnippet: string }[];
}

interface UseChatInteractionsProps {
    documentId: string;
    initialModel: string; // Preferred model from preferences
    initialMessages: Message[] | null; // <-- ADDED: Initial messages from history
    editorRef: React.RefObject<BlockNoteEditor<any>>;
    uploadedImagePath: string | null; // ADDED BACK: Storage path for DB
    uploadedImageSignedUrl: string | null; // Signed download URL for AI/UI
    isUploading: boolean; // From useFileUpload
    clearFileUploadPreview: () => void; // From useFileUpload
    apiEndpoint?: string; // Optional override for API endpoint
}

// Define inline options type based on docs for append/handleSubmit
interface ReloadOptions {
    headers?: Record<string, string> | Headers;
    body?: object; // Assuming a generic object is suitable
    data?: any; // Assuming JSONValue or any
    // attachments are likely not needed for reload, omitting for now
}

// Define the return type for the hook - ADDED audio props
interface UseChatInteractionsReturn {
    messages: Message[];
    setMessages: (messages: Message[]) => void;
    input: string;
    setInput: (input: string) => void;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (event?: React.FormEvent<HTMLFormElement>, options?: { data?: any }) => Promise<void>; // Updated handleSubmit signature
    isLoading: boolean;
    reload: (options?: ReloadOptions | undefined) => Promise<string | null | undefined>;
    stop: () => void; // Stop AI generation
    model: string;
    setModel: React.Dispatch<React.SetStateAction<string>>;
    // --- NEW AUDIO PROPS --- 
    isRecording: boolean;
    isTranscribing: boolean;
    micPermissionError: boolean;
    startRecording: () => void;
    stopRecording: (timedOut?: boolean) => void; // Make timedOut optional
    audioTimeDomainData: AudioTimeDomainData; // <<< NEW: Exposed audio data for visualization
    // --- END NEW AUDIO PROPS ---
}

// --- NEW: Type for audio visualization data ---
export type AudioTimeDomainData = Uint8Array | null; // Export the type

export function useChatInteractions({
    documentId,
    initialModel,
    initialMessages, // Prop containing messages from useInitialChatMessages
    editorRef,
    uploadedImagePath,
    uploadedImageSignedUrl,
    isUploading,
    clearFileUploadPreview,
    apiEndpoint = '/api/chat',
}: UseChatInteractionsProps): UseChatInteractionsReturn {
    
    console.log('[useChatInteractions] Received initialMessages prop:', JSON.stringify(initialMessages, null, 2));
    
    // --- Internal State ---
    const [model, setModel] = useState<string>(initialModel);
    const [pendingInitialSubmission, setPendingInitialSubmission] = useState<string | null>(null);
    const [pendingSubmissionMethod, setPendingSubmissionMethod] = useState<'audio' | 'text' | null>(null); // Track pending type
    const [pendingWhisperDetails, setPendingWhisperDetails] = useState<any | null>(null); // Store whisper details
    const initialMsgProcessedRef = useRef(false);

    // Audio Recording State
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]); // Use ref for chunks to avoid stale closures in recorder handlers
    const [recordingTimerId, setRecordingTimerId] = useState<NodeJS.Timeout | null>(null);
    const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
    const [micPermissionError, setMicPermissionError] = useState<boolean>(false);

    // --- NEW: Ref to track recording state synchronously for the animation loop ---
    const isRecordingRef = useRef(false);
    // --- END NEW ---

    // --- NEW: Audio Visualization State ---
    const [audioTimeDomainData, setAudioTimeDomainData] = useState<AudioTimeDomainData>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null); // To store requestAnimationFrame ID
    const dataArrayRef = useRef<Uint8Array | null>(null); // To store the array for data retrieval
    // --- END NEW ---

    // --- External Hooks ---
    const router = useRouter();
    const searchParams = useSearchParams();
    const followUpContext = useFollowUpStore((state) => state.followUpContext);
    const setFollowUpContext = useFollowUpStore((state) => state.setFollowUpContext);

    // --- Vercel AI useChat Hook ---
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit: originalHandleSubmit,
        isLoading,
        reload,
        stop: stopAiGeneration, 
        setMessages, // Need setMessages from the hook
        setInput,
        append
    } = useChat({
        api: apiEndpoint,
        id: documentId,
        // --- Pass initialMessages directly, fallback to empty array ---
        initialMessages: initialMessages || [], 
        onResponse: (res) => {
            console.log('[useChat onResponse] Received response:', res);
            if (!res.ok) {
                 console.error(`[useChat onResponse] Response not OK! Status: ${res.status}`);
                 toast.error(`Chat Request Failed: ${res.statusText} (${res.status})`);
            }
        },
        onError: (err) => {
            console.error('[useChat onError] Full error object:', err);
            const errorMsg = `Chat Error: ${err.message || 'Unknown error'}`;
            toast.error(errorMsg);
        },
        onFinish: (message) => {
            console.log('[useChat onFinish] Stream finished. Final message:', message);
        },
    });

    console.log('[useChatInteractions] Messages state FROM useChat hook IMMEDIATELY AFTER init:', JSON.stringify(messages, null, 2));

    // --- Editor Context Retrieval ---
    const getEditorContext = useCallback(async (): Promise<EditorContextData> => {
        const editor = editorRef.current;
        if (!editor) {
             console.warn("getEditorContext called but editorRef is null.");
             return {};
        }
        let contextData: EditorContextData = {};
        try {
            const currentBlocks = editor.document;
            if (currentBlocks?.length > 0) {
                // Use Promise.all to handle the async markdown conversion
                const editorBlocksContextPromises = currentBlocks.map(async (b) => {
                    let snippet = '';
                    if (b.type === 'table') {
                        // Convert the entire table block to Markdown using editor method
                        try {
                            // Use blocksToMarkdownLossy for robustness, passing the single block in an array
                            snippet = await editor.blocksToMarkdownLossy([b]); 
                            // Add a hard limit to prevent excessive context length
                            if (snippet.length > 2000) {
                                snippet = snippet.substring(0, 2000) + '\n... [Table Markdown Truncated] ...';
                            }
                            // Ensure it starts clearly indicating it's table markdown
                            snippet = `[Table Markdown]\n${snippet}`;
                        } catch (mdError) {
                            console.error(`Failed to convert table block ${b.id} to Markdown:`, mdError);
                            snippet = `[table - Error generating Markdown snippet]`;
                        }
                    } else {
                        // Default behavior for non-table blocks
                        snippet = (Array.isArray(b.content) ? getInlineContentText(b.content).slice(0, 100) : '') || `[${b.type}]`;
                    }

                    return {
                        id: b.id,
                        type: b.type,
                        contentSnippet: snippet
                    };
                });
                contextData = {
                    editorBlocksContext: await Promise.all(editorBlocksContextPromises)
                };
            }
        } catch (e) {
            console.error('Failed to get editor snippets:', e);
            toast.error('⚠️ Error getting editor context.');
        }
        return contextData;
    }, [editorRef]);

    // --- Wrapped Submit Handler (Updated Signature) ---
    const handleSubmit = useCallback(async (event?: React.FormEvent<HTMLFormElement>, options?: { data?: any }) => {
        if (event) event.preventDefault();
        if (!documentId) { toast.error("Cannot send message: Document context missing."); return; }

        // --- NEW: Check for pending audio submission ---
        let isAudioSubmission = false;
        let audioWhisperDetails: any = null;
        // Check if the current input matches the pending one AND the method is audio
        if (pendingSubmissionMethod === 'audio' && input === pendingInitialSubmission && input.trim() !== '') {
            isAudioSubmission = true;
            audioWhisperDetails = pendingWhisperDetails;
            console.log("[handleSubmit] Detected pending audio submission.");
            // Reset pending state related to audio - pendingInitialSubmission will be cleared by auto-submit effect later
            setPendingSubmissionMethod(null);
            setPendingWhisperDetails(null);
        } else if (pendingSubmissionMethod === 'audio') {
            // If method is audio but input doesn't match (e.g., user edited), clear audio state
            console.log("[handleSubmit] Pending audio submission detected but input changed. Resetting audio state.");
            setPendingSubmissionMethod(null);
            setPendingWhisperDetails(null);
        }
        // --- END NEW Check ---

        // Note: `options.data` might be passed by manual tool calls in future,
        // for now, we prioritize the pending audio state detected above.
        // const requestData = options?.data || {}; 

        const contextPrefix = followUpContext ? `${followUpContext}\n\n---\n\n` : '';
        // If input came from audio, use that content directly, otherwise use the text input state
        const finalInput = isAudioSubmission ? input : (contextPrefix + input); // Use current input if audio
        const signedUrlToSend = isAudioSubmission ? null : uploadedImageSignedUrl; // Don't send image if input is audio
        const imagePathForDb = isAudioSubmission ? null : uploadedImagePath; // Path only relevant for manual save, keep null for audio
        const currentModel = model;

        if (isLoading || isUploading || (!finalInput?.trim() && !signedUrlToSend)) {
             console.log('[useChatInteractions handleSubmit] Submission prevented:', { isLoading, isUploading, finalInput, signedUrlToSend });
            return;
        }

        // --- Get editor context (no change) ---
        const editorContextData = await getEditorContext();
        const isSummarizationTask = finalInput ? (/ (summar(y|ize|ies)|bullet|points?|outline|sources?|citations?) /i.test(finalInput) && finalInput.length > 25) : false;

        // --- Prepare attachments for optimistic UI update (no change) ---
        const attachmentsForOptimisticUI = signedUrlToSend ? [
            {
                contentType: 'image/*',
                name: imagePathForDb?.split('/').pop() || 'uploaded_image',
                url: signedUrlToSend
            }
        ] : undefined;

        // --- Prepare data payload for the API call (includes image URL if present) ---
        const submitDataPayload = {
            model: currentModel,
            documentId,
            ...editorContextData,
            firstImageSignedUrl: signedUrlToSend,
            uploadedImagePath: imagePathForDb,
            taskHint: isSummarizationTask ? 'summarize_and_cite_outline' : undefined,
            ...(isAudioSubmission && {
                inputMethod: 'audio',
                whisperDetails: audioWhisperDetails,
            }),
        };

        // --- Create the user message object for the hook (content as string) ---
        const contentValue = finalInput?.trim() || '';
        
        // --- START MODIFICATION: Create parts array --- 
        // Define Part types inline or import if needed
        type TextPart = { type: 'text'; text: string };
        type ImagePart = { type: 'image'; image: URL }; // Assuming URL object is correct based on docs
        const parts: Array<TextPart | ImagePart> = [];
        if (contentValue) {
            parts.push({ type: 'text', text: contentValue });
        }
        if (signedUrlToSend) { // Assuming signedUrlToSend is the image URL string
            try {
                const imageUrl = new URL(signedUrlToSend);
                parts.push({ type: 'image', image: imageUrl });
            } catch (e) {
                console.error(`[handleSubmit] Invalid URL provided for image: ${signedUrlToSend}`, e);
                toast.error("Invalid image URL provided.");
                // Decide how to handle: prevent submission? Send only text? 
                return; // Example: Prevent submission on invalid URL
            }
        }

        // --- Create message with BOTH string content AND parts array --- 
        const userMessageForAi: Message = {
            id: `temp-user-${Date.now()}`,
            role: 'user',
            content: contentValue, // <-- Use the plain string here
            parts: parts as any,   // <-- Add the parts array here
            createdAt: new Date(),
        };
        // --- END MODIFICATION --- 

        // --- Manually update UI state BEFORE sending API request --- 
        // REMOVED: setMessages([...messages, userMessageForAi]); // Let append handle this

        // --- Set hook input state for API call & Clear context state --- 
        // Keep setting finalInput for potential internal use by the hook before API call? Let's test removing this too if append works.
        // setInput(finalInput); // Set hook's input to the combined value - Let's comment this out, append takes the message object.
        clearFileUploadPreview(); // Clear file preview
        setFollowUpContext(null); // Clear follow-up context store

        // --- Remove temporary input clearing ---
        // const currentInput = input; 
        // setInput(''); 

        // --- Prepare options for the API call (contains the data payload) ---
        const submitOptions: { data: any; } = {
            data: submitDataPayload as any,
        };

        // --- Call append with the string-content message and options data ---
        try {
            console.log('[handleSubmit] Preparing to call append. Current isLoading state:', isLoading);
            if (isLoading) {
                console.warn('[handleSubmit] Aborting call to append because isLoading is true!');
                toast.error("Chat is still processing the previous request.");
                // If we were manually adding, we'd rollback here. append should handle its own state.
                return; // Explicitly prevent call if loading
            }
            console.log('[handleSubmit] Calling append with message (parts content): ', JSON.stringify(userMessageForAi, null, 2), 'and options:', JSON.stringify(submitOptions, null, 2)); 
            
            // ---> Call append with the parts-based message object <--- 
            append(userMessageForAi, submitOptions);
            
            console.log('[handleSubmit] append called successfully.');
            console.log('[handleSubmit] Messages state immediately after append call:', JSON.stringify(messages, null, 2));

            // ---> Clear visual input field AFTER append call? Append might do this itself. Let's clear it explicitly. <---
            setInput(''); 

        } catch (appendError: any) {
             console.error("[handleSubmit] Error occurred *during* call to append:", appendError);
             toast.error(`Failed to initiate chat request: ${appendError.message || 'Unknown internal error'}`);
             // append should manage its own state rollback on error.
        }
        
    }, [
        documentId, followUpContext, input, model, uploadedImagePath, uploadedImageSignedUrl,
        isLoading, isUploading, getEditorContext, clearFileUploadPreview,
        setFollowUpContext, setInput, messages,
        append,
        pendingInitialSubmission, pendingSubmissionMethod, pendingWhisperDetails
    ]);

    // --- Audio Processing Logic (IMPLEMENTED) ---
    const handleProcessRecordedAudio = useCallback(async () => {
        console.log("handleProcessRecordedAudio called");
        if (audioChunksRef.current.length === 0) {
            console.warn("No audio chunks recorded.");
            toast.info("No audio detected.");
            // Ensure recording state is false if somehow called without stopping properly
            setIsRecording(false); 
            return;
        }

        setIsTranscribing(true);
        console.log("Processing audio chunks...");

        let audioBlob: Blob;
        let mimeType: string | undefined;

        try {
            // Try to get mimeType from the recorder if available
            mimeType = mediaRecorder?.mimeType;
            const effectiveMimeType = mimeType || 'audio/webm'; // Default to webm if not available
            console.log(`Creating Blob with effective mimeType: ${effectiveMimeType}`);
            audioBlob = new Blob(audioChunksRef.current, { type: effectiveMimeType });

             // Basic size check (e.g., < 1KB might be silence or glitch)
            if (audioBlob.size < 1024) {
                console.warn(`Audio blob size (${audioBlob.size} bytes) is very small. Aborting transcription.`);
                toast.info("Recording too short or silent.");
                setIsTranscribing(false); // Reset transcribing state
                setIsRecording(false); // Ensure recording state is off
                audioChunksRef.current = []; // Clear chunks
                return;
            }

            audioChunksRef.current = []; // Reset chunks early
            console.log(`Audio Blob created. Size: ${audioBlob.size}, Type: ${audioBlob.type}`);

            const formData = new FormData();
            // Construct filename using the effectiveMimeType's subtype
            const fileExtension = effectiveMimeType.split('/')[1]?.split(';')[0] || 'webm';
            const fileName = `audio.${fileExtension}`;
            formData.append('audioFile', audioBlob, fileName);
            console.log(`Appending blob to FormData with filename: ${fileName}, type: ${effectiveMimeType}`);

            // Call the transcription API endpoint
            console.log("Sending audio to /api/chat/transcribe...");
            const response = await fetch('/api/chat/transcribe', { 
                method: 'POST',
                body: formData,
            });

            console.log(`Transcription API response status: ${response.status}`);
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Failed to read error response');
                console.error(`Transcription API error: ${response.statusText}`, errorText);
                throw new Error(`Transcription failed: ${response.statusText}`);
            }

            const result = await response.json();
            console.log("Transcription API response data:", result);

            if (result?.transcription && typeof result.transcription === 'string') {
                const transcribedText = result.transcription.trim();
                if (transcribedText) {
                    console.log(`Transcription successful: "${transcribedText}"`);
                    
                    // ---> NEW: Set pending state instead of direct submit <---
                    setInput(transcribedText); // Set the input field
                    setPendingInitialSubmission(transcribedText); // Mark for auto-submit
                    setPendingSubmissionMethod('audio'); // Mark as audio
                    setPendingWhisperDetails(result.whisperDetails || null); // Store details
                    console.log("Set pending state for audio submission.");
                    
                } else {
                    console.warn("Transcription result was empty after trimming.");
                    toast.info("Could not understand audio.");
                }
            } else {
                console.error("Invalid transcription response format:", result);
                throw new Error("Received invalid transcription format from API.");
            }

        } catch (error: any) {
            console.error("Error during audio processing or transcription:", error);
            toast.error(`Transcription Error: ${error.message || 'An unknown error occurred'}`);
            // Ensure recording state is false on error
            setIsRecording(false);
        } finally {
            console.log("Finished processing audio. Resetting isTranscribing.");
            setIsTranscribing(false);
            // Explicitly clear chunks again in finally, just in case
            audioChunksRef.current = []; 
            // Explicitly clear recorder state in finally, as onstop might not have fired on error
            if (mediaRecorder?.stream) {
                console.log("Cleaning up media stream tracks in finally block.");
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
            setMediaRecorder(null);
        }
    }, [audioChunksRef, mediaRecorder, setInput, setIsTranscribing, setIsRecording, setMediaRecorder]); // Removed handleSubmit as it's unlikely needed here and causes changes

    // --- NEW: Function to handle the audio analysis loop ---
    const analyseAudio = useCallback(() => {
        // Use ref check for loop continuation, state check might be stale on first frame
        if (!isRecordingRef.current) {
            console.log("[analyseAudio] isRecordingRef is false, stopping loop.");
            return; 
        }

        if (!analyserRef.current || !dataArrayRef.current) {
            console.log("[analyseAudio] Analyser or data array not ready, skipping frame.");
            // Still request next frame if recording is intended
            if (isRecordingRef.current) {
                 animationFrameRef.current = requestAnimationFrame(analyseAudio);
            }
            return; 
        }

        try {
            analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
            const newData = new Uint8Array(dataArrayRef.current);
            setAudioTimeDomainData(newData);

            // Continue the loop based on the ref
            if (isRecordingRef.current) { 
                animationFrameRef.current = requestAnimationFrame(analyseAudio);
            } 
            // No need for an else log here, the top check handles stopping

        } catch (error) {
            console.error("[analyseAudio] Error getting time domain data:", error);
            // Optionally stop on error, or just log and try next frame
            if (isRecordingRef.current) { // Still try next frame if recording
                animationFrameRef.current = requestAnimationFrame(analyseAudio);
            }
        }
    // Still include isRecording state in deps so the callback itself updates
    // if the state is used for other logic within the hook/component.
    // The ref handles the immediate loop continuation logic.
    }, []); 

    // --- Stop Recording Logic (MODIFIED for cleanup) ---
    const handleStopRecording = useCallback((timedOut = false) => {
        console.log(`handleStopRecording called. Timed out: ${timedOut}, Current recorder state: ${mediaRecorder?.state}`);
        isRecordingRef.current = false; // <<< Set ref to false

        // --- NEW: Stop audio analysis loop ---
        if (animationFrameRef.current) {
            console.log("[handleStopRecording] Cancelling animation frame:", animationFrameRef.current);
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        setAudioTimeDomainData(null); // Clear visualization data
        // --- END NEW ---

        // Clear the timeout regardless of recorder state
        if (recordingTimerId) {
            clearTimeout(recordingTimerId);
            setRecordingTimerId(null);
            console.log("Cleared recording timer.");
        }

        // Stop MediaRecorder if active
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.log("Stopping MediaRecorder...");
            mediaRecorder.stop(); // Triggers onstop -> handleProcessRecordedAudio
            // Set recording state immediately - ensures UI updates even if onstop takes time
            setIsRecording(false); // <--- MOVED setIsRecording(false) here
            if (timedOut) {
                toast.info("Recording stopped automatically after 30 seconds.");
            }
        } else {
             console.log("MediaRecorder not active or already stopped, ensuring isRecording is false.");
            setIsRecording(false); // Ensure state is false even if recorder was not active
            // Cleanup stream tracks if they exist and weren't cleaned by recorder.onstop
             if (mediaRecorder?.stream) {
                console.log("[handleStopRecording] Cleaning up tracks for non-recording recorder.");
                 mediaRecorder.stream.getTracks().forEach(track => track.stop());
             }
             setMediaRecorder(null); // Clear recorder state here too
        }

        // --- NEW: Cleanup AudioContext and Nodes ---
        // Use setTimeout to allow potential pending async operations to finish
        // and avoid potential race conditions with recorder stopping.
        setTimeout(() => {
            if (audioSourceNodeRef.current) {
                 console.log("[handleStopRecording Cleanup] Disconnecting source node.");
                audioSourceNodeRef.current.disconnect();
                audioSourceNodeRef.current = null;
            }
            // Analyser is implicitly disconnected when source is disconnected.
            analyserRef.current = null;

            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                 console.log("[handleStopRecording Cleanup] Closing AudioContext. Current state:", audioContextRef.current.state);
                audioContextRef.current.close().then(() => {
                    console.log("[handleStopRecording Cleanup] AudioContext closed successfully.");
                    audioContextRef.current = null;
                }).catch(err => {
                     console.error("[handleStopRecording Cleanup] Error closing AudioContext:", err);
                     audioContextRef.current = null; // Still nullify ref on error
                });
            } else {
                console.log("[handleStopRecording Cleanup] AudioContext already closed or null.");
                 audioContextRef.current = null; // Ensure ref is null
            }
             dataArrayRef.current = null; // Clear data array ref
         }, 50); // Small delay (e.g., 50ms) - adjust if needed
         // --- END NEW ---

    // Dependencies: recorder instance, timer ID state/setter, and NEW audio refs
    }, [mediaRecorder]); // Removed recordingTimerId from deps, managed by isRecording

    // --- Start Recording Logic (MODIFIED) ---
    const handleStartRecording = useCallback(async () => {
        console.log("Attempting to start recording...");
        setMicPermissionError(false); // Reset error state

        // --- NEW: Clear previous audio data ---
        setAudioTimeDomainData(null);
        if (animationFrameRef.current) { // Cancel any lingering frame loop
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        // --- END NEW ---

        if (!navigator.mediaDevices?.getUserMedia) {
            toast.error("Audio recording is not supported by this browser.");
            console.error("getUserMedia not supported");
            setMicPermissionError(true); // Set error state
            setIsRecording(false);
            // Clear any pending submission if mic access fails
            setPendingInitialSubmission(null);
            setPendingSubmissionMethod(null);
            setPendingWhisperDetails(null);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Microphone access granted.");

            // --- NEW: Get Audio Track and Clone it --- 
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error("No audio track found in the stream.");
            }
            const originalAudioTrack = audioTracks[0];
            const clonedAudioTrack = originalAudioTrack.clone();
            console.log("[handleStartRecording] Cloned audio track.");

            // Create separate streams for AudioContext and MediaRecorder
            const streamForContext = new MediaStream([originalAudioTrack]);
            const streamForRecorder = new MediaStream([clonedAudioTrack]);
            // --- END NEW TRACK CLONING --- 

            // --- Initialize AudioContext and Analyser (Use streamForContext) ---
            try {
                 // Close existing context if any (e.g., from a previous failed attempt)
                if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                     console.log("[handleStartRecording] Closing existing AudioContext before creating new one.");
                    await audioContextRef.current.close();
                 }
                 audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                 console.log("[handleStartRecording] AudioContext created/resumed. State:", audioContextRef.current.state);

                // <<< Use streamForContext here >>>
                audioSourceNodeRef.current = audioContextRef.current.createMediaStreamSource(streamForContext);
                analyserRef.current = audioContextRef.current.createAnalyser();

                // Configure AnalyserNode
                analyserRef.current.fftSize = 2048;
                const bufferLength = analyserRef.current.frequencyBinCount;
                console.log("[handleStartRecording] Analyser bufferLength:", bufferLength);
                dataArrayRef.current = new Uint8Array(bufferLength);

                // Connect the nodes: Source -> Analyser
                audioSourceNodeRef.current.connect(analyserRef.current);
                 console.log("[handleStartRecording] Audio nodes created and connected.");

            } catch (audioSetupError) {
                 console.error("[handleStartRecording] Failed to set up AudioContext/Analyser:", audioSetupError);
                 toast.error("Failed to initialize audio analysis.");
                 // Cleanup BOTH tracks if audio setup failed after getting stream
                 originalAudioTrack.stop();
                 clonedAudioTrack.stop();
                 setIsRecording(false);
                 setMicPermissionError(true);
                 return;
            }
            // --- END AudioContext Setup ---

            // Select MIME type for MediaRecorder (no change needed here)
            const options: MediaRecorderOptions = {};
            const preferredType = 'audio/webm';
            if (MediaRecorder.isTypeSupported(preferredType)) {
                options.mimeType = preferredType;
                console.log(`Using preferred MIME type: ${preferredType}`);
            } else {
                console.log(`Preferred MIME type ${preferredType} not supported, using browser default.`);
            }

            // <<< Use streamForRecorder here >>>
            const recorder = new MediaRecorder(streamForRecorder, options);
            audioChunksRef.current = []; // Clear previous chunks

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    // console.log(`Audio chunk received, size: ${event.data.size}, total chunks: ${audioChunksRef.current.length}`); // Less verbose log
                }
            };

            // Use modified stop handler
            recorder.onstop = () => {
                 console.log("MediaRecorder onstop triggered.");
                // handleProcessRecordedAudio handles transcription
                 handleProcessRecordedAudio();
                 // Explicitly call the main stop handler for cleanup consistency,
                 // even though handleProcessRecordedAudio also cleans up some state.
                 // The main handler ensures AudioContext/Analyser cleanup happens.
                 // Pass false as it's not a timeout.
                 // NOTE: Avoid calling handleStopRecording directly inside onstop if it causes issues.
                 // The primary stop should happen via user action or timer.
                 // Let's rely on the main handleStopRecording call triggered externally.
                 // handleStopRecording(false); // <--- Let's REMOVE this to avoid double-stopping issues. Cleanup is handled by the external call.
            };

            recorder.onerror = (event) => {
                // ... existing recorder error handling ...
                 handleStopRecording(false); // Ensure full cleanup on recorder error
            };

            setMediaRecorder(recorder);
            recorder.start();
            setIsRecording(true); // Set state AFTER recorder starts
            isRecordingRef.current = true; // <<< Set ref to true
            console.log("Recording started. State:", recorder.state);

            // --- NEW: Start the analysis loop ---
            console.log("[handleStartRecording] Starting audio analysis loop...");
            animationFrameRef.current = requestAnimationFrame(analyseAudio);
            // --- END NEW ---

            // Start 30-second timer (no change)
            const timerId = setTimeout(() => {
                console.log("Recording timer (30s) finished.");
                handleStopRecording(true); // Pass true for timedOut
            }, 30000);
            setRecordingTimerId(timerId);
            console.log(`Recording timer set with ID: ${timerId}`);

        } catch (err: any) {
            // ... existing getUserMedia error handling ...
             handleStopRecording(false); // Ensure full cleanup on getUserMedia error
        }
    // Added handleStopRecording, analyseAudio and audio refs dependencies
    }, [handleProcessRecordedAudio, handleStopRecording, analyseAudio]); // Keep analyseAudio here

    // --- Initial Message Processing ---
    useEffect(() => {
        if (!documentId || initialMsgProcessedRef.current) return;
        const initialMsg = searchParams?.get('initialMsg');
        if (initialMsg) {
            const decodedMsg = decodeURIComponent(initialMsg);
            setInput(decodedMsg);
            setPendingInitialSubmission(decodedMsg);
            const currentPath = window.location.pathname; 
            router.replace(currentPath, { scroll: false }); 
            initialMsgProcessedRef.current = true;
        }
    }, [documentId, searchParams, setInput, router]);

    // --- Auto-Submit Initial Message ---
    useEffect(() => {
        if (pendingInitialSubmission && input === pendingInitialSubmission && !isLoading && !isRecording && !isTranscribing) { // Also check recording states
            handleSubmit(undefined);
            setPendingInitialSubmission(null);
        }
    }, [input, pendingInitialSubmission, isLoading, isRecording, isTranscribing, handleSubmit]); // Added recording states

    // --- SPLIT CLEANUP EFFECTS ---

    // Effect specifically for cleaning up the recording timer when it changes or on unmount
    useEffect(() => {
        // Return a cleanup function for the timer
        return () => {
            if (recordingTimerId) {
                console.log("[useChatInteractions Timer Cleanup] Clearing recording timer:", recordingTimerId);
                clearTimeout(recordingTimerId);
            }
        };
    }, [recordingTimerId]); // Only depend on the timer ID itself

    // Effect for handling resource cleanup ONLY on component unmount
    useEffect(() => {
        // This function runs ONCE when the component mounts
        // It returns a cleanup function that runs ONLY when the component unmounts
        return () => {
            console.log("[useChatInteractions UNMOUNT Cleanup] Cleaning up resources.");

            // Ensure animation frame is cancelled
            if (animationFrameRef.current) {
                console.log("[useChatInteractions UNMOUNT Cleanup] Cancelling animation frame:", animationFrameRef.current);
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }

            // Ensure recording stops if unmounting while active
            // Access state/refs directly as this runs only at the very end
            if (isRecording || mediaRecorder?.state === 'recording') {
                console.log("[useChatInteractions UNMOUNT Cleanup] Stopping recording due to unmount.");
                // Call stop directly - ensures tracks/recorder are stopped
                // Note: handleStopRecording also tries to close context, which we do below anyway.
                // Avoid calling handleStopRecording here if it causes double-closing issues.
                // Let's try stopping the recorder and tracks directly first.
                if (mediaRecorder) {
                    if (mediaRecorder.stream) {
                        mediaRecorder.stream.getTracks().forEach(track => track.stop());
                        console.log("[useChatInteractions UNMOUNT Cleanup] Stopped media stream tracks.");
                    }
                    if (mediaRecorder.state === 'recording') {
                         mediaRecorder.stop();
                         console.log("[useChatInteractions UNMOUNT Cleanup] Stopped media recorder.");
                    }
                    // Don't call setMediaRecorder here - state updates are irrelevant during unmount
                }
                // No need to call setIsRecording - component is unmounting
            }

            // Ensure AudioContext is closed
            if (audioContextRef.current) {
                if (audioContextRef.current.state !== 'closed') {
                    console.log("[useChatInteractions UNMOUNT Cleanup] Closing AudioContext. State:", audioContextRef.current.state);
                    audioContextRef.current.close().catch(err => console.error("[UNMOUNT Cleanup] Error closing AudioContext:", err));
                } else {
                    console.log("[useChatInteractions UNMOUNT Cleanup] AudioContext was already closed.");
                }
                audioContextRef.current = null; // Clear ref
            }

            // Refs holding nodes are implicitly handled when context closes or stream stops.
            audioSourceNodeRef.current = null;
            analyserRef.current = null;
            dataArrayRef.current = null;

            // Clear refs/state that might persist (though usually unnecessary on unmount)
            audioChunksRef.current = [];

        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // <<< EMPTY DEPENDENCY ARRAY - Runs cleanup only on unmount

    // Return updated hook values
    return {
        messages,
        setMessages,
        input,
        setInput,
        handleInputChange: (e) => {
            // ---> NEW: Clear pending audio state on manual input <---
            if (pendingSubmissionMethod === 'audio') {
                console.log("[handleInputChange] Manual input detected, clearing pending audio submission state.");
                setPendingSubmissionMethod(null);
                setPendingWhisperDetails(null);
                // Keep pendingInitialSubmission as is, user might be editing the initial message
            }
            handleInputChange(e); // Call original handler
        },
        handleSubmit,
        isLoading,
        reload,
        stop: stopAiGeneration, // Return renamed stop function
        model,
        setModel,
        // --- NEW AUDIO PROPS ---
        isRecording,
        isTranscribing,
        micPermissionError,
        startRecording: handleStartRecording,
        stopRecording: handleStopRecording,
        audioTimeDomainData, // <<< NEW: Export the state
        // --- END NEW AUDIO PROPS ---
    };
} 