import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from 'ai';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { 
  ClientChatOperationState, 
  AIToolState, 
  AudioState, 
  FileUploadState,
  isAnyOperationInProgress, 
  getOperationStatusText 
} from '@/app/lib/clientChatOperationState';

// Types for tool execution
type ToolExecutor = (args: any) => Promise<any>;

type ToolExecutorMap = {
  [toolName: string]: ToolExecutor;
};

// --- NEW: Resource management types ---
type ManagedResource = {
  id: string;
  type: 'blob' | 'url' | 'worker' | 'stream' | 'file';
  resource: any;
  createdAt: number;
  size?: number; // Optional size in bytes for memory tracking
  cleanup?: () => void; // Cleanup function for this resource
};

type MemoryUsageStats = {
  totalAllocated: number; // Total memory allocated in bytes
  activeResources: number; // Number of active resources
  largeFileThreshold: number; // Threshold for large file warning (bytes)
  isMemoryPressure: boolean; // Whether we're approaching memory limits
};
// --- END NEW ---

// Types for the orchestrator hook
type ClientChatOrchestratorProps = {
  chatMessages: Message[];
  addToolResult: (toolCallId: string, result: any) => void;
  isLoading?: boolean;
  toolExecutors?: ToolExecutorMap;
  // Props for audio operations
  setInputValue: (value: string) => void; // To set the transcript in the chat input
  startRecording?: () => Promise<void>;    // Function to start actual recording
  stopRecording?: () => Promise<Blob | null>;     // Function to stop actual recording and get blob
  transcribeAudio?: (audioBlob: Blob) => Promise<string | null>; // Function to transcribe audio blob
  // Props for file upload operations
  uploadFile?: (file: File) => Promise<string>;
  fetchSignedUrl?: (filePath: string) => Promise<string>; // Optional: For fetching download URL
};

export type PendingFileUpload = {
  file: File;
  path?: string;
  signedUrl?: string | null; // Added for download URL
  error?: Error;
  // --- NEW: Resource management fields ---
  uploadStartTime?: number; // Timestamp for upload timeout management
  memoryUsage?: number; // Memory usage in bytes
  resourceId?: string; // Unique ID for resource tracking
  cleanup?: () => void; // Cleanup function for this specific upload
  // --- END NEW ---
};

type ClientChatOrchestratorResult = {
  // Derived state
  isChatInputBusy: boolean;
  currentOperationStatusText: string | null;
  operationState: ClientChatOperationState;
  
  // Tool call tracking
  pendingToolCallIds: Set<string>;
  processedToolCallIds: Set<string>;
  
  // AI Tool handlers
  handleAIToolDetected: (toolCallId: string, toolName: string) => void;
  handleAIToolExecutionStart: (toolCallId: string, description?: string) => void;
  handleAIToolExecutionComplete: (toolCallId: string, result: any, error?: any) => void;
  
  // Tool execution functions
  executeToolByName: (toolName: string, toolCallId: string, args: any) => Promise<any>;
  processToolInvocations: (message: Message) => void;
  
  // Audio handlers
  handleAudioRecordingStart: () => Promise<void>;
  handleAudioRecordingStop: () => Promise<Blob | null>;
  handleAudioRecordingCancel: () => Promise<void>; // Cancel recording without transcription
  handleAudioTranscriptionStart: () => Promise<string | null>;
  handleAudioTranscriptionComplete: (transcript: string | null, error?: any) => void;
  handleCompleteAudioFlow: () => Promise<void>;
  
  // --- NEW: Recording timer ---
  recordingDuration: number; // Duration in seconds
  // --- END NEW ---
  
  // File upload handlers
  handleFileUploadStart: (file: File) => Promise<string | null>;
  handleFileUploadComplete: (filePath: string | null, error?: any) => string | null;
  getPendingFile: () => PendingFileUpload | null;
  isFileUploadInProgress: () => boolean;
  cancelFileUpload: () => void;
  pendingFileUpload: PendingFileUpload | null;
  
  // --- NEW: Resource management methods ---
  getMemoryUsage: () => MemoryUsageStats;
  forceResourceCleanup: () => void;
  // --- END NEW ---
  
  // Consistency checks
  isHistoryConsistentForAPICall: () => boolean;
  getHistoryInconsistencyDetails: () => {
    isConsistent: boolean;
    missingResults: Array<{ id: string, name: string }>;
    pendingToolCalls: Array<{ id: string, name: string }>;
  };
  attemptToFixInconsistencies: () => Promise<boolean>;
  
  // Reset functionality
  resetAllOperations: () => void;
};

