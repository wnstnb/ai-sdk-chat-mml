export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private recordedChunks: Float32Array[] = [];
  private isRecording: boolean = false;

  constructor() {
    // Constructor logic can be added later if needed
  }

  private async initializeAudio(): Promise<void> {
    if (this.audioContext) {
      return;
    }

    try {
      this.audioContext = new AudioContext();
      // Ensure AudioContext is resumed (for browser autoplay policies)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Load the AudioWorklet processor
      // The path might need adjustment based on the build process and public serving directory
      await this.audioContext.audioWorklet.addModule('/audio-recorder-processor.js'); // Placeholder path

      const mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-recorder-processor');

      // Connect the source to the worklet node
      mediaStreamSource.connect(this.workletNode);

      // The worklet node might not need to connect to the destination if it only sends data back
      // this.workletNode.connect(this.audioContext.destination);

      this.workletNode.port.onmessage = (event) => {
        if (event.data.audioData) {
          this.recordedChunks.push(event.data.audioData);
        }
      };

    } catch (error) {
      console.error("Error initializing audio:", error);
      this.cleanup();
      throw error; // Re-throw the error for the caller to handle
    }
  }

  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.warn("Recording is already in progress.");
      return;
    }

    try {
      await this.initializeAudio();
      if (!this.audioContext || !this.workletNode) {
        throw new Error("Audio context or worklet node not initialized.");
      }
      
      this.recordedChunks = [];
      this.isRecording = true;
      this.workletNode.port.postMessage({ command: 'start' });
      console.log("Recording started.");
    } catch (error) {
      console.error("Failed to start recording:", error);
      this.cleanup(); // Ensure cleanup on failure
      throw error;
    }
  }

  public async stopRecording(): Promise<Blob | null> {
    if (!this.isRecording || !this.audioContext || !this.workletNode) {
      console.warn("Recording is not in progress or audio not initialized.");
      return null;
    }

    return new Promise((resolve) => {
      this.workletNode!.port.postMessage({ command: 'stop' });
      this.isRecording = false;
      console.log("Recording stopped. Processing data...");

      // Give a brief moment for any final data to arrive from the worklet
      setTimeout(() => {
        const audioBlob = this.createWavBlob(this.recordedChunks, this.audioContext!.sampleRate);
        this.cleanup(); // Cleanup resources after processing
        resolve(audioBlob);
      }, 100); // Adjust delay if necessary
    });
  }

  private cleanup(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.workletNode) {
      this.workletNode.port.close();
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    // Do not close audioContext here if it might be reused.
    // If it's single-use per recording session, it can be closed.
    // For now, let's assume it might be reused or managed externally if part of a larger system.
    // if (this.audioContext && this.audioContext.state !== 'closed') {
    //   this.audioContext.close().then(() => console.log("AudioContext closed."));
    //   this.audioContext = null;
    // }
    this.isRecording = false;
    this.recordedChunks = []; // Clear any stored chunks
    console.log("Audio resources cleaned up.");
  }

  // Placeholder for WAV conversion logic
  private createWavBlob(audioDataArrays: Float32Array[], sampleRate: number): Blob {
    // Combine all chunks into a single Float32Array
    let totalLength = 0;
    audioDataArrays.forEach(arr => totalLength += arr.length);
    const combinedData = new Float32Array(totalLength);
    let offset = 0;
    audioDataArrays.forEach(arr => {
      combinedData.set(arr, offset);
      offset += arr.length;
    });

    // WAV encoding logic (simplified, for a more robust solution, a library might be better)
    const numChannels = 1; // Mono
    const bitsPerSample = 16; // 16-bit PCM
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;

    const dataSize = combinedData.length * bitsPerSample / 8;
    const fileSize = 36 + dataSize; // 36 bytes for WAV header (RIFF chunk descriptor + FMT sub-chunk)

    const buffer = new ArrayBuffer(44 + dataSize); // 44 for a more complete header
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    let pcmOffset = 44;
    for (let i = 0; i < combinedData.length; i++, pcmOffset += 2) {
      let s = Math.max(-1, Math.min(1, combinedData[i]));
      view.setInt16(pcmOffset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    function writeString(view: DataView, offset: number, string: string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }
    
    console.log(`Creating WAV blob with ${combinedData.length} samples at ${sampleRate} Hz.`);
    return new Blob([view], { type: 'audio/wav' });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
} 