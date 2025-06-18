import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat, type Message } from 'ai/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useFollowUpStore } from '@/lib/stores/followUpStore';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { AIToolState, AudioState } from '@/app/lib/clientChatOperationState';
import { useClientChatOrchestrator, type PendingFileUpload } from '@/app/hooks/useClientChatOrchestrator';
import type { BlockNoteEditor, Block } from '@blocknote/core';
import { getInlineContentText } from '@/lib/editorUtils';
import { tool } from 'ai';
import { z } from 'zod';
import { transcribeAudio } from '@/lib/audio/AudioTranscriptionService';

// Define the shape of the processed block with structural information
interface ProcessedBlock {
  id: string;
  type: string;
  contentSnippet: string;
  level: number;
  parentId: string | null;
}

// Define the shape of the editor context data expected by the submit handler
interface EditorContextData {
    editorMarkdownContent?: string;
    editorBlocksContext?: ProcessedBlock[];
}

// Define the type for tagged documents
interface TaggedDocument {
    id: string;
    name: string;
}

interface UseChatInteractionsProps {
    documentId: string;
    initialModel: string;
    initialMessages: Message[] | null;
    editorRef: React.RefObject<BlockNoteEditor<any>>;
    uploadedImagePath: string | null;
    uploadedImageSignedUrl: string | null;
    isUploading: boolean;
    clearFileUploadPreview: (options?: { deleteFromStorage?: boolean }) => Promise<void>;
    apiEndpoint?: string;
    initialTaggedDocIdsString?: string | null;
    uploadFileForOrchestrator: (file: File) => Promise<string>;
    fetchDownloadUrlForPath: (filePath: string) => Promise<string>;
}

// Define inline options type based on docs for append/handleSubmit
interface ReloadOptions {
    headers?: Record<string, string> | Headers;
    body?: object;
    data?: any;
}

// Define the return type for the hook
interface UseChatInteractionsReturn {
    messages: Message[];
    setMessages: (messages: Message[]) => void;
    input: string;
    setInput: (input: string) => void;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    sendMessage: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
    // handleSubmit: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
    isLoading: boolean; 
    reload: (options?: ReloadOptions | undefined) => Promise<string | null | undefined>;
    stop: () => void;
    model: string;
    setModel: React.Dispatch<React.SetStateAction<string>>;
    
    // Audio props (delegated to orchestrator)
    isRecording: boolean;
    isTranscribing: boolean;
    micPermissionError: boolean;
    handleMicrophoneClick: () => void;
    handleStopRecording: () => void;
    handleCancelRecording: () => void; // Cancel recording without sending
    audioTimeDomainData: AudioTimeDomainData;
    recordingDuration: number; // Duration in seconds
    
    // Tagged documents props
    taggedDocuments: TaggedDocument[];
    setTaggedDocuments: React.Dispatch<React.SetStateAction<TaggedDocument[]>>;
    
    addToolResult: ({toolCallId, result}: {toolCallId: string; result: any;}) => void;
    
    // Orchestrator exposed items
    handleFileUpload: (file: File) => Promise<string | null>;
    cancelFileUpload: () => void;
    isChatInputBusy: boolean;
    currentOperationStatusText: string | null;
    isFileUploadInProgress: () => boolean;
    pendingFile: PendingFileUpload | null;
    error: any; 
}

// Define Zod schemas for the editor tools (matching backend)
const addContentSchema = z.object({
  markdownContent: z.string().describe("The Markdown content to be added to the editor."),
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert relative to (e.g., insert 'after'). If null, append or use current selection."),
});

const modifyContentSchema = z.object({
  targetBlockId: z.string().describe("The ID of the block to modify."),
  targetText: z.string().nullable().describe("The specific text within the block to modify. If null, the modification applies to the entire block's content."),
  newMarkdownContent: z.string().describe("The new Markdown content for the block."),
});

const deleteContentSchema = z.object({
  targetBlockId: z.string().describe("The ID of the block to remove."),
  targetText: z.string().nullable().describe("The specific text within the targetBlockId block to delete. If null, the entire block is deleted."),
});

