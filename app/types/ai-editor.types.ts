export type BlockStatus = 'idle' | 'loading' | 'modified' | 'error';

export interface BlockStatusDetail {
  status: BlockStatus;
  timestamp: number;
  action?: 'insert' | 'update' | 'delete';
  errorMessage?: string;
  message?: string; // For loading messages or other info
}

export type BlockStatusMap = Record<string, BlockStatusDetail>;

// Additional types for the store based on subtask 1.1
export interface EditorInteractionState {
  lastFocusedBlockId?: string;
  lastSelectionRange?: any; // Consider a more specific type if available
}

export interface EditorTimeoutConfig {
  autoSaveInterval: number; // in milliseconds
  longLoadingThreshold: number; // in milliseconds
}

export interface EditorFeatureFlags {
  enableRealtimeCollaboration: boolean;
  enableAdvancedHighlighting: boolean;
}

// Moved from editorBlockStatusStore.ts for better organization
export interface EditorBlockStatusState {
  blockStatusMap: BlockStatusMap;
  interactionState: EditorInteractionState;
  timeoutConfig: EditorTimeoutConfig;
  featureFlags: EditorFeatureFlags;
  setBlockStatus: (blockId: string, status: BlockStatus, message?: string, action?: 'insert' | 'update' | 'delete') => void;
  setErrorStatus: (blockId: string, errorMessage: string) => void;
  clearBlockStatus: (blockId: string) => void;
  updateInteractionState: (newState: Partial<EditorInteractionState>) => void;
  updateTimeoutConfig: (newConfig: Partial<EditorTimeoutConfig>) => void;
  toggleFeatureFlag: (flagName: keyof EditorFeatureFlags) => void;
  getFormattedBlockStatus: (blockId: string) => string;
} 