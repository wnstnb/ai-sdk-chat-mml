'use client';

import React from 'react';
import { useModalStore } from '@/stores/useModalStore';
import { FileBrowserModal } from '@/components/modals/FileBrowserModal';
import { SearchModal } from '@/components/search/SearchModal';
import NewDocumentModal from '@/components/modals/NewDocumentModal';
import PreferencesModal from '@/components/modals/PreferencesModal';
import { LiveSummariesModal } from '@/components/modals/LiveSummariesModal';

interface ModalManagerProps {
  children: React.ReactNode;
}

const ModalManager: React.FC<ModalManagerProps> = ({ children }) => {
  const isFileBrowserModalOpen = useModalStore((state) => state.isFileBrowserModalOpen);
  const closeFileBrowserModal = useModalStore((state) => state.closeFileBrowserModal);

  const isSearchModalOpen = useModalStore((state) => state.isSearchModalOpen);
  const closeSearchModal = useModalStore((state) => state.closeSearchModal);

  const isNewDocumentModalOpen = useModalStore((state) => state.isNewDocumentModalOpen);
  const closeNewDocumentModal = useModalStore((state) => state.closeNewDocumentModal);

  const isPreferencesModalOpen = useModalStore((state) => state.isPreferencesModalOpen);
  const closePreferencesModal = useModalStore((state) => state.closePreferencesModal);

  const isLiveSummariesModalOpen = useModalStore((state) => state.isLiveSummariesModalOpen);
  const closeLiveSummariesModal = useModalStore((state) => state.closeLiveSummariesModal);

  return (
    <>
      {children}
      <FileBrowserModal
        isOpen={isFileBrowserModalOpen}
        onClose={closeFileBrowserModal}
      />
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={closeSearchModal}
      />
      <NewDocumentModal
        isOpen={isNewDocumentModalOpen}
        onClose={closeNewDocumentModal}
      />
      <PreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={closePreferencesModal}
      />
      <LiveSummariesModal
        isOpen={isLiveSummariesModalOpen}
        onClose={closeLiveSummariesModal}
      />
      {/* Other modals will be added here */}
    </>
  );
};

export default ModalManager; 