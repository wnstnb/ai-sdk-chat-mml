import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface LiveSummariesState {
  transcription: string;
  summary: string;
  isRecording: boolean;
}

export interface ModalState {
  isSearchModalOpen: boolean;
  isVersionHistoryModalOpen: boolean;
  isFileBrowserModalOpen: boolean;
  isNewDocumentModalOpen: boolean;
  isPreferencesModalOpen: boolean;
  isLiveSummariesModalOpen: boolean;
  liveSummaries: LiveSummariesState;

  openSearchModal: () => void;
  closeSearchModal: () => void;
  openVersionHistoryModal: () => void;
  closeVersionHistoryModal: () => void;
  openFileBrowserModal: () => void;
  closeFileBrowserModal: () => void;
  openNewDocumentModal: () => void;
  closeNewDocumentModal: () => void;
  openPreferencesModal: () => void;
  closePreferencesModal: () => void;
  openLiveSummariesModal: () => void;
  closeLiveSummariesModal: () => void;

  setLiveSummariesTranscription: (transcription: string) => void;
  setLiveSummariesSummary: (summary: string) => void;
  toggleLiveSummariesRecording: () => void;
  resetLiveSummaries: () => void;
}

const initialLiveSummariesState: LiveSummariesState = {
  transcription: '',
  summary: '',
  isRecording: false,
};

export const useModalStore = create<ModalState>()(
  devtools(
    (set) => ({
      isSearchModalOpen: false,
      isVersionHistoryModalOpen: false,
      isFileBrowserModalOpen: false,
      isNewDocumentModalOpen: false,
      isPreferencesModalOpen: false,
      isLiveSummariesModalOpen: false,
      liveSummaries: initialLiveSummariesState,

      openSearchModal: () => set({ isSearchModalOpen: true }),
      closeSearchModal: () => set({ isSearchModalOpen: false }),
      openVersionHistoryModal: () => set({ isVersionHistoryModalOpen: true }),
      closeVersionHistoryModal: () =>
        set({ isVersionHistoryModalOpen: false }),
      openFileBrowserModal: () => set({ isFileBrowserModalOpen: true }),
      closeFileBrowserModal: () => set({ isFileBrowserModalOpen: false }),
      openNewDocumentModal: () => set({ isNewDocumentModalOpen: true }),
      closeNewDocumentModal: () => set({ isNewDocumentModalOpen: false }),
      openPreferencesModal: () => set({ isPreferencesModalOpen: true }),
      closePreferencesModal: () => set({ isPreferencesModalOpen: false }),
      openLiveSummariesModal: () => set({ isLiveSummariesModalOpen: true }),
      closeLiveSummariesModal: () => set({ isLiveSummariesModalOpen: false, liveSummaries: initialLiveSummariesState }),

      setLiveSummariesTranscription: (transcription) =>
        set((state) => ({
          liveSummaries: { ...state.liveSummaries, transcription },
        })),
      setLiveSummariesSummary: (summary) =>
        set((state) => ({
          liveSummaries: { ...state.liveSummaries, summary },
        })),
      toggleLiveSummariesRecording: () =>
        set((state) => ({
          liveSummaries: {
            ...state.liveSummaries,
            isRecording: !state.liveSummaries.isRecording,
          },
        })),
      resetLiveSummaries: () =>
        set({ liveSummaries: initialLiveSummariesState }),
    }),
    {
      name: "modal-storage",
    },
  ),
);
