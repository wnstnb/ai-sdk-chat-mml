import React from 'react';
import { useModalStore } from '@/stores/useModalStore';
import { X, Mic, Square as StopIcon } from 'lucide-react';

interface LiveSummariesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialTranscriptionPlaceholder = 'Transcription will appear here once recording starts...';
const initialSummaryPlaceholder = 'Summary will appear here after recording stops...';

export const LiveSummariesModal: React.FC<LiveSummariesModalProps> = ({ isOpen, onClose }) => {
  // ALL HOOKS ARE CALLED UNCONDITIONALLY AT THE TOP
  const isRecording = useModalStore(state => state.liveSummaries.isRecording);
  const transcription = useModalStore(state => state.liveSummaries.transcription);
  const summary = useModalStore(state => state.liveSummaries.summary);

  const toggleLiveSummariesRecording = useModalStore(state => state.toggleLiveSummariesRecording);
  const setLiveSummariesTranscription = useModalStore(state => state.setLiveSummariesTranscription);
  const setLiveSummariesSummary = useModalStore(state => state.setLiveSummariesSummary);

  const micButtonRef = React.useRef<HTMLButtonElement>(null);
  const modalContentRef = React.useRef<HTMLDivElement>(null); // Ref for the dialog content div
  const webSocketRef = React.useRef<WebSocket | null>(null);

  // TODO: Make WebSocket URL configurable
  const WEBSOCKET_URL = 'ws://localhost:8001/api/ws/transcriptions';

  const connectWebSocket = () => {
    if (webSocketRef.current && webSocketRef.current.readyState !== WebSocket.CLOSED) {
      console.log('WebSocket already connected or connecting.');
      return;
    }

    console.log('Attempting to connect WebSocket...');
    const ws = new WebSocket(WEBSOCKET_URL);
    webSocketRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection established.');
      // According to task 4.2, we will send { action: 'start', lang: 'en' } here
      // For now, just log. This will be handled in the next subtask.
    };

    ws.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      // Handle initial server 'connected' message if applicable
      // Actual transcription message handling will be in subtask 4.3
      try {
        const message = JSON.parse(event.data as string);
        if (message.event === 'connected') {
          console.log('Successfully connected to transcription server.');
        }
        // Further message processing will be implemented in subsequent subtasks
      } catch (error) {
        console.error('Failed to parse WebSocket message or unknown message format:', event.data, error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      webSocketRef.current = null; // Clean up ref on close
    };
  };

  const disconnectWebSocket = () => {
    if (webSocketRef.current) {
      console.log('Closing WebSocket connection...');
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
  };

  // Effect for initial focus and Escape key listener
  React.useEffect(() => {
    if (isOpen) {
      micButtonRef.current?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
          disconnectWebSocket(); // Ensure WebSocket is closed if modal is closed via Escape key
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        // Do not disconnect here if modal is simply unmounted but could be re-opened
        // Disconnection should be tied to explicit stop actions or modal close actions
      };
    } else {
      // If modal is closed (isOpen becomes false), ensure disconnection
      disconnectWebSocket();
    }
  }, [isOpen, onClose]);

  // Effect for managing transcription/summary placeholders and ARIA live region
  React.useEffect(() => {
    const statusDiv = document.getElementById('live-summaries-status');
    if (!statusDiv) return;

    if (isOpen) {
      if (isRecording) {
        let newTranscription = transcription;
        if (transcription === initialTranscriptionPlaceholder || transcription.trim() === '') {
          newTranscription = 'Recording in progress...';
        } else if (transcription.includes('(paused)')) {
          newTranscription = transcription.replace('(paused)', '(recording resumed)...');
        } else if (!transcription.includes('(recording resumed)...') && !transcription.includes('Recording in progress...')) {
          newTranscription = transcription + ' (recording resumed)...';
        }
        // Only update if changed to prevent potential loops if the value is already correct
        if (newTranscription !== transcription) {
          setLiveSummariesTranscription(newTranscription);
        }
        if (summary !== '') { // Always clear summary when recording starts/resumes
          setLiveSummariesSummary('');
        }
        statusDiv.textContent = 'Recording started.';
      } else { // isRecording is false
        if (transcription.includes('Recording in progress...') || transcription.includes('(recording resumed)...')) {
          const newTranscription = transcription
            .replace('Recording in progress...', 'Transcription captured (paused).')
            .replace('(recording resumed)...', '(paused).');
          // Only update if changed
          if (newTranscription !== transcription) {
             setLiveSummariesTranscription(newTranscription);
          }
          // Set summary placeholder only if it's not already set to this or something else substantial
          if (summary !== 'Summary of recorded content [placeholder].') {
            setLiveSummariesSummary('Summary of recorded content [placeholder].');
          }
          statusDiv.textContent = 'Recording stopped. Summary generated.';
        } else {
          if (statusDiv.textContent === 'Recording started.') {
            statusDiv.textContent = 'Ready to record.';
          } else if (statusDiv.textContent !== 'Recording stopped. Summary generated.') {
            statusDiv.textContent = 'Ready to record.';
          }
        }
      }
    } else {
      statusDiv.textContent = '';
    }
  }, [isOpen, isRecording, transcription, summary, setLiveSummariesTranscription, setLiveSummariesSummary]);

  // EVENT HANDLERS DEFINED AFTER HOOKS
  const handleRecordToggle = () => {
    toggleLiveSummariesRecording();
    if (!isRecording) { // About to start recording
      connectWebSocket();
    } else { // About to stop recording
      disconnectWebSocket();
    }
  };

  const handleAddToEditor = () => {
    console.log('Adding to editor:', summary);
    onClose(); 
  };

  const handleCancel = () => {
    onClose(); 
    disconnectWebSocket(); // Ensure WebSocket is closed on cancel
  };

  // CONDITIONAL RETURN FOR VISIBILITY (AFTER ALL HOOKS)
  if (!isOpen) {
    return null;
  }

  // Add an effect to disconnect WebSocket when the component unmounts or when isOpen becomes false
  React.useEffect(() => {
    return () => {
      // This cleanup runs when the component unmounts
      if (webSocketRef.current) {
        console.log('LiveSummariesModal unmounting, ensuring WebSocket is closed.');
        disconnectWebSocket();
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount

  // ACTUAL MODAL JSX
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" aria-hidden={!isOpen}>
      {/* Visually hidden div for ARIA live announcements */}
      <div className="sr-only" aria-live="polite" id="live-summaries-status"></div>

      <div 
        ref={modalContentRef} // Assign ref
        role="dialog"
        aria-modal="true"
        aria-labelledby="liveSummariesModalTitle"
        className="bg-[--bg-color] text-[--text-color] p-6 rounded-lg shadow-xl w-full max-w-lg relative flex flex-col max-h-[90vh]"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-[--hover-bg] text-[--text-color]"
          aria-label="Close live summaries modal"
        >
          <X size={20} />
        </button>
        <h2 id="liveSummariesModalTitle" className="text-xl font-semibold mb-4 text-center">Live Summaries</h2>

        <div className="flex-grow overflow-y-auto space-y-4 mb-4">
          <div className="transcription-area border border-[--border-color] rounded p-3 min-h-[150px] bg-[--input-bg]">
            <h3 className="text-md font-semibold mb-2 text-[--muted-text-color]">Transcription</h3>
            <p className="text-sm whitespace-pre-wrap">
              {transcription || initialTranscriptionPlaceholder}
            </p>
          </div>

          <div className="summary-area border border-[--border-color] rounded p-3 min-h-[150px] bg-[--input-bg]">
            <h3 className="text-md font-semibold mb-2 text-[--muted-text-color]">Summary</h3>
            <p className="text-sm whitespace-pre-wrap">
              {summary || initialSummaryPlaceholder}
            </p>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-[--border-color] flex justify-between items-center">
          <button
            ref={micButtonRef}
            onClick={handleRecordToggle}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={`p-2 rounded-full 
                        ${isRecording 
                          ? 'bg-red-500 text-white animate-pulse' 
                          : 'bg-[--primary-btn-bg] text-[--primary-btn-text-color] hover:bg-[--primary-btn-hover-bg]'}`}
          >
            {isRecording ? <StopIcon size={20} /> : <Mic size={20} />}
          </button>
          
          <div className="flex space-x-2">
            <button
              onClick={handleAddToEditor}
              disabled={isRecording || !summary}
              className="px-4 py-2 text-sm font-medium rounded-md bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Add to Editor
            </button>
            <button
              onClick={handleCancel}
              disabled={isRecording}
              className="px-4 py-2 text-sm font-medium rounded-md bg-[--secondary-btn-bg] text-[--secondary-btn-text-color] hover:bg-[--secondary-btn-hover-bg] disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Cancel & Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 