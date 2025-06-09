import { AudioRecorder } from '../AudioRecorder';

// Mock Web APIs
const mockMediaDevices = {
  getUserMedia: jest.fn(),
};

const mockAudioContext = {
  resume: jest.fn(),
  state: 'running',
  sampleRate: 44100,
  audioWorklet: {
    addModule: jest.fn(),
  },
  createMediaStreamSource: jest.fn(),
  destination: {},
  close: jest.fn(),
};

const mockAudioWorkletNode = {
  port: {
    postMessage: jest.fn(),
    close: jest.fn(),
    onmessage: null,
  },
  connect: jest.fn(),
  disconnect: jest.fn(),
};

const mockMediaStream = {
  getTracks: jest.fn(() => [
    { stop: jest.fn() },
    { stop: jest.fn() },
  ]),
};

const mockMediaStreamSource = {
  connect: jest.fn(),
};

// Global mocks
global.AudioContext = jest.fn(() => mockAudioContext) as any;
global.AudioWorkletNode = jest.fn(() => mockAudioWorkletNode) as any;

// Mock navigator with proper structure
Object.defineProperty(global, 'navigator', {
  value: {
    mediaDevices: mockMediaDevices,
  },
  writable: true,
});

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('AudioRecorder', () => {
  let audioRecorder: AudioRecorder;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mocks
    mockMediaDevices.getUserMedia.mockResolvedValue(mockMediaStream);
    mockAudioContext.resume.mockResolvedValue(undefined);
    mockAudioContext.audioWorklet.addModule.mockResolvedValue(undefined);
    mockAudioContext.createMediaStreamSource.mockReturnValue(mockMediaStreamSource);

    audioRecorder = new AudioRecorder();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  describe('Initialization', () => {
    it('should create an AudioRecorder instance', () => {
      expect(audioRecorder).toBeInstanceOf(AudioRecorder);
      expect(audioRecorder.getIsRecording()).toBe(false);
    });
  });

  describe('startRecording', () => {
    it('should initialize audio and start recording successfully', async () => {
      await audioRecorder.startRecording();

      expect(global.AudioContext).toHaveBeenCalled();
      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalledWith('/audio-recorder-processor.js');
      expect(global.AudioWorkletNode).toHaveBeenCalledWith(mockAudioContext, 'audio-recorder-processor');
      expect(mockMediaStreamSource.connect).toHaveBeenCalledWith(mockAudioWorkletNode);
      expect(mockAudioWorkletNode.port.postMessage).toHaveBeenCalledWith({ command: 'start' });
      expect(audioRecorder.getIsRecording()).toBe(true);
    });

    it('should resume suspended audio context', async () => {
      mockAudioContext.state = 'suspended';

      await audioRecorder.startRecording();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('should not start recording if already recording', async () => {
      await audioRecorder.startRecording();
      jest.clearAllMocks();

      await audioRecorder.startRecording();

      expect(mockConsoleWarn).toHaveBeenCalledWith('Recording is already in progress.');
      expect(mockMediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it('should handle getUserMedia failure', async () => {
      const permissionError = new Error('Permission denied');
      mockMediaDevices.getUserMedia.mockRejectedValue(permissionError);

      await expect(audioRecorder.startRecording()).rejects.toThrow('Permission denied');
      expect(mockConsoleError).toHaveBeenCalledWith('Error initializing audio:', permissionError);
    });

    it('should handle AudioWorklet loading failure', async () => {
      const workletError = new Error('Failed to load worklet');
      mockAudioContext.audioWorklet.addModule.mockRejectedValue(workletError);

      await expect(audioRecorder.startRecording()).rejects.toThrow('Failed to load worklet');
      expect(mockConsoleError).toHaveBeenCalledWith('Error initializing audio:', workletError);
    });
  });

  describe('stopRecording', () => {
    beforeEach(async () => {
      await audioRecorder.startRecording();
      jest.clearAllMocks();
    });

    it('should stop recording and return audio blob', async () => {
      // Mock audio data reception
      const mockAudioData = new Float32Array([0.1, 0.2, 0.3]);
      setTimeout(() => {
        const messageHandler = (mockAudioWorkletNode.port as any).onmessage;
        if (messageHandler) {
          messageHandler({ data: { audioData: mockAudioData } });
        }
      }, 50);

      const blob = await audioRecorder.stopRecording();

      expect(mockAudioWorkletNode.port.postMessage).toHaveBeenCalledWith({ command: 'stop' });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob?.type).toBe('audio/wav');
      expect(audioRecorder.getIsRecording()).toBe(false);
    });

    it('should return null if not recording', async () => {
      // Stop recording first
      await audioRecorder.stopRecording();
      
      const blob = await audioRecorder.stopRecording();

      expect(blob).toBeNull();
      expect(mockConsoleWarn).toHaveBeenCalledWith('Recording is not in progress or audio not initialized.');
    });

    it('should handle cleanup after stopping', async () => {
      const blob = await audioRecorder.stopRecording();

      expect(mockMediaStream.getTracks()[0].stop).toHaveBeenCalled();
      expect(mockMediaStream.getTracks()[1].stop).toHaveBeenCalled();
      expect(mockAudioWorkletNode.port.close).toHaveBeenCalled();
      expect(mockAudioWorkletNode.disconnect).toHaveBeenCalled();
    });
  });

  describe('Audio Data Processing', () => {
    beforeEach(async () => {
      await audioRecorder.startRecording();
    });

    it('should process audio data messages from worklet', async () => {
      const mockAudioData1 = new Float32Array([0.1, 0.2]);
      const mockAudioData2 = new Float32Array([0.3, 0.4]);

      // Simulate worklet sending audio data
      const messageHandler = (mockAudioWorkletNode.port as any).onmessage;
      if (messageHandler) {
        messageHandler({ data: { audioData: mockAudioData1 } });
        messageHandler({ data: { audioData: mockAudioData2 } });
      }

      const blob = await audioRecorder.stopRecording();

      expect(blob).toBeInstanceOf(Blob);
      expect(blob?.size).toBeGreaterThan(0);
    });

    it('should create valid WAV blob with correct headers', async () => {
      const mockAudioData = new Float32Array(1024); // 1024 samples
      mockAudioData.fill(0.5); // Fill with test data

      const messageHandler = (mockAudioWorkletNode.port as any).onmessage;
      if (messageHandler) {
        messageHandler({ data: { audioData: mockAudioData } });
      }

      const blob = await audioRecorder.stopRecording();

      expect(blob).toBeInstanceOf(Blob);
      expect(blob?.type).toBe('audio/wav');
      
      // WAV file should be larger than just the audio data due to headers
      const expectedMinSize = 44 + (mockAudioData.length * 2); // 44 byte header + 16-bit PCM data
      expect(blob?.size).toBeGreaterThanOrEqual(expectedMinSize);
    });
  });

  describe('Error Handling', () => {
    it('should handle worklet message errors gracefully', async () => {
      await audioRecorder.startRecording();

      // Simulate invalid message
      const messageHandler = (mockAudioWorkletNode.port as any).onmessage;
      if (messageHandler) {
        messageHandler({ data: {} });
      }

      const blob = await audioRecorder.stopRecording();
      expect(blob).toBeInstanceOf(Blob); // Should still work even with invalid messages
    });

    it('should clean up resources on initialization failure', async () => {
      const setupError = new Error('Setup failed');
      mockAudioContext.createMediaStreamSource.mockImplementation(() => {
        throw setupError;
      });

      await expect(audioRecorder.startRecording()).rejects.toThrow('Setup failed');
      
      // Cleanup should have been called
      expect(mockMediaStream.getTracks()[0].stop).toHaveBeenCalled();
    });
  });

  describe('getIsRecording', () => {
    it('should return false initially', () => {
      expect(audioRecorder.getIsRecording()).toBe(false);
    });

    it('should return true while recording', async () => {
      await audioRecorder.startRecording();
      expect(audioRecorder.getIsRecording()).toBe(true);
    });

    it('should return false after stopping', async () => {
      await audioRecorder.startRecording();
      await audioRecorder.stopRecording();
      expect(audioRecorder.getIsRecording()).toBe(false);
    });
  });
}); 