const modifyTableSchema = z.object({
    tableBlockId: z.string().describe("The ID of the table block to modify."),
    newTableMarkdown: z.string().describe("The COMPLETE, final Markdown content for the entire table after the requested modifications have been applied by the AI."),
});

const createChecklistSchema = z.object({
  items: z.array(z.string()).describe("An array of plain text strings, where each string is the content for a new checklist item. The tool will handle Markdown formatting (e.g., prepending '* [ ]'). Do NOT include Markdown like '*[ ]' in these strings."),
  targetBlockId: z.string().nullable().describe("Optional: The ID of the block to insert the new checklist after. If null, the checklist is appended to the document or inserted at the current selection."),
});

const searchAndTagDocumentsSchema = z.object({
  searchQuery: z.string().describe("The user's query to search for in the documents.")
});

const replaceAllContentSchema = z.object({
  newMarkdownContent: z.string().describe("The complete new Markdown content to replace the entire document with."),
  requireConfirmation: z.boolean().default(true).describe("Whether to require user confirmation before replacement. Defaults to true for safety."),
});

// Define client-side tools (no execute functions)
const clientTools = {
  addContent: tool({
    description: "Adds new general Markdown content (e.g., paragraphs, headings, simple bullet/numbered lists, or single list/checklist items). For multi-item checklists, use createChecklist.",
    parameters: addContentSchema,
  }),
  modifyContent: tool({
    description: "Modifies content within specific NON-TABLE editor blocks. Can target a single block (with optional specific text replacement) or multiple blocks (replacing entire content of each with corresponding new Markdown from an array). Main tool for altering existing lists/checklists.",
    parameters: modifyContentSchema,
  }),
  deleteContent: tool({
    description: "Deletes one or more NON-TABLE blocks, or specific text within a NON-TABLE block, from the editor.",
    parameters: deleteContentSchema,
  }),
  modifyTable: tool({
    description: "Modifies an existing TABLE block by providing the complete final Markdown. Reads original from context, applies changes, returns result.",
    parameters: modifyTableSchema,
  }),
  createChecklist: tool({
    description: "Creates a new checklist with multiple items. Provide an array of plain text strings for the items (e.g., ['Buy milk', 'Read book']). Tool handles Markdown formatting.",
    parameters: createChecklistSchema,
  }),
  searchAndTagDocumentsTool: tool({
    description: 'Searches documents by title and semantic content. Returns a list of relevant documents that the user can choose to tag for context.',
    parameters: searchAndTagDocumentsSchema,
  }),
  replaceAllContent: tool({
    description: "Replaces the entire document content with new Markdown content. This is a destructive operation that requires user confirmation by default. Can be undone using Ctrl+Z/Cmd+Z or the Undo button in the toast notification.",
    parameters: replaceAllContentSchema,
  }),
};

// Create adapter function to fix addToolResult signature mismatch
const createAddToolResultAdapter = (addToolResultFn: ({toolCallId, result}: {toolCallId: string; result: any;}) => void) => {
  return (toolCallId: string, result: any) => {
    addToolResultFn({ toolCallId, result });
  };
};

// Create mock tool executors for consistency checks (client-side tools are handled elsewhere)
// These are placeholders for the orchestrator's consistency checking system
const createMockToolExecutors = () => {
  const mockExecutor = async (args: any) => {
    console.log('[Mock Tool Executor] Tool execution delegated to editor page:', args);
    return { success: true, status: 'delegated_to_editor_page', args };
  };

  return {
    addContent: mockExecutor,
    modifyContent: mockExecutor,
    deleteContent: mockExecutor,
    modifyTable: mockExecutor,
    createChecklist: mockExecutor,
    searchAndTagDocumentsTool: mockExecutor,
    replaceAllContent: mockExecutor,
  };
};

