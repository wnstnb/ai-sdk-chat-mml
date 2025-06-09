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

// Types for the orchestrator hook
type ClientChatOrchestratorProps = {
  chatMessages: Message[];
  addToolResult: (toolCallId: string, result: any) => void;
  isLoading?: boolean;
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
  
  // Audio handlers (placeholders for now)
  handleAudioRecordingStart: () => void;
  handleAudioTranscriptionStart: () => void;
  handleAudioTranscriptionComplete: (transcript: string | null, error?: any) => void;
  
  // File upload handlers (placeholders for now)
  handleFileUploadStart: () => void;
  handleFileUploadComplete: (filePath: string | null, error?: any) => void;
  
  // Consistency check
  isHistoryConsistentForAPICall: () => boolean;
  
  // Reset functionality
  resetAllOperations: () => void;
};

export function useClientChatOrchestrator({
  chatMessages,
  addToolResult,
  isLoading = false
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

  // Derived state
  const isChatInputBusy = isAnyOperationInProgress(operationState) || isLoading;
  const currentOperationStatusText = getOperationStatusText(operationState);

  // AI Tool Handlers
  const handleAIToolDetected = useCallback((toolCallId: string, toolName: string) => {
    console.log(`[Orchestrator] AI tool detected: ${toolName} (ID: ${toolCallId})`);
    
    setPendingToolCallIds(prev => new Set([...prev, toolCallId]));
    setOperationStates({
      aiToolState: AIToolState.DETECTED,
      currentToolCallId: toolCallId,
      currentOperationDescription: `AI requests: ${toolName}`
    });
  }, [setOperationStates]);

  const handleAIToolExecutionStart = useCallback((toolCallId: string, description?: string) => {
    console.log(`[Orchestrator] AI tool execution starting: ${toolCallId}`);
    
    setOperationStates({
      aiToolState: AIToolState.EXECUTING,
      currentToolCallId: toolCallId,
      currentOperationDescription: description || `Executing tool: ${toolCallId}`
    });
  }, [setOperationStates]);

  const handleAIToolExecutionComplete = useCallback((toolCallId: string, result: any, error?: any) => {
    console.log(`[Orchestrator] AI tool execution complete: ${toolCallId}`, { result, error });
    
    try {
      // Add the tool result to the chat state
      const resultToAdd = error ? { error: error.message || 'Tool execution failed' } : result;
      addToolResult(toolCallId, resultToAdd);
      
      // Update state to awaiting result integration
      setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
    } catch (addResultError) {
      console.error(`[Orchestrator] Error adding tool result for ${toolCallId}:`, addResultError);
      resetChatOperationState();
    }
  }, [addToolResult, setAIToolState, resetChatOperationState]);

  // Audio handlers
  const handleAudioRecordingStart = useCallback(() => {
    console.log('[Orchestrator] Audio recording started');
    setAudioState(AudioState.RECORDING);
  }, [setAudioState]);

  const handleAudioTranscriptionStart = useCallback(() => {
    console.log('[Orchestrator] Audio transcription started');
    setAudioState(AudioState.TRANSCRIBING);
  }, [setAudioState]);

  const handleAudioTranscriptionComplete = useCallback((transcript: string | null, error?: any) => {
    console.log('[Orchestrator] Audio transcription complete', { transcript, error });
    
    if (error) {
      console.error('[Orchestrator] Audio transcription error:', error);
      resetChatOperationState();
    } else if (transcript && transcript.trim()) {
      setAudioState(AudioState.TRANSCRIPT_READY_FOR_INPUT);
      
      // Brief delay to allow UI to show the state, then complete
      setTimeout(() => {
        setAudioState(AudioState.PROCESSING_COMPLETE);
        
        // Another brief delay to show completion, then reset to idle
        setTimeout(() => {
          setAudioState(AudioState.IDLE);
        }, 100);
      }, 200);
    } else {
      // Empty transcript, reset to idle
      setAudioState(AudioState.IDLE);
    }
  }, [setAudioState, resetChatOperationState]);

  // File upload handlers
  const handleFileUploadStart = useCallback(() => {
    console.log('[Orchestrator] File upload started');
    setFileUploadState(FileUploadState.UPLOADING_FOR_CHAT);
  }, [setFileUploadState]);

  const handleFileUploadComplete = useCallback((filePath: string | null, error?: any) => {
    console.log('[Orchestrator] File upload complete', { filePath, error });
    
    if (error) {
      console.error('[Orchestrator] File upload error:', error);
      resetChatOperationState();
    } else if (filePath) {
      setFileUploadState(FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE);
      
      // Brief delay to allow UI to show the state, then complete
      setTimeout(() => {
        setFileUploadState(FileUploadState.PROCESSING_COMPLETE);
        
        // Another brief delay to show completion, then reset to idle
        setTimeout(() => {
          setFileUploadState(FileUploadState.IDLE);
        }, 100);
      }, 200);
    } else {
      // No file path, reset to idle
      setFileUploadState(FileUploadState.IDLE);
    }
  }, [setFileUploadState, resetChatOperationState]);

  // History consistency check
  const isHistoryConsistentForAPICall = useCallback(() => {
    const toolInvocations = new Set<string>();
    const toolResults = new Set<string>();
    
    for (const message of chatMessages) {
      // Check for tool invocations in assistant messages
      if (message.role === 'assistant' && 'toolInvocations' in message && message.toolInvocations) {
        message.toolInvocations.forEach((invocation: any) => {
          if (invocation.toolCallId) {
            toolInvocations.add(invocation.toolCallId);
          }
        });
      }
      
      // Check for tool results (using any to handle extended message types)
      const msgAny = message as any;
      if (msgAny.role === 'tool' && msgAny.tool_call_id) {
        toolResults.add(msgAny.tool_call_id as string);
      }
    }
    
    // Check if all tool invocations have corresponding results
    for (const id of toolInvocations) {
      if (!toolResults.has(id) && !processedToolCallIdsRef.current.has(id)) {
        console.warn(`[Orchestrator] Missing tool result for invocation: ${id}`);
        return false;
      }
    }
    
    return true;
  }, [chatMessages]);

  // Reset all operations
  const resetAllOperations = useCallback(() => {
    console.log('[Orchestrator] Resetting all operations');
    resetChatOperationState();
    setPendingToolCallIds(new Set());
    // Note: We don't reset processedToolCallIds as they should persist across resets
  }, [resetChatOperationState]);

  // Effect to monitor chat messages for tool results and update processed IDs
  useEffect(() => {
    if (operationState.aiToolState === AIToolState.AWAITING_RESULT_IN_STATE && operationState.currentToolCallId) {
      const toolCallId = operationState.currentToolCallId;
      
      // Check if the tool result has been added to chat messages
      const hasToolResult = chatMessages.some(msg => {
        const msgAny = msg as any;
        return msgAny.role === 'tool' && msgAny.tool_call_id === toolCallId;
      });
      
      if (hasToolResult) {
        console.log(`[Orchestrator] Tool result found in messages for ${toolCallId}`);
        
        // Update processed tool call IDs
        setProcessedToolCallIds(prev => new Set([...prev, toolCallId]));
        setPendingToolCallIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(toolCallId);
          return newSet;
        });
        
        // Reset AI tool state if this was the last pending tool call
        const newPendingSize = pendingToolCallIds.size - 1;
        if (newPendingSize <= 0) {
          setOperationStates({
            aiToolState: AIToolState.PROCESSING_COMPLETE,
            currentToolCallId: undefined,
            currentOperationDescription: undefined,
          });
          
          // Brief delay to allow UI to show "complete" state, then reset to idle
          setTimeout(() => {
            setOperationStates({
              aiToolState: AIToolState.IDLE,
              currentToolCallId: undefined,
              currentOperationDescription: undefined,
            });
          }, 100);
        } else {
          // Still have pending tool calls, just clear this one
          setOperationStates({
            currentToolCallId: undefined,
            currentOperationDescription: undefined,
          });
        }
      }
    }
  }, [
    chatMessages, 
    operationState.aiToolState, 
    operationState.currentToolCallId, 
    pendingToolCallIds.size,
    setOperationStates
  ]);

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
    
    // Audio handlers
    handleAudioRecordingStart,
    handleAudioTranscriptionStart,
    handleAudioTranscriptionComplete,
    
    // File upload handlers
    handleFileUploadStart,
    handleFileUploadComplete,
    
    // Consistency check
    isHistoryConsistentForAPICall,
    
    // Reset functionality
    resetAllOperations,
  };
} 