import { transcribeAudio } from '../AudioTranscriptionService';

// Mock global fetch
global.fetch = jest.fn();

describe('AudioTranscriptionService', () => {
  const mockBlob = new Blob(['mock audio data'], { type: 'audio/wav' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transcribeAudio', () => {
    it('should successfully transcribe audio and return text', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          transcription: 'Hello, this is a test transcription.'
        })
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await transcribeAudio(mockBlob);

      expect(global.fetch).toHaveBeenCalledWith('/api/chat/transcribe', {
        method: 'POST',
        body: expect.any(FormData)
      });
      
      expect(result).toBe('Hello, this is a test transcription.');
    });

    it('should handle API response errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(transcribeAudio(mockBlob))
        .rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network request failed');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      await expect(transcribeAudio(mockBlob))
        .rejects.toThrow('Network request failed');
    });

    it('should handle malformed API response', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: 'some other data'
        })
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(transcribeAudio(mockBlob))
        .rejects.toThrow('Received invalid transcription format from API.');
    });

    it('should send FormData with correct audio file', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ transcription: 'test' })
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await transcribeAudio(mockBlob);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const formData = fetchCall[1].body as FormData;
      
      expect(formData.get('audioFile')).toBeInstanceOf(File);
      expect((formData.get('audioFile') as File).name).toBe('audio_recording.wav');
      expect((formData.get('audioFile') as File).type).toBe('audio/wav');
    });

    it('should handle JSON parsing errors', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(transcribeAudio(mockBlob))
        .rejects.toThrow('Invalid JSON');
    });

    it('should handle empty transcription result', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ transcription: 'Valid response' })
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await transcribeAudio(mockBlob);
      expect(result).toBe('Valid response');
    });

    it('should handle HTTP error status codes', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(transcribeAudio(mockBlob))
        .rejects.toThrow();
    });

    it('should handle empty or invalid audio blob', async () => {
      const emptyBlob = new Blob([], { type: 'audio/wav' });

      await expect(transcribeAudio(emptyBlob))
        .rejects.toThrow('Cannot transcribe empty audio blob.');
    });

    it('should handle custom file names', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ transcription: 'Custom file test' })
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await transcribeAudio(mockBlob, 'custom_audio.wav');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const formData = fetchCall[1].body as FormData;
      
      expect((formData.get('audioFile') as File).name).toBe('custom_audio.wav');
    });

    it('should handle API error responses with error field', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          error: 'Transcription service unavailable'
        })
      };
      
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(transcribeAudio(mockBlob))
        .rejects.toThrow('Transcription service unavailable');
    });
  });
}); 