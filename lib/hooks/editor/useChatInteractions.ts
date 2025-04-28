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
    // --- END NEW AUDIO PROPS ---
}

export function useChatInteractions({
    documentId,
    initialModel,
    editorRef,
    uploadedImagePath,
    uploadedImageSignedUrl,
    isUploading,
    clearFileUploadPreview,
    apiEndpoint = '/api/chat',
}: UseChatInteractionsProps): UseChatInteractionsReturn {
    
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
        stop: stopAiGeneration, // Renamed to avoid conflict
        setMessages,
        setInput,
    } = useChat({
        api: apiEndpoint,
        id: documentId,
        initialMessages: [],
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

    // --- Editor Context Retrieval ---
    const getEditorContext = useCallback(async (): Promise<EditorContextData> => {
        const editor = editorRef.current;
        if (!editor) return {};
        let contextData: EditorContextData = {};
        try {
            const currentBlocks = editor.document;
            if (currentBlocks?.length > 0) {
                contextData = {
                    editorBlocksContext: currentBlocks.map(b => ({
                        id: b.id,
                        contentSnippet: (Array.isArray(b.content) ? getInlineContentText(b.content).slice(0, 100) : '') || `[${b.type}]`
                    }))
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

        const editorContextData = await getEditorContext();
        const isSummarizationTask = finalInput ? (/ (summar(y|ize|ies)|bullet|points?|outline|sources?|citations?) /i.test(finalInput) && finalInput.length > 25) : false;

        try {
            // --- REMOVED: Manual user message saving via /api/documents/.../messages ---
            // The backend /api/chat route now handles saving the user message
            // when inputMethod === 'audio' is detected in the requestData passed below.

            // --- REMOVED: Manual Whisper tool call logging ---
            // The backend /api/chat route now handles this logging.

            // Prepare attachments for optimistic UI update (only if NOT audio input)
            const attachmentsForOptimisticUI = signedUrlToSend ? [
                {
                    contentType: 'image/*',
                    name: imagePathForDb?.split('/').pop() || 'uploaded_image',
                    url: signedUrlToSend
                }
            ] : undefined;

            // Prepare data payload for the /api/chat call via originalHandleSubmit
            const submitDataPayload = {
                model: currentModel,
                documentId,
                ...editorContextData,
                firstImageSignedUrl: signedUrlToSend,
                taskHint: isSummarizationTask ? 'summarize_and_cite_outline' : undefined,
                // ---> NEW: Conditionally add audio metadata <--- 
                ...(isAudioSubmission && {
                    inputMethod: 'audio',
                    whisperDetails: audioWhisperDetails,
                })
            };

            // ---> RE-ADD: Construct the user message object for useChat <---
            const userMessageForAi: Message = {
                id: `temp-user-${Date.now()}`,
                role: 'user',
                content: finalInput?.trim() || '', // Use finalInput (text or transcription)
                createdAt: new Date(),
            };

            // --- Call original useChat submit ---
            // ---> NEW: Wrap in try...catch <---
            try {
                console.log('[handleSubmit] Preparing to call original useChat submit. Current isLoading state:', isLoading);
                if (isLoading) {
                    console.warn('[handleSubmit] Aborting call to originalHandleSubmit because isLoading is true!');
                    toast.error("Chat is still processing the previous request.");
                    return; // Explicitly prevent call if loading
                }
                console.log('[handleSubmit] Calling original useChat submit with message and payload:', { userMessageForAi, submitDataPayload });
                
                // ---> NEW: Conditionally construct options object <---
                const submitOptions: { data: any; experimental_attachments?: any } = {
                    data: submitDataPayload as any,
                };
                if (attachmentsForOptimisticUI) {
                    submitOptions.experimental_attachments = attachmentsForOptimisticUI;
                }
                // --- End Conditional Options --- 
                
                // ---> REVERT: Pass the message object as first arg <---
                originalHandleSubmit(userMessageForAi as any, submitOptions);
                
                // ---> Moved state clearing inside try block <---
                setInput(''); // Clear text input after submission
                clearFileUploadPreview(); // Clear file preview
                setFollowUpContext(null); // Clear follow-up context
                console.log('[handleSubmit] originalHandleSubmit called successfully (request potentially sent).');

            } catch (submitHookError: any) {
                 console.error("[handleSubmit] Error occurred *during* call to originalHandleSubmit:", submitHookError);
                 toast.error(`Failed to initiate chat request: ${submitHookError.message || 'Unknown internal error'}`);
            }
            // --- End Call original useChat submit ---

        } catch (submitError: any) {
             // Catch potential errors during getEditorContext (less likely now)
             console.error("[useChatInteractions handleSubmit] Error during submission process (likely pre-submit):", submitError);
             toast.error(`Failed to send message: ${submitError.message}`);
        }
    }, [
        documentId, followUpContext, input, model, uploadedImagePath, uploadedImageSignedUrl,
        isLoading, isUploading, getEditorContext, originalHandleSubmit, clearFileUploadPreview,
        setFollowUpContext, setInput,
        // ---> NEW: Add pending state dependencies <--- 
        pendingInitialSubmission, pendingSubmissionMethod, pendingWhisperDetails
    ]); // Removed messages, setMessages from deps

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
    }, [audioChunksRef, mediaRecorder, setInput, handleSubmit, setIsTranscribing, setIsRecording, setMediaRecorder]); // Added dependencies

    // --- Stop Recording Logic (IMPLEMENTED - Moved Before Start) ---
    // Defined before handleStartRecording to resolve dependency order
    const handleStopRecording = useCallback((timedOut = false) => {
        console.log(`handleStopRecording called. Timed out: ${timedOut}, Current recorder state: ${mediaRecorder?.state}`);
        
        // Clear the timeout regardless of recorder state
        if (recordingTimerId) {
            clearTimeout(recordingTimerId);
            setRecordingTimerId(null);
            console.log("Cleared recording timer.");
        }

        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.log("Stopping MediaRecorder...");
            mediaRecorder.stop(); // This triggers the onstop handler defined in startRecording
            setIsRecording(false); // Set recording state immediately 
            if (timedOut) {
                toast.info("Recording stopped automatically after 30 seconds.");
            }
        } else {
             console.log("MediaRecorder not active or already stopped, ensuring isRecording is false.");
            setIsRecording(false);
            if (mediaRecorder?.stream) {
                console.log("Cleaning up tracks for non-recording recorder.");
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
            setMediaRecorder(null);
        }
    // Dependencies: recorder instance and timer ID state/setter - remove setIsRecording/setRecordingTimerId if causing issues, rely on closure
    }, [mediaRecorder, recordingTimerId]); 

    // --- Start Recording Logic (NEW) ---
    const handleStartRecording = useCallback(async () => {
        console.log("Attempting to start recording...");
        setMicPermissionError(false); // Reset error state

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

            // Select MIME type
            const options: MediaRecorderOptions = {};
            const preferredType = 'audio/webm';
            if (MediaRecorder.isTypeSupported(preferredType)) {
                options.mimeType = preferredType;
                console.log(`Using preferred MIME type: ${preferredType}`);
            } else {
                console.log(`Preferred MIME type ${preferredType} not supported, using browser default.`);
            }

            const recorder = new MediaRecorder(stream, options);
            audioChunksRef.current = []; // Clear previous chunks using ref

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    console.log(`Audio chunk received, size: ${event.data.size}, total chunks: ${audioChunksRef.current.length}`);
                }
            };

            recorder.onstop = handleProcessRecordedAudio;
            
            recorder.onerror = (event) => {
                console.error("MediaRecorder error:", event);
                toast.error(`Recording error: ${ (event as any)?.error?.name || 'Unknown error' }`);
                setIsRecording(false);
                setMediaRecorder(null);
                stream.getTracks().forEach(track => track.stop());
                 if (recordingTimerId) clearTimeout(recordingTimerId);
                setRecordingTimerId(null);
            };

            setMediaRecorder(recorder);
            recorder.start();
            setIsRecording(true);
            console.log("Recording started. State:", recorder.state);

            // Start 30-second timer
            const timerId = setTimeout(() => {
                console.log("Recording timer (30s) finished.");
                handleStopRecording(true); // Pass true for timedOut 
            }, 30000); // 30 seconds
            setRecordingTimerId(timerId);
            console.log(`Recording timer set with ID: ${timerId}`);

        } catch (err: any) {
            console.error("Error getting user media or starting recorder:", err);
            let errorMsg = "Could not start recording.";
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorMsg = "Microphone permission denied.";
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorMsg = "No microphone found.";
            } else {
                errorMsg = `Mic Error: ${err.name || 'Unknown'}`;
            }
            toast.error(errorMsg);
            setMicPermissionError(true);
            setIsRecording(false);
            // Clear any pending submission if mic access fails
            setPendingInitialSubmission(null);
            setPendingSubmissionMethod(null);
            setPendingWhisperDetails(null);
        }
    // Added handleStopRecording dependency
    }, [handleProcessRecordedAudio, recordingTimerId, handleStopRecording]); 

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
        startRecording: handleStartRecording, // Export the actual function
        stopRecording: handleStopRecording,   // Export the implemented function
        // --- END NEW AUDIO PROPS ---
    };
} 