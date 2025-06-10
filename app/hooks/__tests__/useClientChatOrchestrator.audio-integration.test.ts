import { renderHook, act } from '@testing-library/react';
import { useClientChatOrchestrator } from '../useClientChatOrchestrator';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { AudioRecorder } from '@/lib/audio/AudioRecorder';
import { transcribeAudio } from '@/lib/audio/AudioTranscriptionService';
import { AIToolState, AudioState, FileUploadState } from '@/app/lib/clientChatOperationState';

// Mock the store
jest.mock('@/lib/stores/useClientChatOperationStore');

// Mock the audio services  
jest.mock('@/lib/audio/AudioRecorder');
jest.mock('@/lib/audio/AudioTranscriptionService');

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

// Mock timers
jest.useFakeTimers();

describe('Audio Integration Tests', () => {
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

  // Mock functions
  const mockAddToolResult = jest.fn();
  const mockSetInputValue = jest.fn();

  // Audio test data
  const mockAudioBlob = new Blob(['mock audio data'], { type: 'audio/wav' });
  const mockTranscript = 'Hello, this is a test transcript';

  // Mock AudioRecorder instance
  const mockAudioRecorderInstance = {
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    getIsRecording: jest.fn(),
    cleanup: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Reset store state
    Object.assign(mockStoreState, {
      aiToolState: AIToolState.IDLE,
      audioState: AudioState.IDLE,
      fileUploadState: FileUploadState.IDLE,
      currentToolCallId: undefined,
      currentOperationDescription: undefined,
    });

    // Mock the store hook
    (useClientChatOperationStore as jest.MockedFunction<typeof useClientChatOperationStore>).mockImplementation((selector?: any) => {
      if (selector) {
        return selector({ ...mockStoreState, ...mockStoreActions });
      }
      return { ...mockStoreState, ...mockStoreActions };
    });

    // Mock AudioRecorder constructor
    (AudioRecorder as jest.MockedClass<typeof AudioRecorder>).mockImplementation(() => mockAudioRecorderInstance as any);
    
    // Mock transcription service
    (transcribeAudio as jest.MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscript);
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
    jest.useRealTimers();
  });

  describe('End-to-End Audio Recording and Transcription', () => {
    it('should complete the full audio workflow successfully', async () => {
      // Setup mocks for successful flow
      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording.mockResolvedValue(mockAudioBlob);

      const audioRecorder = new AudioRecorder();
      
      const startRecording = async () => {
        await audioRecorder.startRecording();
      };
      
      const stopRecording = async () => {
        return await audioRecorder.stopRecording();
      };

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      // Step 1: Start recording
      await act(async () => {
        await result.current.handleAudioRecordingStart();
      });

      expect(mockAudioRecorderInstance.startRecording).toHaveBeenCalled();
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.RECORDING,
        currentOperationDescription: 'Recording audio...',
      });

      // Step 2: Complete the full audio flow (stop + transcribe)
      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockAudioRecorderInstance.stopRecording).toHaveBeenCalled();
      expect(transcribeAudio).toHaveBeenCalledWith(mockAudioBlob);
      expect(mockSetInputValue).toHaveBeenCalledWith(mockTranscript);

      // Verify state transitions
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.TRANSCRIBING,
        currentOperationDescription: 'Transcribing audio...',
      });
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.TRANSCRIPT_READY_FOR_INPUT,
        currentOperationDescription: 'Transcript ready',
      });
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.PROCESSING_COMPLETE,
        currentOperationDescription: 'Transcript processed',
      });

      // Fast-forward timers for final state reset
      act(() => {
        jest.runAllTimers();
      });

      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined,
      });
    });

    it('should handle multiple recording sessions correctly', async () => {
      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording
        .mockResolvedValueOnce(mockAudioBlob)
        .mockResolvedValueOnce(new Blob(['second recording'], { type: 'audio/wav' }));

      (transcribeAudio as jest.MockedFunction<typeof transcribeAudio>)
        .mockResolvedValueOnce('First transcript')
        .mockResolvedValueOnce('Second transcript');

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      // First recording session
      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockSetInputValue).toHaveBeenCalledWith('First transcript');

      // Fast-forward to reset state
      act(() => {
        jest.runAllTimers();
      });

      // Second recording session
      jest.clearAllMocks();
      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockSetInputValue).toHaveBeenCalledWith('Second transcript');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle microphone permission denial', async () => {
      const permissionError = new Error('Permission denied');
      mockAudioRecorderInstance.startRecording.mockRejectedValue(permissionError);

      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      await act(async () => {
        await result.current.handleAudioRecordingStart();
      });

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[Orchestrator] Failed to start recording:',
        permissionError
      );
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined,
      });
    });

    it('should handle audio device disconnection during recording', async () => {
      const deviceError = new Error('Device disconnected');
      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording.mockRejectedValue(deviceError);

      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      // Start recording successfully
      await act(async () => {
        await result.current.handleAudioRecordingStart();
      });

      // Attempt to stop recording fails
      await act(async () => {
        const result_blob = await result.current.handleAudioRecordingStop();
        expect(result_blob).toBeNull();
      });

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[Orchestrator] Failed to stop recording:',
        deviceError
      );
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined,
      });
    });

    it('should handle transcription API failures', async () => {
      const transcriptionError = new Error('Transcription service unavailable');
      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording.mockResolvedValue(mockAudioBlob);
      (transcribeAudio as jest.MockedFunction<typeof transcribeAudio>).mockRejectedValue(transcriptionError);

      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[Orchestrator] Audio transcription process resulted in error:',
        transcriptionError
      );
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined,
      });
      expect(mockSetInputValue).not.toHaveBeenCalled();
    });

    it('should handle empty or corrupted audio data', async () => {
      const emptyBlob = new Blob([], { type: 'audio/wav' });
      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording.mockResolvedValue(emptyBlob);
      (transcribeAudio as jest.MockedFunction<typeof transcribeAudio>).mockResolvedValue('');

      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[Orchestrator] Transcription returned null or empty in complete flow.'
      );
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined,
      });
      expect(mockSetInputValue).not.toHaveBeenCalled();
    });

    it('should handle network failures during transcription', async () => {
      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording.mockResolvedValue(mockAudioBlob);
      (transcribeAudio as jest.MockedFunction<typeof transcribeAudio>).mockRejectedValue(
        new Error('Network error: fetch failed')
      );

      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[Orchestrator] Audio transcription process resulted in error:',
        expect.objectContaining({
          message: 'Network error: fetch failed',
        })
      );
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined,
      });
    });
  });

  describe('State Management Integration', () => {
    it('should properly synchronize audio state with other operation states', async () => {
      // Set initial state to simulate an ongoing AI tool operation
      Object.assign(mockStoreState, {
        aiToolState: AIToolState.EXECUTING,
        currentToolCallId: 'tool-123',
      });

      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording.mockResolvedValue(mockAudioBlob);

      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      // Audio operations should still work despite other operations running
      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(mockSetInputValue).toHaveBeenCalledWith(mockTranscript);
      // Audio state should be updated independently
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith(
        expect.objectContaining({
          audioState: AudioState.PROCESSING_COMPLETE,
        })
      );
    });

    it('should reset audio state on operation reset', async () => {
      Object.assign(mockStoreState, {
        audioState: AudioState.TRANSCRIBING,
      });

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording: jest.fn(),
          stopRecording: jest.fn(),
          transcribeAudio,
        })
      );

      act(() => {
        result.current.resetAllOperations();
      });

      expect(mockStoreActions.resetChatOperationState).toHaveBeenCalled();
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle large audio files efficiently', async () => {
      // Create a large mock blob (simulating a long recording)
      const largeAudioBlob = new Blob([new ArrayBuffer(50 * 1024 * 1024)], { 
        type: 'audio/wav' 
      }); // 50MB file

      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording.mockResolvedValue(largeAudioBlob);
      (transcribeAudio as jest.MockedFunction<typeof transcribeAudio>).mockResolvedValue('Large file transcript');

      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      const { result } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      expect(transcribeAudio).toHaveBeenCalledWith(largeAudioBlob);
      expect(mockSetInputValue).toHaveBeenCalledWith('Large file transcript');
    });

    it('should clean up resources properly after operations', async () => {
      mockAudioRecorderInstance.startRecording.mockResolvedValue(undefined);
      mockAudioRecorderInstance.stopRecording.mockResolvedValue(mockAudioBlob);

      const audioRecorder = new AudioRecorder();
      const startRecording = () => audioRecorder.startRecording();
      const stopRecording = () => audioRecorder.stopRecording();

      const { result, unmount } = renderHook(() =>
        useClientChatOrchestrator({
          chatMessages: [],
          addToolResult: mockAddToolResult,
          setInputValue: mockSetInputValue,
          startRecording,
          stopRecording,
          transcribeAudio,
        })
      );

      await act(async () => {
        await result.current.handleCompleteAudioFlow();
      });

      // Fast-forward timers to complete all operations
      act(() => {
        jest.runAllTimers();
      });

      // Unmount the component
      unmount();

      // Verify resources are cleaned up (AudioRecorder should handle its own cleanup)
      expect(mockStoreActions.setOperationStates).toHaveBeenCalledWith({
        audioState: AudioState.IDLE,
        currentOperationDescription: undefined,
      });
    });
  });
});
