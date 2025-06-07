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
import { generateNotesFromTranscript, prettifyTranscript } from '@/lib/ai/notesService';
import { type BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CustomAudioVisualizer from '@/components/editor/CustomAudioVisualizer';
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions';
import { debounce } from '@/lib/utils/debounce';
import { useRouter } from 'next/navigation';

interface VoiceSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TargetDocumentType = 'current' | 'new'; // Define type for target selection

const initialTranscriptionPlaceholder = "Start speaking to record your thoughts. Transcription will appear here...";

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
  const hasActiveDocument = !!editorRef?.current; // Derived state for active document
  const router = useRouter();
  const prevIsOpenRef = React.useRef<boolean>(isOpen); // <-- Add ref to track previous isOpen state

  const isRecordingFromStore = useModalStore(state => state.voiceSummary.isRecording);
  const transcription = useModalStore(state => state.voiceSummary.transcription);
  const legacySummary = useModalStore(state => state.voiceSummary.legacySummary);

  const [generatedNotes, setGeneratedNotes] = React.useState<string | null>(null);
  const [isGeneratingNotes, setIsGeneratingNotes] = React.useState<boolean>(false);
  const [notesError, setNotesError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<string>("transcription");
  const [insertionType, setInsertionType] = React.useState<'active' | 'transcription' | 'notes' | 'both'>('active');
  const [notesAction, setNotesAction] = React.useState<'summary' | 'prettify'>('summary');
  const [targetDocument, setTargetDocument] = React.useState<TargetDocumentType>('new'); // State for target selection
  const [isCreatingNewDocument, setIsCreatingNewDocument] = React.useState<boolean>(false);

  // --- NEW: State for WebSocket configuration ---
  const [websocketUrl, setWebsocketUrl] = React.useState<string | null>(null);
  const [websocketAuthToken, setWebsocketAuthToken] = React.useState<string | null>(null);
  const [isFetchingConfig, setIsFetchingConfig] = React.useState<boolean>(false);
  const [configError, setConfigError] = React.useState<string | null>(null);
  // --- END NEW STATE ---

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
  const analyserNodeRef = React.useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = React.useRef<number | null>(null);
  const animationFrameCounterRef = React.useRef<number>(0);

  const isRecordingRef = React.useRef<boolean>(isRecordingFromStore);

  const [analyserData, setAnalyserData] = React.useState<AudioTimeDomainData>(new Uint8Array(0));

  const finalizedTranscriptContent = React.useRef<string>('');
  const currentUtteranceContent = React.useRef<string>('');
  const lastTranscriptionForNotesRef = React.useRef<string | null>(null);

  // Refs for scrollable tab content
  const transcriptionTabContentRef = React.useRef<HTMLDivElement | null>(null);
  const notesTabContentRef = React.useRef<HTMLDivElement | null>(null);

  const MAX_RECONNECTION_ATTEMPTS = 3;
  const RECONNECTION_DELAY_BASE = 2000;
  const AUDIO_BUFFER_SIZE = 4096;

  // Effect to keep isRecordingRef updated
  React.useEffect(() => {
    isRecordingRef.current = isRecordingFromStore;
  }, [isRecordingFromStore]);

  // --- NEW: Function to fetch WebSocket configuration ---
  const fetchWebsocketConfig = React.useCallback(async (): Promise<{ websocketUrl: string; websocketAuthToken: string } | null> => {
    // If already fetching, or if config is already in state and valid, return state values
    if (isFetchingConfig) {
      console.warn('[VoiceSummaryModal] fetchWebsocketConfig called while already fetching.');
      return null; 
    }
    if (websocketUrl && websocketAuthToken) {
      console.log('[VoiceSummaryModal] WebSocket config already in state, returning it:', { websocketUrl, websocketAuthToken });
      return { websocketUrl, websocketAuthToken };
    }

    console.log('[VoiceSummaryModal] Fetching WebSocket config from API...');
    setIsFetchingConfig(true);
    setConfigError(null);
    try {
      const response = await fetch('/api/chat/websocket-config');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch WebSocket config details.' }));
        throw new Error(errorData.error || `Failed to fetch WebSocket config: ${response.status}`);
      }
      const { websocketUrl: url, websocketAuthToken: token } = await response.json();
      if (!url || !token) {
        throw new Error('WebSocket URL or token missing in server response.');
      }
      // Set state for future use / re-renders
      setWebsocketUrl(url);
      setWebsocketAuthToken(token);
      console.log('[VoiceSummaryModal] WebSocket config fetched and state updated successfully.');
      const returnedConfig = { websocketUrl: url, websocketAuthToken: token };
      console.log('[VoiceSummaryModal] fetchWebsocketConfig returning:', returnedConfig);
      return returnedConfig;
    } catch (error: any) {
      console.error('[VoiceSummaryModal] Error fetching WebSocket config:', error);
      setConfigError(error.message);
      toast.error(`Error fetching WebSocket config: ${error.message}`);
      setWebsocketUrl(null); // Clear state on error
      setWebsocketAuthToken(null);
      console.log('[VoiceSummaryModal] fetchWebsocketConfig returning null due to error.');
      return null; // Indicate failure
    } finally {
      setIsFetchingConfig(false);
    }
  }, [isFetchingConfig, websocketUrl, websocketAuthToken]); // Dependencies include state vars to return them if already fetched
  // --- END NEW FUNCTION ---

  const debouncedSetVoiceSummaryTranscription = React.useMemo(
    () => debounce((text: string) => setVoiceSummaryTranscription(text), 100),
    [setVoiceSummaryTranscription]
  );

  // Memoized helper functions
  const stopAudioCapture = React.useCallback(() => {
    if (microphoneSourceRef.current) { microphoneSourceRef.current.disconnect(); microphoneSourceRef.current = null; }
    if (audioWorkletNodeRef.current) { audioWorkletNodeRef.current.port.onmessage = null; audioWorkletNodeRef.current.disconnect(); audioWorkletNodeRef.current = null; }
    if (analyserNodeRef.current) { analyserNodeRef.current.disconnect(); analyserNodeRef.current = null; }
    if (localMediaStreamRef.current) { localMediaStreamRef.current.getTracks().forEach(track => track.stop()); localMediaStreamRef.current = null; }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close().catch(console.error); audioContextRef.current = null; }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    setAnalyserData(new Uint8Array(0));
  }, [setAnalyserData]);

  const disconnectWebSocket = React.useCallback((sendEndStream = true) => {
    if (webSocketRef.current) {
      if (webSocketRef.current.readyState === WebSocket.OPEN && sendEndStream) {
        webSocketRef.current.send('END_STREAM');
      }
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
  }, []);

  // Helper function to clear modal content
  const clearModalContent = React.useCallback(() => {
    console.log("[VoiceSummaryModal clearModalContent] Called. Current finalizedTranscriptContent:", finalizedTranscriptContent.current);
    setVoiceSummaryTranscription(initialTranscriptionPlaceholder); 
    finalizedTranscriptContent.current = ''; 
    console.log("[VoiceSummaryModal clearModalContent] finalizedTranscriptContent has been WIPED.");
    currentUtteranceContent.current = '';
    setGeneratedNotes(null);
    setNotesError(null);
    lastTranscriptionForNotesRef.current = null; 
    setActiveTab("transcription");
    setInsertionType('active');
  }, [setVoiceSummaryTranscription, setGeneratedNotes, setNotesError, setActiveTab, setInsertionType]);

  // Helper function to stop recording and perform necessary cleanup
  const handleStopRecordingAndCleanup = React.useCallback(() => {
    console.log("[VoiceSummaryModal handleStopRecordingAndCleanup] Called.");
    // Capture current utterance before stopping audio capture, as it might clear it
    const lastUtterance = currentUtteranceContent.current.trim();
    if (lastUtterance) {
      finalizedTranscriptContent.current += lastUtterance + ' \n'; // Append with a newline for clarity
      currentUtteranceContent.current = ''; // Clear it now that it's "finalized"
      console.log("[VoiceSummaryModal handleStopRecordingAndCleanup] Finalized last utterance.");
    }

    stopAudioCapture(); 
    disconnectWebSocket(true); 
    
    // DO NOT toggleVoiceSummaryRecording() here - it causes a double toggle.
    // DO NOT set "paused" message here - the caller should do it based on context.
    console.log("[VoiceSummaryModal handleStopRecordingAndCleanup] Audio capture stopped and WebSocket disconnected.");

  }, [stopAudioCapture, disconnectWebSocket]);
  
  // Enhanced close handler
  const handleCloseModal = React.useCallback(() => {
    console.log("[VoiceSummaryModal handleCloseModal] Called. Current isRecording state (ref):", isRecordingRef.current);
    
    // Always attempt to stop recording and cleanup, regardless of the initial ref state.
    // handleStopRecordingAndCleanup is designed to be safe to call even if not actively recording.
    handleStopRecordingAndCleanup();

    const hasTranscription = finalizedTranscriptContent.current && finalizedTranscriptContent.current.trim() !== '';
    const hasNotes = !!generatedNotes;
    const hasUnhandledContent = hasTranscription || hasNotes;
    console.log("[VoiceSummaryModal handleCloseModal] Post-cleanup. HasTranscription:", hasTranscription, "HasNotes:", hasNotes);

    if (hasUnhandledContent && !isRecordingRef.current) { // Check ref *after* cleanup attempt
      if (window.confirm('You have unsaved content. Discard this content and close?')) {
        console.log("[VoiceSummaryModal handleCloseModal] Confirmed discard unsaved content.");
        clearModalContent(); 
        onClose();
      } else {
        // User chose not to discard, so modal remains open. 
        // If recording was stopped, it remains stopped.
        return; 
      }
    } else {
      // If there was no unhandled content, or if recording was active and stopped (user implicitly agreed by closing),
      // or if user confirmed discard.
      console.log("[VoiceSummaryModal handleCloseModal] No unhandled content or confirmed discard. Closing and clearing.");
      clearModalContent(); 
      onClose();
    }
  }, [generatedNotes, handleStopRecordingAndCleanup, clearModalContent, onClose]);

  React.useEffect(() => {
    if (isOpen) {
      micButtonRef.current?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          handleCloseModal();
        }
      };
      document.addEventListener('keydown', handleKeyDown as EventListener);
      return () => { document.removeEventListener('keydown', handleKeyDown as EventListener); };
    } else {
      // Cleanup when modal is closed for any reason
      console.log("[VoiceSummaryModal useEffect isOpen=false] Cleaning up...");
      handleStopRecordingAndCleanup(); 
      // clearModalContent(); // Content clearing is now primarily handled by handleCloseModal or explicitly by user.
    }
  }, [isOpen, handleCloseModal, handleStopRecordingAndCleanup]);

  React.useEffect(() => {
    const statusDiv = document.getElementById('voice-summary-status');
    if (!statusDiv) return;

    if (isOpen) {
      if (isRecordingFromStore) {
        if (legacySummary !== '') { setVoiceSummaryLegacySummary(''); }
        statusDiv.textContent = 'Recording active.';
      } else { // NOT RECORDING (i.e., paused or never started)
        // Check if the current transcription already indicates a paused state set by handleStopRecordingAndCleanup
        const alreadyPaused = transcription.endsWith('(paused).');
        
        // Only set a generic "paused" message if handleStopRecordingAndCleanup hasn't already set a more specific one.
        if (!alreadyPaused) {
          const isActiveStateIndicatingItWasJustActive = 
            transcription.includes('Recording in progress...') ||
            transcription.includes('(recording resumed)...') ||
            transcription.includes('--- Recording Resumed ---') ||
            transcription.includes('Listening...') ||
            transcription.includes('Connecting to transcription service...') ||
            transcription.includes('Initializing microphone...') ||
            transcription.includes('Microphone active. Streaming audio...');

          if (isActiveStateIndicatingItWasJustActive) {
            // This block is for when recording stops NOT via handleRecordToggle (e.g. modal closed unexpectedly)
            // or if handleStopRecordingAndCleanup didn't set the message yet.
            let genericPausedMessage = 'Transcription captured (paused).';
            if (finalizedTranscriptContent.current.trim()) {
              genericPausedMessage = finalizedTranscriptContent.current.trimEnd() + ' (paused).';
            }
            if (genericPausedMessage !== transcription) {
              setVoiceSummaryTranscription(genericPausedMessage);
            }
          } else if (transcription === initialTranscriptionPlaceholder || statusDiv.textContent === 'Recording active.') {
            // If it was never active or has been reset
            statusDiv.textContent = 'Ready to record.';
          } else {
            // If it has some content but wasn't just active (e.g. loaded previous state)
            statusDiv.textContent = 'Content captured.'; 
          }
        } else {
          // If alreadyPaused is true, it means handleStopRecordingAndCleanup did its job.
          // We can just set the statusDiv text based on the content.
          statusDiv.textContent = finalizedTranscriptContent.current.trim() 
            ? 'Content captured (paused).' 
            : 'Ready to record (paused).';
        }

        // Legacy summary logic (can probably be simplified or removed if not used)
        if (legacySummary !== 'Summary of recorded content [placeholder].') {
          setVoiceSummaryLegacySummary('Summary of recorded content [placeholder].');
        }
      }
    } else { 
      statusDiv.textContent = ''; 
    }
  }, [isOpen, isRecordingFromStore, transcription, legacySummary, setVoiceSummaryTranscription, setVoiceSummaryLegacySummary]);

  // Effect to manage targetDocument based on document availability and modal state
  React.useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current) { // Modal was previously closed and is now open
        if (hasActiveDocument) {
          setTargetDocument('current');
        } else {
          setTargetDocument('new');
        }
      } else { // Modal was already open
        // If no document is active (e.g., was closed while modal is open) 
        // and the current target is 'current', switch to 'new'.
        if (!hasActiveDocument && targetDocument === 'current') {
          setTargetDocument('new');
        }
      }
    }
    // Always update the ref to the current isOpen state for the next render.
    prevIsOpenRef.current = isOpen;
  }, [isOpen, hasActiveDocument, targetDocument, setTargetDocument]); // targetDocument and setTargetDocument are needed for the conditions and actions within the effect.

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

  const connectWebSocket = async (url: string, token: string): Promise<boolean> => {
    if (!url || !token) {
      toast.error('WebSocket configuration not available. Cannot connect.');
      console.error('[VoiceSummaryModal connectWebSocket] Missing URL or token parameters.');
      setVoiceSummaryTranscription('Error: WebSocket configuration missing. Please try reopening the modal or contact support.');
      return false; // Return a promise resolving to false
    }

    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      console.log("[VoiceSummaryModal connectWebSocket] WebSocket connection already open.");
      return true; // Return a promise resolving to true
    }

    if (webSocketRef.current) {
      console.log("[VoiceSummaryModal connectWebSocket] Closing existing WebSocket connection before reopening.");
      webSocketRef.current.onopen = null; // Clear old handlers
      webSocketRef.current.onmessage = null;
      webSocketRef.current.onerror = null;
      webSocketRef.current.onclose = null;
      webSocketRef.current.close();
    }
    
    // DO NOT clear finalizedTranscriptContent.current or currentUtteranceContent.current here.
    // The caller (handleRecordToggle) is responsible for setting the initial state and message.

    return new Promise((resolve, reject) => { // MODIFIED: Return a Promise
      try {
        const fullUrl = `${url}?auth_token=${encodeURIComponent(token)}`;
        console.log(`[VoiceSummaryModal connectWebSocket] Attempting to connect to: ${fullUrl}`);
        webSocketRef.current = new WebSocket(fullUrl);

        webSocketRef.current.onopen = () => {
          console.log("[VoiceSummaryModal WebSocket] Connection Opened (onopen).");
          // finalizedTranscriptContent.current already has the prefix (e.g., "--- Recording Started ---\n")
          // and the UI was set to "PREFIX\nConnecting to transcription service..." by handleRecordToggle.
          // Now update it to "PREFIX\nConnection established. Listening..."
          setVoiceSummaryTranscription(finalizedTranscriptContent.current + "Connection established. Listening..."); 
          reconnectionAttemptsRef.current = 0;
          resolve(true); // Resolve promise on successful open
        };

        webSocketRef.current.onmessage = (event) => {
          try {
            const messageData = JSON.parse(event.data as string);
            console.log("[VoiceSummaryModal WebSocket] Message received:", messageData);

            if (messageData.type === 'transcript_update') {
              if (messageData.is_final) {
                finalizedTranscriptContent.current += messageData.text + ' ';
                currentUtteranceContent.current = '';
              } else {
                currentUtteranceContent.current = messageData.text;
              }
              
              let baseTranscript = finalizedTranscriptContent.current;
              let liveUtterance = currentUtteranceContent.current;
              let fullDisplay = baseTranscript + liveUtterance;

              const prefixRegex = /^(--- Recording (Started|Resumed) ---\n)/;
              const match = baseTranscript.match(prefixRegex);
              let contentAfterPrefixIsEmpty = true;

              if (match) {
                  const prefix = match[0];
                  // Check if restOfBase (after prefix) OR liveUtterance has meaningful content
                  const restOfBase = baseTranscript.substring(prefix.length);
                  if (restOfBase.trim() !== '' || liveUtterance.trim() !== '') {
                      contentAfterPrefixIsEmpty = false;
                  }
              } else { // Should ideally not happen if handleRecordToggle sets prefix
                  if (fullDisplay.trim() !== '') contentAfterPrefixIsEmpty = false;
              }

              if (contentAfterPrefixIsEmpty) {
                  debouncedSetVoiceSummaryTranscription(baseTranscript + "Listening...");
              } else {
                  debouncedSetVoiceSummaryTranscription(fullDisplay.trim());
              }

            } else if (messageData.type === 'session_begin') {
              console.log("[VoiceSummaryModal WebSocket] Session began with ID:", messageData.session_id);
            } else if (messageData.type === 'session_terminated') {
              console.log("[VoiceSummaryModal WebSocket] Session terminated by server. Duration:", messageData.audio_duration_seconds);
            } else if (messageData.type === 'error') {
              console.error("[VoiceSummaryModal WebSocket] Error message from server:", messageData.message);
              toast.error(`Server error: ${messageData.message}`);
            }
          } catch (e) {
            console.error("[VoiceSummaryModal WebSocket] Error processing message:", e, "Raw data:", event.data);
          }
        };

        webSocketRef.current.onerror = (event) => {
          console.error("[VoiceSummaryModal WebSocket] Error event (onerror):", event);
          const currentContent = (finalizedTranscriptContent.current + currentUtteranceContent.current).trim();
          // Use currentContent if available, otherwise fallback to the prefix in finalizedTranscriptContent
          const messageBase = currentContent || finalizedTranscriptContent.current.trim(); 
          setVoiceSummaryTranscription(messageBase + " (WebSocket connection error. Please try again.)");
          resolve(false); 
        };

        webSocketRef.current.onclose = (event) => {
          console.log("[VoiceSummaryModal WebSocket] Connection Closed (onclose). Code:", event.code, "Reason:", event.reason, "Was Clean:", event.wasClean);
          
          const lastUtterance = currentUtteranceContent.current.trim();
          if (lastUtterance) {
            finalizedTranscriptContent.current += lastUtterance + ' '; 
            currentUtteranceContent.current = ''; 
          }
          
          let messageOnClose = finalizedTranscriptContent.current.trim();

          if (!event.wasClean) {
            setVoiceSummaryTranscription(messageOnClose + " (WebSocket connection closed unexpectedly.)");
            if (isRecordingRef.current) { 
              handleReconnection(); 
            }
          } else {
            const prefixPattern = /^---\s(Recording Started|Recording Resumed)\s---$/; // Check if it's ONLY the prefix
            if (prefixPattern.test(messageOnClose)) {
              setVoiceSummaryTranscription(messageOnClose + " (No speech detected.)");
            } else {
              setVoiceSummaryTranscription(messageOnClose + " (Connection closed.)");
            }
          }
          resolve(false); 
        };
      } catch (error: any) {
        console.error('[VoiceSummaryModal connectWebSocket] Error instantiating WebSocket:', error);
        setVoiceSummaryTranscription('Error: Failed to initialize WebSocket connection. Please check your internet connection and try restarting the recording.');
        resolve(false); // Resolve false on instantiation error
      }
    });
  };

  const startAudioCaptureAndStreaming = async () => {
    console.log("[VoiceSummaryModal] Entering startAudioCaptureAndStreaming.");
    setVoiceSummaryTranscription('Initializing microphone...');

    // --- Block 1: Ensure AudioContext is initialized and running --- 
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      console.log("[VoiceSummaryModal Block 1] AudioContext is null or closed. Attempting to create/recreate.");
      try {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
        console.log(`[VoiceSummaryModal Block 1] AudioContext created/recreated. Initial state: ${audioContextRef.current.state}, SR: ${audioContextRef.current.sampleRate}`);
      } catch (e) {
        console.error("[VoiceSummaryModal Block 1] Error creating AudioContext:", e);
        audioContextRef.current = null;
      }
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      console.log("[VoiceSummaryModal Block 1] AudioContext is suspended. Attempting to resume...");
      try {
        await audioContextRef.current.resume();
        console.log(`[VoiceSummaryModal Block 1] AudioContext resume attempt complete. New state: ${audioContextRef.current?.state}`);
      } catch (err) {
        console.error("[VoiceSummaryModal Block 1] Error resuming AudioContext:", err);
        // If resume fails, the context might remain suspended or become closed.
      }
    }
    // --- End Block 1 ---

    // Check if WebSocket connection is established and ready
    console.log(`[VoiceSummaryModal PRE-WS-CHECK] WebSocket readyState: ${webSocketRef.current?.readyState}`);
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) { 
      let msg = finalizedTranscriptContent.current;
      if (isRecordingRef.current && currentUtteranceContent.current) { msg += currentUtteranceContent.current; }
      if (msg && !/\s$/.test(msg)) { msg += ' '; }
      msg += '(Error: WebSocket connection not ready. Please ensure connection is established before starting audio stream.)';
      setVoiceSummaryTranscription(msg);
      toast.error('WebSocket not connected. Cannot start audio streaming.');
       if (isRecordingRef.current) {
           toggleVoiceSummaryRecording(); 
       }
      return;
    }
    
    // --- Block 2: Validate AudioContext status AFTER Block 1 attempts --- 
    console.log(`[VoiceSummaryModal PRE-AC-CHECK (Block 2)] audioContextRef.current is null? ${!audioContextRef.current}. State (if exists): ${audioContextRef.current?.state}`);
    if (!audioContextRef.current || audioContextRef.current.state !== 'running') { 
      let errorReasonB2 = "AudioContext issue after initialization attempts.";
      if (!audioContextRef.current) {
        errorReasonB2 = "AudioContext is null";
      } else {
        errorReasonB2 = `AudioContext state is '${audioContextRef.current.state}' (expected 'running')`;
      }
      const msgB2 = finalizedTranscriptContent.current + `(Error: Audio context not ready. ${errorReasonB2}. Please try again.)`;
      setVoiceSummaryTranscription(msgB2);
      console.error(`[VoiceSummaryModal Block 2 FAIL] AudioContext check failed. ${errorReasonB2}`);
      if (isRecordingRef.current) { 
        toggleVoiceSummaryRecording(); 
      }
      return;
    }
    // --- End Block 2 ---

    let initMsg = finalizedTranscriptContent.current;
    if (isRecordingRef.current && currentUtteranceContent.current) { initMsg += currentUtteranceContent.current; }
    if (initMsg && !/[\s\)]$/.test(initMsg)) { initMsg += ' '; }
    initMsg += '(Initializing microphone...)';
    setVoiceSummaryTranscription(initMsg);

    try {
      localMediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      });
      
      // --- Block 3: Final check of AudioContext before creating MediaStreamSource --- 
      // AudioContext should be valid and running from Block 1 & 2. This is a sanity check.
      console.log(`[VoiceSummaryModal PRE-MS-SRC-CHECK (Block 3)] audioContextRef.current state: ${audioContextRef.current?.state}`);
      if (!audioContextRef.current || audioContextRef.current.state !== 'running') {
        const fatalErrorReasonB3 = audioContextRef.current ? `state became ${audioContextRef.current.state}` : "became null";
        console.error(`[VoiceSummaryModal Block 3 FATAL] AudioContext no longer valid before creating MediaStreamSource. Reason: ${fatalErrorReasonB3}`);
        const fatalMsgB3 = finalizedTranscriptContent.current + `(FATAL: Audio system became unstable (${fatalErrorReasonB3}). Please try again.)`;
        setVoiceSummaryTranscription(fatalMsgB3);
        if (isRecordingRef.current) toggleVoiceSummaryRecording();
        return;
      }
      // --- End Block 3 ---
      microphoneSourceRef.current = audioContextRef.current.createMediaStreamSource(localMediaStreamRef.current);
      
      // Setup AnalyserNode
      analyserNodeRef.current = audioContextRef.current.createAnalyser();
      analyserNodeRef.current.fftSize = 2048; // Example FFT size
      const bufferLength = analyserNodeRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      setAnalyserData(dataArray); // Initialize state with correct size

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
      // Connect audio graph: Source -> Analyser -> Worklet
      microphoneSourceRef.current.connect(analyserNodeRef.current);
      analyserNodeRef.current.connect(audioWorkletNodeRef.current);
      // The AudioWorkletNode (audio-processor) is now only sending data via its port for the WebSocket.
      // It is NOT connected to audioContext.destination, so no microphone passthrough audio will be heard.

      // Start visualization loop
      const visualize = () => {
        // console.log('[VoiceSummaryModal] Visualize function entered. isRecording (ref):', isRecordingRef.current, 'analyserNode:', !!analyserNodeRef.current);
        if (analyserNodeRef.current && isRecordingRef.current) { 
          animationFrameCounterRef.current++; // Increment counter
          // console.log('[VoiceSummaryModal] Visualize loop running. animationFrameId:', animationFrameIdRef.current);
          const currentDataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
          analyserNodeRef.current.getByteTimeDomainData(currentDataArray);
          
          if (animationFrameCounterRef.current % 2 === 0) { // Only update analyserData every 3rd frame
            setAnalyserData(currentDataArray);
          }

          // if (animationFrameIdRef.current && animationFrameIdRef.current % 30 === 0) { 
          //   // console.log('[VoiceSummaryModal - Visualize Data]', currentDataArray.slice(0, 10));
          // }

          animationFrameIdRef.current = requestAnimationFrame(visualize);
        } else { 
          if (animationFrameIdRef.current) {
            // console.log('[VoiceSummaryModal] Visualize loop stopping. isRecording (ref):', isRecordingRef.current, 'analyserNode:', !!analyserNodeRef.current);
            cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = null;
          }
          setAnalyserData(new Uint8Array(0)); 
          animationFrameCounterRef.current = 0; // Reset counter when stopping
        } 
        // else {
        //   console.log('[VoiceSummaryModal] Visualize loop not starting/continuing. isRecording (ref):', isRecordingRef.current, 'analyserNode:', !!analyserNodeRef.current);
        // }
      };
      console.log('[VoiceSummaryModal] Initiating visualization loop...');
      animationFrameIdRef.current = requestAnimationFrame(visualize);

      let activeMsg = finalizedTranscriptContent.current;
      if (isRecordingRef.current && currentUtteranceContent.current) { activeMsg += currentUtteranceContent.current; }
      if (activeMsg && !/[\s\)]$/.test(activeMsg)) { activeMsg += ' '; }
      activeMsg += '(Microphone active. Streaming audio...)';
      setVoiceSummaryTranscription(activeMsg);

    } catch (err) {
      let errMsg = finalizedTranscriptContent.current;
      if (isRecordingRef.current && currentUtteranceContent.current) { errMsg += currentUtteranceContent.current; }
      if (errMsg && !/[\s\)]$/.test(errMsg)) { errMsg += ' '; }
      errMsg += '(Microphone access denied or error. Please check permissions and try again.)';
      setVoiceSummaryTranscription(errMsg);

      if (isRecordingRef.current) {
        toggleVoiceSummaryRecording();
      }
      disconnectWebSocket(false);
    }
  };

  const handleReconnection = () => {
    if (reconnectionAttemptsRef.current < MAX_RECONNECTION_ATTEMPTS) {
      reconnectionAttemptsRef.current++;
      const delay = RECONNECTION_DELAY_BASE * reconnectionAttemptsRef.current;
      let reconMsg1 = finalizedTranscriptContent.current;
      if (isRecordingRef.current && currentUtteranceContent.current) { reconMsg1 += currentUtteranceContent.current; }
      if (reconMsg1 && !/[\s\)]$/.test(reconMsg1)) { reconMsg1 += ' '; }
      reconMsg1 += `(Connection lost. Attempting to reconnect (${reconnectionAttemptsRef.current}/${MAX_RECONNECTION_ATTEMPTS})...)`;
      setVoiceSummaryTranscription(reconMsg1);
      setTimeout(() => {
        if (isRecordingRef.current) {
          connectWebSocket(websocketUrl as string, websocketAuthToken as string);
        } else {
          reconnectionAttemptsRef.current = 0;
        }
      }, delay);
    } else {
      let reconMsg2 = finalizedTranscriptContent.current;
      if (isRecordingRef.current && currentUtteranceContent.current) { reconMsg2 += currentUtteranceContent.current; }
      if (reconMsg2 && !/[\s\)]$/.test(reconMsg2)) { reconMsg2 += ' '; }
      reconMsg2 += '(Failed to reconnect after multiple attempts. Please restart recording.)';
      setVoiceSummaryTranscription(reconMsg2);
      if (isRecordingRef.current) {
        toggleVoiceSummaryRecording();
      }
      reconnectionAttemptsRef.current = 0;
    }
  };

  const handleRecordToggle = async () => {
    console.log("[VoiceSummaryModal handleRecordToggle] Called. Current recording state (from store): ", isRecordingFromStore);
    console.log("[VoiceSummaryModal handleRecordToggle] finalizedTranscriptContent.current AT START:", JSON.stringify(finalizedTranscriptContent.current));

    if (isGeneratingNotes) {
        toast.info("Please wait for notes generation to complete.");
        return;
    }
    if (isFetchingConfig) {
        toast.info("Please wait, fetching server configuration...");
        return;
    }

    const newRecordingState = !isRecordingRef.current; // Target state after toggle

    if (newRecordingState) { // Attempting to START recording
      let currentWebsocketUrl = websocketUrl; // Try to use existing state first
      let currentWebsocketAuthToken = websocketAuthToken;

      // If config not in state, fetch it
      if (!currentWebsocketUrl || !currentWebsocketAuthToken) {
        console.log('[VoiceSummaryModal] Config not in state, fetching before starting recording attempt.');
        const fetchedConfig = await fetchWebsocketConfig();
        console.log('[VoiceSummaryModal handleRecordToggle] fetchedConfig:', fetchedConfig);
        
        if (!fetchedConfig || !fetchedConfig.websocketUrl || !fetchedConfig.websocketAuthToken) {
          toast.error("Could not fetch server configuration. Please try again.");
          return; 
        }
        currentWebsocketUrl = fetchedConfig.websocketUrl;
        currentWebsocketAuthToken = fetchedConfig.websocketAuthToken;
      }

      console.log('[VoiceSummaryModal handleRecordToggle] Values before second check:', { currentWebsocketUrl, currentWebsocketAuthToken });
      if (!currentWebsocketUrl || !currentWebsocketAuthToken) {
          toast.error("WebSocket configuration is still missing after fetch attempt. Cannot start recording.");
          return;
      }
      
      toggleVoiceSummaryRecording(); // Optimistically update recording state in store (triggers UI)

      let initialDisplayMessage = '';
      console.log("[VoiceSummaryModal handleRecordToggle] About to check finalizedTranscriptContent.current.trim(). Current value:", JSON.stringify(finalizedTranscriptContent.current));
      if (finalizedTranscriptContent.current.trim()) { 
        if (!finalizedTranscriptContent.current.endsWith('\n')) { // Corrected check from \\n to \n
          finalizedTranscriptContent.current += '\n';
        }
        finalizedTranscriptContent.current += '--- Recording Resumed ---\n';
        initialDisplayMessage = finalizedTranscriptContent.current + "Connecting to transcription service...";
      } else {
        finalizedTranscriptContent.current = '--- Recording Started ---\n';
        initialDisplayMessage = finalizedTranscriptContent.current + "Connecting to transcription service...";
      }
      currentUtteranceContent.current = ''; // Clear current utterance for new/resumed session
      setGeneratedNotes(null); // Clear previous notes
      setNotesError(null);
      
      setVoiceSummaryTranscription(initialDisplayMessage); // Set UI to show prefix + connecting

      console.log('[VoiceSummaryModal handleRecordToggle] Calling connectWebSocket with:', { currentWebsocketUrl, currentWebsocketAuthToken });
      try {
        const connected = await connectWebSocket(currentWebsocketUrl, currentWebsocketAuthToken); 
        if (connected && webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
           await startAudioCaptureAndStreaming(); 
        } else {
          // Construct message using the already prefixed finalizedTranscriptContent
          let failConnectMsg = finalizedTranscriptContent.current.trim();
          // if (currentUtteranceContent.current) { failConnectMsg += currentUtteranceContent.current; } // currentUtterance is cleared above
          if (failConnectMsg && !/[\s\)]$/.test(failConnectMsg)) { failConnectMsg += ' '; }
          failConnectMsg += '(Failed to connect. Please try again.)';
          setVoiceSummaryTranscription(failConnectMsg);
          if (isRecordingRef.current) { 
            toggleVoiceSummaryRecording(); 
          }
        }
      } catch (error) {
        let initErrorMsg = finalizedTranscriptContent.current.trim();
        // if (currentUtteranceContent.current) { initErrorMsg += currentUtteranceContent.current; } // currentUtterance is cleared above
        if (initErrorMsg && !/[\s\)]$/.test(initErrorMsg)) { initErrorMsg += ' '; }
        initErrorMsg += '(Error initializing recording. Please try again.)';
        setVoiceSummaryTranscription(initErrorMsg);
        if (isRecordingRef.current) { 
            toggleVoiceSummaryRecording(); 
        }
      }
    } else { // Attempting to STOP recording
      const wasCurrentlyRecording = isRecordingRef.current; // Check *before* toggling state

      toggleVoiceSummaryRecording(); // Update store state (isRecordingFromStore -> false, which updates isRecordingRef.current)
      
      handleStopRecordingAndCleanup(); // Perform actual cleanup actions

      if (wasCurrentlyRecording) { // If we actually stopped a recording session
        console.log("[VoiceSummaryModal handleRecordToggle] Setting paused message after stopping.");
        let pausedMessage = 'Transcription captured (paused).'; 
        // Use finalizedTranscriptContent which should now include the last utterance
        const trimmedFinalContent = finalizedTranscriptContent.current.trim();
        const prefixPattern = /^---\s(Recording Started|Recording Resumed)\s---$/;

        if (trimmedFinalContent && !prefixPattern.test(trimmedFinalContent)) { // Ensure it's not just the prefix
          pausedMessage = trimmedFinalContent;
          if (!pausedMessage.endsWith('.') && !pausedMessage.endsWith('?') && !pausedMessage.endsWith('!')) {
            pausedMessage += '.'; 
          }
          pausedMessage += ' (paused).';
        } else if (prefixPattern.test(trimmedFinalContent)) {
          pausedMessage = trimmedFinalContent + ' (No speech detected, paused).';
        }
        setVoiceSummaryTranscription(pausedMessage);
      }
    }
  };

  const handleGenerateNotes = async () => {
    const cleanedFinalizedContent = finalizedTranscriptContent.current
      .replace(/Transcription session started...\n/gi, '')
      .replace(/Session terminated...\n/gi, '')
      .trim();

    if (!cleanedFinalizedContent) {
      setNotesError('No actual transcription content available to process.');
      toast.info('No transcription available to process.');
      return;
    }

    setIsGeneratingNotes(true);
    setNotesError(null);
    setGeneratedNotes(null);

    const currentAction = notesAction; // Capture current action for consistent use in async/toast
    const actionVerb = currentAction === 'summary' ? 'summarize' : 'prettify';
    const actionNoun = currentAction === 'summary' ? 'summary' : 'prettified transcript';
    const actionInProgress = currentAction === 'summary' ? 'Generating summary...' : 'Prettifying transcript...';

    try {
      await toast.promise(
        async () => {
          let result: { notes?: string | null; error?: string | null; } = { error: "Unknown action" };
          if (currentAction === 'summary') {
            result = await generateNotesFromTranscript(cleanedFinalizedContent);
          } else if (currentAction === 'prettify') {
            result = await prettifyTranscript(cleanedFinalizedContent);
          }

          if (result.error) {
            throw new Error(result.error);
          } else if (result.notes) {
            setGeneratedNotes(result.notes);
            setActiveTab('notes');
            return `${actionNoun} generated successfully!`;
          } else {
            throw new Error(`${actionNoun} generation returned no content.`);
          }
        },
        {
          loading: actionInProgress,
          success: (message) => message,
          error: (err) => {
            setNotesError(err.message);
            setGeneratedNotes(null);
            // actionVerb and actionNoun are available here from the outer scope
            return `Failed to ${actionVerb} transcript: ${err.message}`;
          },
        }
      );
    } catch (error: any) { // Catch errors from the promise setup itself or unhandled rejections
      console.error(`Unexpected error during ${currentAction} process:`, error);
      setNotesError(`An unexpected error occurred: ${error.message}`);
      // actionVerb is available here
      toast.error(`An unexpected error occurred while trying to ${actionVerb} the transcript.`);
      setGeneratedNotes(null);
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  // Handler to add content to the currently active editor (BlockNote specific)
  const handleAddToEditor = async (content: string) => {
    if (!editorRef?.current) {
      toast.error('Editor instance not available.');
      return;
    }
    if (!content || content.trim() === '') {
      toast.info('No content to add to the editor.');
      return;
    }

    const editor = editorRef.current;

    try {
      let blocksToInsert: PartialBlock[] = await editor.tryParseMarkdownToBlocks(content);

      if (blocksToInsert.length === 0 && content.trim() !== '') {
        blocksToInsert = [{ type: 'paragraph', content: [{ type: 'text', text: content, styles: {} }] }];
      }
      
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
        editor.replaceBlocks(editor.document, blocksToInsert);
      }
      
      toast.success('Content added to editor.');
      // clearModalContent(); // Consider if this is needed or if onClose handles it
      onClose(); // Close modal after adding content
    } catch (error: any) {
      console.error('Error adding content to editor:', error);
      toast.error(`Failed to add content to editor: ${error.message}`);
    }
  };

  // --- NEW: Handler for creating a new document with content ---
  const handleCreateNewDocumentWithContent = async (contentToSave: string) => {
    if (!editorRef?.current) {
      toast.error("Editor instance not available. Cannot format content for new document.");
      return;
    }
    if (!contentToSave || contentToSave.trim() === '') {
      toast.error("No content available to create a new document.");
      return;
    }

    setIsCreatingNewDocument(true);
    toast.info("Creating new document...");

    try {
      let blocksToInsert: PartialBlock[] = await editorRef.current.tryParseMarkdownToBlocks(contentToSave);

      if (blocksToInsert.length === 0 && contentToSave.trim() !== '') {
        // If parsing fails but content exists, create a simple paragraph block
        blocksToInsert = [{ type: 'paragraph', content: [{ type: 'text', text: contentToSave, styles: {} }] }];
      }
      
      if (blocksToInsert.length === 0) {
          toast.info("No content to insert after formatting.");
          setIsCreatingNewDocument(false);
          return;
      }

      const response = await fetch('/api/documents/create-with-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Title can be added here if needed, e.g., from a new input field or derived
          // title: `Voice Note - ${new Date().toLocaleString()}`, 
          content: blocksToInsert, // Send BlockNote JSON content
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to create new document. Please try again.' } }));
        throw new Error(errorData.error?.message || 'Failed to create new document.');
      }

      const result = await response.json();
      const newDocumentId = result.data?.documentId;

      if (!newDocumentId) {
        throw new Error('Failed to get new document ID from response.');
      }

      toast.success('New document created successfully!');
      onClose(); 
      router.push(`/editor/${newDocumentId}`);
    } catch (error: any) {
      console.error('Error creating new document with content:', error);
      toast.error(error.message || 'An unexpected error occurred while creating the document.');
    } finally {
      setIsCreatingNewDocument(false);
    }
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
        className="bg-[var(--editor-bg)] text-[--text-color] p-6 rounded-lg shadow-xl w-full max-w-lg relative flex flex-col max-h-[90vh] animate-modalFadeIn"
      >
        <button
          onClick={handleCloseModal}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-[--hover-bg] text-[--text-color]"
          aria-label="Close voice summary modal"
        >
          <X size={20} />
        </button>
        <h2 id="voiceSummaryModalTitle" className="text-xl font-semibold mb-4 text-center">Voice Summary</h2>
        
        {/* Audio Visualizer - Placed above tabs for visibility during recording */}
        {isRecordingRef.current && (
          <div className="my-3 h-16 w-full bg-gray-800 rounded-md overflow-hidden">
            <CustomAudioVisualizer audioTimeDomainData={analyserData} barColor='#4A90E2' barWidth={3} barGap={2} sensitivity={3} />
          </div>
        )}

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
            {isGeneratingNotes && !toast.loading ? ( // Show placeholder only if not handled by toast
              <p className="text-sm text-[--muted-text-color] animate-pulse">
                {notesAction === 'summary' ? 'Generating summary...' : 'Prettifying transcript...'}
              </p>
            ) : notesError ? (
              <p className="text-sm text-red-500 whitespace-pre-wrap">Error: {notesError}</p>
            ) : generatedNotes ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {generatedNotes}
              </ReactMarkdown>
            ) : (
              <p className="text-sm text-[--muted-text-color]">
                {transcriptionAvailable
                  ? (notesAction === 'summary'
                    ? "Select 'Generate Summary' to create an AI-generated summary."
                    : "Select 'Prettify Transcript' to clean up and format the transcription.")
                  : "Record or ensure transcription is available to process."}
              </p>
            )}
          </TabsContent>
        </Tabs>
        <div className="mt-auto pt-4 border-t border-[--border-color]">
          {/* Row 1: Target Selection Toggle (right-aligned) */}
          <div className="flex justify-end mb-3">
            <div className="flex items-center rounded-md" role="radiogroup" aria-labelledby="target-document-label">
              <span id="target-document-label" className="sr-only">Select target document</span>
              <Button
                onClick={() => setTargetDocument('current')}
                variant={targetDocument === 'current' ? 'default' : 'outline'}
                size="sm" // h-9
                className="rounded-r-none text-xs px-3" // Keep px-3 for these
                disabled={!hasActiveDocument}
                aria-pressed={targetDocument === 'current'}
              >
                Current
              </Button>
              <Button
                onClick={() => setTargetDocument('new')}
                variant={targetDocument === 'new' ? 'default' : 'outline'}
                size="sm" // h-9
                className="rounded-l-none border-l-0 text-xs px-3" // Keep px-3 for these
                aria-pressed={targetDocument === 'new'}
              >
                New
              </Button>
            </div>
          </div>

          {/* Row 2: Main Action & Utility Buttons (distributed) */}
          <div className="flex justify-between items-center gap-2">
            {/* Clear Button */}
            <Button
              onClick={() => {
                setVoiceSummaryTranscription(initialTranscriptionPlaceholder);
                finalizedTranscriptContent.current = '';
                currentUtteranceContent.current = '';
                setGeneratedNotes(null);
                setNotesError(null);
                toast.info("Transcription and notes cleared.");
              }}
              disabled={isRecordingRef.current || (!transcriptionAvailable && !notesAvailable)}
              variant="outline"
              size="sm" // h-9
              className="flex items-center text-xs px-2" // Compact padding
            >
              <Eraser size={14} className="mr-1.5" />
              Clear
            </Button>

            {/* Notes Generation Split Button */}
            <div className="flex items-center">
              <Button
                onClick={handleGenerateNotes}
                disabled={isRecordingRef.current || isGeneratingNotes || !transcriptionAvailable}
                variant="outline"
                size="sm" // h-9
                className="flex items-center text-xs rounded-r-none px-2" // Compact padding
              >
                {isGeneratingNotes ? (
                  <span className="animate-spin mr-1.5">⏳</span>
                ) : (
                  <BotMessageSquare size={14} className="mr-1.5" />
                )}
                {isGeneratingNotes
                  ? (notesAction === 'summary' ? "Summarizing..." : "Prettifying...")
                  : (notesAction === 'summary' ? "Summary" : "Prettify")}
              </Button>
              <Select
                value={notesAction}
                onValueChange={(value: 'summary' | 'prettify') => setNotesAction(value)}
                disabled={isGeneratingNotes || isRecordingRef.current || !transcriptionAvailable}
              >
                <SelectTrigger
                  className="h-9 px-1 text-xs rounded-l-none border-l-0" // Changed px-2 to px-1
                  aria-label="Select notes action type"
                >
                  {/* ChevronDown icon is typically part of SelectTrigger by default */}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary" className="text-xs">Generate Summary</SelectItem>
                  <SelectItem value="prettify" className="text-xs">Prettify Transcript</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Content Selection / Main Action Split Button */}
            <div className="flex items-center">
              <Button
                onClick={() => {
                  const hasContent = (activeTab === 'transcription' && transcriptionAvailable) || (activeTab === 'notes' && notesAvailable);
                  let contentToInsert = '';

                  if (insertionType === 'active') {
                    if (activeTab === 'transcription' && transcriptionAvailable) {
                      contentToInsert = finalizedTranscriptContent.current;
                    } else if (activeTab === 'notes' && notesAvailable) {
                      contentToInsert = generatedNotes || '';
                    }
                  } else if (insertionType === 'transcription' && transcriptionAvailable) {
                    contentToInsert = finalizedTranscriptContent.current;
                  } else if (insertionType === 'notes' && notesAvailable) {
                    contentToInsert = generatedNotes || '';
                  } else if (insertionType === 'both' && transcriptionAvailable && notesAvailable) {
                    contentToInsert = `## Transcription\n\n${finalizedTranscriptContent.current}\n\n## Notes\n\n${generatedNotes || ''}`;
                  }
                  
                  // --- Conditional call to handler based on targetDocument ---
                  if (hasContent && contentToInsert.trim()) {
                    if (targetDocument === 'current') {
                      if(hasActiveDocument) { // Ensure there is an active document for 'current'
                        handleAddToEditor(contentToInsert);
                      } else {
                        toast.error("No active document to add to. Please open a document first or select 'Create New'.")
                      }
                    } else { // targetDocument === 'new'
                      handleCreateNewDocumentWithContent(contentToInsert);
                    }
                  } else {
                    toast.info("No content available for the selected option or content is empty.");
                  }
                }}
                disabled={
                  isGeneratingNotes || isRecordingRef.current || isCreatingNewDocument || // <-- Disable if creating
                  // Disable if target is 'current' but no active editor
                  (targetDocument === 'current' && !hasActiveDocument) || 
                  (insertionType === 'active' && !((activeTab === 'transcription' && transcriptionAvailable) || (activeTab === 'notes' && notesAvailable))) ||
                  (insertionType === 'transcription' && !transcriptionAvailable) ||
                  (insertionType === 'notes' && !notesAvailable) ||
                  (insertionType === 'both' && (!transcriptionAvailable || !notesAvailable))
                }
                variant="default" // Primary action
                size="sm" // h-9
                className="flex items-center text-xs rounded-r-none px-2" // Compact padding
                aria-live="polite" // Announce label changes
              >
                <FilePlus2 size={14} className="mr-1.5" />
                {targetDocument === 'current' ? 'Add to Current' : 'Create New'}
              </Button>
              <Select 
                value={insertionType} 
                onValueChange={(value: 'active' | 'transcription' | 'notes' | 'both') => setInsertionType(value)}
                disabled={ // Simplified disabled logic for the select part
                  isGeneratingNotes || isRecordingRef.current || !editorRef || !editorRef.current ||
                  !((transcriptionAvailable || notesAvailable)) 
                }
              >
                <SelectTrigger
                  className="h-9 px-1 text-xs rounded-l-none border-l-0" // Changed px-2 to px-1
                  aria-label="Select content type to add to editor"
                >
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" className="text-xs">Insert Active Tab</SelectItem>
                  <SelectItem value="transcription" disabled={!transcriptionAvailable} className="text-xs">Transcription Only</SelectItem>
                  <SelectItem value="notes" disabled={!notesAvailable} className="text-xs">Notes/Summary Only</SelectItem>
                  <SelectItem value="both" disabled={!transcriptionAvailable || !notesAvailable} className="text-xs">Both (Transcription & Notes)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Record button */}
            <Button
              ref={micButtonRef}
              onClick={handleRecordToggle}
              aria-label={isRecordingRef.current ? 'Stop recording' : 'Start recording'}
              variant="outline" // Making it outline to be less prominent than main action
              size="sm" // h-9. For square, use w-9 too.
              className={`flex items-center justify-center w-9 p-0 rounded-full transition-colors ${isRecordingRef.current ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
            >
              {isRecordingRef.current ? <StopIcon size={18} /> : <Mic size={18} />}
            </Button>
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