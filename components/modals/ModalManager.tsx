'use client';

import React from 'react';
import { useModalStore } from '@/stores/useModalStore';
import { FileBrowserModal } from '@/components/modals/FileBrowserModal';
import { SearchModal } from '@/components/search/SearchModal';
import NewDocumentModal from '@/components/modals/NewDocumentModal';
import PreferencesModal from '@/components/modals/PreferencesModal';
import { VoiceSummaryModal } from '@/components/modals/VoiceSummaryModal';
import { PDFModal } from '@/components/modals/PDFModal';

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

  const isVoiceSummaryModalOpen = useModalStore((state) => state.isVoiceSummaryModalOpen);
  const closeVoiceSummaryModal = useModalStore((state) => state.closeVoiceSummaryModal);

  const isPDFModalOpen = useModalStore((state) => state.isPDFModalOpen);
  const closePDFModal = useModalStore((state) => state.closePDFModal);

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
      <VoiceSummaryModal
        isOpen={isVoiceSummaryModalOpen}
        onClose={closeVoiceSummaryModal}
      />
      <PDFModal
        isOpen={isPDFModalOpen}
        onClose={closePDFModal}
      />
      {/* Other modals will be added here */}
    </>
  );
};

export default ModalManager; 