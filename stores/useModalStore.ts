import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface ModalState {
  isSearchModalOpen: boolean;
  isVersionHistoryModalOpen: boolean;
  isFileBrowserModalOpen: boolean;
  isNewDocumentModalOpen: boolean;
  openSearchModal: () => void;
  closeSearchModal: () => void;
  openVersionHistoryModal: () => void;
  closeVersionHistoryModal: () => void;
  openFileBrowserModal: () => void;
  closeFileBrowserModal: () => void;
  openNewDocumentModal: () => void;
  closeNewDocumentModal: () => void;
}

export const useModalStore = create<ModalState>()(
  devtools(
    (set) => ({
      isSearchModalOpen: false,
      isVersionHistoryModalOpen: false,
      isFileBrowserModalOpen: false,
      isNewDocumentModalOpen: false,
      openSearchModal: () => set({ isSearchModalOpen: true }),
      closeSearchModal: () => set({ isSearchModalOpen: false }),
      openVersionHistoryModal: () => set({ isVersionHistoryModalOpen: true }),
      closeVersionHistoryModal: () =>
        set({ isVersionHistoryModalOpen: false }),
      openFileBrowserModal: () => set({ isFileBrowserModalOpen: true }),
      closeFileBrowserModal: () => set({ isFileBrowserModalOpen: false }),
      openNewDocumentModal: () => set({ isNewDocumentModalOpen: true }),
      closeNewDocumentModal: () => set({ isNewDocumentModalOpen: false }),
    }),
    {
      name: "modal-storage",
    },
  ),
);
