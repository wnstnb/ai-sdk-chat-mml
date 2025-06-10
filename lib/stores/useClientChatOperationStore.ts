import { create } from 'zustand';
import {
  ClientChatOperationState,
  initialClientChatOperationState,
  AIToolState,
  AudioState,
  FileUploadState,
  BlockStatus,
  BlockStatusEntry,
  BlockStatusMap
} from '@/app/lib/clientChatOperationState'; // Adjusted import path

interface ClientChatOperationStore extends ClientChatOperationState {
  setAIToolState: (aiToolState: AIToolState) => void;
  setAudioState: (audioState: AudioState) => void;
  setFileUploadState: (fileUploadState: FileUploadState) => void;
  setCurrentToolCallId: (toolCallId?: string) => void;
  setCurrentOperationDescription: (description?: string) => void;
  resetChatOperationState: () => void;
  setOperationStates: (states: Partial<ClientChatOperationState>) => void;

  // ---- NEW ACTIONS FOR EDITOR BLOCK STATUS ----
  setBlockStatus: (
    blockId: string,
    status: BlockStatus,
    action?: 'insert' | 'update' | 'delete',
    message?: string
  ) => void;
  clearBlockStatus: (blockId: string) => void;
  clearAllBlockStatuses: () => void;
  // ---- END NEW ACTIONS ----
}

export const useClientChatOperationStore = create<ClientChatOperationStore>((set) => ({
  ...initialClientChatOperationState,
  setAIToolState: (aiToolState) => set({ aiToolState }),
  setAudioState: (audioState) => set({ audioState }),
  setFileUploadState: (fileUploadState) => set({ fileUploadState }),
  setCurrentToolCallId: (currentToolCallId) => set({ currentToolCallId }),
  setCurrentOperationDescription: (currentOperationDescription) =>
    set({ currentOperationDescription }),
  resetChatOperationState: () => set(initialClientChatOperationState),
  setOperationStates: (states) => set((prevState) => ({ ...prevState, ...states })),

  // ---- IMPLEMENTATION OF NEW ACTIONS ----
  setBlockStatus: (blockId, status, action, message) =>
    set((state) => ({
      editorBlockStatuses: {
        ...state.editorBlockStatuses,
        [blockId]: {
          status,
          action,
          message,
          timestamp: Date.now(),
        } as BlockStatusEntry,
      },
    })),
  clearBlockStatus: (blockId) =>
    set((state) => {
      const { [blockId]: _, ...rest } = state.editorBlockStatuses;
      return { editorBlockStatuses: rest };
    }),
  clearAllBlockStatuses: () =>
    set({ editorBlockStatuses: {} }),
  // ---- END IMPLEMENTATION ----
})); 