// Recursive helper function to process blocks and their children
const processBlocksRecursive = async (
    blocks: Block[],
    currentLevel: number,
    currentParentId: string | null,
    editor: BlockNoteEditor<any>
): Promise<ProcessedBlock[]> => {
    let processedBlocks: ProcessedBlock[] = [];

    for (const b of blocks) {
        console.log("[processBlocksRecursive] Processing block:", JSON.stringify(b, null, 2));

        let snippet = '';
        if (b.type === 'table') {
            try {
                snippet = await editor.blocksToMarkdownLossy([b]);
            } catch (mdError) {
                console.error(`Failed to convert table block ${b.id} to Markdown:`, mdError);
                snippet = `[table - Error generating Markdown snippet]`;
            }
        } else if (b.type === 'checkListItem') {
            const isChecked = b.props?.checked === true;
            const prefix = isChecked ? "[x] " : "[ ] ";
            const itemText = Array.isArray(b.content) ? getInlineContentText(b.content) : '';
            snippet = prefix + itemText;
        } else {
            snippet = (Array.isArray(b.content) ? getInlineContentText(b.content) : '') || `[${b.type}]`;
        }

        processedBlocks.push({
            id: b.id,
            type: b.type,
            contentSnippet: snippet,
            level: currentLevel,
            parentId: currentParentId,
        });

        if (b.children && b.children.length > 0) {
            const childBlocks = await processBlocksRecursive(
                b.children,
                currentLevel + 1,
                b.id,
                editor
            );
            processedBlocks = processedBlocks.concat(childBlocks);
        }
    }
    return processedBlocks;
};

// Type for audio visualization data
export type AudioTimeDomainData = Uint8Array | null;

