import React from 'react';
import { useModalStore } from '@/stores/useModalStore';
import { X, Mic, Square as StopIcon, FileText as NotesIcon, ChevronDown, Eraser, BotMessageSquare, FilePlus2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateNotesFromTranscript } from '@/lib/ai/notesService';
import { type BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const editorRef = useModalStore(state => state.editorRef);

  const isRecording = useModalStore(state => state.voiceSummary.isRecording);
  const transcription = useModalStore(state => state.voiceSummary.transcription);
  const legacySummary = useModalStore(state => state.voiceSummary.legacySummary);

  const [generatedNotes, setGeneratedNotes] = React.useState<string | null>(null);
  const [isGeneratingNotes, setIsGeneratingNotes] = React.useState<boolean>(false);
  const [notesError, setNotesError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<string>("transcription");
  const [insertionType, setInsertionType] = React.useState<'active' | 'transcription' | 'notes' | 'both'>('active');

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

  // Refs for scrollable tab content
  const transcriptionTabContentRef = React.useRef<HTMLDivElement | null>(null);
  const notesTabContentRef = React.useRef<HTMLDivElement | null>(null);

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

  const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;

  // Helper function to scroll an element to its bottom if overflowing
  const scrollToBottomIfOverflowing = (element: HTMLDivElement | null) => {
    if (element) {
      // Using a small timeout to allow the DOM to update with the new content height
      // before calculating scroll position.
      setTimeout(() => {
        if (element.scrollHeight > element.clientHeight) {
          element.scrollTop = element.scrollHeight;
        }
      }, 0); 
    }
  };

  // Autoscroll for Transcription Tab
  React.useEffect(() => {
    if (activeTab === 'transcription') {
      scrollToBottomIfOverflowing(transcriptionTabContentRef.current);
    }
  }, [transcription, activeTab]);

  // Autoscroll for Notes Tab
  React.useEffect(() => {
    if (activeTab === 'notes') {
      scrollToBottomIfOverflowing(notesTabContentRef.current);
    }
  }, [generatedNotes, isGeneratingNotes, notesError, activeTab]);

  const connectWebSocket = () => {
    if (!WEBSOCKET_URL) {
      let messageToShow = finalizedTranscriptContent.current;
      // No currentUtterance to add here as recording hasn't started/failed pre-stream
      if (messageToShow && !/\s$/.test(messageToShow)) { messageToShow += ' '; }
      messageToShow += '(Configuration error: WebSocket URL is not set. Please contact support.)';
      setVoiceSummaryTranscription(messageToShow);
      console.error('CRITICAL: NEXT_PUBLIC_WEBSOCKET_URL is not defined. Cannot connect to WebSocket.');
      return Promise.reject(new Error('WebSocket URL is not configured.'));
    }
    if (webSocketRef.current && webSocketRef.current.readyState !== WebSocket.CLOSED) {
      return Promise.resolve();
    }

    let messageToShowConnect = finalizedTranscriptContent.current;
    if (isRecording && currentUtteranceContent.current) { // Check isRecording as this is for an active attempt
      messageToShowConnect += currentUtteranceContent.current;
    }
    if (messageToShowConnect && !/\s$/.test(messageToShowConnect)) { messageToShowConnect += ' '; }
    messageToShowConnect += '(Connecting to transcription service...)';
    setVoiceSummaryTranscription(messageToShowConnect);

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
              currentUtteranceContent.current = '';
              setVoiceSummaryTranscription(finalizedTranscriptContent.current + "Listening...");
              console.log('[WS] Session Begin. Display:', finalizedTranscriptContent.current + "Listening...");
              break;
            case 'transcript_update':
              const sanitizedText = message.text.replace(/\0/g, '');
              let isFinalMessage = message.is_final;

              if (isFinalMessage) {
                finalizedTranscriptContent.current += sanitizedText + '\n';
                currentUtteranceContent.current = ''; 
                console.log('[WS] Final transcript segment: "', sanitizedText, '" Added to finalized. Finalized content: "', finalizedTranscriptContent.current, '"');
              } else {
                currentUtteranceContent.current = sanitizedText;
              }

              let currentDisplay = finalizedTranscriptContent.current; // Start with finalized content

              if (!isFinalMessage && currentUtteranceContent.current) {
                // If it's an interim message AND there's current utterance content, append it
                currentDisplay += currentUtteranceContent.current;
              } else if (isRecording && !currentUtteranceContent.current && !isFinalMessage) {
                // If still recording, no current utterance (e.g. server sends empty interim), and not a final message, show "Listening..."
                // This covers the case where an interim message has empty text.
                currentDisplay += "Listening...";
              } else if (isRecording && finalizedTranscriptContent.current.endsWith('Listening...') && currentUtteranceContent.current) {
                // If "Listening..." is already there from a previous empty interim, but now we have content, replace "Listening..."
                 currentDisplay = finalizedTranscriptContent.current.replace(/Listening...$/, '') + currentUtteranceContent.current;
              } else if (isRecording && !finalizedTranscriptContent.current.endsWith('Listening...') && !currentUtteranceContent.current && !isFinalMessage) {
                // Similar to above, ensure "Listening..." is added if needed during active recording and no utterance.
                currentDisplay += "Listening...";
              }


              // Handle display if not recording / or if it's a final message (currentUtteranceContent is already cleared)
              if (!isRecording && !currentDisplay.trim()) {
                currentDisplay = initialTranscriptionPlaceholder;
              } else if (!isRecording && currentDisplay.trim() === finalizedTranscriptContent.current.trim() && !finalizedTranscriptContent.current.trim()) {
                 // If not recording and finalized content is also empty (e.g. cleared), show placeholder
                 currentDisplay = initialTranscriptionPlaceholder;
              } else if (!isRecording) {
                // If not recording, just show the accumulated content (which is now currentDisplay)
                // or placeholder if it ended up empty.
                currentDisplay = currentDisplay.trim() ? currentDisplay : initialTranscriptionPlaceholder;
              }

              setVoiceSummaryTranscription(currentDisplay);
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
              let wsErrorMsg = finalizedTranscriptContent.current;
              if (isRecording && currentUtteranceContent.current) { wsErrorMsg += currentUtteranceContent.current; }
              if (wsErrorMsg && !/[\\s\\)]$/.test(wsErrorMsg)) { wsErrorMsg += ' '; } // Avoid double space if already ends with space or )
              wsErrorMsg += `(Transcription service error: ${message.message}. Please try again.)`;
              setVoiceSummaryTranscription(wsErrorMsg);
              break;
            default:
              console.warn('Received unknown message type from server:', message);
          }
        } catch (error) {
           if (typeof event.data === 'string') {
             let parseErrorMsg = finalizedTranscriptContent.current;
             if (isRecording && currentUtteranceContent.current) { parseErrorMsg += currentUtteranceContent.current; }
             if (parseErrorMsg && !/[\\s\\)]$/.test(parseErrorMsg)) { parseErrorMsg += ' '; }
             parseErrorMsg += `(Received unexpected data: ${event.data})`;
             setVoiceSummaryTranscription(parseErrorMsg);
           }
        }
      };
      ws.onerror = (errorEvent) => {
        let messageToShow = finalizedTranscriptContent.current;
        if (isRecording && currentUtteranceContent.current) {
          messageToShow += currentUtteranceContent.current;
        }
        // Add a space if there's content and it doesn't end with a space/newline
        if (messageToShow && !messageToShow.endsWith('\n') && !messageToShow.endsWith(' ')) {
          messageToShow += ' ';
        }
        messageToShow += '(Connection error. Please check your internet and try restarting the recording.)';
        setVoiceSummaryTranscription(messageToShow);
        handleReconnection();
        reject(errorEvent);
      };
      ws.onclose = (event) => {
        if (isRecording && reconnectionAttemptsRef.current < MAX_RECONNECTION_ATTEMPTS && !event.wasClean) {
          let msg1 = finalizedTranscriptContent.current;
          if (currentUtteranceContent.current) { msg1 += currentUtteranceContent.current; }
          if (msg1 && !/[\s\)]$/.test(msg1)) { msg1 += ' '; }
          msg1 += '(Connection lost unexpectedly. Attempting to reconnect...)';
          setVoiceSummaryTranscription(msg1);
          handleReconnection();
        } else if (isRecording && !event.wasClean) {
          let msg2 = finalizedTranscriptContent.current;
          if (currentUtteranceContent.current) { msg2 += currentUtteranceContent.current; }
          if (msg2 && !/[\s\)]$/.test(msg2)) { msg2 += ' '; }
          msg2 += '(Connection lost. Max reconnection attempts reached. Please restart recording.)';
          setVoiceSummaryTranscription(msg2);
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
      let msg = finalizedTranscriptContent.current;
      if (isRecording && currentUtteranceContent.current) { msg += currentUtteranceContent.current; }
      if (msg && !/\s$/.test(msg)) { msg += ' '; }
      msg += '(Error: Connection not ready. Please try again.)';
      setVoiceSummaryTranscription(msg);
      return;
    }

    let initMsg = finalizedTranscriptContent.current;
    if (isRecording && currentUtteranceContent.current) { initMsg += currentUtteranceContent.current; }
    if (initMsg && !/\s$/.test(initMsg)) { initMsg += ' '; }
    initMsg += '(Initializing microphone...)';
    setVoiceSummaryTranscription(initMsg);

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

      let activeMsg = finalizedTranscriptContent.current;
      if (isRecording && currentUtteranceContent.current) { activeMsg += currentUtteranceContent.current; }
      if (activeMsg && !/\s$/.test(activeMsg)) { activeMsg += ' '; }
      activeMsg += '(Microphone active. Streaming audio...)';
      setVoiceSummaryTranscription(activeMsg);

    } catch (err) {
      let errMsg = finalizedTranscriptContent.current;
      if (isRecording && currentUtteranceContent.current) { errMsg += currentUtteranceContent.current; }
      if (errMsg && !/\s$/.test(errMsg)) { errMsg += ' '; }
      errMsg += '(Microphone access denied or error. Please check permissions and try again.)';
      setVoiceSummaryTranscription(errMsg);

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
      let reconMsg1 = finalizedTranscriptContent.current;
      if (isRecording && currentUtteranceContent.current) { reconMsg1 += currentUtteranceContent.current; }
      if (reconMsg1 && !/[\s\)]$/.test(reconMsg1)) { reconMsg1 += ' '; }
      reconMsg1 += `(Connection lost. Attempting to reconnect (${reconnectionAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS})...)`;
      setVoiceSummaryTranscription(reconMsg1);
      setTimeout(() => {
        if (isRecording) {
          connectWebSocket();
        } else {
          reconnectionAttemptsRef.current = 0;
        }
      }, delay);
    } else {
      let reconMsg2 = finalizedTranscriptContent.current;
      if (isRecording && currentUtteranceContent.current) { reconMsg2 += currentUtteranceContent.current; }
      if (reconMsg2 && !/[\s\)]$/.test(reconMsg2)) { reconMsg2 += ' '; }
      reconMsg2 += '(Failed to reconnect after multiple attempts. Please restart recording.)';
      setVoiceSummaryTranscription(reconMsg2);
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
        // When recording is active, the transcription display is managed by handleRecordToggle,
        // connectWebSocket, startAudioCaptureAndStreaming, and the WebSocket message handlers.
        // This effect should just handle other side-effects.
        if (legacySummary !== '') { setVoiceSummaryLegacySummary(''); }
        statusDiv.textContent = 'Recording active.'; // Changed from 'Recording started.' for clarity
      } else {
        // This block executes when isRecording transitions from true to false (i.e., recording stopped)
        // or if the modal opens and isRecording is already false.

        // Check if the transcription currently shows an active recording/connecting state.
        const isActiveState = transcription.includes('Recording in progress...') ||
                            transcription.includes('(recording resumed)...') || // Note: handleRecordToggle uses "Recording resumed..."
                            transcription.includes('--- Recording Resumed ---') || // Marker from handleRecordToggle
                            transcription.includes('Listening...') ||
                            transcription.includes('Connecting to transcription service...') ||
                            transcription.includes('Initializing microphone...') ||
                            transcription.includes('Microphone active. Streaming audio...');

        if (isActiveState) {
          // If it was an active state, show the finalized content with a "(paused)" message.
          const pausedMessage = finalizedTranscriptContent.current.trim()
            ? finalizedTranscriptContent.current.trimEnd() + ' (paused).'
            : 'Transcription captured (paused).'; // Fallback if finalized is somehow empty

          if (pausedMessage !== transcription) { // Only update if different
            setVoiceSummaryTranscription(pausedMessage);
          }

          if (legacySummary !== 'Summary of recorded content [placeholder].') {
            setVoiceSummaryLegacySummary('Summary of recorded content [placeholder].');
          }
          statusDiv.textContent = 'Recording stopped. Content captured.'; // Changed for clarity
        } else {
          // If not an active state (e.g., it shows an error, or already paused, or initial placeholder),
          // ensure statusDiv is appropriate.
          if (transcription === initialTranscriptionPlaceholder || statusDiv.textContent === 'Recording active.') {
             statusDiv.textContent = 'Ready to record.';
          }
          // Don't change transcription if it's an error message or already correctly paused/initial.
        }
      }
    } else { 
      statusDiv.textContent = ''; 
    }
  }, [isOpen, isRecording, transcription, legacySummary, setVoiceSummaryTranscription, setVoiceSummaryLegacySummary]);

  const handleRecordToggle = async () => {
    toggleVoiceSummaryRecording();
    const currentlyRecording = !isRecording;
    if (currentlyRecording) {
      if (finalizedTranscriptContent.current.trim()) {
        if (!finalizedTranscriptContent.current.endsWith('\n')) {
          finalizedTranscriptContent.current += '\n';
        }
        finalizedTranscriptContent.current += '--- Recording Resumed ---\n';
        setVoiceSummaryTranscription(finalizedTranscriptContent.current + "Listening...");
      } else {
        finalizedTranscriptContent.current = '--- Recording Started ---\n';
        setVoiceSummaryTranscription(finalizedTranscriptContent.current + "Listening...");
      }
      currentUtteranceContent.current = '';
      setGeneratedNotes(null);
      setNotesError(null);

      try {
        await connectWebSocket();
        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
           await startAudioCaptureAndStreaming();
        } else {
          let failConnectMsg = finalizedTranscriptContent.current;
          if (isRecording && currentUtteranceContent.current) { failConnectMsg += currentUtteranceContent.current; }
          if (failConnectMsg && !/\s$/.test(failConnectMsg)) { failConnectMsg += ' '; }
          failConnectMsg += '(Failed to connect. Please try again.)';
          setVoiceSummaryTranscription(failConnectMsg);
          toggleVoiceSummaryRecording(); // Rollback recording state
        }
      } catch (error) {
        let initErrorMsg = finalizedTranscriptContent.current;
        if (isRecording && currentUtteranceContent.current) { initErrorMsg += currentUtteranceContent.current; }
        if (initErrorMsg && !/\s$/.test(initErrorMsg)) { initErrorMsg += ' '; }
        initErrorMsg += '(Error initializing recording. Please try again.)';
        setVoiceSummaryTranscription(initErrorMsg);
        if (isRecording) { // Ensure we only toggle if it was set to recording
            toggleVoiceSummaryRecording(); // Rollback recording state
        }
      }
    } else {
      stopAudioCapture();
      disconnectWebSocket(true);
    }
  };

  const handleGenerateNotes = async () => {
    const cleanedFinalizedContent = finalizedTranscriptContent.current
      .replace(/Transcription session started...\n/gi, '')
      .replace(/Session terminated...\n/gi, '')
      .trim();

    if (!cleanedFinalizedContent) {
      setNotesError('No actual transcription content available to generate notes.');
      toast.info('No transcription available to generate notes.');
      return;
    }

    setIsGeneratingNotes(true);
    setNotesError(null);
    setGeneratedNotes(null);

    try {
      const result = await generateNotesFromTranscript(cleanedFinalizedContent);

      if (result.error) {
        setNotesError(result.error);
        toast.error(`Failed to generate notes: ${result.error}`);
        setGeneratedNotes(null); 
      } else if (result.notes) {
        setGeneratedNotes(result.notes);
        toast.success('Notes generated successfully!');
        setActiveTab('notes'); // Switch to notes tab after generation
      } else {
        setNotesError('Notes generation returned no content.');
        toast.info('Notes generation returned no content.');
        setGeneratedNotes(null);
      }
    } catch (error: any) {
      console.error('Unexpected error generating notes:', error);
      setNotesError(`An unexpected error occurred: ${error.message}`);
      toast.error(`An unexpected error occurred while generating notes.`);
      setGeneratedNotes(null);
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const handleAddToEditor = async (content: string) => {
    if (!editorRef) {
      toast.error('Editor reference object is not available. Please ensure the editor page is fully loaded.');
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      toast.error('Editor instance not available. Please ensure the editor has initialized.');
      return;
    }
    if (!content || content.trim() === '') {
      toast.info('No content to add to the editor.');
      return;
    }

    try {
      // Attempt to parse as Markdown first
      let blocksToInsert: PartialBlock[] = await editor.tryParseMarkdownToBlocks(content);

      // If Markdown parsing results in no blocks (e.g., plain text that isn't valid Markdown or empty),
      // treat the content as a single paragraph.
      if (blocksToInsert.length === 0 && content.trim() !== '') {
        blocksToInsert = [{ type: 'paragraph', content: [{ type: 'text', text: content, styles: {} }] }];
      }
      
      // If there are still no blocks to insert (e.g., content was only whitespace), do nothing.
      if (blocksToInsert.length === 0) {
          toast.info("No content to insert.");
          return;
      }

      const { block: currentBlock } = editor.getTextCursorPosition();
      let referenceBlockId: string | undefined = currentBlock?.id;

      if (!referenceBlockId && editor.document.length > 0) {
        referenceBlockId = editor.document[editor.document.length - 1]?.id;
      }

      if (referenceBlockId) {
        editor.insertBlocks(blocksToInsert, referenceBlockId, 'after');
      } else {
        // If the document is empty or no reference block, replace everything (or insert at start)
        editor.replaceBlocks(editor.document, blocksToInsert);
      }
      
      toast.success('Content added to editor.');
      onClose(); // Close modal after adding content
    } catch (error: any) {
      console.error('Error adding content to editor:', error);
      toast.error(`Failed to add content to editor: ${error.message}`);
    }
  };

  const handleCancel = () => {
    if (isRecording) { stopAudioCapture(); disconnectWebSocket(true); toggleVoiceSummaryRecording(); }
    onClose();
  };

  if (!isOpen) { return null; }

  // Determine content availability for select options and button
  const transcriptionAvailable = transcription && transcription !== initialTranscriptionPlaceholder && !!finalizedTranscriptContent.current.trim();
  const notesAvailable = !!generatedNotes;

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
          <TabsContent 
            value="transcription" 
            ref={transcriptionTabContentRef} 
            className="flex-grow overflow-y-auto mt-2 border border-[--border-color] rounded p-3 bg-[--input-bg] min-h-[150px]"
          >
            <p className="text-sm whitespace-pre-wrap">
              {transcription || initialTranscriptionPlaceholder}
            </p>
          </TabsContent>
          <TabsContent 
            value="notes" 
            ref={notesTabContentRef}
            className="flex-grow overflow-y-auto mt-2 border border-[--border-color] rounded p-3 bg-[--input-bg] min-h-[150px] max-w-full text-sm"
          >
            {isGeneratingNotes ? (
              <p className="text-sm text-[--muted-text-color] animate-pulse">Generating notes...</p>
            ) : notesError ? (
              <p className="text-sm text-red-500 whitespace-pre-wrap">Error: {notesError}</p>
            ) : generatedNotes ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {generatedNotes}
              </ReactMarkdown>
            ) : (
              <p className="text-sm text-[--muted-text-color]">
                Click &quot;Generate Notes&quot; to create an AI-generated summary of the transcription.
              </p>
            )}
          </TabsContent>
        </Tabs>
        <div className="mt-auto pt-4 border-t border-[--border-color]">
          <div className="flex justify-between items-center mb-3">
            <Button
              ref={micButtonRef}
              onClick={handleRecordToggle}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`p-2 rounded-full ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-[--primary-btn-bg] text-[--primary-btn-text-color] hover:bg-[--primary-btn-hover-bg]'}`}
              size="sm"
            >
              {isRecording ? <StopIcon size={18} className="mr-1" /> : <Mic size={18} className="mr-1" />}
              {isRecording ? 'Recording' : 'Record'}
            </Button>

            <Button
              onClick={() => {
                setVoiceSummaryTranscription(initialTranscriptionPlaceholder);
                finalizedTranscriptContent.current = '';
                currentUtteranceContent.current = '';
                setGeneratedNotes(null);
                setNotesError(null);
                toast.info("Transcription and notes cleared.");
              }}
              disabled={isRecording || (!transcriptionAvailable && !notesAvailable)}
              variant="outline"
              size="sm"
              className="flex items-center"
            >
              <Eraser size={16} className="mr-2" />
              Clear
            </Button>

            <Button
              onClick={handleGenerateNotes}
              disabled={isRecording || isGeneratingNotes || !transcriptionAvailable}
              variant="outline"
              size="sm"
              className="flex items-center"
            >
              {isGeneratingNotes ? (
                <span className="animate-spin mr-2">⏳</span>
              ) : (
                <BotMessageSquare size={16} className="mr-2" />
              )}
              {isGeneratingNotes ? "Generating..." : "Notes"}
            </Button>
            
            <div className="flex items-center">
              <Button
                onClick={() => {
                  let contentToInsert = '';
                  let hasContent = false;

                  switch (insertionType) {
                    case 'active':
                      if (activeTab === 'transcription' && transcriptionAvailable) {
                        contentToInsert = finalizedTranscriptContent.current.trim();
                        hasContent = !!contentToInsert;
                      } else if (activeTab === 'notes' && notesAvailable) {
                        contentToInsert = generatedNotes as string;
                        hasContent = true;
                      }
                      break;
                    case 'transcription':
                      if (transcriptionAvailable) {
                        contentToInsert = finalizedTranscriptContent.current.trim();
                        hasContent = !!contentToInsert;
                      }
                      break;
                    case 'notes':
                      if (notesAvailable) {
                        contentToInsert = generatedNotes as string;
                        hasContent = true;
                      }
                      break;
                    case 'both':
                      if (transcriptionAvailable && notesAvailable) {
                        contentToInsert = `## Transcription\n\n${finalizedTranscriptContent.current.trim()}\n\n## Notes\n\n${generatedNotes}`;
                        hasContent = true;
                      }
                      break;
                  }

                  if (hasContent && contentToInsert.trim()) {
                    handleAddToEditor(contentToInsert);
                  } else {
                    toast.info("No content available for the selected option or content is empty.");
                  }
                }}
                disabled={
                  isGeneratingNotes || isRecording || !editorRef || !editorRef.current ||
                  (insertionType === 'active' && !((activeTab === 'transcription' && transcriptionAvailable) || (activeTab === 'notes' && notesAvailable))) ||
                  (insertionType === 'transcription' && !transcriptionAvailable) ||
                  (insertionType === 'notes' && !notesAvailable) ||
                  (insertionType === 'both' && (!transcriptionAvailable || !notesAvailable))
                }
                variant="outline"
                size="sm"
                className="flex items-center rounded-r-none"
              >
                <FilePlus2 size={16} className="mr-2" />
                Editor
              </Button>
              <Select 
                value={insertionType} 
                onValueChange={(value: 'active' | 'transcription' | 'notes' | 'both') => setInsertionType(value)}
                disabled={
                  isGeneratingNotes || isRecording || !editorRef || !editorRef.current ||
                  (insertionType === 'active' && !((activeTab === 'transcription' && transcriptionAvailable) || (activeTab === 'notes' && notesAvailable))) ||
                  (insertionType === 'transcription' && !transcriptionAvailable) ||
                  (insertionType === 'notes' && !notesAvailable) ||
                  (insertionType === 'both' && (!transcriptionAvailable || !notesAvailable))
                }
              >
                <SelectTrigger
                  className="h-9 px-2 text-xs rounded-l-none border-l-0"
                  aria-label="Select content type to add to editor"
                >
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Insert Active Tab Content</SelectItem>
                  <SelectItem value="transcription" disabled={!transcriptionAvailable}>Insert Transcription Only</SelectItem>
                  <SelectItem value="notes" disabled={!notesAvailable}>Insert Notes Only</SelectItem>
                  <SelectItem value="both" disabled={!transcriptionAvailable || !notesAvailable}>Insert Both (Transcription & Notes)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-end items-center space-x-2 mt-4">
            {/* The "Add to Editor", "Generate Notes", and "Cancel & Clear" buttons from the original layout are now part of Row 1 or handled differently. */}
            {/* Keeping Cancel button for modal dismissal, separate from Clear transcription */}
            {/* <Button
              onClick={handleCancel} // handleCancel should already exist and handle closing/stopping recording
              // disabled={isRecording} // We might want to allow canceling even if recording, handleCancel should stop it.
              variant="ghost"
              size="sm"
            >
              Close
            </Button> */}
          </div>

        </div>
      </div>
    </div>
  );
}; 

export const VoiceSummaryModal: React.FC<VoiceSummaryModalProps> = (props) => {
  const { isOpen, onClose } = props;

  if (!isOpen) return null;

  return (
    <>
      <ActualVoiceSummaryModal isOpen={isOpen} onClose={onClose} />
      {isOpen && (
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