export function useClientChatOrchestrator({
  chatMessages,
  addToolResult,
  isLoading = false,
  toolExecutors = {},
  // Destructure new audio props
  setInputValue,
  startRecording,
  stopRecording,
  transcribeAudio,
  // Destructure new file upload props
  uploadFile,
  fetchSignedUrl,
}: ClientChatOrchestratorProps): ClientChatOrchestratorResult {
  
  // Get the operation store state and actions
  const operationState = useClientChatOperationStore();
  const {
    setAIToolState,
    setAudioState,
    setFileUploadState,
    setCurrentToolCallId,
    setCurrentOperationDescription,
    resetChatOperationState,
    setOperationStates,
  } = useClientChatOperationStore();

  // Local state for tracking tool calls
  const [pendingToolCallIds, setPendingToolCallIds] = useState<Set<string>>(new Set());
  const [processedToolCallIds, setProcessedToolCallIds] = useState<Set<string>>(new Set());
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null); // State for the recorded audio blob
  const [pendingFileUpload, setPendingFileUpload] = useState<PendingFileUpload | null>(null);
  
  // --- NEW: Recording timer state ---
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // --- END NEW ---
  
  // --- NEW: Resource management state ---
  const [managedResources, setManagedResources] = useState<Map<string, ManagedResource>>(new Map());
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB threshold
  const MEMORY_PRESSURE_THRESHOLD = 200 * 1024 * 1024; // 200MB threshold
  // --- END NEW ---
  
  // Refs to avoid stale closures
  const pendingToolCallIdsRef = useRef(pendingToolCallIds);
  const processedToolCallIdsRef = useRef(processedToolCallIds);
  
  // Update refs when state changes
  useEffect(() => {
    pendingToolCallIdsRef.current = pendingToolCallIds;
  }, [pendingToolCallIds]);
  
  useEffect(() => {
    processedToolCallIdsRef.current = processedToolCallIds;
  }, [processedToolCallIds]);

  // --- NEW: Timer management effect ---
  useEffect(() => {
    if (operationState.audioState === AudioState.RECORDING && recordingStartTime) {
      // Start timer
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);
      
      console.log('[Orchestrator] Recording timer started');
    } else {
      // Clear timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
        console.log('[Orchestrator] Recording timer cleared');
      }
      
      // Reset duration if not recording
      if (operationState.audioState !== AudioState.RECORDING) {
        setRecordingDuration(0);
        setRecordingStartTime(null);
      }
    }

    // Cleanup on unmount
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [operationState.audioState, recordingStartTime]);
  // --- END NEW ---

  // Derived state
  const isChatInputBusy = isAnyOperationInProgress(operationState) || isLoading;
  const currentOperationStatusText = getOperationStatusText(operationState);

  // --- NEW: Resource Management Core Functions ---
  const generateResourceId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

  const addManagedResource = useCallback((resourceData: Omit<ManagedResource, 'id' | 'createdAt'>) => {
    const id = generateResourceId();
    const newResource: ManagedResource = {
      ...resourceData,
      id,
      createdAt: Date.now(),
    };
    setManagedResources(prev => new Map(prev).set(id, newResource));
    console.log(`[Orchestrator] Resource added: ${id} (Type: ${newResource.type}, Size: ${newResource.size || 'N/A'})`);
    return id;
  }, []);

  const cleanupResourceById = useCallback((id: string | undefined) => {
    if (!id) return;
    setManagedResources(prev => {
      const newMap = new Map(prev);
      const resourceToCleanup = newMap.get(id);
      if (resourceToCleanup) {
        try {
          resourceToCleanup.cleanup?.();
          console.log(`[Orchestrator] Resource cleaned up: ${id} (Type: ${resourceToCleanup.type})`);
        } catch (error) {
          console.error(`[Orchestrator] Error cleaning up resource ${id}:`, error);
        }
        newMap.delete(id);
      }
      return newMap;
    });
  }, []);
  
  const getMemoryUsage = useCallback((): MemoryUsageStats => {
    let totalAllocated = 0;
    managedResources.forEach(resource => {
      totalAllocated += resource.size || 0;
    });
    const activeResources = managedResources.size;
    const isMemoryPressure = totalAllocated > MEMORY_PRESSURE_THRESHOLD;

    if (isMemoryPressure) {
      console.warn(`[Orchestrator] Memory pressure detected. Total allocated: ${totalAllocated / (1024*1024)}MB`);
    }
    if (totalAllocated > LARGE_FILE_THRESHOLD && activeResources > 0) {
        // Potentially log or warn if a single resource or total allocation is very large
        // For now, just providing the stats
    }

    return {
      totalAllocated,
      activeResources,
      largeFileThreshold: LARGE_FILE_THRESHOLD,
      isMemoryPressure,
    };
  }, [managedResources]);

  const forceResourceCleanup = useCallback(() => {
    console.log('[Orchestrator] Forcing cleanup of all managed resources.');
    managedResources.forEach(resource => {
      try {
        resource.cleanup?.();
        console.log(`[Orchestrator] Force cleaned up resource: ${resource.id} (Type: ${resource.type})`);
      } catch (error) {
        console.error(`[Orchestrator] Error during force cleanup of resource ${resource.id}:`, error);
      }
    });
    setManagedResources(new Map());
  }, [managedResources]);
  // --- END NEW: Resource Management Core Functions ---

  // AI Tool Handlers with enhanced state validation and logging
  const handleAIToolDetected = useCallback((toolCallId: string, toolName: string) => {
    console.log(`[Orchestrator] AI tool detected: ${toolName} (ID: ${toolCallId})`);
    console.log(`[Orchestrator] State transition: ${operationState.aiToolState} → DETECTED`);
    
    // Validate state transition
    if (operationState.aiToolState !== AIToolState.IDLE) {
      console.warn(`[Orchestrator] Unexpected state transition from ${operationState.aiToolState} to DETECTED`);
    }
    
    setPendingToolCallIds(prev => {
      const newSet = new Set([...prev, toolCallId]);
      console.log(`[Orchestrator] Pending tool calls updated:`, Array.from(newSet));
      return newSet;
    });
    
    setOperationStates({
      aiToolState: AIToolState.DETECTED,
      currentToolCallId: toolCallId,
      currentOperationDescription: `AI requests: ${toolName}`
    });
  }, [setOperationStates, operationState.aiToolState]);

  const handleAIToolExecutionStart = useCallback((toolCallId: string, description?: string) => {
    console.log(`[Orchestrator] AI tool execution starting: ${toolCallId}`);
    console.log(`[Orchestrator] State transition: ${operationState.aiToolState} → EXECUTING`);
    
    // Validate state transition
    if (operationState.aiToolState !== AIToolState.DETECTED) {
      console.warn(`[Orchestrator] Unexpected state transition from ${operationState.aiToolState} to EXECUTING`);
    }
    
    setOperationStates({
      aiToolState: AIToolState.EXECUTING,
      currentToolCallId: toolCallId,
      currentOperationDescription: description || `Executing tool: ${toolCallId}`
    });
  }, [setOperationStates, operationState.aiToolState]);

  const handleAIToolExecutionComplete = useCallback((toolCallId: string, result: any, error?: any) => {
    console.log(`[Orchestrator] AI tool execution complete: ${toolCallId}`, { result, error });
    console.log(`[Orchestrator] State transition: ${operationState.aiToolState} → AWAITING_RESULT_IN_STATE`);
    
    // Validate state transition
    if (operationState.aiToolState !== AIToolState.EXECUTING) {
      console.warn(`[Orchestrator] Unexpected state transition from ${operationState.aiToolState} to AWAITING_RESULT_IN_STATE`);
    }
    
    try {
      // Add the tool result to the chat state
      const resultToAdd = error ? { error: error.message || 'Tool execution failed' } : result;
      console.log(`[Orchestrator] Adding tool result to chat state:`, { toolCallId, resultToAdd });
      addToolResult(toolCallId, resultToAdd);
      
      // Update state to awaiting result integration
      setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
    } catch (addResultError) {
      console.error(`[Orchestrator] Error adding tool result for ${toolCallId}:`, addResultError);
      console.log(`[Orchestrator] State transition: ${operationState.aiToolState} → IDLE (error recovery)`);
      resetChatOperationState();
    }
  }, [addToolResult, setAIToolState, resetChatOperationState, operationState.aiToolState]);

  // Audio handlers - New detailed implementation
  const handleAudioRecordingStart = useCallback(async () => {
    if (!startRecording) {
      console.warn("[Orchestrator] startRecording function not provided.");
      return;
    }
    
    console.log('[Orchestrator] Audio recording start requested');
    try {
      // --- NEW: Set recording start time ---
      const startTime = Date.now();
      setRecordingStartTime(startTime);
      // --- END NEW ---
      
      setOperationStates({
        audioState: AudioState.RECORDING,
        currentOperationDescription: 'Recording audio...'
      });
      await startRecording();
      console.log('[Orchestrator] Audio recording actually started');
    } catch (error) {
      console.error('[Orchestrator] Failed to start recording:', error);
      // --- NEW: Reset timer on error ---
      setRecordingStartTime(null);
      setRecordingDuration(0);
      // --- END NEW ---
      setOperationStates({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
      // Optionally, notify the user via toast or other UI element
    }
  }, [startRecording, setOperationStates]);

  const handleAudioRecordingStop = useCallback(async (): Promise<Blob | null> => {
    if (!stopRecording) {
      console.warn("[Orchestrator] stopRecording function not provided.");
      return null;
    }
    
    console.log('[Orchestrator] Audio recording stop requested');
    try {
      // No state change here yet, actual stop might take a moment.
      // The state will change to TRANSCRIBING once the blob is received.
      const blob = await stopRecording();
      if (blob) {
        setAudioBlob(blob);
        setOperationStates({
          audioState: AudioState.TRANSCRIBING, // Transition after blob is ready
          currentOperationDescription: 'Processing audio...'
        });
        console.log('[Orchestrator] Audio recording actually stopped, blob received, transcribing state set.');
        return blob;
      } else {
        console.warn('[Orchestrator] stopRecording returned null blob.');
        setOperationStates({ // Reset if no blob
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined
        });
        return null;
      }
    } catch (error) {
      console.error('[Orchestrator] Failed to stop recording:', error);
      setOperationStates({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
      return null;
    }
  }, [stopRecording, setOperationStates, setAudioBlob]);

  const handleAudioTranscriptionStart = useCallback(async (): Promise<string | null> => {
    if (!transcribeAudio) {
      console.warn("[Orchestrator] transcribeAudio function not provided.");
      return null;
    }
    if (!audioBlob) {
      console.warn('[Orchestrator] No audio blob available for transcription.');
      setOperationStates({ // Reset if somehow called without blob
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
      return null;
    }
    
    console.log('[Orchestrator] Audio transcription start requested');
    try {
      setOperationStates({ // Ensure state is TRANSCRIBING if not already
        audioState: AudioState.TRANSCRIBING,
        currentOperationDescription: 'Transcribing audio...'
      });
      const transcript = await transcribeAudio(audioBlob);
      if (transcript) {
        setOperationStates({
          audioState: AudioState.TRANSCRIPT_READY_FOR_INPUT,
          currentOperationDescription: 'Transcript ready'
        });
        console.log('[Orchestrator] Audio transcription successful, transcript ready.');
        return transcript;
      } else {
        console.warn('[Orchestrator] Transcription returned null or empty.');
         setOperationStates({ // Reset if no transcript
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined
        });
        return null;
      }
    } catch (error) {
      console.error('[Orchestrator] Failed to transcribe audio:', error);
      setOperationStates({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
      return null;
    }
  }, [transcribeAudio, audioBlob, setOperationStates]);
  
  const handleAudioTranscriptionComplete = useCallback((transcript: string | null, error?: any) => {
    console.log('[Orchestrator] Audio transcription complete handler called', { 
      transcript: transcript?.substring(0, 100) + (transcript && transcript.length > 100 ? '...' : ''), 
      transcriptLength: transcript?.length,
      hasError: !!error,
      error 
    });
    if (error) {
      console.error('[Orchestrator] Audio transcription process resulted in error:', error);
      setOperationStates({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
      setAudioBlob(null); // Clear the blob
    } else if (transcript && transcript.trim()) {
      console.log('[Orchestrator] Setting input value to transcribed text:', transcript.trim());
      setInputValue(transcript.trim());
      setOperationStates({
        audioState: AudioState.PROCESSING_COMPLETE,
        currentOperationDescription: 'Transcript processed'
      });
      setAudioBlob(null); // Clear the blob
      
      // Short delay to show completion, then reset to idle
      setTimeout(() => {
        setOperationStates({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined
        });
        console.log('[Orchestrator] Audio flow complete, reset to IDLE.');
      }, 500);
    } else {
      console.warn('[Orchestrator] Transcription complete but transcript is empty or null.');
      setOperationStates({ // If transcript is empty, just reset
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
      setAudioBlob(null); // Clear the blob
    }
  }, [setInputValue, setOperationStates, setAudioBlob]);

  const handleCompleteAudioFlow = useCallback(async () => {
    console.log('[Orchestrator] Starting complete audio flow...');
    const blob = await handleAudioRecordingStop();
    if (blob) {
      // Directly transcribe with the blob, bypassing state dependency
      if (!transcribeAudio) {
        console.warn("[Orchestrator] transcribeAudio function not provided.");
        handleAudioTranscriptionComplete(null, new Error("Transcribe function not available."));
        return;
      }
      
      console.log('[Orchestrator] Audio transcription start requested in complete flow');
      try {
        setOperationStates({
          audioState: AudioState.TRANSCRIBING,
          currentOperationDescription: 'Transcribing audio...'
        });
        const transcript = await transcribeAudio(blob);
        if (transcript) {
          setOperationStates({
            audioState: AudioState.TRANSCRIPT_READY_FOR_INPUT,
            currentOperationDescription: 'Transcript ready'
          });
          console.log('[Orchestrator] Audio transcription successful in complete flow, transcript ready.');
          handleAudioTranscriptionComplete(transcript);
        } else {
          console.warn('[Orchestrator] Transcription returned null or empty in complete flow.');
          handleAudioTranscriptionComplete(null, new Error("Transcription did not produce a result."));
        }
      } catch (error) {
        console.error('[Orchestrator] Failed to transcribe audio in complete flow:', error);
        handleAudioTranscriptionComplete(null, error);
      }
    } else {
      // If stopping recording failed or produced no blob, reset state.
      console.warn('[Orchestrator] Complete audio flow aborted: stopRecording did not produce a blob.');
      setOperationStates({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
    }
  }, [handleAudioRecordingStop, transcribeAudio, handleAudioTranscriptionComplete, setOperationStates]);

  // Cancel recording without transcription
  const handleAudioRecordingCancel = useCallback(async (): Promise<void> => {
    console.log('[Orchestrator] Audio recording cancel requested');
    try {
      if (stopRecording && operationState.audioState === AudioState.RECORDING) {
        // Stop recording but don't save the blob or transcribe
        await stopRecording();
        console.log('[Orchestrator] Recording stopped for cancellation');
      }
      // Reset to idle state without processing audio
      setOperationStates({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
      setAudioBlob(null); // Clear any audio blob
      console.log('[Orchestrator] Audio recording cancelled, state reset to IDLE');
    } catch (error) {
      console.error('[Orchestrator] Failed to cancel recording:', error);
      // Still reset state even if cancellation had errors
      setOperationStates({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined
      });
      setAudioBlob(null);
    }
  }, [stopRecording, operationState.audioState, setOperationStates, setAudioBlob]);

  // File upload handlers - Enhanced with resource management
  const handleFileUploadStart = useCallback(async (file: File): Promise<string | null> => {
    if (!uploadFile) {
      console.warn("[Orchestrator] uploadFile function not provided.");
      setFileUploadState(FileUploadState.IDLE); // Reset if no uploadFile func
      return null;
    }
    
    console.log(`[Orchestrator] File upload start requested for: ${file.name}`);
    let resourceId: string | undefined = undefined;

    try {
      // --- NEW: Resource Management ---
      resourceId = addManagedResource({
        type: 'file',
        resource: file, // Store the file object itself, or a relevant part
        size: file.size,
        cleanup: () => {
          // Specific cleanup for the file resource, e.g., revoking an ObjectURL if created for preview
          // For now, primarily for tracking. If an ObjectURL was created for this file:
          // if (fileObjectURL) URL.revokeObjectURL(fileObjectURL);
          console.log(`[Orchestrator] File resource ${file.name} (ID: ${resourceId}) marked for cleanup.`);
        }
      });
      
      setPendingFileUpload({ 
        file, 
        resourceId, // Store resourceId
        uploadStartTime: Date.now(),
        memoryUsage: file.size, // Track memory usage
      });
      // --- END NEW ---
      
      setOperationStates({
        fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
        currentOperationDescription: `Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`
      });
      
      const filePath = await uploadFile(file);
      let signedDownloadUrl: string | null = null;

      if (filePath && fetchSignedUrl) {
        try {
            console.log(`[Orchestrator] Fetching signed URL for ${filePath}`);
            signedDownloadUrl = await fetchSignedUrl(filePath);
            console.log(`[Orchestrator] Fetched signed URL: ${signedDownloadUrl}`);
            
            // --- NEW: Register signed URL as a managed resource ---
            if (signedDownloadUrl) {
              addManagedResource({
                type: 'url',
                resource: signedDownloadUrl,
                size: signedDownloadUrl.length,
                cleanup: () => {
                  console.log(`[Orchestrator] Signed URL resource ${signedDownloadUrl} (ID: ${resourceId}) marked for cleanup.`);
                }
              });
            }
            // --- END NEW ---
        } catch (urlError) {
            console.error('[Orchestrator] Failed to fetch signed URL after upload:', urlError);
            setPendingFileUpload(prev => prev ? { 
              ...prev, 
              path: filePath, 
              signedUrl: null, 
              error: urlError instanceof Error ? urlError : new Error('Failed to fetch signed URL') 
            } : null);
        }
      } else if (filePath && !fetchSignedUrl) {
        console.warn(`[Orchestrator] File uploaded to ${filePath}, but no fetchSignedUrl function provided to get download URL.`);
      }
      
      setPendingFileUpload(prev => prev ? { 
        ...prev, 
        path: filePath, 
        signedUrl: signedDownloadUrl, 
        error: undefined 
      } : { 
        file, 
        path: filePath, 
        signedUrl: signedDownloadUrl, 
        error: undefined,
        uploadStartTime: Date.now(),
        memoryUsage: file.size,
        resourceId,
        cleanup: () => {
          console.log(`[Orchestrator] Cleaning up upload resources for ${file.name}`);
          // Clean up any temporary URLs or resources created during upload
          // (This is called when upload completes, fails, or is cancelled)
        }
      });
      
      setOperationStates({
        fileUploadState: FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE,
        currentOperationDescription: 'Preparing file for message'
      });
      
      return filePath; // Still return filePath, caller can get full pendingFile if needed
    } catch (error) {
      console.error('[Orchestrator] Failed to upload file:', error);
      
      // --- NEW: Enhanced error handling with resource cleanup ---
      setPendingFileUpload(prev => {
        if (prev?.cleanup) {
          try {
            prev.cleanup();
          } catch (cleanupError) {
            console.error('[Orchestrator] Error during upload error cleanup:', cleanupError);
          }
        }
        return prev ? { ...prev, error: error as Error } : null;
      });
      // --- END NEW ---
      
      setOperationStates({
        fileUploadState: FileUploadState.IDLE,
        currentOperationDescription: undefined
      });
      
      // --- NEW: Cleanup on error ---
      if (resourceId) {
        cleanupResourceById(resourceId);
      }
      // --- END NEW ---
      
      return null;
    }
  }, [uploadFile, fetchSignedUrl, setOperationStates, setPendingFileUpload, addManagedResource, cleanupResourceById]);
  
  const handleFileUploadComplete = useCallback((filePath: string | null, error?: any): string | null => {
    console.log('[Orchestrator] File upload complete reported.', { filePath, error });
    
    // --- NEW: Resource Management ---
    if (pendingFileUpload?.resourceId) {
      cleanupResourceById(pendingFileUpload.resourceId);
    }
    // --- END NEW ---

    setPendingFileUpload(null); // Clear pending file info

    if (error) {
      console.error('[Orchestrator] File upload error:', error);
      setOperationStates({
        fileUploadState: FileUploadState.IDLE,
        currentOperationDescription: undefined
      });
      return null;
    }

    setOperationStates({
      fileUploadState: FileUploadState.PROCESSING_COMPLETE,
      currentOperationDescription: undefined
    });
    
    // After a short delay, reset to IDLE
    setTimeout(() => {
      setOperationStates({
        fileUploadState: FileUploadState.IDLE,
      });
    }, 500);
    
    return filePath;
  }, [setOperationStates]);

  const getPendingFile = useCallback(() => {
    return pendingFileUpload || null;
  }, [pendingFileUpload]);

  const isFileUploadInProgress = useCallback(() => {
    return operationState.fileUploadState === FileUploadState.UPLOADING_FOR_CHAT;
  }, [operationState.fileUploadState]);

  const cancelFileUpload = useCallback(() => {
    console.log('[Orchestrator] File upload cancellation requested.');

    // --- NEW: Resource Management ---
    if (pendingFileUpload?.resourceId) {
      cleanupResourceById(pendingFileUpload.resourceId);
    }
     // --- END NEW ---

    setPendingFileUpload(null); // Clear pending file info
    setOperationStates({
      fileUploadState: FileUploadState.IDLE,
      currentOperationDescription: undefined
    });
  }, [setOperationStates, setPendingFileUpload]);

  // Reset all operations
  const resetAllOperations = useCallback(() => {
    console.log('[Orchestrator] Resetting all operations and states.');
    
    // Clear any pending tool calls
    setPendingToolCallIds(new Set());
    setProcessedToolCallIds(new Set());
    
    // Clear audio blob if any
    setAudioBlob(null);
    
    // Clear pending file upload and associated resources
    if (pendingFileUpload?.resourceId) {
      cleanupResourceById(pendingFileUpload.resourceId);
    }
    setPendingFileUpload(null);
    
    // Reset the Zustand store to its initial state
    resetChatOperationState(); // This resets AI, Audio, FileUpload states and descriptions

    // --- NEW: Force cleanup all managed resources ---
    forceResourceCleanup();
    // --- END NEW ---

    console.log('[Orchestrator] All states reset to idle.');
  }, [resetChatOperationState, pendingFileUpload, cleanupResourceById, forceResourceCleanup]);

  // Helper function to create a timeout wrapper for tool execution
  const withTimeout = useCallback(<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool '${toolName}' execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      promise
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }, []);

  // Tool execution functions
  const executeToolByName = useCallback(async (toolName: string, toolCallId: string, args: any) => {
    const executor = toolExecutors[toolName];
    
    if (!executor) {
      console.error(`[Orchestrator] No executor found for tool: ${toolName}`);
      const errorResult = { 
        success: false, 
        error: `Tool '${toolName}' not found`,
        context: { toolCallId, availableTools: Object.keys(toolExecutors) }
      };
      handleAIToolExecutionComplete(toolCallId, errorResult, new Error(`Tool '${toolName}' not found`));
      return errorResult;
    }
    
    // Validate arguments
    if (args === undefined || args === null) {
      console.warn(`[Orchestrator] Tool ${toolName} called with null/undefined arguments, using empty object`);
      args = {};
    }
    
    try {
      console.log(`[Orchestrator] Executing tool ${toolName} with args:`, args);
      handleAIToolExecutionStart(toolCallId, `Executing ${toolName}`);
      
      // Add timeout protection (30 seconds default)
      const timeoutMs = 30000;
      const rawResult = await withTimeout(executor(args), timeoutMs, toolName);
      
      // Structure the result for proper chat integration
      let structuredResult;
      if (rawResult === null || rawResult === undefined) {
        structuredResult = { success: true, result: null };
      } else if (typeof rawResult === 'object' && rawResult.error) {
        // Tool returned an error object
        structuredResult = { 
          success: false, 
          error: rawResult.error,
          context: { toolName, toolCallId }
        };
      } else {
        // Normal successful result
        structuredResult = { success: true, result: rawResult };
      }
      
      console.log(`[Orchestrator] Tool ${toolName} execution completed:`, structuredResult);
      handleAIToolExecutionComplete(toolCallId, structuredResult);
      return structuredResult;
    } catch (error) {
      console.error(`[Orchestrator] Error executing tool ${toolName}:`, error);
      
      // Enhanced error context
      const isTimeoutError = error instanceof Error && error.message.includes('timed out');
      let errorMessage = `Tool '${toolName}' execution failed`;
      
      // For timeout errors, preserve the original timeout message
      if (isTimeoutError && error instanceof Error) {
        errorMessage = error.message;
      }
      
      const errorResult = { 
        success: false, 
        error: errorMessage,
        context: { 
          toolName, 
          toolCallId, 
          isTimeout: isTimeoutError,
          timestamp: new Date().toISOString()
        }
      };
      
      // Attempt state recovery for critical errors
      if (isTimeoutError) {
        console.warn(`[Orchestrator] Tool ${toolName} timed out, attempting state recovery`);
        // Reset the tool state to prevent getting stuck
        setTimeout(() => {
          if (operationState.aiToolState !== AIToolState.IDLE) {
            console.log(`[Orchestrator] Recovering from timeout, resetting tool state`);
            resetChatOperationState();
          }
        }, 1000);
      }
      
      handleAIToolExecutionComplete(toolCallId, errorResult, error);
      return errorResult;
    }
  }, [toolExecutors, handleAIToolExecutionStart, handleAIToolExecutionComplete, withTimeout, operationState.aiToolState, resetChatOperationState]);
  
  const processToolInvocations = useCallback((message: Message) => {
    try {
      if (message.role !== 'assistant' || !message.toolInvocations) return;
      
      console.log(`[Orchestrator] Processing tool invocations from message:`, message.toolInvocations);
      
      // Validate message structure
      if (!Array.isArray(message.toolInvocations)) {
        console.error(`[Orchestrator] Invalid toolInvocations structure, expected array:`, message.toolInvocations);
        return;
      }
      
      // Process each tool invocation with error boundary
      message.toolInvocations.forEach((invocation: any, index: number) => {
        try {
          const toolCallId = invocation.toolCallId;
          const toolName = invocation.toolName;
          const args = invocation.args;
          
          if (!toolCallId || !toolName) {
            console.warn(`[Orchestrator] Invalid tool invocation missing ID or name at index ${index}:`, invocation);
            return;
          }
          
          // Skip if we've already processed this tool call
          if (processedToolCallIds.has(toolCallId) || pendingToolCallIds.has(toolCallId)) {
            console.log(`[Orchestrator] Skipping already processed tool call: ${toolCallId}`);
            return;
          }
          
          // Check if this is a client-side tool
          if (toolExecutors[toolName]) {
            console.log(`[Orchestrator] Found client-side tool executor for: ${toolName}`);
            
            // Mark this tool call as detected
            handleAIToolDetected(toolCallId, toolName);
            
            // Execute the tool (this has its own error handling)
            executeToolByName(toolName, toolCallId, args);
          } else {
            console.log(`[Orchestrator] No client-side executor found for tool: ${toolName} (server-side tool)`);
          }
        } catch (invocationError) {
          console.error(`[Orchestrator] Error processing tool invocation at index ${index}:`, invocationError);
          // Continue processing other invocations even if one fails
        }
      });
    } catch (error) {
      console.error(`[Orchestrator] Critical error in processToolInvocations:`, error);
      // Attempt graceful recovery
      try {
        console.log(`[Orchestrator] Attempting graceful recovery from processToolInvocations error`);
        resetChatOperationState();
      } catch (recoveryError) {
        console.error(`[Orchestrator] Failed to recover from processToolInvocations error:`, recoveryError);
      }
    }
  }, [processedToolCallIds, pendingToolCallIds, toolExecutors, handleAIToolDetected, executeToolByName, resetChatOperationState]);

  // Effect to automatically process tool invocations when chat messages change
  useEffect(() => {
    try {
      // Only process if we're not already handling a tool
      if (operationState.aiToolState === AIToolState.IDLE) {
        // Get the last assistant message
        const lastAssistantMessage = [...chatMessages]
          .reverse()
          .find(msg => msg.role === 'assistant');
        
        if (lastAssistantMessage) {
          processToolInvocations(lastAssistantMessage);
        }
      }
    } catch (error) {
      console.error(`[Orchestrator] Error in auto tool invocation effect:`, error);
      // Attempt recovery by resetting state
      try {
        resetChatOperationState();
      } catch (recoveryError) {
        console.error(`[Orchestrator] Failed to recover from auto tool invocation error:`, recoveryError);
      }
    }
  }, [chatMessages, operationState.aiToolState, processToolInvocations, resetChatOperationState]);

  // Effect to monitor chat messages for tool results and update processed IDs
  useEffect(() => {
    try {
      if (operationState.aiToolState === AIToolState.AWAITING_RESULT_IN_STATE && operationState.currentToolCallId) {
        const toolCallId = operationState.currentToolCallId;
        
        // Check if the tool result has been added to chat messages
        const hasToolResult = chatMessages.some(msg => {
          try {
            const msgAny = msg as any;
            return msgAny.role === 'tool' && msgAny.tool_call_id === toolCallId;
          } catch (msgError) {
            console.warn(`[Orchestrator] Error checking message for tool result:`, msgError);
            return false;
          }
        });
        
        if (hasToolResult) {
          console.log(`[Orchestrator] Tool result found in messages for ${toolCallId}`);
          
          // Update processed tool call IDs
          setProcessedToolCallIds(prev => {
            const newSet = new Set([...prev, toolCallId]);
            console.log(`[Orchestrator] Processed tool calls updated:`, Array.from(newSet));
            return newSet;
          });
          setPendingToolCallIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(toolCallId);
            console.log(`[Orchestrator] Pending tool calls updated:`, Array.from(newSet));
            return newSet;
          });
          
          // Reset AI tool state if this was the last pending tool call
          const newPendingSize = pendingToolCallIds.size - 1;
          if (newPendingSize <= 0) {
            console.log(`[Orchestrator] State transition: AWAITING_RESULT_IN_STATE → PROCESSING_COMPLETE`);
            setOperationStates({
              aiToolState: AIToolState.PROCESSING_COMPLETE,
              currentToolCallId: undefined,
              currentOperationDescription: undefined,
            });
            
            // Brief delay to allow UI to show "complete" state, then reset to idle
            setTimeout(() => {
              console.log(`[Orchestrator] State transition: PROCESSING_COMPLETE → IDLE (delayed)`);
              setOperationStates({
                aiToolState: AIToolState.IDLE,
                currentToolCallId: undefined,
                currentOperationDescription: undefined,
              });
            }, 100);
          } else {
            console.log(`[Orchestrator] Still ${newPendingSize} pending tool calls, clearing current tool info`);
            // Still have pending tool calls, just clear this one
            setOperationStates({
              currentToolCallId: undefined,
              currentOperationDescription: undefined,
            });
          }
        }
      }
    } catch (error) {
      console.error(`[Orchestrator] Error in tool result monitoring effect:`, error);
      // Attempt recovery
      try {
        console.log(`[Orchestrator] Attempting recovery from tool result monitoring error`);
        resetChatOperationState();
      } catch (recoveryError) {
        console.error(`[Orchestrator] Failed to recover from tool result monitoring error:`, recoveryError);
      }
    }
  }, [
    chatMessages, 
    operationState.aiToolState, 
    operationState.currentToolCallId, 
    pendingToolCallIds.size,
    setOperationStates,
    resetChatOperationState
  ]);

  // Enhanced history consistency check
  const isHistoryConsistentForAPICall = useCallback(() => {
    // Check for AI tool consistency
    const toolInvocations = new Map<string, { name: string, args: any }>();
    const toolResults = new Set<string>();
    
    // Collect all tool invocations and results
    for (const message of chatMessages) {
      if (message.role === 'assistant' && 'toolInvocations' in message && message.toolInvocations) {
        message.toolInvocations.forEach((invocation: any) => {
          // Only track client-side tools
          if (toolExecutors[invocation.toolName]) {
            toolInvocations.set(invocation.toolCallId, { name: invocation.toolName, args: invocation.args });
          }
        });
      }
      // Check for tool results (using any to handle extended message types)
      const msgAny = message as any;
      if (msgAny.role === 'tool' && msgAny.tool_call_id) {
        toolResults.add(msgAny.tool_call_id as string);
      }
    }
    
    // Check if all tool invocations have corresponding results or are pending
    let isConsistent = true;
    const missingResults: string[] = [];
    
    toolInvocations.forEach((invocation, id) => {
      if (!toolResults.has(id) && !pendingToolCallIdsRef.current.has(id)) {
        isConsistent = false;
        missingResults.push(`${invocation.name} (${id})`);
      }
    });
    
    if (!isConsistent) {
      console.warn('Chat history is inconsistent. Missing tool results for:', missingResults);
    }
    
    return isConsistent;
  }, [chatMessages, toolExecutors]);

  // Function to get details about inconsistencies
  const getHistoryInconsistencyDetails = useCallback(() => {
    const toolInvocations = new Map<string, { name: string, args: any }>();
    const toolResults = new Set<string>();
    
    // Collect all tool invocations and results
    for (const message of chatMessages) {
      if (message.role === 'assistant' && 'toolInvocations' in message && message.toolInvocations) {
        message.toolInvocations.forEach((invocation: any) => {
          // Only track client-side tools
          if (toolExecutors[invocation.toolName]) {
            toolInvocations.set(invocation.toolCallId, { name: invocation.toolName, args: invocation.args });
          }
        });
      }
      // Check for tool results (using any to handle extended message types)
      const msgAny = message as any;
      if (msgAny.role === 'tool' && msgAny.tool_call_id) {
        toolResults.add(msgAny.tool_call_id as string);
      }
    }
    
    // Find missing results (tool calls without results and not pending)
    const missingResults: Array<{ id: string, name: string }> = [];
    const pendingToolCalls: Array<{ id: string, name: string }> = [];
    
    toolInvocations.forEach((invocation, id) => {
      if (!toolResults.has(id)) {
        if (pendingToolCallIdsRef.current.has(id)) {
          pendingToolCalls.push({ id, name: invocation.name });
        } else {
          missingResults.push({ id, name: invocation.name });
        }
      }
    });
    
    return {
      isConsistent: missingResults.length === 0,
      missingResults,
      pendingToolCalls,
    };
  }, [chatMessages, toolExecutors]);
  
  // Function to attempt to fix inconsistencies by executing pending tools
  const attemptToFixInconsistencies = useCallback(async () => {
    const { missingResults, isConsistent } = getHistoryInconsistencyDetails();
    
    if (isConsistent) return true;
    
    // Try to find and execute the missing tool calls
    const fixPromises = missingResults.map(async ({ id }) => {
      // Find the original invocation
      for (const message of chatMessages) {
        if (message.role === 'assistant' && 'toolInvocations' in message && message.toolInvocations) {
          const invocation = message.toolInvocations.find((inv: any) => inv.toolCallId === id);
          if (invocation && toolExecutors[invocation.toolName]) {
            try {
              const result = await executeToolByName(invocation.toolName, id, invocation.args);
              return result.success;
            } catch (error) {
              console.error(`[Orchestrator] Failed to execute tool ${invocation.toolName} for fixing inconsistency:`, error);
              return false;
            }
          }
        }
      }
      return false;
    });
    
    const results = await Promise.all(fixPromises);
    
    // Return true if all attempts succeeded
    return results.every(success => success);
  }, [chatMessages, getHistoryInconsistencyDetails, toolExecutors, executeToolByName]);

  // Enhanced cleanup of old resources (automatic garbage collection)
  useEffect(() => {
    const RESOURCE_MAX_AGE = 10 * 60 * 1000; // 10 minutes
    const cleanup = () => {
      const now = Date.now();
      const resourcesToCleanup: string[] = [];
      
      managedResources.forEach((resource, id) => {
        if (now - resource.createdAt > RESOURCE_MAX_AGE) {
          resourcesToCleanup.push(id);
        }
      });
      
      if (resourcesToCleanup.length > 0) {
        console.log(`[Orchestrator] Auto-cleaning ${resourcesToCleanup.length} old resources`);
        resourcesToCleanup.forEach(id => {
          const resource = managedResources.get(id);
          resource?.cleanup?.();
        });
      }
    };
    
    const interval = setInterval(cleanup, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [managedResources]);

  return {
    // Derived state
    isChatInputBusy,
    currentOperationStatusText,
    operationState,
    
    // Tool call tracking
    pendingToolCallIds,
    processedToolCallIds,
    
    // AI Tool handlers
    handleAIToolDetected,
    handleAIToolExecutionStart,
    handleAIToolExecutionComplete,
    
    // Tool execution functions
    executeToolByName,
    processToolInvocations,
    
    // Audio handlers
    handleAudioRecordingStart,
    handleAudioRecordingStop,
    handleAudioRecordingCancel,
    handleAudioTranscriptionStart,
    handleAudioTranscriptionComplete,
    handleCompleteAudioFlow,
    
    // --- NEW: Recording timer ---
    recordingDuration,
    // --- END NEW ---
    
    // File upload handlers
    handleFileUploadStart,
    handleFileUploadComplete,
    getPendingFile,
    isFileUploadInProgress,
    cancelFileUpload,
    pendingFileUpload,
    
    // --- NEW: Resource management methods ---
    getMemoryUsage,
    forceResourceCleanup,
    // --- END NEW ---
    
    // Consistency checks
    isHistoryConsistentForAPICall,
    getHistoryInconsistencyDetails,
    attemptToFixInconsistencies,
    
    // Reset functionality
    resetAllOperations,
  };
} 