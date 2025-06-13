// Define granular state enums for each operation type
export enum AIToolState {
  IDLE = 'AI_TOOL_IDLE',
  DETECTED = 'AI_TOOL_DETECTED',
  EXECUTING = 'AI_TOOL_EXECUTING',
  AWAITING_RESULT_IN_STATE = 'AI_TOOL_AWAITING_RESULT_IN_STATE',
  PROCESSING_COMPLETE = 'AI_TOOL_PROCESSING_COMPLETE'
}

export enum AudioState {
  IDLE = 'AUDIO_IDLE',
  RECORDING = 'AUDIO_RECORDING',
  TRANSCRIBING = 'AUDIO_TRANSCRIBING',
  TRANSCRIPT_READY_FOR_INPUT = 'AUDIO_TRANSCRIPT_READY_FOR_INPUT',
  PROCESSING_COMPLETE = 'AUDIO_PROCESSING_COMPLETE'
}

export enum FileUploadState {
  IDLE = 'FILE_IDLE',
  UPLOADING_FOR_CHAT = 'FILE_UPLOADING_FOR_CHAT',
  UPLOAD_COMPLETE_FOR_MESSAGE = 'FILE_UPLOAD_COMPLETE_FOR_MESSAGE',
  PROCESSING_COMPLETE = 'FILE_PROCESSING_COMPLETE'
}

// ---- NEW TYPES FOR EDITOR BLOCK STATUS ----
export enum BlockStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  MODIFIED = 'MODIFIED', // Indicates content was changed by AI, for highlighting
  ERROR = 'ERROR'       // Indicates an error occurred during AI operation on this block
}

export interface BlockStatusEntry {
  status: BlockStatus;
  action?: 'insert' | 'update' | 'delete'; // Optional: for more granular feedback
  timestamp: number; // For potential timeout or ordering logic
  message?: string; // Optional: error message or other info
}

export type BlockStatusMap = {
  [blockId: string]: BlockStatusEntry | undefined;
};
// ---- END NEW TYPES ----

// Define a type to represent the overall client chat operation state
export type ClientChatOperationState = {
  aiToolState: AIToolState;
  audioState: AudioState;
  fileUploadState: FileUploadState;
  currentToolCallId?: string;
  currentOperationDescription?: string;
  editorBlockStatuses: BlockStatusMap; // Added editor block statuses
};

// Initial state
export const initialClientChatOperationState: ClientChatOperationState = {
  aiToolState: AIToolState.IDLE,
  audioState: AudioState.IDLE,
  fileUploadState: FileUploadState.IDLE,
  currentToolCallId: undefined,
  currentOperationDescription: undefined,
  editorBlockStatuses: {}, // Initialize as empty object
};

export const isAnyOperationInProgress = (state: ClientChatOperationState): boolean => {
  return (
    state.aiToolState !== AIToolState.IDLE && state.aiToolState !== AIToolState.PROCESSING_COMPLETE ||
    state.audioState !== AudioState.IDLE && state.audioState !== AudioState.PROCESSING_COMPLETE ||
    state.fileUploadState !== FileUploadState.IDLE && state.fileUploadState !== FileUploadState.PROCESSING_COMPLETE
  );
};

export const getOperationStatusText = (state: ClientChatOperationState): string | null => {
  if (state.aiToolState === AIToolState.EXECUTING) {
    return `Processing AI action: ${state.currentOperationDescription || 'tool call'}...`;
  }
  if (state.aiToolState === AIToolState.AWAITING_RESULT_IN_STATE) {
    return 'Updating chat with AI tool result...';
  }
  if (state.audioState === AudioState.TRANSCRIBING) {
    return 'Transcribing audio...';
  }
  if (state.audioState === AudioState.TRANSCRIPT_READY_FOR_INPUT) {
    return 'Preparing transcript for chat...';
  }
  if (state.fileUploadState === FileUploadState.UPLOADING_FOR_CHAT) {
    return 'Uploading file for chat message...';
  }
  if (state.fileUploadState === FileUploadState.UPLOAD_COMPLETE_FOR_MESSAGE) {
    return 'Preparing file for chat message...';
  }
  return null;
}; 