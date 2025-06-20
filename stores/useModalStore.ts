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
  isMobileSidebarOpen: boolean;
  isPDFModalOpen: boolean;
  isShareDocumentModalOpen: boolean;
  voiceSummary: VoiceSummaryState;
  isVoiceSummaryActive: boolean; // NEW: tracks if voice summary is active (prevents multiple instances)
  editorRef: React.RefObject<BlockNoteEditor<any> | null> | null;
  setBlockStatus: ((blockId: string, status: any, action?: 'insert' | 'update' | 'delete', message?: string) => void) | null;

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
  setVoiceSummaryActive: (active: boolean) => void; // NEW: manage voice summary active state
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  openPDFModal: () => void;
  closePDFModal: () => void;
  openShareDocumentModal: () => void;
  closeShareDocumentModal: () => void;

  setVoiceSummaryTranscription: (transcription: string) => void;
  setVoiceSummaryLegacySummary: (summary: string) => void;
  toggleVoiceSummaryRecording: () => void;
  resetVoiceSummaryState: () => void;
  setEditorRef: (editorRef: React.RefObject<BlockNoteEditor<any> | null> | null) => void;
  setBlockStatusFunction: (fn: ((blockId: string, status: any, action?: 'insert' | 'update' | 'delete', message?: string) => void) | null) => void;
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
      isMobileSidebarOpen: false,
      isPDFModalOpen: false,
      isShareDocumentModalOpen: false,
      voiceSummary: initialVoiceSummaryState,
      isVoiceSummaryActive: false, // NEW: initialize voice summary active state
      editorRef: null,
      setBlockStatus: null,

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
      openVoiceSummaryModal: () => set({ isVoiceSummaryModalOpen: true, isVoiceSummaryActive: true }),
      closeVoiceSummaryModal: () => set({ isVoiceSummaryModalOpen: false, voiceSummary: initialVoiceSummaryState, isVoiceSummaryActive: false }),
      setVoiceSummaryActive: (active) => set({ isVoiceSummaryActive: active }), // NEW: manage voice summary active state
      openMobileSidebar: () => set({ isMobileSidebarOpen: true }),
      closeMobileSidebar: () => set({ isMobileSidebarOpen: false }),
      openPDFModal: () => set({ isPDFModalOpen: true }),
      closePDFModal: () => set({ isPDFModalOpen: false }),
      openShareDocumentModal: () => set({ isShareDocumentModalOpen: true }),
      closeShareDocumentModal: () => set({ isShareDocumentModalOpen: false }),

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
      setBlockStatusFunction: (fn) => set({ setBlockStatus: fn }),
    }),
    {
      name: "modal-storage",
    },
  ),
);