export function useChatInteractions({
    documentId,
    initialModel,
    initialMessages,
    editorRef,
    uploadedImagePath,
    uploadedImageSignedUrl,
    isUploading: isExternalUploading,
    clearFileUploadPreview,
    apiEndpoint = '/api/chat',
    initialTaggedDocIdsString,
    uploadFileForOrchestrator,
    fetchDownloadUrlForPath,
}: UseChatInteractionsProps): UseChatInteractionsReturn {
    
    // Debug: Hook initialization (removed due to infinite loop)
    
    // Internal State
    const [model, setModel] = useState<string>(initialModel);
    const [taggedDocuments, setTaggedDocuments] = useState<TaggedDocument[]>([]);
    const [pendingInitialSubmission, setPendingInitialSubmission] = useState<string | null>(null);
    const initialMsgProcessedRef = useRef(false);

    // Access client chat operation store actions
    const {
        setAIToolState,
        setOperationStates,
        resetChatOperationState,
    } = useClientChatOperationStore();

    // Selector for current AI tool state
    const currentAIToolState = useClientChatOperationStore(state => state.aiToolState);

    // External Hooks
    const router = useRouter();
    const searchParams = useSearchParams();
    const { setFollowUpContext } = useFollowUpStore();
    const followUpContext = useFollowUpStore((state) => state.followUpContext);

    // Effect to load initial tagged documents from URL string
    useEffect(() => {
        if (initialTaggedDocIdsString) {
            const ids = initialTaggedDocIdsString.split(',').filter(id => id.trim() !== '');
            if (ids.length > 0) {
                console.log('[useChatInteractions] Initial tagged document IDs found:', ids);
                const fetchTaggedDocuments = async () => {
                    try {
                        const response = await fetch(`/api/chat-tag-search?docIds=${ids.join(',')}`); 
                        if (!response.ok) {
                            throw new Error(`Failed to fetch initial tagged documents: ${response.statusText}`);
                        }
                        const data = await response.json();
                        if (data.documents && Array.isArray(data.documents)) {
                            setTaggedDocuments(data.documents.map((doc: any) => ({ id: doc.id, name: doc.name })));
                            console.log('[useChatInteractions] Successfully loaded initial tagged documents:', data.documents);
                        } else {
                            console.warn('[useChatInteractions] No documents found for initial IDs or invalid format.');
                        }
                    } catch (error) {
                        console.error('[useChatInteractions] Error fetching initial tagged documents:', error);
                        toast.error("Could not load initially tagged documents.");
                    }
                };
                fetchTaggedDocuments();
            }
        }
    }, [initialTaggedDocIdsString]);

    // Initialize useChat with clean configuration
    const {
        messages,
        setMessages,
        append,
        reload,
        stop: stopAiGeneration,
        isLoading: isUseChatLoading,
        input,
        setInput,
        error: useChatError,
        addToolResult: useChatAddToolResult,
    } = useChat({
        api: apiEndpoint,
        id: documentId,
        initialMessages: initialMessages || undefined,
        body: {
            documentId,
        },
        onFinish: (message) => {
            console.log('[useChat onFinish] Stream finished. Final message:', message);
            // Note: Follow-up context should only be set manually by user selection,
            // not automatically from AI responses
        },
        onError: (error) => {
            console.error('[useChat onError] Full error object:', error);
            console.error('[useChat onError] Error name:', error.name);
            console.error('[useChat onError] Error message:', error.message);
            console.error('[useChat onError] Error stack:', error.stack);
            console.error('[useChat onError] Error cause:', error.cause);
            console.error('[useChat onError] All error properties:', Object.keys(error));
            console.warn(`Chat error: ${error.message}`);
        },
        generateId: () => `editor-chat-${documentId}-${Date.now()}`,
    });

    // Create tool executors for orchestrator - exclude editor tools to prevent conflicts
    const allMockExecutors = createMockToolExecutors();
    const { addContent, modifyContent, deleteContent, modifyTable, createChecklist, ...nonEditorExecutors } = allMockExecutors;
    const toolExecutorMap = nonEditorExecutors;
    
    // Audio recording state and refs for simpler MediaRecorder implementation
    const [audioTimeDomainDataState, setAudioTimeDomainDataState] = useState<AudioTimeDomainData>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    
    // Audio visualization function
    const visualizeAudio = useCallback(() => {
        if (!analyserRef.current || !dataArrayRef.current) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            return;
        }

        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
        setAudioTimeDomainDataState(new Uint8Array(dataArrayRef.current));
        animationFrameRef.current = requestAnimationFrame(visualizeAudio);
    }, []);
    
    // Audio recording functions for orchestrator
    const orchestratorStartRecording = useCallback(async (): Promise<void> => {
        try {
            console.log('[Editor Audio] Starting recording...');
            
            // Reset any existing state
            setAudioTimeDomainDataState(null);
            audioChunksRef.current = [];
            
            // Get user media
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            // Set up audio context for visualization
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 2048;
            audioSourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
            audioSourceNodeRef.current.connect(analyserRef.current);
            dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
            
            // Start visualization
            animationFrameRef.current = requestAnimationFrame(visualizeAudio);
            
            // Set up MediaRecorder
            const options: MediaRecorderOptions = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options.mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                options.mimeType = 'audio/webm';
            }
            
            const recorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = recorder;
            
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };
            
            recorder.start();
            console.log('[Editor Audio] Recording started successfully');
            
        } catch (error) {
            console.error('[Editor Audio] Failed to start recording:', error);
            throw error;
        }
    }, [visualizeAudio]);
    
    const orchestratorStopRecording = useCallback(async (): Promise<Blob | null> => {
        return new Promise((resolve) => {
            console.log('[Editor Audio] Stopping recording...');
            
            // Clean up visualization
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            setAudioTimeDomainDataState(null);
            
            // Clean up audio context
            if (audioSourceNodeRef.current) {
                audioSourceNodeRef.current.disconnect();
                audioSourceNodeRef.current = null;
            }
            if (analyserRef.current) {
                analyserRef.current.disconnect();
                analyserRef.current = null;
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
                audioContextRef.current = null;
            }
            
            // Stop MediaRecorder
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.onstop = () => {
                    console.log('[Editor Audio] Recording stopped, processing data...');
                    
                    // Create blob from recorded chunks
                    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
                    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                    
                    // Clean up
                    mediaRecorderRef.current = null;
                    audioChunksRef.current = [];
                    
                    if (streamRef.current) {
                        streamRef.current.getTracks().forEach(track => track.stop());
                        streamRef.current = null;
                    }
                    
                    console.log('[Editor Audio] Audio blob created:', audioBlob.size, 'bytes');
                    resolve(audioBlob);
                };
                
                mediaRecorderRef.current.stop();
            } else {
                console.warn('[Editor Audio] MediaRecorder not recording or not initialized');
                resolve(null);
            }
        });
    }, []);
    
    const handleTranscribeAudio = useCallback(async (audioBlob: Blob): Promise<string | null> => {
        try {
            console.log('[Editor Audio] Starting transcription of blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
            const result = await transcribeAudio(audioBlob);
            console.log('[Editor Audio] Transcription result:', result);
            if (result && result.trim()) {
                console.log('[Editor Audio] Successfully transcribed:', result.length, 'characters');
                return result;
            } else {
                console.warn('[Editor Audio] Transcription returned empty or null result');
                return null;
            }
        } catch (error) {
            console.error('[Editor Audio] Transcription failed:', error);
            return null;
        }
    }, []);
    
    // Initialize orchestrator with clean interface
    const orchestrator = useClientChatOrchestrator({
        chatMessages: messages,
        addToolResult: createAddToolResultAdapter(useChatAddToolResult),
        isLoading: isUseChatLoading,
        toolExecutors: toolExecutorMap,
        setInputValue: setInput,
        uploadFile: uploadFileForOrchestrator,
        fetchSignedUrl: fetchDownloadUrlForPath,
        startRecording: orchestratorStartRecording,
        stopRecording: orchestratorStopRecording,
        transcribeAudio: handleTranscribeAudio,
    });

    // Extract orchestrator state and handlers
    const {
        isChatInputBusy,
        currentOperationStatusText,
        handleAudioRecordingStart: orchestratorHandleAudioRecordingStart,
        handleAudioRecordingCancel: orchestratorHandleAudioRecordingCancel,
        handleCompleteAudioFlow,
        handleFileUploadStart,
        handleFileUploadComplete,
        isFileUploadInProgress,
        cancelFileUpload,
        pendingFileUpload: orchestratorPendingFile,
        isHistoryConsistentForAPICall,
        operationState,
        recordingDuration, // NEW: Recording timer duration
    } = orchestrator;

    // Derive audio state from orchestrator operation state
    const isRecording = operationState.audioState === AudioState.RECORDING;
    const isTranscribing = operationState.audioState === AudioState.TRANSCRIBING;
    const micPermissionError = false; // TODO: Handle permission errors from orchestrator
    const audioTimeDomainData: AudioTimeDomainData = audioTimeDomainDataState;

    // Editor Context Retrieval
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
                const allProcessedBlocks = await processBlocksRecursive(currentBlocks, 1, null, editor);
                contextData = {
                    editorBlocksContext: allProcessedBlocks
                };
            }
        } catch (e) {
            console.error('Failed to get editor snippets with structure:', e);
            console.warn('⚠️ Error getting structured editor context.');
        }
        return contextData;
    }, [editorRef]);

    // Initial Message Processing
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

    // Auto-Submit Initial Message
    useEffect(() => {
        if (pendingInitialSubmission && input === pendingInitialSubmission && !isUseChatLoading && !isRecording && !isTranscribing && documentId) {
            console.log('[useChatInteractions] Auto-submitting initial message with documentId:', documentId);
            sendMessage(undefined);
            setPendingInitialSubmission(null);
        }
    }, [input, pendingInitialSubmission, isUseChatLoading, isRecording, isTranscribing, documentId]);

    // Effect to handle AI response after a tool result has been submitted
    useEffect(() => {
        if (currentAIToolState === AIToolState.AWAITING_RESULT_IN_STATE && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role === 'assistant' && (
                !('tool_calls' in lastMessage) || 
                !lastMessage.tool_calls || 
                (Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length === 0)
            )) {
                console.log('[useChatInteractions] AI responded after tool result. Finalizing tool state.');
                setAIToolState(AIToolState.PROCESSING_COMPLETE);
                setTimeout(() => {
                    setOperationStates({
                        aiToolState: AIToolState.IDLE,
                        currentToolCallId: undefined,
                        currentOperationDescription: undefined,
                    });
                }, 100);
            }
        }
    }, [messages, currentAIToolState, setAIToolState, setOperationStates]);

    // useEffect to handle onFinish logic that requires orchestrator instance
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
            // Handle any pending file completion
            if (orchestratorPendingFile?.path) {
                console.log('[useEffect messages] Clearing pending file path via orchestrator.');
                handleFileUploadComplete(orchestratorPendingFile.path, false);
            }
        }
    }, [messages, orchestratorPendingFile, handleFileUploadComplete]);

    // Wrapped Stop Handler
    const stop = useCallback(() => {
        console.log('[useChatInteractions] stop called. Current states:', {
            isUseChatLoading,
            isChatInputBusy,
            audioState: operationState.audioState, // from orchestrator
            currentAIToolState,
            currentOperationDescription: operationState.currentOperationDescription
        });
        // debugger; // You can uncomment this to pause execution in browser dev tools and inspect the call stack
        stopAiGeneration();
        resetChatOperationState();
    }, [stopAiGeneration, resetChatOperationState, isUseChatLoading, isChatInputBusy, operationState, currentAIToolState]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    }, [setInput]);

    const sendMessage = useCallback(async (e?: React.FormEvent<HTMLFormElement>) => {
        e?.preventDefault();
    
        if (isChatInputBusy) {
            toast.info("Please wait for the current operation to complete.");
            return;
        }
        
        // Guard against missing documentId (especially during initialization after hard refresh)
        if (!documentId || typeof documentId !== 'string') {
            console.warn('[useChatInteractions] sendMessage blocked: documentId not available yet', { documentId, type: typeof documentId });
            // Use console.warn instead of toast to avoid user annoyance during normal page load
            console.warn('Document not ready yet. Please wait a moment and try again.');
            return;
        }
    
        if (!isHistoryConsistentForAPICall()) {
            toast.error('Cannot send message: Chat history is inconsistent. Please try reloading.');
            return;
        }
    
        const filePath = orchestratorPendingFile?.path;
        let currentInput = input.trim();
    
        if (!currentInput && !filePath) return;
    
        let messageContent = currentInput;
        
        // Include follow-up context if it exists
        if (followUpContext && followUpContext.trim()) {
            messageContent = `Follow-up Context: ${followUpContext.trim()}\n\n---\n\n${currentInput}`;
        }
        
        // === DEBUG: Log values before creating dataForApi ===
        console.log("=== [useChatInteractions] SEND MESSAGE DEBUG START ===");
        console.log("[useChatInteractions] Values for dataForApi:");
        console.log("  - documentId:", documentId);
        console.log("  - documentId type:", typeof documentId);
        console.log("  - model:", model);
        console.log("  - taggedDocuments length:", taggedDocuments.length);
        console.log("  - editorRef.current exists:", !!editorRef.current);
        
        const editorContext = await getEditorContext();
        console.log("  - editorContext:", editorContext);
        
        const dataForApi: any = {
            editorBlocksContext: editorContext.editorBlocksContext,
            documentId: documentId,
            model: model, 
            taggedDocumentIds: taggedDocuments.map(doc => doc.id),
        };
        
        console.log("[useChatInteractions] Final dataForApi:", JSON.stringify(dataForApi, null, 2));
        console.log("=== [useChatInteractions] SEND MESSAGE DEBUG END ===");

        if (filePath) {
            let displayFileName = orchestratorPendingFile?.file?.name || 'Uploaded file';
            let urlForAIMessage = filePath; 
            if (fetchDownloadUrlForPath) {
                try {
                    urlForAIMessage = await fetchDownloadUrlForPath(filePath);
                } catch (err) {
                    console.error("Failed to get signed URL for AI message", err);
                    toast.error("Failed to prepare uploaded file for AI.");
                    return;
                }
            }
            messageContent = `${currentInput}\n![${displayFileName}](${urlForAIMessage})`;
            handleFileUploadComplete(filePath, true);
        }
    
        await append(
            { role: 'user', content: messageContent },
            { data: dataForApi }
        );
    
        setInput('');
        
        // Clear follow-up context after sending the message
        if (followUpContext) {
            setFollowUpContext(null);
        }
    }, [
        input, isChatInputBusy, isHistoryConsistentForAPICall, orchestratorPendingFile, append, setInput,
        handleFileUploadComplete, documentId, model, taggedDocuments, getEditorContext, fetchDownloadUrlForPath,
        followUpContext, setFollowUpContext
    ]);

    // Auto-Submit After Transcription
    const [wasTranscribing, setWasTranscribing] = useState(false);
    const [audioTranscriptionPending, setAudioTranscriptionPending] = useState(false);
    
    useEffect(() => {
        // Track when transcription state changes
        if (isTranscribing) {
            setWasTranscribing(true);
            setAudioTranscriptionPending(true);
            console.log('[Editor Audio] Transcription started, marking as pending...');
        } else if (wasTranscribing && !isTranscribing && audioTranscriptionPending && input.trim() && documentId) {
            // If we just finished transcribing and there's input text AND documentId is available, auto-submit
            console.log('[Editor Audio] Auto-submitting transcribed text:', input.trim(), 'with documentId:', documentId);
            setAudioTranscriptionPending(false);
            setTimeout(() => {
                sendMessage(undefined);
                setWasTranscribing(false);
            }, 100); // Small delay to ensure UI is updated
        } else if (!isTranscribing && wasTranscribing && !input.trim()) {
            // If transcription finished but no input, just reset states
            console.log('[Editor Audio] Transcription finished but no input text, resetting states');
            setWasTranscribing(false);
            setAudioTranscriptionPending(false);
        }
    }, [isTranscribing, wasTranscribing, audioTranscriptionPending, input, sendMessage, documentId]);

    const handleMicrophoneClick = useCallback(() => {
        console.log('[Editor Audio] handleMicrophoneClick called, preparing to start recording...');
        // Reset stale transcription states before starting a new recording via the orchestrator's handler
        setWasTranscribing(false);
        setAudioTranscriptionPending(false);
        orchestratorHandleAudioRecordingStart(); 
    }, [orchestratorHandleAudioRecordingStart]);

    const handleStopRecording = useCallback(() => {
        console.log('[Editor Audio] handleStopRecording called, triggering complete audio flow');
        handleCompleteAudioFlow(); 
    }, [handleCompleteAudioFlow]);

    const handleCancelRecording = useCallback(() => {
        console.log('[Editor Audio] handleCancelRecording called, cancelling recording without transcription');
        // Reset transcription states to prevent auto-submit
        setWasTranscribing(false);
        setAudioTranscriptionPending(false);
        orchestratorHandleAudioRecordingCancel(); 
    }, [orchestratorHandleAudioRecordingCancel]);

    // Create aliases for missing functions expected by components
    const startRecording = handleMicrophoneClick;
    const stopRecording = handleStopRecording;
    const orchestratorHandleFileUploadStart: (file: File) => Promise<string | null> = handleFileUploadStart;
    
    const handleFileUpload = useCallback(async (file: File) => {
        const result = await handleFileUploadStart(file);
        if (!result) {
            toast.error("Failed to upload file");
        }
    }, [handleFileUploadStart]);
    const orchestratorCancelFileUpload = cancelFileUpload;
    const orchestratorIsFileUploadInProgress = isFileUploadInProgress;
    const orchestratorIsChatInputBusy = isChatInputBusy;
    const orchestratorCurrentOperationStatusText = currentOperationStatusText;

    return {
        messages,
        setMessages,
        input,
        setInput,
        handleInputChange,
        sendMessage,
        isLoading: isUseChatLoading || isChatInputBusy, 
        reload,
        stop,
        model,
        setModel,
        isRecording,
        isTranscribing,
        micPermissionError,
        audioTimeDomainData,
        recordingDuration,
        handleMicrophoneClick,
        handleStopRecording,
        handleCancelRecording,
        handleFileUpload: orchestratorHandleFileUploadStart,      
        taggedDocuments,
        setTaggedDocuments,
        addToolResult: useChatAddToolResult,
        cancelFileUpload, 
        isChatInputBusy, 
        currentOperationStatusText, 
        isFileUploadInProgress, 
        pendingFile: orchestratorPendingFile,
        error: useChatError, 
    };
} 