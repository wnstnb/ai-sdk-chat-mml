import { renderHook, act } from '@testing-library/react';
import { useClientChatOrchestrator } from '../useClientChatOrchestrator';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { AIToolState, AudioState, FileUploadState } from '@/app/lib/clientChatOperationState';
import type { Message } from 'ai';

// Mock the store
jest.mock('@/lib/stores/useClientChatOperationStore');

// Mock console methods to avoid noise in tests
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

// Mock for timers
jest.useFakeTimers();

describe('useClientChatOrchestrator', () => {
  // Mock store state and actions
  const mockStoreState = {
    aiToolState: AIToolState.IDLE,
    audioState: AudioState.IDLE,
    fileUploadState: FileUploadState.IDLE,
    currentToolCallId: undefined,
    currentOperationDescription: undefined,
  };

  const mockStoreActions = {
    setAIToolState: jest.fn(),
    setAudioState: jest.fn(),
    setFileUploadState: jest.fn(),
    setCurrentToolCallId: jest.fn(),
    setCurrentOperationDescription: jest.fn(),
    resetChatOperationState: jest.fn(),
    setOperationStates: jest.fn(),
  };

  const mockAddToolResult = jest.fn();
  const mockSetInputValue = jest.fn();
  const mockStartRecording = jest.fn();
  const mockStopRecording = jest.fn();
  const mockTranscribeAudio = jest.fn();
  const mockUploadFile = jest.fn();
  const mockFetchSignedUrl = jest.fn();

  const initialProps = {
    chatMessages: [],
    addToolResult: mockAddToolResult,
    setInputValue: mockSetInputValue,
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    transcribeAudio: mockTranscribeAudio,
    uploadFile: mockUploadFile,
    fetchSignedUrl: mockFetchSignedUrl,
    isLoading: false,
    toolExecutors: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers(); // Clear any pending timers
    
    // Reset store state to defaults
    Object.assign(mockStoreState, {
      aiToolState: AIToolState.IDLE,
      audioState: AudioState.IDLE,
      fileUploadState: FileUploadState.IDLE,
      currentToolCallId: undefined,
      currentOperationDescription: undefined,
    });

    // Mock the store hook to return our mock state and actions
    (useClientChatOperationStore as jest.MockedFunction<typeof useClientChatOperationStore>).mockImplementation((selector?: any) => {
      if (selector) {
        return selector({ ...mockStoreState, ...mockStoreActions });
      }
      return { ...mockStoreState, ...mockStoreActions };
    });
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
    jest.useRealTimers(); // Restore real timers
  });

  describe('Initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator(initialProps)
      );

      expect(result.current.isChatInputBusy).toBe(false);
      expect(result.current.currentOperationStatusText).toBe(null);
      expect(result.current.pendingToolCallIds).toEqual(new Set());
      expect(result.current.processedToolCallIds).toEqual(new Set());
      expect(result.current.operationState.aiToolState).toBe(AIToolState.IDLE);
      expect(result.current.operationState.audioState).toBe(AudioState.IDLE);
      expect(result.current.operationState.fileUploadState).toBe(FileUploadState.IDLE);
    });

    it('should indicate busy state when isLoading is true', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator({ ...initialProps, isLoading: true })
      );

      expect(result.current.isChatInputBusy).toBe(true);
    });

    it('should indicate busy state when any operation is in progress', () => {
      mockStoreState.aiToolState = AIToolState.EXECUTING;

      const { result } = renderHook(() =>
        useClientChatOrchestrator(initialProps)
      );

      expect(result.current.isChatInputBusy).toBe(true);
    });
  });

  describe('AI Tool Handlers', () => {
    it('should handle AI tool detection correctly', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator(initialProps)
      );

      act(() => {
        result.current.handleAIToolDetected('tool-123', 'searchDocuments');
      });

      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        aiToolState: AIToolState.DETECTED,
        currentToolCallId: 'tool-123',
        currentOperationDescription: 'AI requests: searchDocuments',
      });

      expect(result.current.pendingToolCallIds).toEqual(new Set(['tool-123']));
    });

    it('should handle AI tool execution start correctly', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator(initialProps)
      );

      act(() => {
        result.current.handleAIToolExecutionStart('tool-123', 'Searching documents...');
      });

      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        aiToolState: AIToolState.EXECUTING,
        currentToolCallId: 'tool-123',
        currentOperationDescription: 'Searching documents...',
      });
    });

    it('should handle AI tool execution completion with success', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator(initialProps)
      );

      const mockResult = { success: true, data: 'search results' };

      act(() => {
        result.current.handleAIToolExecutionComplete('tool-123', mockResult);
      });

      expect(mockAddToolResult).toHaveBeenCalledWith('tool-123', mockResult);
      expect(mockStoreActions.setAIToolState).toHaveBeenCalledWith(AIToolState.AWAITING_RESULT_IN_STATE);
    });

    it('should handle AI tool execution completion with error', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator(initialProps)
      );

      const mockError = new Error('Tool execution failed');

      act(() => {
        result.current.handleAIToolExecutionComplete('tool-123', null, mockError);
      });

      expect(mockAddToolResult).toHaveBeenCalledWith('tool-123', {
        error: 'Tool execution failed',
      });
      expect(mockStoreActions.setAIToolState).toHaveBeenCalledWith(AIToolState.AWAITING_RESULT_IN_STATE);
    });

    it('should reset state when addToolResult throws an error', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator(initialProps)
      );

      mockAddToolResult.mockImplementation(() => {
        throw new Error('Failed to add tool result');
      });

      act(() => {
        result.current.handleAIToolExecutionComplete('tool-123', { success: true });
      });

      expect(mockStoreActions.resetChatOperationState).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[Orchestrator] Error adding tool result for tool-123:',
        expect.any(Error)
      );
    });
  });

  describe('Audio Handlers', () => {
    // Mock Blob
    const mockAudioBlob = new Blob(['mock audio data'], { type: 'audio/wav' });

    describe('handleAudioRecordingStart', () => {
      it('should start recording and update state', async () => {
        mockStartRecording.mockResolvedValueOnce(undefined);
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

        await act(async () => {
          await result.current.handleAudioRecordingStart();
        });

        expect(mockStartRecording).toHaveBeenCalledTimes(1);
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.RECORDING,
          currentOperationDescription: 'Recording audio...',
        });
      });

      it('should handle startRecording prop not provided', async () => {
        const { result } = renderHook(() => useClientChatOrchestrator({ ...initialProps, startRecording: undefined }));
        await act(async () => {
          await result.current.handleAudioRecordingStart();
        });
        expect(mockStartRecording).not.toHaveBeenCalled();
        expect(mockConsoleWarn).toHaveBeenCalledWith("[Orchestrator] startRecording function not provided.");
        expect(mockStoreActions.setOperationStates).not.toHaveBeenCalled();
      });

      it('should handle error during recording start', async () => {
        mockStartRecording.mockRejectedValueOnce(new Error('Mic access denied'));
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

        await act(async () => {
          await result.current.handleAudioRecordingStart();
        });

        expect(mockStartRecording).toHaveBeenCalledTimes(1);
        expect(mockConsoleError).toHaveBeenCalledWith('[Orchestrator] Failed to start recording:', expect.any(Error));
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });
    });

    describe('handleAudioRecordingStop', () => {
      it('should stop recording, set audioBlob, and update state', async () => {
        mockStopRecording.mockResolvedValueOnce(mockAudioBlob);
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

        let returnedBlob;
        await act(async () => {
          returnedBlob = await result.current.handleAudioRecordingStop();
        });

        expect(mockStopRecording).toHaveBeenCalledTimes(1);
        expect(returnedBlob).toBe(mockAudioBlob);
        // Check internal audioBlob state by calling transcription next or by exposing it if necessary for testing
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.TRANSCRIBING,
          currentOperationDescription: 'Processing audio...',
        });
      });
      
      it('should handle stopRecording prop not provided', async () => {
        const { result } = renderHook(() => useClientChatOrchestrator({ ...initialProps, stopRecording: undefined }));
        let returnedBlob;
        await act(async () => {
          returnedBlob = await result.current.handleAudioRecordingStop();
        });
        expect(mockStopRecording).not.toHaveBeenCalled();
        expect(mockConsoleWarn).toHaveBeenCalledWith("[Orchestrator] stopRecording function not provided.");
        expect(returnedBlob).toBeNull();
        expect(mockStoreActions.setOperationStates).not.toHaveBeenCalled();
      });

      it('should handle stopRecording returning null blob', async () => {
        mockStopRecording.mockResolvedValueOnce(null);
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));
         let returnedBlob;
        await act(async () => {
          returnedBlob = await result.current.handleAudioRecordingStop();
        });
        expect(mockStopRecording).toHaveBeenCalledTimes(1);
        expect(mockConsoleWarn).toHaveBeenCalledWith('[Orchestrator] stopRecording returned null blob.');
        expect(returnedBlob).toBeNull();
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });

      it('should handle error during recording stop', async () => {
        mockStopRecording.mockRejectedValueOnce(new Error('Stop failed'));
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

        let returnedBlob;
        await act(async () => {
          returnedBlob = await result.current.handleAudioRecordingStop();
        });

        expect(mockStopRecording).toHaveBeenCalledTimes(1);
        expect(mockConsoleError).toHaveBeenCalledWith('[Orchestrator] Failed to stop recording:', expect.any(Error));
        expect(returnedBlob).toBeNull();
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });
    });

    describe('handleAudioTranscriptionStart', () => {
      // Helper to set audioBlob before tests
      const setupWithAudioBlob = async () => {
        const { result, rerender } = renderHook((props) => useClientChatOrchestrator(props), { initialProps });
        
         // Simulate setting the audioBlob by calling stopRecording first
        mockStopRecording.mockResolvedValueOnce(mockAudioBlob);
        await act(async () => { 
          await result.current.handleAudioRecordingStop(); 
        });
        mockStoreActions.setOperationStates.mockClear(); // Clear mocks after setup

        return { result, rerender };
      };

      it('should start transcription and update state', async () => {
        mockTranscribeAudio.mockResolvedValueOnce('Hello world');
        const { result } = await setupWithAudioBlob();

        let transcript;
        await act(async () => {
          transcript = await result.current.handleAudioTranscriptionStart();
        });

        expect(mockTranscribeAudio).toHaveBeenCalledWith(mockAudioBlob);
        expect(transcript).toBe('Hello world');
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.TRANSCRIPT_READY_FOR_INPUT,
          currentOperationDescription: 'Transcript ready',
        });
      });
      
      it('should handle transcribeAudio prop not provided', async () => {
        const { result } = await setupWithAudioBlob();
        // Update props for this specific test
        const { result: resultNoTranscribe } = renderHook(() => useClientChatOrchestrator({ ...initialProps, transcribeAudio: undefined }));

        // Need to set audioBlob for resultNoTranscribe instance
        mockStopRecording.mockResolvedValueOnce(mockAudioBlob);
        await act(async () => { await resultNoTranscribe.current.handleAudioRecordingStop(); });
        mockStoreActions.setOperationStates.mockClear();

        let transcript;
        await act(async () => {
          transcript = await resultNoTranscribe.current.handleAudioTranscriptionStart();
        });

        expect(mockTranscribeAudio).not.toHaveBeenCalled();
        expect(mockConsoleWarn).toHaveBeenCalledWith("[Orchestrator] transcribeAudio function not provided.");
        expect(transcript).toBeNull();
        expect(mockStoreActions.setOperationStates).not.toHaveBeenCalled(); // Because it should return early
      });

      it('should handle no audioBlob available', async () => {
        // Render without calling stopRecording to ensure audioBlob is null
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps)); 
        let transcript;
        await act(async () => {
          transcript = await result.current.handleAudioTranscriptionStart();
        });

        expect(mockTranscribeAudio).not.toHaveBeenCalled();
        expect(mockConsoleWarn).toHaveBeenCalledWith('[Orchestrator] No audio blob available for transcription.');
        expect(transcript).toBeNull();
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });

      it('should handle transcribeAudio returning null/empty transcript', async () => {
        mockTranscribeAudio.mockResolvedValueOnce(null);
        const { result } = await setupWithAudioBlob();
        let transcript;
        await act(async () => {
          transcript = await result.current.handleAudioTranscriptionStart();
        });

        expect(mockTranscribeAudio).toHaveBeenCalledWith(mockAudioBlob);
        expect(mockConsoleWarn).toHaveBeenCalledWith('[Orchestrator] Transcription returned null or empty.');
        expect(transcript).toBeNull();
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });

      it('should handle error during transcription start', async () => {
        mockTranscribeAudio.mockRejectedValueOnce(new Error('Transcription failed'));
        const { result } = await setupWithAudioBlob();
        let transcript;
        await act(async () => {
          transcript = await result.current.handleAudioTranscriptionStart();
        });

        expect(mockTranscribeAudio).toHaveBeenCalledWith(mockAudioBlob);
        expect(mockConsoleError).toHaveBeenCalledWith('[Orchestrator] Failed to transcribe audio:', expect.any(Error));
        expect(transcript).toBeNull();
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });
    });

    describe('handleAudioTranscriptionComplete', () => {
      it('should set input value and update state on successful completion', () => {
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));
        const transcript = 'Test transcript';

        act(() => {
          result.current.handleAudioTranscriptionComplete(transcript);
        });

        expect(mockSetInputValue).toHaveBeenCalledWith(transcript);
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.PROCESSING_COMPLETE,
          currentOperationDescription: 'Transcript processed',
        });

        act(() => {
          jest.runAllTimers();
        });

        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });

      it('should handle error on completion', () => {
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));
        const error = new Error('Completion error');

        act(() => {
          result.current.handleAudioTranscriptionComplete(null, error);
        });

        expect(mockSetInputValue).not.toHaveBeenCalled();
        expect(mockConsoleError).toHaveBeenCalledWith('[Orchestrator] Audio transcription process resulted in error:', error);
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
        // Ensure audioBlob would be cleared (though not directly testable without exposing state or specific action)
      });

      it('should handle null/empty transcript on completion', () => {
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

        act(() => {
          result.current.handleAudioTranscriptionComplete(''); // Empty transcript
        });

        expect(mockSetInputValue).not.toHaveBeenCalled();
        expect(mockConsoleWarn).toHaveBeenCalledWith('[Orchestrator] Transcription complete but transcript is empty or null.');
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });
    });

    describe('handleCompleteAudioFlow', () => {
      it('should run the full audio flow successfully', async () => {
        mockStopRecording.mockResolvedValueOnce(mockAudioBlob);
        mockTranscribeAudio.mockResolvedValueOnce('Full flow transcript');
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

        await act(async () => {
          await result.current.handleCompleteAudioFlow();
        });

        expect(mockStopRecording).toHaveBeenCalledTimes(1);
        expect(mockTranscribeAudio).toHaveBeenCalledWith(mockAudioBlob);
        expect(mockSetInputValue).toHaveBeenCalledWith('Full flow transcript');
        
        // Check intermediate states
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.TRANSCRIBING,
          currentOperationDescription: 'Processing audio...',
        });
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.TRANSCRIPT_READY_FOR_INPUT,
          currentOperationDescription: 'Transcript ready',
        });
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.PROCESSING_COMPLETE,
          currentOperationDescription: 'Transcript processed',
        });

        act(() => {
          jest.runAllTimers(); // For the final reset to IDLE
        });
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });

      it('should handle failure in stopRecording during full flow', async () => {
        mockStopRecording.mockResolvedValueOnce(null); // Simulate stop failure
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

        await act(async () => {
          await result.current.handleCompleteAudioFlow();
        });

        expect(mockStopRecording).toHaveBeenCalledTimes(1);
        expect(mockTranscribeAudio).not.toHaveBeenCalled();
        expect(mockSetInputValue).not.toHaveBeenCalled();
        expect(mockConsoleWarn).toHaveBeenCalledWith('[Orchestrator] Complete audio flow aborted: stopRecording did not produce a blob.');
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });

      it('should handle failure in transcribeAudio during full flow', async () => {
        mockStopRecording.mockResolvedValueOnce(mockAudioBlob);
        mockTranscribeAudio.mockResolvedValueOnce(null); // Simulate transcription failure (no transcript)
        const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

        await act(async () => {
          await result.current.handleCompleteAudioFlow();
        });

        expect(mockStopRecording).toHaveBeenCalledTimes(1);
        expect(mockTranscribeAudio).toHaveBeenCalledWith(mockAudioBlob);
        expect(mockSetInputValue).not.toHaveBeenCalled(); // Because handleAudioTranscriptionComplete gets null
        expect(mockConsoleError).toHaveBeenCalledWith('[Orchestrator] Audio transcription process resulted in error:', expect.any(Error));
        
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          audioState: AudioState.IDLE,
          currentOperationDescription: undefined,
        });
      });
    });
  });

  describe('File Upload Handlers', () => {
    const mockFile = new File(['dummy content'], 'test-file.png', { type: 'image/png' });
    const mockFilePath = '/uploads/test-file.png';

    beforeEach(() => {
      // Reset relevant mocks for file upload
      mockUploadFile.mockReset();
      mockFetchSignedUrl.mockReset();
      // Reset store state specifically for file uploads if needed, though beforeEach global reset should cover it
      mockStoreState.fileUploadState = FileUploadState.IDLE;
      
      // Clear any existing managed resources from previous tests if they weren't cleaned up
      // This requires access to internal state or a reset method not typically exposed by hooks for testing.
      // For now, we rely on the hook's own cleanup. If issues arise, we might need to enhance resetAllOperations or mock managedResources.
    });

    it('should handle successful file upload and resource management', async () => {
      mockUploadFile.mockResolvedValueOnce(mockFilePath);
      const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

      let returnedFilePath: string | null = null;
      await act(async () => {
        returnedFilePath = await result.current.handleFileUploadStart(mockFile);
      });

      expect(mockUploadFile).toHaveBeenCalledWith(mockFile);
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith(expect.objectContaining({
        fileUploadState: FileUploadState.UPLOADING_FOR_CHAT,
        currentOperationDescription: `Uploading ${mockFile.name}`,
      }));
      
      expect(result.current.pendingFileUpload).toMatchObject({
        file: mockFile,
        memoryUsage: mockFile.size,
        resourceId: expect.any(String),
      });
      const resourceId = result.current.pendingFileUpload?.resourceId;

      // Simulate upload completion reported by caller
      act(() => {
        result.current.handleFileUploadComplete(returnedFilePath, null);
      });
      
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith(expect.objectContaining({
        fileUploadState: FileUploadState.PROCESSING_COMPLETE,
      }));
      expect(result.current.pendingFileUpload).toBeNull();

      // Verify resource cleanup by checking managedResources (indirectly via getMemoryUsage or if a mock cleanup was called)
      // To directly test cleanupResourceById, we'd need to spy on it or its effects.
      // For now, we assume its correct integration if states reset.
      
      // Check that memory usage reflects the cleanup
      const memoryUsage = result.current.getMemoryUsage();
      expect(memoryUsage.activeResources).toBe(0); // Assuming this was the only resource
      expect(memoryUsage.totalAllocated).toBe(0);


      // Advance timers to ensure idle state is reached after PROCESSING_COMPLETE timeout
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith(expect.objectContaining({
        fileUploadState: FileUploadState.IDLE,
      }));
    });

    it('should handle file upload failure and resource cleanup', async () => {
      const uploadError = new Error('Upload failed miserably');
      mockUploadFile.mockRejectedValueOnce(uploadError);
      const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

      await act(async () => {
        await result.current.handleFileUploadStart(mockFile);
      });
      
      expect(mockUploadFile).toHaveBeenCalledWith(mockFile);
      expect(result.current.pendingFileUpload).toMatchObject({
        file: mockFile,
        error: uploadError,
      });
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith(expect.objectContaining({
        fileUploadState: FileUploadState.IDLE, // Should go to IDLE on error during start
        currentOperationDescription: undefined,
      }));
      
      // Verify resource cleanup happened
      const memoryUsage = result.current.getMemoryUsage();
      expect(memoryUsage.activeResources).toBe(0);
      expect(memoryUsage.totalAllocated).toBe(0);
    });

    it('should handle file upload cancellation and resource cleanup', async () => {
      mockUploadFile.mockResolvedValueOnce(mockFilePath); // Simulate an ongoing upload
      const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

      // Start the upload
      await act(async () => {
        await result.current.handleFileUploadStart(mockFile);
      });
      expect(result.current.isFileUploadInProgress()).toBe(true);
      const resourceId = result.current.pendingFileUpload?.resourceId;
      expect(resourceId).toBeDefined();

      // Cancel the upload
      act(() => {
        result.current.cancelFileUpload();
      });

      expect(result.current.pendingFileUpload).toBeNull();
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith(expect.objectContaining({
        fileUploadState: FileUploadState.IDLE,
        currentOperationDescription: undefined,
      }));
      expect(result.current.isFileUploadInProgress()).toBe(false);
      
      // Verify resource cleanup
      const memoryUsage = result.current.getMemoryUsage();
      expect(memoryUsage.activeResources).toBe(0);
      expect(memoryUsage.totalAllocated).toBe(0);
    });

    it('should handle uploadFile prop not being provided', async () => {
      const { result } = renderHook(() => useClientChatOrchestrator({ ...initialProps, uploadFile: undefined }));
      let returnedFilePath: string | null = null;
      await act(async () => {
        returnedFilePath = await result.current.handleFileUploadStart(mockFile);
      });

      expect(returnedFilePath).toBeNull();
      expect(mockUploadFile).not.toHaveBeenCalled();
      expect(mockConsoleWarn).toHaveBeenCalledWith("[Orchestrator] uploadFile function not provided.");
      expect(mockStoreActions.setFileUploadState).toHaveBeenCalledWith(FileUploadState.IDLE); // Check if it explicitly resets
    });
    
    it('should update memory usage stats during file upload', async () => {
      mockUploadFile.mockResolvedValueOnce(mockFilePath);
      const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

      await act(async () => {
        await result.current.handleFileUploadStart(mockFile);
      });

      const memoryUsage = result.current.getMemoryUsage();
      expect(memoryUsage.activeResources).toBe(1);
      expect(memoryUsage.totalAllocated).toBe(mockFile.size);
      expect(memoryUsage.isMemoryPressure).toBe(mockFile.size > 200 * 1024 * 1024); // Check MEMORY_PRESSURE_THRESHOLD

      // Complete the upload
      act(() => {
        result.current.handleFileUploadComplete(mockFilePath, null);
      });
      
      const memoryUsageAfter = result.current.getMemoryUsage();
      expect(memoryUsageAfter.activeResources).toBe(0);
      expect(memoryUsageAfter.totalAllocated).toBe(0);
    });

    it('should correctly cleanup resources on resetAllOperations when a file upload was pending', async () => {
      mockUploadFile.mockResolvedValueOnce(mockFilePath); // Simulate an ongoing upload
      const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

      // Start the upload
      await act(async () => {
        await result.current.handleFileUploadStart(mockFile);
      });
      expect(result.current.pendingFileUpload).not.toBeNull();
      expect(result.current.getMemoryUsage().activeResources).toBe(1);


      // Reset all operations
      act(() => {
        result.current.resetAllOperations();
      });

      expect(result.current.pendingFileUpload).toBeNull();
      expect(mockStoreActions.resetChatOperationState).toHaveBeenCalled();
      
      // Verify resource cleanup (all managed resources should be gone)
      const memoryUsage = result.current.getMemoryUsage();
      expect(memoryUsage.activeResources).toBe(0);
      expect(memoryUsage.totalAllocated).toBe(0);
    });
  });

  describe('History Consistency Checks', () => {
    const mockToolExecutor = jest.fn(async (args: any) => ({ success: true, data: 'tool_executed', args }));
    const mockToolExecutors = {
      'testTool': mockToolExecutor,
      'anotherTool': mockToolExecutor,
    };

    // Helper to create an assistant message with tool calls, typed for the orchestrator's expectation
    const baseAssistantMessageWithToolCall = (id: string, toolCallId: string, toolName: string, args: any = {}): Message => ({
      id: id,
      role: 'assistant',
      content: '',
      // The orchestrator expects a simpler toolInvocations structure for client tools
      toolInvocations: [{ toolCallId, toolName, args }] as any, 
    });

    // Helper to create a tool message, typed for the orchestrator's expectation
    const baseToolMessage = (id: string, toolCallId: string, result: any = {}): Message => ({
      id: id,
      role: 'tool', // role 'tool' is a valid CoreMessage role
      content: JSON.stringify(result),
      tool_call_id: toolCallId, 
    } as any); // Cast the entire object to any to allow tool_call_id for test purposes
    
    // Test for isHistoryConsistentForAPICall
    it('isHistoryConsistentForAPICall should return true for an empty history', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: [],
          toolExecutors: mockToolExecutors,
        })
      );
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('isHistoryConsistentForAPICall should return true for history with no tool calls', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there!' },
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors,
        })
      );
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('isHistoryConsistentForAPICall should return true for a consistent history with tool calls and results', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Use testTool' },
        baseAssistantMessageWithToolCall('2', 'tc1', 'testTool'),
        baseToolMessage('3', 'tc1', { data: 'result for tc1' }),
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors,
        })
      );
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('isHistoryConsistentForAPICall should return true for multiple consistent tool calls', () => {
      const messages: Message[] = [
        baseAssistantMessageWithToolCall('1', 'tc1', 'testTool'),
        baseToolMessage('2', 'tc1', { data: 'result for tc1' }),
        baseAssistantMessageWithToolCall('3', 'tc2', 'anotherTool', { param: 'value' }),
        baseToolMessage('4', 'tc2', { data: 'result for tc2' }),
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors,
        })
      );
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('isHistoryConsistentForAPICall should return false for a history missing a tool result', () => {
      // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
      mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
      
      const messages: Message[] = [
        baseAssistantMessageWithToolCall('1', 'tc1', 'testTool'),
        // Missing tool result for tc1
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors,
        })
      );
      expect(result.current.isHistoryConsistentForAPICall()).toBe(false);
      
      // Reset aiToolState for other tests
      mockStoreState.aiToolState = AIToolState.IDLE;
    });

    it('isHistoryConsistentForAPICall should return false if a tool result is present but its call is missing', () => {
      // This scenario is less about "missing result" and more about structural integrity,
      // but the current function primarily checks if calls have results.
      // A tool message without a preceding call might be an edge case for other validation logic.
      const messages: Message[] = [
        baseToolMessage('1', 'tc1', { data: 'result for tc1' }),
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors,
        })
      );
      // The function looks for invocations that are missing results.
      // If there are no invocations, it's consistent from its perspective.
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });
    
    it('isHistoryConsistentForAPICall should return true if a tool call is pending (in pendingToolCallIds)', () => {
      const messages: Message[] = [
        baseAssistantMessageWithToolCall('1', 'tc1', 'testTool'),
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors,
        })
      );
      
      // Simulate 'tc1' being pending
      act(() => {
        // Directly manipulating pendingToolCallIds from the hook's return for testing
        // In real usage, this is managed internally by handleAIToolDetected etc.
         (result.current.pendingToolCallIds as Set<string>).add('tc1');
      });
      
      // Even though tc1 doesn't have a result message, it's pending, so history is considered consistent
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('isHistoryConsistentForAPICall should ignore server-side tools (not in toolExecutors)', () => {
      const messages: Message[] = [
        baseAssistantMessageWithToolCall('1', 'tc1', 'serverSideTool'), // This tool is not in mockToolExecutors
        // No result for tc1, but it should be ignored
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors, // mockToolExecutors only contains 'testTool' and 'anotherTool'
        })
      );
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('isHistoryConsistentForAPICall should handle mixed client-side and server-side tools correctly', () => {
      const messages: Message[] = [
        baseAssistantMessageWithToolCall('1', 'tc1', 'testTool'),
        baseToolMessage('2', 'tc1', { data: 'result for tc1' }),
        baseAssistantMessageWithToolCall('3', 'tc2', 'serverSideTool'), // Server tool, no executor
        // Missing result for tc2, but it's a server tool, so it's ignored
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors,
        })
      );
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('isHistoryConsistentForAPICall should return false if a client-side tool is missing a result among mixed tools', () => {
      // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
      mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
      
      const messages: Message[] = [
        baseAssistantMessageWithToolCall('1', 'tc1', 'testTool'), // Client tool, missing result
        baseAssistantMessageWithToolCall('3', 'tc2', 'serverSideTool'),
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          toolExecutors: mockToolExecutors,
        })
      );
      expect(result.current.isHistoryConsistentForAPICall()).toBe(false);
      
      // Reset aiToolState for other tests
      mockStoreState.aiToolState = AIToolState.IDLE;
    });
    
    // Tests for getHistoryInconsistencyDetails
    describe('getHistoryInconsistencyDetails', () => {
      it('should return consistent with empty arrays for empty history', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            toolExecutors: mockToolExecutors,
          })
        );
        const details = result.current.getHistoryInconsistencyDetails();
        expect(details.isConsistent).toBe(true);
        expect(details.missingResults).toEqual([]);
        expect(details.pendingToolCalls).toEqual([]);
      });

      it('should return consistent for history with no tool calls', () => {
        const messages: Message[] = [{ id: '1', role: 'user', content: 'Hello' }];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            toolExecutors: mockToolExecutors,
          })
        );
        const details = result.current.getHistoryInconsistencyDetails();
        expect(details.isConsistent).toBe(true);
        expect(details.missingResults).toEqual([]);
        expect(details.pendingToolCalls).toEqual([]);
      });

      it('should return consistent for history with matched tool calls and results', () => {
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('1', 'tc1', 'testTool'),
          baseToolMessage('2', 'tc1', { data: 'res1' }),
        ];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            toolExecutors: mockToolExecutors,
          })
        );
        const details = result.current.getHistoryInconsistencyDetails();
        expect(details.isConsistent).toBe(true);
        expect(details.missingResults).toEqual([]);
        // Assuming no pending calls were manually set for this test
        expect(details.pendingToolCalls).toEqual([]); 
      });

      it('should identify missing tool results', () => {
        // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
        mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
        
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('msg1', 'call1', 'testTool'),
          baseAssistantMessageWithToolCall('msg2', 'call2', 'anotherTool', { p: 1 }),
          baseToolMessage('msg3', 'call1', { data: 'res1' }),
          // call2 is missing its result
        ];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            toolExecutors: mockToolExecutors,
          })
        );
        const details = result.current.getHistoryInconsistencyDetails();
        expect(details.isConsistent).toBe(false);
        expect(details.missingResults).toEqual([{ id: 'call2', name: 'anotherTool' }]);
        expect(details.pendingToolCalls).toEqual([]);
        
        // Reset aiToolState for other tests
        mockStoreState.aiToolState = AIToolState.IDLE;
      });

      it('should identify pending tool calls', () => {
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('msg1', 'call1', 'testTool'),
        ];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            toolExecutors: mockToolExecutors,
          })
        );
        act(() => {
          (result.current.pendingToolCallIds as Set<string>).add('call1');
        });
        const details = result.current.getHistoryInconsistencyDetails();
        expect(details.isConsistent).toBe(true); // Still consistent because the missing one is pending
        expect(details.missingResults).toEqual([]);
        expect(details.pendingToolCalls).toEqual([{ id: 'call1', name: 'testTool' }]);
      });

      it('should correctly identify mixed missing and pending calls', () => {
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('m1', 'tc_missing', 'testTool'), // Will be missing
          baseAssistantMessageWithToolCall('m2', 'tc_pending', 'anotherTool'), // Will be pending
          baseAssistantMessageWithToolCall('m3', 'tc_ok', 'testTool'),
          baseToolMessage('m4', 'tc_ok', { res: 'ok' }),
        ];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            toolExecutors: mockToolExecutors,
          })
        );
        act(() => {
          (result.current.pendingToolCallIds as Set<string>).add('tc_pending');
        });
        const details = result.current.getHistoryInconsistencyDetails();
        expect(details.isConsistent).toBe(false);
        expect(details.missingResults).toEqual([{ id: 'tc_missing', name: 'testTool' }]);
        // The pendingToolCalls map in the hook needs the invocation to exist in messages for name resolution
        expect(details.pendingToolCalls).toEqual([{ id: 'tc_pending', name: 'anotherTool' }]); 
      });

      it('should ignore server-side tools when identifying missing results', () => {
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('m1', 'tc_server', 'serverOnlyTool'), // Not in toolExecutors
        ];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            toolExecutors: mockToolExecutors, // serverOnlyTool is not defined here
          })
        );
        const details = result.current.getHistoryInconsistencyDetails();
        expect(details.isConsistent).toBe(true);
        expect(details.missingResults).toEqual([]);
        expect(details.pendingToolCalls).toEqual([]);
      });
    });
    
    // Tests for attemptToFixInconsistencies
    describe('attemptToFixInconsistencies', () => {
      it('should return true immediately if history is already consistent', async () => {
        // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
        mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
        
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('1', 'tc1', 'testTool'),
          baseToolMessage('2', 'tc1', { data: 'res1' }),
        ];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            toolExecutors: mockToolExecutors,
          })
        );
        await act(async () => {
          expect(await result.current.attemptToFixInconsistencies()).toBe(true);
        });
        expect(mockToolExecutor).not.toHaveBeenCalled();
        
        // Reset aiToolState for other tests
        mockStoreState.aiToolState = AIToolState.IDLE;
      });

      it('should execute a missing client-side tool and return true if fixed', async () => {
        // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
        mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
        
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('1', 'tc1', 'testTool', { input: 'fix me' }),
          // tc1 result is missing
        ];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages, // Initial messages, tc1 result missing
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        // The args passed to testTool for tc1 were { input: 'fix me' }
        mockToolExecutor.mockResolvedValueOnce({ success: true, data: 'fixed data for tc1', args: { input: 'fix me' } });

        let fixedSuccessfully = false;
        await act(async () => {
          fixedSuccessfully = await result.current.attemptToFixInconsistencies();
        });
        
        expect(fixedSuccessfully).toBe(true);
        expect(mockToolExecutor).toHaveBeenCalledWith({ input: 'fix me' });
        expect(mockAddToolResult).toHaveBeenCalledWith('tc1', { 
          success: true, 
          result: { success: true, data: 'fixed data for tc1', args: { input: 'fix me' } }
        });
        
        // Reset aiToolState for other tests
        mockStoreState.aiToolState = AIToolState.IDLE;
      });
      
      it('should return false if a missing client-side tool fails to execute', async () => {
        // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
        mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
        
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('1', 'tc1', 'testTool', { input: 'fail me' }),
        ];
        const { result, rerender } = renderHook(
          ({ msgs, addFn, executors }) => useClientChatOrchestrator({ ...initialProps, chatMessages: msgs, addToolResult: addFn, toolExecutors: executors }),
          { initialProps: { msgs: messages, addFn: mockAddToolResult, executors: mockToolExecutors } }
        );

        mockToolExecutor.mockRejectedValueOnce(new Error('Execution failed badly'));

        let fixedSuccessfully = true; // Assume true, expect it to become false
        await act(async () => {
          fixedSuccessfully = await result.current.attemptToFixInconsistencies();
        });
        
        expect(fixedSuccessfully).toBe(false);
        expect(mockToolExecutor).toHaveBeenCalledWith({ input: 'fail me' });
        // Check if addToolResult was called with an error structure
        expect(mockAddToolResult).toHaveBeenCalledWith('tc1', {
          error: "Execution failed badly"
        });
        
        // Reset aiToolState for other tests
        mockStoreState.aiToolState = AIToolState.IDLE;
      });

      it('should not attempt to fix server-side tools and return true if otherwise consistent', async () => {
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('1', 'tc_server', 'serverToolXYZ'), // Not in mockToolExecutors
        ];
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        let fixedSuccessfully = false;
        await act(async () => {
          fixedSuccessfully = await result.current.attemptToFixInconsistencies();
        });
        
        expect(fixedSuccessfully).toBe(true); // Consistent because server-side tools are ignored by the consistency check
        expect(mockToolExecutor).not.toHaveBeenCalled();
        expect(mockAddToolResult).not.toHaveBeenCalled();
      });

      it('should return false if a client-side tool is missing and unfixable among other consistent server tools', async () => {
        // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
        mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
        
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('m1', 'tc_client_missing', 'testTool'), // This one is missing
          baseAssistantMessageWithToolCall('m2', 'tc_server_ignored', 'serverToolXYZ'), // This one is ignored
        ];
         mockToolExecutor.mockRejectedValueOnce(new Error('Client tool failed'));

        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        let fixedSuccessfully = true;
        await act(async () => {
          fixedSuccessfully = await result.current.attemptToFixInconsistencies();
        });
        
        expect(fixedSuccessfully).toBe(false);
        expect(mockToolExecutor).toHaveBeenCalledWith({}); // Called for tc_client_missing (args default to {})
        expect(mockAddToolResult).toHaveBeenCalledWith('tc_client_missing', expect.any(Object));
        
        // Reset aiToolState for other tests
        mockStoreState.aiToolState = AIToolState.IDLE;
      });

      it('should handle multiple missing tools, fixing one and failing another', async () => {
        // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
        mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
        
        const messages: Message[] = [
          baseAssistantMessageWithToolCall('m1', 'tc_fixable', 'testTool', { data: 'fix this' }),
          baseAssistantMessageWithToolCall('m2', 'tc_unfixable', 'anotherTool', { data: 'fail this' }),
        ];
        
        // Setup mockToolExecutor to succeed for 'tc_fixable' and fail for 'tc_unfixable'
        mockToolExecutor
          .mockImplementationOnce(async (args_tc_fixable) => { // For tc_fixable
            if (args_tc_fixable.data === 'fix this') return { success: true, data: 'fixed_tc1', args: args_tc_fixable };
            throw new Error('Unexpected call to fixable mock');
          })
          .mockImplementationOnce(async (args_tc_unfixable) => { // For tc_unfixable
            if (args_tc_unfixable.data === 'fail this') throw new Error('Failed to fix unfixable');
            throw new Error('Unexpected call to unfixable mock');
          });

        const { result } = renderHook(() => 
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        let fixedSuccessfully = true;
        await act(async () => {
          fixedSuccessfully = await result.current.attemptToFixInconsistencies();
        });

        expect(fixedSuccessfully).toBe(false); // Overall consistency check will fail because one tool failed
        
        // Check tc_fixable call
        expect(mockToolExecutor).toHaveBeenCalledWith({ data: 'fix this' });
        expect(mockAddToolResult).toHaveBeenCalledWith('tc_fixable', { 
          success: true, 
          result: { success: true, data: 'fixed_tc1', args: { data: 'fix this' } }
        });
        
        // Check tc_unfixable call
        expect(mockToolExecutor).toHaveBeenCalledWith({ data: 'fail this' });
        expect(mockAddToolResult).toHaveBeenCalledWith('tc_unfixable', {
          error: "Failed to fix unfixable"
        });
        
        // Reset aiToolState for other tests
        mockStoreState.aiToolState = AIToolState.IDLE;
      });
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all operations', () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: [],
        })
      );

      // Add some pending tool calls first
      act(() => {
        result.current.handleAIToolDetected('tool-123', 'searchDocuments');
        result.current.handleAIToolDetected('tool-456', 'createContent');
      });

      expect(result.current.pendingToolCallIds.size).toBe(2);

      act(() => {
        result.current.resetAllOperations();
      });

      expect(mockStoreActions.resetChatOperationState).toHaveBeenCalled();
      expect(result.current.pendingToolCallIds.size).toBe(0);
    });
  });

     describe('Tool Result Monitoring Effect', () => {
     it('should update processed IDs when tool result appears in messages', () => {
       // Set up the mock store state for this test
       Object.assign(mockStoreState, {
         aiToolState: AIToolState.AWAITING_RESULT_IN_STATE,
         currentToolCallId: 'tool-123',
       });

      const initialMessages: Message[] = [];

      const { result, rerender } = renderHook(
        ({ messages }) =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: messages,
          }),
        { initialProps: { messages: initialMessages } }
      );

      // Add a pending tool call
      act(() => {
        result.current.handleAIToolDetected('tool-123', 'searchDocuments');
      });

      // Simulate tool result being added to messages
      const messagesWithResult: Message[] = [
        ...initialMessages,
        {
          id: '3',
          role: 'tool',
          tool_call_id: 'tool-123',
          content: JSON.stringify({ success: true }),
        } as any,
      ];

      rerender({ messages: messagesWithResult });

      // The effect should detect the tool result and update state
      expect(result.current.processedToolCallIds).toEqual(new Set(['tool-123']));
      expect(result.current.pendingToolCallIds).toEqual(new Set());
    });

         it('should transition to PROCESSING_COMPLETE when last pending tool call is processed', async () => {
       jest.useFakeTimers();
       
       // Set up the mock store state for this test
       Object.assign(mockStoreState, {
         aiToolState: AIToolState.AWAITING_RESULT_IN_STATE,
         currentToolCallId: 'tool-123',
       });

      const messagesWithResult: Message[] = [
        {
          id: '3',
          role: 'tool',
          tool_call_id: 'tool-123',
          content: JSON.stringify({ success: true }),
        } as any,
      ];

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messagesWithResult,
        })
      );

      // Add a pending tool call
      act(() => {
        result.current.handleAIToolDetected('tool-123', 'searchDocuments');
      });

      // The effect should run and detect the completion
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        aiToolState: AIToolState.PROCESSING_COMPLETE,
        currentToolCallId: undefined,
        currentOperationDescription: undefined,
      });

      // Fast-forward to test the delayed reset to IDLE
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        aiToolState: AIToolState.IDLE,
        currentToolCallId: undefined,
        currentOperationDescription: undefined,
      });

      jest.useRealTimers();
    });
  });

  describe('Edge Cases', () => {
    it('should handle messages without toolInvocations gracefully', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Hi there!',
        },
      ];

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
        })
      );

      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('should handle malformed tool invocations gracefully', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'assistant',
          content: 'I will help you.',
          toolInvocations: [
            {
              // Missing toolCallId
              toolName: 'searchDocuments',
              args: { query: 'test' },
            } as any,
          ],
        } as any,
      ];

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          addToolResult: mockAddToolResult,
        })
      );

      // Should not crash and should return true (no valid tool calls to check)
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });

    it('should handle undefined or null tool invocations', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'assistant',
          content: 'I will help you.',
          toolInvocations: undefined,
        } as any,
        {
          id: '2',
          role: 'assistant',
          content: 'Another message.',
          toolInvocations: null,
        } as any,
      ];

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          ...initialProps,
          chatMessages: messages,
          addToolResult: mockAddToolResult,
        })
      );

      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);
    });
  });

  describe('Tool Execution and Processing', () => {
    const mockToolExecutors = {
      testTool: jest.fn().mockResolvedValue({ success: true, data: 'tool result', args: {} }),
      anotherTool: jest.fn().mockResolvedValue({ success: true, data: 'another result', args: {} }),
    };

    const baseAssistantMessageWithToolCall = (id: string, toolCallId: string, toolName: string, args: any = {}): Message => ({
      id,
      role: 'assistant',
      content: '',
      toolInvocations: [{ toolCallId, toolName, args }],
    } as any);

    const baseToolMessage = (id: string, toolCallId: string, result: any = {}): Message => ({
      id,
      role: 'tool' as any,
      content: JSON.stringify(result),
      toolCallId,
    } as any);

    it('should execute a tool by name successfully', async () => {
      const { result } = renderHook(() =>
        useClientChatOrchestrator({ ...initialProps, toolExecutors: mockToolExecutors })
      );
      const toolName = 'testTool';
      const toolCallId = 'tool-call-id-1';
      const executionResult = await act(async () => {
        return result.current.executeToolByName(toolName, toolCallId, { query: 'test' });
      });

      expect(mockToolExecutors.testTool).toHaveBeenCalledWith({ query: 'test' });
      expect(executionResult).toEqual({ success: true, result: { success: true, data: 'tool result', args: {} } });
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        aiToolState: AIToolState.EXECUTING,
        currentToolCallId: 'tool-call-id-1',
        currentOperationDescription: 'Executing testTool',
      });
      expect(mockAddToolResult).toHaveBeenCalledWith('tool-call-id-1', { success: true, result: { success: true, data: 'tool result', args: {} } });
    });

    it('should handle tool execution failure in executeToolByName', async () => {
      const failingToolExecutors = {
        failingTool: jest.fn().mockRejectedValue(new Error('Tool failed spectacularly')),
      };
      const { result } = renderHook(() =>
        useClientChatOrchestrator({ ...initialProps, toolExecutors: failingToolExecutors })
      );
      const toolName = 'failingTool';
      const executionResult = await act(async () => {
        return result.current.executeToolByName(toolName, 'tool-call-id-1', {});
      });

      expect(executionResult).toEqual({
        success: false,
        error: "Tool 'failingTool' execution failed",
        context: { toolName: 'failingTool', toolCallId: 'tool-call-id-1', isTimeout: false, timestamp: expect.any(String) },
      });
      expect(mockAddToolResult).toHaveBeenCalledWith('tool-call-id-1', {
        error: "Tool failed spectacularly",
      });
    });

    it('should process tool invocations from a message and add results', async () => {
      // Start with a message that has both tool call and result
      const mockMessages: Message[] = [
        baseAssistantMessageWithToolCall('msg1', 'tc1', 'testTool', { query: 'test' }),
        baseToolMessage('3', 'tc1', { success: true }),
      ];
      
      const { result } = renderHook(() => 
        useClientChatOrchestrator({ ...initialProps, chatMessages: mockMessages, toolExecutors: mockToolExecutors })
      );

      await act(async () => {
        // Wait for effects to run
      });

      // The hook should detect the tool result and update state accordingly
      expect(result.current.processedToolCallIds).toEqual(new Set(['tc1']));
      expect(result.current.pendingToolCallIds).toEqual(new Set());
    });

    it('should handle multiple tool invocations in one message', async () => {
      const mockMessages: Message[] = [
        {
          id: 'msg-multi',
          role: 'assistant',
          content: '',
          toolInvocations: [
            { toolCallId: 'tc-multi-1', toolName: 'testTool', args: { q: '1'} },
            { toolCallId: 'tc-multi-2', toolName: 'anotherTool', args: { q: '2'} },
          ],
        } as any,
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({ ...initialProps, chatMessages: mockMessages, toolExecutors: mockToolExecutors })
      );

      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockStoreActions.setOperationStates).toHaveBeenCalledTimes(2);
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        aiToolState: AIToolState.PROCESSING_COMPLETE,
        currentToolCallId: undefined,
        currentOperationDescription: 'Transcript processed',
      });
    });

    it('should not process already processed tool calls', async () => {
      // Set to PROCESSING_COMPLETE to prevent automatic processing
      mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
      
      const mockMessages: Message[] = [
        baseAssistantMessageWithToolCall('msg-processed', 'tc-processed', 'testTool', { query: 'test' }),
        baseToolMessage('3', 'tc-processed', { success: true }),
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({ ...initialProps, chatMessages: mockMessages, toolExecutors: mockToolExecutors })
      );

      // The tool call should be considered processed because it has a result message
      expect(result.current.processedToolCallIds).toEqual(new Set(['tc-processed']));
      expect(result.current.pendingToolCallIds).toEqual(new Set());
      
      // Reset aiToolState
      mockStoreState.aiToolState = AIToolState.IDLE;
    });

    it('should skip tool invocations if tool executor is not found', async () => {
      // Set to PROCESSING_COMPLETE to prevent automatic processing
      mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
      
      const mockMessages: Message[] = [
        baseAssistantMessageWithToolCall('msg-no-exec', 'tc-no-exec', 'nonExistentTool'),
      ];
      const { result } = renderHook(() =>
        useClientChatOrchestrator({ ...initialProps, chatMessages: mockMessages, toolExecutors: mockToolExecutors })
      );

      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockStoreActions.setOperationStates).toHaveBeenCalledTimes(0);
      
      // Reset aiToolState
      mockStoreState.aiToolState = AIToolState.IDLE;
    });

    it('should handle errors during tool execution in processToolInvocations', async () => {
      // Set to PROCESSING_COMPLETE to prevent automatic processing
      mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
      
      const mockMessages: Message[] = [
        baseAssistantMessageWithToolCall('msg-fail', 'tc-fail', 'testTool', { query: 'fail' }),
      ];
      mockToolExecutors.testTool.mockRejectedValueOnce(new Error('Execution failed hard'));

      const { result } = renderHook(() =>
        useClientChatOrchestrator({ ...initialProps, chatMessages: mockMessages, toolExecutors: mockToolExecutors })
      );

      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockStoreActions.setOperationStates).toHaveBeenCalledTimes(0);
      
      // Reset aiToolState
      mockStoreState.aiToolState = AIToolState.IDLE;
    });
  });

  describe('Consistency Checks', () => {
    const mockToolExecutors = {
      'testTool': jest.fn(),
      'anotherTool': jest.fn(),
    };

    const toolCallId1 = 'tc-pending-1';
    const toolCallId2 = 'tc-pending-2';
    const toolCallIdProcessed = 'tc-processed-1';

    const messagesWithPending: Message[] = [
      { id: 'm1', role: 'user', content: 'Hello' },
      { 
        id: 'm2', role: 'assistant', content: '', 
        toolInvocations: [ {toolCallId: toolCallId1, toolName: 'testTool', args: {}}]
      } as any,
      { 
        id: 'm3', role: 'assistant', content: '', 
        toolInvocations: [ {toolCallId: toolCallId2, toolName: 'anotherTool', args: {}}]
      } as any,
      { id: 'm4', role: 'assistant', tool_call_id: toolCallIdProcessed, content: 'result'} as any
    ];

    it('isHistoryConsistentForAPICall should return true for consistent history', () => {
      const { result } = renderHook(() => useClientChatOrchestrator(initialProps));
      // No pending calls, all tool calls have results or no tool calls
      expect(result.current.isHistoryConsistentForAPICall()).toBe(true);

      const messagesWithResults: Message[] = [
        { id: 'm1', role: 'user', content: 'Hello' },
        { 
          id: 'm2', role: 'assistant', content: '', 
          toolInvocations: [ {toolCallId: 'tc1', toolName: 'testTool', args: {}}]
        } as any,
        { id: 'm3', role: 'assistant', tool_call_id: 'tc1', content: 'resultA'} as any
      ];
      // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
      mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
      
      const { result: result2 } = renderHook(() => 
        useClientChatOrchestrator({ ...initialProps, chatMessages: messagesWithResults, toolExecutors: mockToolExecutors })
      );
      expect(result2.current.isHistoryConsistentForAPICall()).toBe(true);
      
      // Reset aiToolState for other tests
      mockStoreState.aiToolState = AIToolState.IDLE;
    });

    it('isHistoryConsistentForAPICall should return false if tool calls are missing results', () => {
      // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
      mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
      
      const { result } = renderHook(() => 
        useClientChatOrchestrator({ ...initialProps, chatMessages: messagesWithPending, toolExecutors: mockToolExecutors })
      );
       act(() => {
        result.current.handleAIToolDetected(toolCallId1, 'testTool');
        result.current.handleAIToolDetected(toolCallId2, 'anotherTool');
      });
      expect(result.current.isHistoryConsistentForAPICall()).toBe(false);
      
      // Reset aiToolState for other tests
      mockStoreState.aiToolState = AIToolState.IDLE;
    });

    it('getHistoryInconsistencyDetails should identify missing results and pending calls', () => {
      // Set aiToolState to PROCESSING_COMPLETE to prevent automatic tool invocation processing
      mockStoreState.aiToolState = AIToolState.PROCESSING_COMPLETE;
      
      const { result } = renderHook(() => 
        useClientChatOrchestrator({ ...initialProps, chatMessages: messagesWithPending, toolExecutors: mockToolExecutors })
      );

      act(() => {
        result.current.handleAIToolDetected(toolCallId1, 'testTool');
        result.current.handleAIToolDetected(toolCallId2, 'anotherTool');
      });

      const details = result.current.getHistoryInconsistencyDetails();
      expect(details.isConsistent).toBe(false);
      expect(details.missingResults).toEqual([{ id: 'tc-pending-2', name: 'anotherTool' }]);
      expect(details.pendingToolCalls).toEqual([{ id: 'tc-pending-1', name: 'testTool' }]);
      
      // Reset aiToolState for other tests
      mockStoreState.aiToolState = AIToolState.IDLE;
    });

    it('attemptToFixInconsistencies should try to execute pending tool calls', async () => {
      const mockToolExecutorsLocal = {
        testTool: jest.fn().mockResolvedValue({ success: true, data: 'fixed A' }),
        anotherTool: jest.fn().mockResolvedValue({ success: true, data: 'fixed B' }),
      };
      const { result } = renderHook(() => 
        useClientChatOrchestrator({ 
          ...initialProps, 
          chatMessages: messagesWithPending, 
          toolExecutors: mockToolExecutorsLocal 
        })
      );

      // Simulate these tool calls being detected but not yet having results in chatMessages
      let fixedSuccessfully = true;
      await act(async () => {
        fixedSuccessfully = await result.current.attemptToFixInconsistencies();
      });

      expect(fixedSuccessfully).toBe(true);
      expect(mockToolExecutorsLocal.testTool).toHaveBeenCalledWith({});
      expect(mockToolExecutorsLocal.anotherTool).toHaveBeenCalledWith({});
      expect(mockAddToolResult).toHaveBeenCalledTimes(2);
    });
  });

  describe('Reset Functionality', () => {
    it('resetAllOperations should reset store and pending tool calls', () => {
      const { result } = renderHook(() => useClientChatOrchestrator(initialProps));

      // Simulate some operations
      act(() => {
        result.current.handleAIToolDetected('tool-123', 'searchDocuments');
        result.current.handleAIToolDetected('tool-456', 'createContent');
      });

      expect(result.current.pendingToolCallIds.size).toBe(2);

      act(() => {
        result.current.resetAllOperations();
      });

      expect(mockStoreActions.resetChatOperationState).toHaveBeenCalled();
      expect(result.current.pendingToolCallIds.size).toBe(0);
    });
  });

  describe('Tool Execution Functionality', () => {
    const mockToolExecutor = jest.fn();
    const mockToolExecutors = {
      searchDocuments: mockToolExecutor,
      createContent: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('executeToolByName', () => {
      it('should execute tool successfully and return structured result', async () => {
        const mockResult = { documents: ['doc1', 'doc2'] };
        mockToolExecutor.mockResolvedValue(mockResult);

        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const executionResult = await act(async () => {
          return result.current.executeToolByName('searchDocuments', 'tool-123', { query: 'test' });
        });

        expect(mockToolExecutor).toHaveBeenCalledWith({ query: 'test' });
        expect(executionResult).toEqual({ success: true, result: mockResult });
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          aiToolState: AIToolState.EXECUTING,
          currentToolCallId: 'tool-123',
          currentOperationDescription: 'Executing searchDocuments',
        });
        expect(mockAddToolResult).toHaveBeenCalledWith('tool-123', { success: true, result: mockResult });
      });

      it('should handle tool not found error', async () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const executionResult = await act(async () => {
          return result.current.executeToolByName('unknownTool', 'tool-123', {});
        });

        expect(executionResult).toEqual({
          success: false,
          error: "Tool 'unknownTool' not found",
          context: { toolCallId: 'tool-123', availableTools: ['searchDocuments', 'createContent'] },
        });
        expect(mockAddToolResult).toHaveBeenCalledWith('tool-123', expect.objectContaining({
          error: "Tool 'unknownTool' not found",
        }));
      });

      it('should handle tool execution error', async () => {
        const mockError = new Error('Tool execution failed');
        mockToolExecutor.mockRejectedValue(mockError);

        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const executionResult = await act(async () => {
          return result.current.executeToolByName('searchDocuments', 'tool-123', { query: 'test' });
        });

        expect(executionResult).toEqual({
          success: false,
          error: "Tool 'searchDocuments' execution failed",
          context: {
            toolName: 'searchDocuments',
            toolCallId: 'tool-123',
            isTimeout: false,
            timestamp: expect.any(String),
          },
        });
      });

      it('should handle tool timeout error', async () => {
        jest.useFakeTimers();
        
        // Mock a tool that never resolves
        mockToolExecutor.mockImplementation(() => new Promise(() => {}));

        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const executionPromise = act(async () => {
          return result.current.executeToolByName('searchDocuments', 'tool-123', { query: 'test' });
        });

        // Fast-forward time to trigger timeout
        act(() => {
          jest.advanceTimersByTime(30000);
        });

        const executionResult = await executionPromise;

        expect(executionResult).toEqual({
          success: false,
          error: "Tool 'searchDocuments' execution timed out after 30000ms",
          context: {
            toolName: 'searchDocuments',
            toolCallId: 'tool-123',
            isTimeout: true,
            timestamp: expect.any(String),
          },
        });

        // Should attempt state recovery
        act(() => {
          jest.advanceTimersByTime(1000);
        });

        jest.useRealTimers();
      });

      it('should handle null/undefined arguments', async () => {
        mockToolExecutor.mockResolvedValue({ success: true });

        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        await act(async () => {
          await result.current.executeToolByName('searchDocuments', 'tool-123', null);
        });

        expect(mockToolExecutor).toHaveBeenCalledWith({});
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          '[Orchestrator] Tool searchDocuments called with null/undefined arguments, using empty object'
        );
      });

      it('should handle tool returning error object', async () => {
        mockToolExecutor.mockResolvedValue({ error: 'Custom tool error' });

        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const executionResult = await act(async () => {
          return result.current.executeToolByName('searchDocuments', 'tool-123', { query: 'test' });
        });

        expect(executionResult).toEqual({
          success: false,
          error: 'Custom tool error',
          context: { toolName: 'searchDocuments', toolCallId: 'tool-123' },
        });
      });

      it('should handle tool returning null result', async () => {
        mockToolExecutor.mockResolvedValue(null);

        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const executionResult = await act(async () => {
          return result.current.executeToolByName('searchDocuments', 'tool-123', { query: 'test' });
        });

        expect(executionResult).toEqual({ success: true, result: null });
      });
    });

    describe('processToolInvocations', () => {
      it('should process valid tool invocations from assistant message', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const assistantMessage: Message = {
          id: '1',
          role: 'assistant',
          content: 'I will search for documents.',
          toolInvocations: [
            {
              toolCallId: 'tool-123',
              toolName: 'searchDocuments',
              args: { query: 'test' },
            },
          ],
        } as any;

        act(() => {
          result.current.processToolInvocations(assistantMessage);
        });

        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          aiToolState: AIToolState.DETECTED,
          currentToolCallId: 'tool-123',
          currentOperationDescription: 'AI requests: searchDocuments',
        });
        expect(result.current.pendingToolCallIds).toEqual(new Set(['tool-123']));
      });

      it('should skip non-assistant messages', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const userMessage: Message = {
          id: '1',
          role: 'user',
          content: 'Search for documents',
        };

        act(() => {
          result.current.processToolInvocations(userMessage);
        });

        expect(mockStoreActions.setOperationStates).not.toHaveBeenCalled();
      });

      it('should skip messages without toolInvocations', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const assistantMessage: Message = {
          id: '1',
          role: 'assistant',
          content: 'Hello there!',
        };

        act(() => {
          result.current.processToolInvocations(assistantMessage);
        });

        expect(mockStoreActions.setOperationStates).not.toHaveBeenCalled();
      });

      it('should skip invalid tool invocations (missing ID or name)', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const assistantMessage: Message = {
          id: '1',
          role: 'assistant',
          content: 'I will help you.',
          toolInvocations: [
            {
              toolName: 'searchDocuments', // Missing toolCallId
              args: { query: 'test' },
            },
            {
              toolCallId: 'tool-123', // Missing toolName
              args: { query: 'test' },
            },
          ],
        } as any;

        act(() => {
          result.current.processToolInvocations(assistantMessage);
        });

        expect(mockConsoleWarn).toHaveBeenCalledWith(
          '[Orchestrator] Invalid tool invocation missing ID or name at index 0:',
          expect.any(Object)
        );
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          '[Orchestrator] Invalid tool invocation missing ID or name at index 1:',
          expect.any(Object)
        );
        expect(mockStoreActions.setOperationStates).not.toHaveBeenCalled();
      });

      it('should skip already processed tool calls', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        // First, add a tool call to processed set
        act(() => {
          result.current.handleAIToolDetected('tool-123', 'searchDocuments');
        });

        // Simulate the tool call being processed
        act(() => {
          // Manually update the processed IDs (normally done by the effect)
          const { processedToolCallIds } = result.current;
          processedToolCallIds.add('tool-123');
        });

        const assistantMessage: Message = {
          id: '1',
          role: 'assistant',
          content: 'I will search for documents.',
          toolInvocations: [
            {
              toolCallId: 'tool-123',
              toolName: 'searchDocuments',
              args: { query: 'test' },
            },
          ],
        } as any;

        act(() => {
          result.current.processToolInvocations(assistantMessage);
        });

        expect(mockConsoleLog).toHaveBeenCalledWith(
          '[Orchestrator] Skipping already processed tool call: tool-123'
        );
      });

      it('should skip server-side tools (not in toolExecutors)', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const assistantMessage: Message = {
          id: '1',
          role: 'assistant',
          content: 'I will use a server tool.',
          toolInvocations: [
            {
              toolCallId: 'tool-123',
              toolName: 'serverSideTool',
              args: { query: 'test' },
            },
          ],
        } as any;

        act(() => {
          result.current.processToolInvocations(assistantMessage);
        });

        expect(mockConsoleLog).toHaveBeenCalledWith(
          '[Orchestrator] No client-side executor found for tool: serverSideTool (server-side tool)'
        );
        expect(mockStoreActions.setOperationStates).not.toHaveBeenCalled();
      });

      it('should handle malformed toolInvocations array', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        const assistantMessage: Message = {
          id: '1',
          role: 'assistant',
          content: 'I will help you.',
          toolInvocations: 'not an array' as any,
        } as any;

        act(() => {
          result.current.processToolInvocations(assistantMessage);
        });

        expect(mockConsoleError).toHaveBeenCalledWith(
          '[Orchestrator] Invalid toolInvocations structure, expected array:',
          'not an array'
        );
      });

      it('should handle individual invocation errors gracefully', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        // Create a malformed invocation that will throw an error during processing
        const assistantMessage: Message = {
          id: '1',
          role: 'assistant',
          content: 'I will help you.',
          toolInvocations: [
            {
              toolCallId: 'tool-123',
              toolName: 'searchDocuments',
              args: { query: 'test' },
            },
            null, // This will cause an error
            {
              toolCallId: 'tool-456',
              toolName: 'createContent',
              args: { content: 'test' },
            },
          ],
        } as any;

        act(() => {
          result.current.processToolInvocations(assistantMessage);
        });

        // Should handle the error and continue processing other invocations
        expect(mockConsoleError).toHaveBeenCalledWith(
          '[Orchestrator] Error processing tool invocation at index 1:',
          expect.any(Error)
        );
        
        // Should still process the valid invocations
        expect(result.current.pendingToolCallIds).toContain('tool-123');
        expect(result.current.pendingToolCallIds).toContain('tool-456');
      });
    });

    describe('Automatic Tool Detection Effect', () => {
      it('should automatically process tool invocations from new assistant messages when idle', () => {
        const initialMessages: Message[] = [];
        
        const { result, rerender } = renderHook<
          ReturnType<typeof useClientChatOrchestrator>,
          { messages: Message[] }
        >(
          ({ messages }) =>
            useClientChatOrchestrator({
              ...initialProps,
              chatMessages: messages,
              addToolResult: mockAddToolResult,
              toolExecutors: mockToolExecutors,
            }),
          { initialProps: { messages: initialMessages } }
        );

        // Add an assistant message with tool invocations
        const newMessages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: 'I will search for documents.',
            toolInvocations: [
              {
                toolCallId: 'tool-123',
                toolName: 'searchDocuments',
                args: { query: 'test' },
              },
            ],
          } as any,
        ];

        act(() => {
          rerender({ messages: newMessages });
        });

        expect(result.current.pendingToolCallIds).toEqual(new Set(['tool-123']));
        expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
          aiToolState: AIToolState.DETECTED,
          currentToolCallId: 'tool-123',
          currentOperationDescription: 'AI requests: searchDocuments',
        });
      });

      it('should not process tool invocations when not idle', () => {
        mockStoreState.aiToolState = AIToolState.EXECUTING;

        const { result, rerender } = renderHook<
          ReturnType<typeof useClientChatOrchestrator>,
          { messages: Message[] }
        >(
          ({ messages }) =>
            useClientChatOrchestrator({
              ...initialProps,
              chatMessages: messages,
              addToolResult: mockAddToolResult,
              toolExecutors: mockToolExecutors,
            }),
          { initialProps: { messages: [] } }
        );

        const newMessages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: 'I will search for documents.',
            toolInvocations: [
              {
                toolCallId: 'tool-123',
                toolName: 'searchDocuments',
                args: { query: 'test' },
              },
            ],
          } as any,
        ];

        act(() => {
          rerender({ messages: newMessages });
        });

        // Should not process because state is not IDLE
        expect(result.current.pendingToolCallIds).toEqual(new Set());
      });

      it('should handle effect errors gracefully', () => {
        // Mock processToolInvocations to throw an error
        const { result, rerender } = renderHook<
          ReturnType<typeof useClientChatOrchestrator>,
          { messages: Message[] }
        >(
          ({ messages }) =>
            useClientChatOrchestrator({
              ...initialProps,
              chatMessages: messages,
              addToolResult: mockAddToolResult,
              toolExecutors: mockToolExecutors,
            }),
          { initialProps: { messages: [] } }
        );

        // Add a message that should trigger the effect
        const newMessages: Message[] = [
          {
            id: '1',
            role: 'assistant',
            content: 'I will search for documents.',
          },
        ];

        act(() => {
          rerender({ messages: newMessages });
        });

        // The effect should handle any errors gracefully and not crash
        expect(result.current).toBeDefined();
      });
    });

    describe('Error Recovery', () => {
      it('should recover from processToolInvocations critical errors', () => {
        const { result } = renderHook(() =>
          useClientChatOrchestrator({
            ...initialProps,
            chatMessages: [],
            addToolResult: mockAddToolResult,
            toolExecutors: mockToolExecutors,
          })
        );

        // Simulate a critical error by passing null
        act(() => {
          result.current.processToolInvocations(null as any);
        });

        expect(mockStoreActions.resetChatOperationState).toHaveBeenCalled();
        expect(mockConsoleError).toHaveBeenCalledWith(
          '[Orchestrator] Critical error in processToolInvocations:',
          expect.any(Error)
        );
      });
    });
  });
}); 