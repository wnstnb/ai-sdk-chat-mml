class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._buffer = [];
    this._isRecording = false;

    this.port.onmessage = (event) => {
      if (event.data.command === 'start') {
        this._isRecording = true;
        this._buffer = []; // Clear buffer on start
        console.log('[Worklet] Recording started');
      } else if (event.data.command === 'stop') {
        this._isRecording = false;
        console.log('[Worklet] Recording stopped');
        // Optionally, send any remaining buffered data if necessary
        // For this example, we assume data is sent periodically in process()
      }
    };
  }

  process(inputs, outputs, parameters) {
    // We expect a single input, and the first channel of that input.
    const inputChannelData = inputs[0] && inputs[0][0];

    if (this._isRecording && inputChannelData) {
      // Create a copy of the Float32Array to send, as the underlying ArrayBuffer may be reused.
      const pcmData = new Float32Array(inputChannelData);
      this.port.postMessage({ audioData: pcmData });
    }

    // Return true to keep the processor alive.
    return true;
  }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor); 