import { create } from 'zustand';
import {
  BlockStatusMap,
  BlockStatus,
  EditorInteractionState,
  EditorTimeoutConfig,
  EditorFeatureFlags,
  EditorBlockStatusState,
} from '@/app/types/ai-editor.types';

const initialInteractionState: EditorInteractionState = {
  lastFocusedBlockId: undefined,
  lastSelectionRange: undefined,
};

const initialTimeoutConfig: EditorTimeoutConfig = {
  autoSaveInterval: 60000, // 1 minute
  longLoadingThreshold: 5000, // 5 seconds
};

const initialFeatureFlags: EditorFeatureFlags = {
  enableRealtimeCollaboration: false,
  enableAdvancedHighlighting: true,
};

// Create the store with proper typing
export const useEditorBlockStatusStore = create<EditorBlockStatusState>((set, get) => ({
  blockStatusMap: {},
  interactionState: initialInteractionState,
  timeoutConfig: initialTimeoutConfig,
  featureFlags: initialFeatureFlags,

  setBlockStatus: (blockId, status, message, action) =>
    set((state) => ({
      blockStatusMap: {
        ...state.blockStatusMap,
        [blockId]: {
          status,
          timestamp: Date.now(),
          action,
          message,
          errorMessage: status === 'error' && message ? message : state.blockStatusMap[blockId]?.errorMessage,
        },
      },
    })),

  setErrorStatus: (blockId, errorMessage) =>
    set((state) => ({
      blockStatusMap: {
        ...state.blockStatusMap,
        [blockId]: {
          // Preserve other properties if they exist, or set sensible defaults
          ...(state.blockStatusMap[blockId] || { status: 'error', timestamp: Date.now() }),
          status: 'error',
          timestamp: Date.now(),
          errorMessage,
        },
      },
    })),

  clearBlockStatus: (blockId) =>
    set((state) => {
      const newMap = { ...state.blockStatusMap };
      delete newMap[blockId];
      return { blockStatusMap: newMap };
    }),

  updateInteractionState: (newState) =>
    set((state) => ({
      interactionState: { ...state.interactionState, ...newState },
    })),

  updateTimeoutConfig: (newConfig) =>
    set((state) => ({
      timeoutConfig: { ...state.timeoutConfig, ...newConfig },
    })),

  toggleFeatureFlag: (flagName) =>
    set((state) => ({
      featureFlags: {
        ...state.featureFlags,
        [flagName]: !state.featureFlags[flagName],
      },
    })),
  
  getFormattedBlockStatus: (blockId: string) => {
    const block = get().blockStatusMap[blockId];
    if (!block) return 'Status: N/A';
    let statusText = `Status: ${block.status}`;
    if (block.message) statusText += ` (${block.message})`;
    if (block.errorMessage) statusText += ` - Error: ${block.errorMessage}`;
    return statusText;
  }
}));

// Add development logging wrapper separately to avoid type issues
if (process.env.NODE_ENV === 'development') {
  const originalStore = useEditorBlockStatusStore;
  
  // Log state changes in development
  useEditorBlockStatusStore.subscribe((state, prevState) => {
    console.log('%cZustand State Change', 'background: #60a5fa; color: black; padding: 2px 4px; border-radius: 3px;', {
      prevState,
      newState: state,
    });
  });
}

// Selectors have been moved to app/stores/selectors/editorBlockStatusSelectors.ts 