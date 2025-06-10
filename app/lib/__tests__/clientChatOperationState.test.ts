import {
  AIToolState,
  AudioState,
  FileUploadState,
  ClientChatOperationState,
  initialClientChatOperationState,
  isAnyOperationInProgress,
  getOperationStatusText,
} from '../clientChatOperationState';

describe('clientChatOperationState', () => {
  describe('Enums and Constants', () => {
    it('should have correct AIToolState enum values', () => {
      expect(AIToolState.IDLE).toBe('AI_TOOL_IDLE');
      expect(AIToolState.DETECTED).toBe('AI_TOOL_DETECTED');
      expect(AIToolState.EXECUTING).toBe('AI_TOOL_EXECUTING');
      expect(AIToolState.AWAITING_RESULT_IN_STATE).toBe('AI_TOOL_AWAITING_RESULT_IN_STATE');
      expect(AIToolState.PROCESSING_COMPLETE).toBe('AI_TOOL_PROCESSING_COMPLETE');
    });

    it('should have correct AudioState enum values', () => {
      expect(AudioState.IDLE).toBe('AUDIO_IDLE');
      expect(AudioState.RECORDING).toBe('AUDIO_RECORDING');
      expect(AudioState.TRANSCRIBING).toBe('AUDIO_TRANSCRIBING');
      expect(AudioState.TRANSCRIPT_READY_FOR_INPUT).toBe('AUDIO_TRANSCRIPT_READY_FOR_INPUT');
      expect(AudioState.PROCESSING_COMPLETE).toBe('AUDIO_PROCESSING_COMPLETE');
    });

    it('should have correct FileUploadState enum values', () => {
      expect(FileUploadState.IDLE).toBe('FILE_IDLE');
      expect(FileUploadState.UPLOADING_FOR_CHAT).toBe('FILE_UPLOADING_FOR_CHAT');
      expect(FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE).toBe('FILE_UPLOAD_COMPLETE_FOR_MESSAGE');
      expect(FileUploadState.PROCESSING_COMPLETE).toBe('FILE_PROCESSING_COMPLETE');
    });

    it('should have correct initial state', () => {
      expect(initialClientChatOperationState).toEqual({
        aiToolState: AIToolState.IDLE,
        audioState: AudioState.IDLE,
        fileUploadState: FileUploadState.IDLE,
        currentToolCallId: undefined,
        currentOperationDescription: undefined,
      });
    });
  });

  describe('isAnyOperationInProgress', () => {
    it('should return false when all operations are in IDLE state', () => {
      const state: ClientChatOperationState = {
        aiToolState: AIToolState.IDLE,
        audioState: AudioState.IDLE,
        fileUploadState: FileUploadState.IDLE,
      };
      expect(isAnyOperationInProgress(state)).toBe(false);
    });

    it('should return false when all operations are in PROCESSING_COMPLETE state', () => {
      const state: ClientChatOperationState = {
        aiToolState: AIToolState.PROCESSING_COMPLETE,
        audioState: AudioState.PROCESSING_COMPLETE,
        fileUploadState: FileUploadState.PROCESSING_COMPLETE,
      };
      expect(isAnyOperationInProgress(state)).toBe(false);
    });

    it('should return true when AI tool operation is in progress', () => {
      const states = [
        AIToolState.DETECTED,
        AIToolState.EXECUTING,
        AIToolState.AWAITING_RESULT_IN_STATE,
      ];

      states.forEach(aiToolState => {
        const state: ClientChatOperationState = {
          aiToolState,
          audioState: AudioState.IDLE,
          fileUploadState: FileUploadState.IDLE,
        };
        expect(isAnyOperationInProgress(state)).toBe(true);
      });
    });

    it('should return true when audio operation is in progress', () => {
      const states = [
        AudioState.RECORDING,
        AudioState.TRANSCRIBING,
        AudioState.TRANSCRIPT_READY_FOR_INPUT,
      ];

      states.forEach(audioState => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState,
          fileUploadState: FileUploadState.IDLE,
        };
        expect(isAnyOperationInProgress(state)).toBe(true);
      });
    });

    it('should return true when file upload operation is in progress', () => {
      const states = [
        FileUploadState.UPLOADING_FOR_CHAT,
        FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE,
      ];

      states.forEach(fileUploadState => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.IDLE,
          fileUploadState,
        };
        expect(isAnyOperationInProgress(state)).toBe(true);
      });
    });

    it('should return true when multiple operations are in progress', () => {
      const state: ClientChatOperationState = {
        aiToolState: AIToolState.EXECUTING,
        audioState: AudioState.TRANSCRIBING,
        fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
      };
      expect(isAnyOperationInProgress(state)).toBe(true);
    });

    it('should return true when some operations are complete and others are in progress', () => {
      const state: ClientChatOperationState = {
        aiToolState: AIToolState.PROCESSING_COMPLETE,
        audioState: AudioState.TRANSCRIBING,
        fileUploadState: FileUploadState.IDLE,
      };
      expect(isAnyOperationInProgress(state)).toBe(true);
    });
  });

  describe('getOperationStatusText', () => {
    it('should return null when all operations are idle', () => {
      const state: ClientChatOperationState = {
        aiToolState: AIToolState.IDLE,
        audioState: AudioState.IDLE,
        fileUploadState: FileUploadState.IDLE,
      };
      expect(getOperationStatusText(state)).toBeNull();
    });

    it('should return null when all operations are complete', () => {
      const state: ClientChatOperationState = {
        aiToolState: AIToolState.PROCESSING_COMPLETE,
        audioState: AudioState.PROCESSING_COMPLETE,
        fileUploadState: FileUploadState.PROCESSING_COMPLETE,
      };
      expect(getOperationStatusText(state)).toBeNull();
    });

    describe('AI Tool States', () => {
      it('should return correct text for EXECUTING state without description', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.EXECUTING,
          audioState: AudioState.IDLE,
          fileUploadState: FileUploadState.IDLE,
        };
        expect(getOperationStatusText(state)).toBe('Processing AI action: tool call...');
      });

      it('should return correct text for EXECUTING state with description', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.EXECUTING,
          audioState: AudioState.IDLE,
          fileUploadState: FileUploadState.IDLE,
          currentOperationDescription: 'search documents',
        };
        expect(getOperationStatusText(state)).toBe('Processing AI action: search documents...');
      });

      it('should return correct text for AWAITING_RESULT_IN_STATE', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.AWAITING_RESULT_IN_STATE,
          audioState: AudioState.IDLE,
          fileUploadState: FileUploadState.IDLE,
        };
        expect(getOperationStatusText(state)).toBe('Updating chat with AI tool result...');
      });

      it('should return null for DETECTED and IDLE states', () => {
        const states = [AIToolState.DETECTED, AIToolState.IDLE];
        
        states.forEach(aiToolState => {
          const state: ClientChatOperationState = {
            aiToolState,
            audioState: AudioState.IDLE,
            fileUploadState: FileUploadState.IDLE,
          };
          expect(getOperationStatusText(state)).toBeNull();
        });
      });
    });

    describe('Audio States', () => {
      it('should return correct text for TRANSCRIBING state', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.TRANSCRIBING,
          fileUploadState: FileUploadState.IDLE,
        };
        expect(getOperationStatusText(state)).toBe('Transcribing audio...');
      });

      it('should return correct text for TRANSCRIPT_READY_FOR_INPUT state', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.TRANSCRIPT_READY_FOR_INPUT,
          fileUploadState: FileUploadState.IDLE,
        };
        expect(getOperationStatusText(state)).toBe('Preparing transcript for chat...');
      });

      it('should return null for RECORDING and IDLE states', () => {
        const states = [AudioState.RECORDING, AudioState.IDLE];
        
        states.forEach(audioState => {
          const state: ClientChatOperationState = {
            aiToolState: AIToolState.IDLE,
            audioState,
            fileUploadState: FileUploadState.IDLE,
          };
          expect(getOperationStatusText(state)).toBeNull();
        });
      });
    });

    describe('File Upload States', () => {
      it('should return correct text for UPLOADING_FOR_CHAT state', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.IDLE,
          fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
        };
        expect(getOperationStatusText(state)).toBe('Uploading file for chat message...');
      });

      it('should return correct text for UPLOAD_COMPLETE_FOR_MESSAGE state', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.IDLE,
          fileUploadState: FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE,
        };
        expect(getOperationStatusText(state)).toBe('Preparing file for chat message...');
      });

      it('should return null for IDLE state', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.IDLE,
          fileUploadState: FileUploadState.IDLE,
        };
        expect(getOperationStatusText(state)).toBeNull();
      });
    });

    describe('Priority and Multiple Operations', () => {
      it('should prioritize AI tool EXECUTING over other states', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.EXECUTING,
          audioState: AudioState.TRANSCRIBING,
          fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
          currentOperationDescription: 'priority test',
        };
        expect(getOperationStatusText(state)).toBe('Processing AI action: priority test...');
      });

      it('should prioritize AI tool AWAITING_RESULT_IN_STATE over audio and file operations', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.AWAITING_RESULT_IN_STATE,
          audioState: AudioState.TRANSCRIBING,
          fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
        };
        expect(getOperationStatusText(state)).toBe('Updating chat with AI tool result...');
      });

      it('should prioritize audio TRANSCRIBING over file operations when AI tool is idle', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.TRANSCRIBING,
          fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
        };
        expect(getOperationStatusText(state)).toBe('Transcribing audio...');
      });

      it('should show audio TRANSCRIPT_READY_FOR_INPUT over file operations when AI tool is idle', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.TRANSCRIPT_READY_FOR_INPUT,
          fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
        };
        expect(getOperationStatusText(state)).toBe('Preparing transcript for chat...');
      });

      it('should show file operation when AI and audio are idle', () => {
        const state: ClientChatOperationState = {
          aiToolState: AIToolState.IDLE,
          audioState: AudioState.IDLE,
          fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
        };
        expect(getOperationStatusText(state)).toBe('Uploading file for chat message...');
      });
    });
  });
}); 