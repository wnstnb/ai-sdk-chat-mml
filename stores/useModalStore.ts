import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { BlockNoteEditor } from '@blocknote/core';

export interface VoiceSummaryState {
  transcription: string;
  legacySummary: string;
  isRecording: boolean;
}

export interface ModalState {
  isSearchModalOpen: boolean;
  isVersionHistoryModalOpen: boolean;
  isFileBrowserModalOpen: boolean;
  isNewDocumentModalOpen: boolean;
  isPreferencesModalOpen: boolean;
  isVoiceSummaryModalOpen: boolean;
  voiceSummary: VoiceSummaryState;
  editorRef: React.RefObject<BlockNoteEditor<any> | null> | null;

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
  openVoiceSummaryModal: () => void;
  closeVoiceSummaryModal: () => void;

  setVoiceSummaryTranscription: (transcription: string) => void;
  setVoiceSummaryLegacySummary: (summary: string) => void;
  toggleVoiceSummaryRecording: () => void;
  resetVoiceSummaryState: () => void;
  setEditorRef: (editorRef: React.RefObject<BlockNoteEditor<any> | null> | null) => void;
}

const initialVoiceSummaryState: VoiceSummaryState = {
  transcription: '',
  legacySummary: '',
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
      isVoiceSummaryModalOpen: false,
      voiceSummary: initialVoiceSummaryState,
      editorRef: null,

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
      openVoiceSummaryModal: () => set({ isVoiceSummaryModalOpen: true }),
      closeVoiceSummaryModal: () => set({ isVoiceSummaryModalOpen: false, voiceSummary: initialVoiceSummaryState }),

      setVoiceSummaryTranscription: (transcription) =>
        set((state) => ({
          voiceSummary: { ...state.voiceSummary, transcription },
        })),
      setVoiceSummaryLegacySummary: (summary) =>
        set((state) => ({
          voiceSummary: { ...state.voiceSummary, legacySummary: summary },
        })),
      toggleVoiceSummaryRecording: () =>
        set((state) => ({
          voiceSummary: {
            ...state.voiceSummary,
            isRecording: !state.voiceSummary.isRecording,
          },
        })),
      resetVoiceSummaryState: () =>
        set({ voiceSummary: initialVoiceSummaryState }),
      setEditorRef: (editorRef) => set({ editorRef }),
    }),
    {
      name: "modal-storage",
    },
  ),
);
