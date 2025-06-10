import { create } from 'zustand';
import {
  ClientChatOperationState,
  initialClientChatOperationState,
  AIToolState,
  AudioState,
  FileUploadState,
} from '@/app/lib/clientChatOperationState'; // Adjusted import path

interface ClientChatOperationStore extends ClientChatOperationState {
  setAIToolState: (aiToolState: AIToolState) => void;
  setAudioState: (audioState: AudioState) => void;
  setFileUploadState: (fileUploadState: FileUploadState) => void;
  setCurrentToolCallId: (toolCallId?: string) => void;
  setCurrentOperationDescription: (description?: string) => void;
  resetChatOperationState: () => void;
  setOperationStates: (states: Partial<ClientChatOperationState>) => void;
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
})); 