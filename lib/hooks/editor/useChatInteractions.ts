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

        // Merge incoming data (like audio details) with standard data
        const requestData = options?.data || {}; 

        const contextPrefix = followUpContext ? `${followUpContext}\n\n---\n\n` : '';
        // If input came from audio, use that content directly, otherwise use the text input state
        const finalInput = requestData.inputMethod === 'audio' ? requestData.transcription : (contextPrefix + input);
        const signedUrlToSend = requestData.inputMethod === 'audio' ? null : uploadedImageSignedUrl; // Don't send image if input is audio
        const imagePathForDb = requestData.inputMethod === 'audio' ? null : uploadedImagePath;
        const currentModel = model;

        if (isLoading || isUploading || (!finalInput?.trim() && !signedUrlToSend)) {
             console.log('[useChatInteractions handleSubmit] Submission prevented:', { isLoading, isUploading, finalInput, signedUrlToSend });
            return;
        }

        const editorContextData = await getEditorContext();
        // Check finalInput for summarization hint, not necessarily the text input state
        const isSummarizationTask = finalInput ? (/(summar(y|ize|ies)|bullet|points?|outline|sources?|citations?)/i.test(finalInput) && finalInput.length > 25) : false;

        try {
            // --- Save user message to DB ---
            console.log(`[useChatInteractions handleSubmit] Saving user message to DB. Input Method: ${requestData.inputMethod || 'text'}, Image path: ${imagePathForDb}`);
            const saveMessageResponse = await fetch(`/api/documents/${documentId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send finalInput (which could be transcription), image path, and input method metadata
                body: JSON.stringify({ 
                    role: 'user', 
                    content: finalInput?.trim() || null, 
                    imageUrlPath: imagePathForDb,
                    metadata: { input_method: requestData.inputMethod || 'text' } // Save input method
                }), 
            });
            if (!saveMessageResponse.ok) {
                const errorData = await saveMessageResponse.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `Failed to save message (${saveMessageResponse.status})`);
            }
            const savedMessageData = await saveMessageResponse.json();
            const savedUserMessageId = savedMessageData?.message?.id; // Assuming response structure
            console.log('[useChatInteractions handleSubmit] User message saved. ID:', savedUserMessageId);
            // --- End Save user message ---

            // --- Prepare Tool Call Logging (if audio) --- 
            if (requestData.inputMethod === 'audio' && savedUserMessageId && requestData.whisperDetails) {
                console.log('[handleSubmit] Logging Whisper tool call...');
                fetch('/api/chat/log-tool-call', { // Assuming a dedicated endpoint for simplicity
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message_id: savedUserMessageId,
                        tool_name: 'whisper_transcription',
                        tool_input: { duration_ms: requestData.whisperDetails.duration_ms },
                        tool_output: { status: 'success', cost: requestData.whisperDetails.cost_estimate }
                    })
                }).catch(err => console.error("Failed to log Whisper tool call:", err)); 
                // Don't block submission on logging failure
            }
            // --- End Tool Call Logging ---

            // Prepare attachments for optimistic UI update (only if NOT audio input)
            const attachmentsForOptimisticUI = signedUrlToSend ? [
                {
                    contentType: 'image/*',
                    name: imagePathForDb?.split('/').pop() || 'uploaded_image',
                    url: signedUrlToSend
                }
            ] : undefined;

            const submitOptions = {
                // Pass merged data, ensuring editor context is included
                data: { 
                    model: currentModel, 
                    documentId, 
                    ...editorContextData, 
                    firstImageSignedUrl: signedUrlToSend, 
                    taskHint: isSummarizationTask ? 'summarize_and_cite_outline' : undefined,
                    // Pass audio-related data for backend processing (if needed beyond logging)
                    // inputMethod: requestData.inputMethod, 
                    // whisperDetails: requestData.whisperDetails,
                },
                options: { experimental_attachments: attachmentsForOptimisticUI }
            };

            // --- Call original useChat submit --- 
            console.log('[handleSubmit] Calling original useChat submit with options:', submitOptions);
            // Use the raw 'finalInput' for the message content sent to the AI service
            // Ensure the message object structure matches what useChat expects
            const userMessageForAi: Message = { 
                id: savedUserMessageId || `temp-user-${Date.now()}`, // Use saved ID or a temporary one
                role: 'user', 
                content: finalInput?.trim() || '', // The actual content (text or transcription)
                createdAt: new Date(),
                // We handle attachments via submitOptions.options.experimental_attachments
            };
            // Pass the constructed message object as the first argument to originalHandleSubmit
            // This allows useChat to handle the optimistic UI update correctly.
            originalHandleSubmit(userMessageForAi as any, { 
                 ...submitOptions, 
                 data: submitOptions.data as any // Pass data payload
             }); 
            setInput(''); // Clear text input after submission
            clearFileUploadPreview(); // Clear file preview
            setFollowUpContext(null); // Clear follow-up context
            // --- End Call original useChat submit ---

        } catch (saveError: any) {
             console.error("[useChatInteractions handleSubmit] Error saving user message or submitting:", saveError);
             toast.error(`Failed to send message: ${saveError.message}`);
        }
    }, [documentId, followUpContext, input, model, uploadedImagePath, uploadedImageSignedUrl, isLoading, isUploading, getEditorContext, originalHandleSubmit, clearFileUploadPreview, setFollowUpContext, setInput, messages, setMessages]); // Added dependencies

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
            console.log(`Creating Blob with explicitly set mimeType: ${mimeType || 'not available'}`);
            audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

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
            // Use a specific filename, Whisper API needs it. Defaulting to 'audio.webm' if type is unknown
            const fileName = `audio.${mimeType?.split('/')[1]?.split(';')[0] || 'webm'}`;
            formData.append('audioFile', audioBlob, fileName);
            console.log(`Appending blob to FormData with filename: ${fileName}`);

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
                    setInput(transcribedText); // Set the text input field
                    
                    // Trigger chat submission with transcription and whisper details
                    console.log("Triggering handleSubmit with transcribed text and details...");
                    // Note: We pass undefined for the event object
                    await handleSubmit(undefined, { 
                        data: { 
                            inputMethod: 'audio', 
                            transcription: transcribedText, // Pass the text for saving
                            whisperDetails: result.whisperDetails || {} // Pass details for logging
                        } 
                    });
                    console.log("handleSubmit triggered for audio input.");
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

    // --- Start Recording Logic (NEW) ---
    const handleStartRecording = useCallback(async () => {
        console.log("Attempting to start recording...");
        setMicPermissionError(false); // Reset error state

        if (!navigator.mediaDevices?.getUserMedia) {
            toast.error("Audio recording is not supported by this browser.");
            console.error("getUserMedia not supported");
            setMicPermissionError(true); // Set error state
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
                // Ensure recording state is reset even if onstop doesn't fire reliably on error
                setIsRecording(false);
                setMediaRecorder(null);
                stream.getTracks().forEach(track => track.stop()); // Clean up stream tracks
                 if (recordingTimerId) clearTimeout(recordingTimerId); // Clear timer
                setRecordingTimerId(null);
            };

            setMediaRecorder(recorder); // Store recorder instance
            recorder.start();
            setIsRecording(true);
            console.log("Recording started. State:", recorder.state);

            // Start 30-second timer
            const timerId = setTimeout(() => {
                console.log("Recording timer (30s) finished.");
                // Need to call handleStopRecording to ensure cleanup and state change
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
            setIsRecording(false); // Ensure recording state is false on error
        }
    }, [handleProcessRecordedAudio, recordingTimerId]); // Added handleProcessRecordedAudio, recordingTimerId dependencies

    // --- Stop Recording Logic (IMPLEMENTED) ---
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
                                 // onstop handles stream track cleanup and setMediaRecorder(null)
            setIsRecording(false); // Set recording state immediately 
            if (timedOut) {
                toast.info("Recording stopped automatically after 30 seconds.");
            }
        } else {
             console.log("MediaRecorder not active or already stopped, ensuring isRecording is false.");
            // If recorder wasn't active or already stopped, ensure state is correct
            setIsRecording(false);
             // If the recorder exists but isn't recording (e.g., inactive), clean up its stream tracks just in case
            if (mediaRecorder?.stream) {
                console.log("Cleaning up tracks for non-recording recorder.");
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
            setMediaRecorder(null); // Also ensure recorder state is cleared if stop was called without active recorder
        }
    }, [mediaRecorder, recordingTimerId, setIsRecording, setRecordingTimerId]); // Dependencies: recorder instance and timer ID state/setter

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
        handleInputChange,
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