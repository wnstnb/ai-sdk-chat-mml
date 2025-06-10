import { renderHook, act } from '@testing-library/react';
import { useClientChatOperationStore } from '../useClientChatOperationStore';
import {
  AIToolState,
  AudioState,
  FileUploadState,
  initialClientChatOperationState,
} from '@/app/lib/clientChatOperationState';

describe('useClientChatOperationStore', () => {
  // Clear store state between tests
  beforeEach(() => {
    const { result } = renderHook(() => useClientChatOperationStore());
    act(() => {
      result.current.resetChatOperationState();
    });
  });

  describe('State Initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useClientChatOperationStore());
      
      expect(result.current.aiToolState).toBe(AIToolState.IDLE);
      expect(result.current.audioState).toBe(AudioState.IDLE);
      expect(result.current.fileUploadState).toBe(FileUploadState.IDLE);
      expect(result.current.currentToolCallId).toBeUndefined();
      expect(result.current.currentOperationDescription).toBeUndefined();
    });

    it('should match initialClientChatOperationState structure', () => {
      const { result } = renderHook(() => useClientChatOperationStore());
      
      const stateSubset = {
        aiToolState: result.current.aiToolState,
        audioState: result.current.audioState,
        fileUploadState: result.current.fileUploadState,
        currentToolCallId: result.current.currentToolCallId,
        currentOperationDescription: result.current.currentOperationDescription,
      };
      
      expect(stateSubset).toEqual(initialClientChatOperationState);
    });
  });

  describe('Individual State Setters', () => {
    describe('setAIToolState', () => {
      it('should update AI tool state correctly', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setAIToolState(AIToolState.DETECTED);
        });
        expect(result.current.aiToolState).toBe(AIToolState.DETECTED);
        
        act(() => {
          result.current.setAIToolState(AIToolState.EXECUTING);
        });
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
        
        act(() => {
          result.current.setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
        });
        expect(result.current.aiToolState).toBe(AIToolState.AWAITING_RESULT_IN_STATE);
        
        act(() => {
          result.current.setAIToolState(AIToolState.PROCESSING_COMPLETE);
        });
        expect(result.current.aiToolState).toBe(AIToolState.PROCESSING_COMPLETE);
      });

      it('should not affect other states when updating AI tool state', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setAudioState(AudioState.RECORDING);
          result.current.setFileUploadState(FileUploadState.UPLOADING_FOR_CHAT);
          result.current.setAIToolState(AIToolState.EXECUTING);
        });
        
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
        expect(result.current.audioState).toBe(AudioState.RECORDING);
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
      });
    });

    describe('setAudioState', () => {
      it('should update audio state correctly', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setAudioState(AudioState.RECORDING);
        });
        expect(result.current.audioState).toBe(AudioState.RECORDING);
        
        act(() => {
          result.current.setAudioState(AudioState.TRANSCRIBING);
        });
        expect(result.current.audioState).toBe(AudioState.TRANSCRIBING);
        
        act(() => {
          result.current.setAudioState(AudioState.TRANSCRIPT_READY_FOR_INPUT);
        });
        expect(result.current.audioState).toBe(AudioState.TRANSCRIPT_READY_FOR_INPUT);
        
        act(() => {
          result.current.setAudioState(AudioState.PROCESSING_COMPLETE);
        });
        expect(result.current.audioState).toBe(AudioState.PROCESSING_COMPLETE);
      });

      it('should not affect other states when updating audio state', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setAIToolState(AIToolState.EXECUTING);
          result.current.setFileUploadState(FileUploadState.UPLOADING_FOR_CHAT);
          result.current.setAudioState(AudioState.TRANSCRIBING);
        });
        
        expect(result.current.audioState).toBe(AudioState.TRANSCRIBING);
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
      });
    });

    describe('setFileUploadState', () => {
      it('should update file upload state correctly', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setFileUploadState(FileUploadState.UPLOADING_FOR_CHAT);
        });
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
        
        act(() => {
          result.current.setFileUploadState(FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE);
        });
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE);
        
        act(() => {
          result.current.setFileUploadState(FileUploadState.PROCESSING_COMPLETE);
        });
        expect(result.current.fileUploadState).toBe(FileUploadState.PROCESSING_COMPLETE);
      });

      it('should not affect other states when updating file upload state', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setAIToolState(AIToolState.EXECUTING);
          result.current.setAudioState(AudioState.TRANSCRIBING);
          result.current.setFileUploadState(FileUploadState.UPLOADING_FOR_CHAT);
        });
        
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
        expect(result.current.audioState).toBe(AudioState.TRANSCRIBING);
      });
    });

    describe('setCurrentToolCallId', () => {
      it('should update tool call ID correctly', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setCurrentToolCallId('tool-123');
        });
        expect(result.current.currentToolCallId).toBe('tool-123');
        
        act(() => {
          result.current.setCurrentToolCallId('tool-456');
        });
        expect(result.current.currentToolCallId).toBe('tool-456');
      });

      it('should handle undefined tool call ID', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setCurrentToolCallId('tool-123');
        });
        expect(result.current.currentToolCallId).toBe('tool-123');
        
        act(() => {
          result.current.setCurrentToolCallId(undefined);
        });
        expect(result.current.currentToolCallId).toBeUndefined();
      });
    });

    describe('setCurrentOperationDescription', () => {
      it('should update operation description correctly', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setCurrentOperationDescription('search documents');
        });
        expect(result.current.currentOperationDescription).toBe('search documents');
        
        act(() => {
          result.current.setCurrentOperationDescription('generate summary');
        });
        expect(result.current.currentOperationDescription).toBe('generate summary');
      });

      it('should handle undefined operation description', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setCurrentOperationDescription('test operation');
        });
        expect(result.current.currentOperationDescription).toBe('test operation');
        
        act(() => {
          result.current.setCurrentOperationDescription(undefined);
        });
        expect(result.current.currentOperationDescription).toBeUndefined();
      });
    });
  });

  describe('Batch State Updates', () => {
    describe('setOperationStates', () => {
      it('should update partial state correctly', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setOperationStates({
            aiToolState: AIToolState.EXECUTING,
            currentOperationDescription: 'test operation',
          });
        });
        
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
        expect(result.current.currentOperationDescription).toBe('test operation');
        expect(result.current.audioState).toBe(AudioState.IDLE); // Should remain unchanged
        expect(result.current.fileUploadState).toBe(FileUploadState.IDLE); // Should remain unchanged
      });

      it('should update complete state correctly', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        act(() => {
          result.current.setOperationStates({
            aiToolState: AIToolState.EXECUTING,
            audioState: AudioState.TRANSCRIBING,
            fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
            currentToolCallId: 'tool-123',
            currentOperationDescription: 'multi-operation test',
          });
        });
        
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
        expect(result.current.audioState).toBe(AudioState.TRANSCRIBING);
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
        expect(result.current.currentToolCallId).toBe('tool-123');
        expect(result.current.currentOperationDescription).toBe('multi-operation test');
      });

      it('should preserve existing state when partial update is applied', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        // Set initial state
        act(() => {
          result.current.setAIToolState(AIToolState.EXECUTING);
          result.current.setCurrentToolCallId('tool-123');
        });
        
        // Partial update
        act(() => {
          result.current.setOperationStates({
            audioState: AudioState.TRANSCRIBING,
          });
        });
        
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING); // Preserved
        expect(result.current.currentToolCallId).toBe('tool-123'); // Preserved
        expect(result.current.audioState).toBe(AudioState.TRANSCRIBING); // Updated
      });
    });
  });

  describe('Reset Functionality', () => {
    describe('resetChatOperationState', () => {
      it('should reset to initial state from modified state', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        // Modify state
        act(() => {
          result.current.setAIToolState(AIToolState.EXECUTING);
          result.current.setAudioState(AudioState.TRANSCRIBING);
          result.current.setFileUploadState(FileUploadState.UPLOADING_FOR_CHAT);
          result.current.setCurrentToolCallId('tool-123');
          result.current.setCurrentOperationDescription('test operation');
        });
        
        // Verify state is modified
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
        expect(result.current.audioState).toBe(AudioState.TRANSCRIBING);
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
        expect(result.current.currentToolCallId).toBe('tool-123');
        expect(result.current.currentOperationDescription).toBe('test operation');
        
        // Reset
        act(() => {
          result.current.resetChatOperationState();
        });
        
        // Verify reset
        expect(result.current.aiToolState).toBe(AIToolState.IDLE);
        expect(result.current.audioState).toBe(AudioState.IDLE);
        expect(result.current.fileUploadState).toBe(FileUploadState.IDLE);
        expect(result.current.currentToolCallId).toBeUndefined();
        expect(result.current.currentOperationDescription).toBeUndefined();
      });

      it('should reset from any complex state configuration', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        // Set complex state
        act(() => {
          result.current.setOperationStates({
            aiToolState: AIToolState.AWAITING_RESULT_IN_STATE,
            audioState: AudioState.TRANSCRIPT_READY_FOR_INPUT,
            fileUploadState: FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE,
            currentToolCallId: 'complex-tool-789',
            currentOperationDescription: 'complex operation scenario',
          });
        });
        
        act(() => {
          result.current.resetChatOperationState();
        });
        
        const stateSubset = {
          aiToolState: result.current.aiToolState,
          audioState: result.current.audioState,
          fileUploadState: result.current.fileUploadState,
        };
        
        expect(stateSubset).toEqual(initialClientChatOperationState);
        expect(result.current.currentToolCallId).toBeUndefined();
        expect(result.current.currentOperationDescription).toBeUndefined();
      });
    });
  });

  describe('State Transitions and Workflows', () => {
    describe('AI Tool Flow', () => {
      it('should support complete AI tool workflow', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        // IDLE → DETECTED
        act(() => {
          result.current.setAIToolState(AIToolState.DETECTED);
          result.current.setCurrentToolCallId('tool-123');
        });
        expect(result.current.aiToolState).toBe(AIToolState.DETECTED);
        expect(result.current.currentToolCallId).toBe('tool-123');
        
        // DETECTED → EXECUTING
        act(() => {
          result.current.setOperationStates({
            aiToolState: AIToolState.EXECUTING,
            currentOperationDescription: 'search documents',
          });
        });
        expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
        expect(result.current.currentOperationDescription).toBe('search documents');
        
        // EXECUTING → AWAITING_RESULT_IN_STATE
        act(() => {
          result.current.setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
        });
        expect(result.current.aiToolState).toBe(AIToolState.AWAITING_RESULT_IN_STATE);
        
        // AWAITING_RESULT_IN_STATE → PROCESSING_COMPLETE
        act(() => {
          result.current.setAIToolState(AIToolState.PROCESSING_COMPLETE);
        });
        expect(result.current.aiToolState).toBe(AIToolState.PROCESSING_COMPLETE);
        
        // PROCESSING_COMPLETE → IDLE (reset or manual)
        act(() => {
          result.current.setOperationStates({
            aiToolState: AIToolState.IDLE,
            currentToolCallId: undefined,
            currentOperationDescription: undefined,
          });
        });
        expect(result.current.aiToolState).toBe(AIToolState.IDLE);
        expect(result.current.currentToolCallId).toBeUndefined();
        expect(result.current.currentOperationDescription).toBeUndefined();
      });
    });

    describe('Audio Flow', () => {
      it('should support complete audio workflow', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        // IDLE → RECORDING
        act(() => {
          result.current.setAudioState(AudioState.RECORDING);
        });
        expect(result.current.audioState).toBe(AudioState.RECORDING);
        
        // RECORDING → TRANSCRIBING
        act(() => {
          result.current.setAudioState(AudioState.TRANSCRIBING);
        });
        expect(result.current.audioState).toBe(AudioState.TRANSCRIBING);
        
        // TRANSCRIBING → TRANSCRIPT_READY_FOR_INPUT
        act(() => {
          result.current.setAudioState(AudioState.TRANSCRIPT_READY_FOR_INPUT);
        });
        expect(result.current.audioState).toBe(AudioState.TRANSCRIPT_READY_FOR_INPUT);
        
        // TRANSCRIPT_READY_FOR_INPUT → PROCESSING_COMPLETE
        act(() => {
          result.current.setAudioState(AudioState.PROCESSING_COMPLETE);
        });
        expect(result.current.audioState).toBe(AudioState.PROCESSING_COMPLETE);
        
        // PROCESSING_COMPLETE → IDLE
        act(() => {
          result.current.setAudioState(AudioState.IDLE);
        });
        expect(result.current.audioState).toBe(AudioState.IDLE);
      });
    });

    describe('File Upload Flow', () => {
      it('should support complete file upload workflow', () => {
        const { result } = renderHook(() => useClientChatOperationStore());
        
        // IDLE → UPLOADING_FOR_CHAT
        act(() => {
          result.current.setFileUploadState(FileUploadState.UPLOADING_FOR_CHAT);
        });
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
        
        // UPLOADING_FOR_CHAT → UPLOAD_COMPLETE_FOR_MESSAGE
        act(() => {
          result.current.setFileUploadState(FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE);
        });
        expect(result.current.fileUploadState).toBe(FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE);
        
        // UPLOAD_COMPLETE_FOR_MESSAGE → PROCESSING_COMPLETE
        act(() => {
          result.current.setFileUploadState(FileUploadState.PROCESSING_COMPLETE);
        });
        expect(result.current.fileUploadState).toBe(FileUploadState.PROCESSING_COMPLETE);
        
        // PROCESSING_COMPLETE → IDLE
        act(() => {
          result.current.setFileUploadState(FileUploadState.IDLE);
        });
        expect(result.current.fileUploadState).toBe(FileUploadState.IDLE);
      });
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple operations running simultaneously', () => {
      const { result } = renderHook(() => useClientChatOperationStore());
      
      // Start multiple operations
      act(() => {
        result.current.setOperationStates({
          aiToolState: AIToolState.EXECUTING,
          audioState: AudioState.TRANSCRIBING,
          fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
          currentToolCallId: 'concurrent-tool',
          currentOperationDescription: 'multiple operations',
        });
      });
      
      expect(result.current.aiToolState).toBe(AIToolState.EXECUTING);
      expect(result.current.audioState).toBe(AudioState.TRANSCRIBING);
      expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
      
      // Complete operations independently
      act(() => {
        result.current.setAudioState(AudioState.PROCESSING_COMPLETE);
      });
      expect(result.current.audioState).toBe(AudioState.PROCESSING_COMPLETE);
      expect(result.current.aiToolState).toBe(AIToolState.EXECUTING); // Still running
      expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT); // Still running
      
      act(() => {
        result.current.setFileUploadState(FileUploadState.PROCESSING_COMPLETE);
      });
      expect(result.current.fileUploadState).toBe(FileUploadState.PROCESSING_COMPLETE);
      expect(result.current.aiToolState).toBe(AIToolState.EXECUTING); // Still running
      
      act(() => {
        result.current.setAIToolState(AIToolState.PROCESSING_COMPLETE);
      });
      expect(result.current.aiToolState).toBe(AIToolState.PROCESSING_COMPLETE);
    });

    it('should maintain independent state management for different operation types', () => {
      const { result } = renderHook(() => useClientChatOperationStore());
      
      // Update operations in different orders
      act(() => {
        result.current.setFileUploadState(FileUploadState.UPLOADING_FOR_CHAT);
      });
      act(() => {
        result.current.setAIToolState(AIToolState.DETECTED);
      });
      act(() => {
        result.current.setAudioState(AudioState.RECORDING);
      });
      
      // Verify independent management
      expect(result.current.aiToolState).toBe(AIToolState.DETECTED);
      expect(result.current.audioState).toBe(AudioState.RECORDING);
      expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT);
      
      // Reset only one operation
      act(() => {
        result.current.setAudioState(AudioState.IDLE);
      });
      
      expect(result.current.audioState).toBe(AudioState.IDLE);
      expect(result.current.aiToolState).toBe(AIToolState.DETECTED); // Unchanged
      expect(result.current.fileUploadState).toBe(FileUploadState.UPLOADING_FOR_CHAT); // Unchanged
    });
  });
}); 