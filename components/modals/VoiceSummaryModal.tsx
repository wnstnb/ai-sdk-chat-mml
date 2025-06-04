import React from 'react';
import { useModalStore } from '@/stores/useModalStore';
import { X, Mic, Square as StopIcon, FileText as NotesIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { generateNotesFromTranscript } from '@/lib/ai/notesService';

interface VoiceSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialTranscriptionPlaceholder = 'Transcription will appear here once recording starts...';

// JavaScript code for the AudioWorkletProcessor
const audioProcessorWorkletCode = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = options.processorOptions.bufferSize || 4096;
    this._buffer = new Float32Array(this.bufferSize);
    this._pos = 0;
  }
  static get parameterDescriptors() { return []; }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const inputChannelData = input[0];
      for (let i = 0; i < inputChannelData.length; i++) {
        this._buffer[this._pos++] = inputChannelData[i];
        if (this._pos === this.bufferSize) {
          const int16Pcm = new Int16Array(this.bufferSize);
          for (let j = 0; j < this.bufferSize; j++) {
            let s = Math.max(-1, Math.min(1, this._buffer[j]));
            int16Pcm[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          this.port.postMessage(int16Pcm.buffer, [int16Pcm.buffer]);
          this._pos = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
`;

const ActualVoiceSummaryModal: React.FC<VoiceSummaryModalProps> = ({ isOpen, onClose }) => {
  const isRecording = useModalStore(state => state.voiceSummary.isRecording);
  const transcription = useModalStore(state => state.voiceSummary.transcription);
  const legacySummary = useModalStore(state => state.voiceSummary.legacySummary);

  const [generatedNotes, setGeneratedNotes] = React.useState<string | null>(null);
  const [isGeneratingNotes, setIsGeneratingNotes] = React.useState<boolean>(false);
  const [notesError, setNotesError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<string>("transcription");

  const toggleVoiceSummaryRecording = useModalStore(state => state.toggleVoiceSummaryRecording);
  const setVoiceSummaryTranscription = useModalStore(state => state.setVoiceSummaryTranscription);
  const setVoiceSummaryLegacySummary = useModalStore(state => state.setVoiceSummaryLegacySummary);

  const micButtonRef = React.useRef<HTMLButtonElement>(null);
  const modalContentRef = React.useRef<HTMLDivElement>(null);
  const webSocketRef = React.useRef<WebSocket | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = React.useRef<AudioWorkletNode | null>(null);
  const microphoneSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const localMediaStreamRef = React.useRef<MediaStream | null>(null);
  const reconnectionAttemptsRef = React.useRef<number>(0);

  const finalizedTranscriptContent = React.useRef<string>('');
  const currentUtteranceContent = React.useRef<string>('');

  const MAX_RECONNECTION_ATTEMPTS = 3;
  const RECONNECTION_DELAY_BASE = 2000;
  const AUDIO_BUFFER_SIZE = 4096;

  React.useEffect(() => {
    return () => {
      if (webSocketRef.current) {
        console.log('VoiceSummaryModal unmounting, ensuring WebSocket is closed.');
        disconnectWebSocket(false);
      }
      stopAudioCapture();
    };
  }, []);

  const WEBSOCKET_URL = 'ws://localhost:8765';

  const connectWebSocket = () => {
    if (webSocketRef.current && webSocketRef.current.readyState !== WebSocket.CLOSED) {
      return Promise.resolve();
    }
    setVoiceSummaryTranscription('Connecting to transcription service...');
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WEBSOCKET_URL);
      webSocketRef.current = ws;
      ws.onopen = () => {
        reconnectionAttemptsRef.current = 0;
        resolve();
      };
      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data as string);
          switch (message.type) {
            case 'session_begin':
              finalizedTranscriptContent.current = 'Transcription session started...\n';
              currentUtteranceContent.current = '';
              setVoiceSummaryTranscription(finalizedTranscriptContent.current);
              break;
            case 'transcript_update':
              if (message.is_final) {
                finalizedTranscriptContent.current += message.text + '\n';
                currentUtteranceContent.current = '';
              } else {
                currentUtteranceContent.current = message.text;
              }
              let displayText = finalizedTranscriptContent.current + currentUtteranceContent.current;
              setVoiceSummaryTranscription(displayText.trim() ? displayText : (isRecording ? "Listening..." : initialTranscriptionPlaceholder));
              break;
            case 'session_terminated':
              if (currentUtteranceContent.current.trim()) {
                finalizedTranscriptContent.current += currentUtteranceContent.current + '\n';
              }
              finalizedTranscriptContent.current += 'Session terminated.\n';
              currentUtteranceContent.current = '';
              setVoiceSummaryTranscription(finalizedTranscriptContent.current.trim());
              break;
            case 'error':
              setVoiceSummaryTranscription(`Transcription service error: ${message.message}. Please try again.`);
              break;
            default:
              console.warn('Received unknown message type from server:', message);
          }
        } catch (error) {
           if (typeof event.data === 'string') {
             setVoiceSummaryTranscription(`Received unexpected data: ${event.data}`);
           }
        }
      };
      ws.onerror = (errorEvent) => {
        setVoiceSummaryTranscription('Connection error. Please check your internet and try restarting the recording.');
        handleReconnection();
        reject(errorEvent);
      };
      ws.onclose = (event) => {
        if (isRecording && reconnectionAttemptsRef.current < MAX_RECONNECTION_ATTEMPTS && !event.wasClean) {
          setVoiceSummaryTranscription('Connection lost unexpectedly. Attempting to reconnect...');
          handleReconnection();
        } else if (isRecording && !event.wasClean) {
          setVoiceSummaryTranscription('Connection lost. Max reconnection attempts reached. Please restart recording.');
        }
        webSocketRef.current = null;
        if (isRecording && reconnectionAttemptsRef.current >= MAX_RECONNECTION_ATTEMPTS) {
          toggleVoiceSummaryRecording();
        }
      };
    });
  };

  const startAudioCaptureAndStreaming = async () => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
      setVoiceSummaryTranscription('Error: Connection not ready. Please try again.');
      return;
    }
    setVoiceSummaryTranscription('Initializing microphone...');
    try {
      localMediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      });
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      if (audioContextRef.current.sampleRate !== 16000) {
          console.warn(`AudioContext started with sample rate ${audioContextRef.current.sampleRate}, not 16000Hz.`);
      }
      microphoneSourceRef.current = audioContextRef.current.createMediaStreamSource(localMediaStreamRef.current);
      const workletBlob = new Blob([audioProcessorWorkletCode], { type: 'application/javascript' });
      const workletURL = URL.createObjectURL(workletBlob);
      await audioContextRef.current.audioWorklet.addModule(workletURL);
      URL.revokeObjectURL(workletURL);
      audioWorkletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'audio-processor', {
          processorOptions: { bufferSize: AUDIO_BUFFER_SIZE }
      });
      audioWorkletNodeRef.current.port.onmessage = (event) => {
        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
          webSocketRef.current.send(event.data as ArrayBuffer);
        }
      };
      microphoneSourceRef.current.connect(audioWorkletNodeRef.current);
      audioWorkletNodeRef.current.connect(audioContextRef.current.destination);
      setVoiceSummaryTranscription('Microphone active. Streaming audio...');
    } catch (err) {
      setVoiceSummaryTranscription('Microphone access denied or error. Please check permissions and try again.');
      if (isRecording) {
        toggleVoiceSummaryRecording();
      }
      disconnectWebSocket(false);
    }
  };

  const stopAudioCapture = () => {
    if (microphoneSourceRef.current) { microphoneSourceRef.current.disconnect(); microphoneSourceRef.current = null; }
    if (audioWorkletNodeRef.current) { audioWorkletNodeRef.current.port.onmessage = null; audioWorkletNodeRef.current.disconnect(); audioWorkletNodeRef.current = null; }
    if (localMediaStreamRef.current) { localMediaStreamRef.current.getTracks().forEach(track => track.stop()); localMediaStreamRef.current = null; }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close().catch(console.error); audioContextRef.current = null; }
  };

  const disconnectWebSocket = (sendEndStream = true) => {
    if (webSocketRef.current) {
      if (webSocketRef.current.readyState === WebSocket.OPEN && sendEndStream) {
        webSocketRef.current.send('END_STREAM');
      }
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
  };

  const handleReconnection = () => {
    if (reconnectionAttemptsRef.current < MAX_RECONNECTION_ATTEMPTS) {
      reconnectionAttemptsRef.current++;
      const delay = RECONNECTION_DELAY_BASE * reconnectionAttemptsRef.current;
      setVoiceSummaryTranscription(`Connection lost. Attempting to reconnect (${reconnectionAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS})...`);
      setTimeout(() => {
        if (isRecording) {
          connectWebSocket();
        } else {
          reconnectionAttemptsRef.current = 0;
        }
      }, delay);
    } else {
      setVoiceSummaryTranscription('Failed to reconnect after multiple attempts. Please restart recording.');
      if (isRecording) {
        toggleVoiceSummaryRecording();
      }
      reconnectionAttemptsRef.current = 0;
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      micButtonRef.current?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') { onClose(); disconnectWebSocket(); }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => { document.removeEventListener('keydown', handleKeyDown); };
    } else {
      disconnectWebSocket();
    }
  }, [isOpen, onClose]);

  React.useEffect(() => {
    const statusDiv = document.getElementById('voice-summary-status');
    if (!statusDiv) return;
    if (isOpen) {
      if (isRecording) {
        let newTranscription = transcription;
        if (transcription === initialTranscriptionPlaceholder || transcription.trim() === '') { newTranscription = 'Recording in progress...'; }
        else if (transcription.includes('(paused)')) { newTranscription = transcription.replace('(paused)', '(recording resumed)...'); }
        else if (!transcription.includes('(recording resumed)...') && !transcription.includes('Recording in progress...')) { newTranscription = transcription + ' (recording resumed)...'; }
        if (newTranscription !== transcription) { setVoiceSummaryTranscription(newTranscription); }
        if (legacySummary !== '') { setVoiceSummaryLegacySummary(''); }
        statusDiv.textContent = 'Recording started.';
      } else {
        if (transcription.includes('Recording in progress...') || transcription.includes('(recording resumed)...')) {
          const newTranscription = transcription.replace('Recording in progress...', 'Transcription captured (paused).').replace('(recording resumed)...', '(paused).');
          if (newTranscription !== transcription) { setVoiceSummaryTranscription(newTranscription); }
          if (legacySummary !== 'Summary of recorded content [placeholder].') { setVoiceSummaryLegacySummary('Summary of recorded content [placeholder].'); }
          statusDiv.textContent = 'Recording stopped. Notes generated.';
        } else {
          if (statusDiv.textContent === 'Recording started.') { statusDiv.textContent = 'Ready to record.'; }
          else if (statusDiv.textContent !== 'Recording stopped. Notes generated.') { statusDiv.textContent = 'Ready to record.'; }
        }
      }
    } else { statusDiv.textContent = ''; }
  }, [isOpen, isRecording, transcription, legacySummary, setVoiceSummaryTranscription, setVoiceSummaryLegacySummary]);

  const handleRecordToggle = async () => {
    toggleVoiceSummaryRecording();
    const currentlyRecording = !isRecording;
    if (currentlyRecording) {
      setVoiceSummaryTranscription(initialTranscriptionPlaceholder);
      setGeneratedNotes(null); setNotesError(null);
      finalizedTranscriptContent.current = '';
      currentUtteranceContent.current = '';
      try {
        await connectWebSocket();
        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
           await startAudioCaptureAndStreaming();
        } else {
          setVoiceSummaryTranscription("Failed to connect. Please try again.");
          toggleVoiceSummaryRecording();
        }
      } catch (error) {
        setVoiceSummaryTranscription("Error initializing recording. Please try again.");
        toggleVoiceSummaryRecording();
      }
    } else {
      stopAudioCapture();
      disconnectWebSocket(true);
    }
  };

  const handleGenerateNotes = async () => {
    if (!finalizedTranscriptContent.current.trim()) {
      setNotesError("There is no transcript content to generate notes from.");
      setGeneratedNotes(null);
      setActiveTab("notes");
      return;
    }
    let transcriptToSummarize = finalizedTranscriptContent.current.replace(/Transcription session started...\n/gi, '').replace(/Session terminated.\n/gi, '').trim();
    if (!transcriptToSummarize) {
      setNotesError("Cleaned transcript is empty. Nothing to generate notes from.");
      setGeneratedNotes(null);
      setActiveTab("notes");
      return;
    }
    setIsGeneratingNotes(true);
    setGeneratedNotes(null);
    setNotesError(null);
    setActiveTab("notes");
    const result = await generateNotesFromTranscript(transcriptToSummarize);
    if (result.error) { setNotesError(result.error); }
    else if (result.notes) { setGeneratedNotes(result.notes); }
    setIsGeneratingNotes(false);
  };

  const handleAddToEditor = () => {
    const contentToAdd = generatedNotes || (legacySummary && legacySummary !== 'Summary of recorded content [placeholder].' ? legacySummary : null);
    if (contentToAdd) {
      console.log('Adding to editor:', contentToAdd);
    } else {
      console.log('No content available to add to editor.');
    }
    onClose();
  };

  const handleCancel = () => {
    if (isRecording) { stopAudioCapture(); disconnectWebSocket(true); toggleVoiceSummaryRecording(); }
    onClose();
  };

  if (!isOpen) { return null; }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" aria-hidden={!isOpen}>
      <div className="sr-only" aria-live="polite" id="voice-summary-status"></div>
      <div
        ref={modalContentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voiceSummaryModalTitle"
        className="bg-[--bg-color] text-[--text-color] p-6 rounded-lg shadow-xl w-full max-w-lg relative flex flex-col max-h-[90vh] animate-modalFadeIn"
      >
        <button
          onClick={() => {
            if (isRecording) { stopAudioCapture(); disconnectWebSocket(true); toggleVoiceSummaryRecording(); }
            onClose();
          }}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-[--hover-bg] text-[--text-color]"
          aria-label="Close voice summary modal"
        >
          <X size={20} />
        </button>
        <h2 id="voiceSummaryModalTitle" className="text-xl font-semibold mb-4 text-center">Voice Summary</h2>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col overflow-hidden mb-4">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="transcription">Transcription</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>
          <TabsContent value="transcription" className="flex-grow overflow-y-auto mt-2 border border-[--border-color] rounded p-3 bg-[--input-bg] min-h-[150px]">
            <p className="text-sm whitespace-pre-wrap">
              {transcription || initialTranscriptionPlaceholder}
            </p>
          </TabsContent>
          <TabsContent value="notes" className="flex-grow overflow-y-auto mt-2 border border-[--border-color] rounded p-3 bg-[--input-bg] min-h-[150px]">
            {isGeneratingNotes ? (
              <p className="text-sm text-[--muted-text-color] animate-pulse">Generating notes...</p>
            ) : notesError ? (
              <p className="text-sm text-red-500 whitespace-pre-wrap">Error: {notesError}</p>
            ) : generatedNotes ? (
              <p className="text-sm whitespace-pre-wrap">{generatedNotes}</p>
            ) : (
              <p className="text-sm text-[--muted-text-color]">
                Click "Generate Notes" to create an AI-generated summary of the transcription.
              </p>
            )}
          </TabsContent>
        </Tabs>
        <div className="mt-auto pt-4 border-t border-[--border-color] flex justify-between items-center">
          <button
            ref={micButtonRef}
            onClick={handleRecordToggle}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={`p-2 rounded-full ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-[--primary-btn-bg] text-[--primary-btn-text-color] hover:bg-[--primary-btn-hover-bg]'}`}
          >
            {isRecording ? <StopIcon size={20} /> : <Mic size={20} />}
          </button>
          <div className="flex space-x-2">
            <Button
              onClick={handleAddToEditor}
              disabled={isRecording || (!generatedNotes && (!legacySummary || legacySummary === 'Summary of recorded content [placeholder].'))}
              variant="default"
              size="sm"
            >
              Add to Editor
            </Button>
            <Button
              onClick={handleGenerateNotes}
              disabled={isRecording || isGeneratingNotes || !finalizedTranscriptContent.current.trim().replace(/Transcription session started...\n/gi, '').replace(/Session terminated.\n/gi, '').trim()}
              variant="outline"
              size="sm"
              className="flex items-center"
            >
              {isGeneratingNotes ? (
                <span className="animate-spin mr-2">⏳</span>
              ) : (
                <NotesIcon size={16} className="mr-2" />
              )}
              {isGeneratingNotes ? "Generating..." : "Generate Notes"}
            </Button>
            <Button
              onClick={handleCancel}
              disabled={isRecording}
              variant="ghost"
              size="sm"
            >
              Cancel & Clear
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}; 

export const VoiceSummaryModal: React.FC<VoiceSummaryModalProps> = (props) => {
  return (
    <>
      <ActualVoiceSummaryModal {...props} />
      {props.isOpen && (
        <style jsx global>{`
          @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          .animate-modalFadeIn {
            animation: modalFadeIn 0.3s ease-out forwards;
          }
        `}</style>
      )}
    </>
  );
}; 