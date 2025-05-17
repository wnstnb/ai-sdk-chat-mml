'use client';

import React from 'react';
import { useModalStore } from '@/stores/useModalStore';
import { FileBrowserModal } from '@/components/modals/FileBrowserModal';
import NewDocumentModal from '@/components/modals/NewDocumentModal';

interface ModalManagerProps {
  children: React.ReactNode;
}

const ModalManager: React.FC<ModalManagerProps> = ({ children }) => {
  const isFileBrowserModalOpen = useModalStore((state) => state.isFileBrowserModalOpen);
  const closeFileBrowserModal = useModalStore((state) => state.closeFileBrowserModal);

  const isNewDocumentModalOpen = useModalStore((state) => state.isNewDocumentModalOpen);
  const closeNewDocumentModal = useModalStore((state) => state.closeNewDocumentModal);

  return (
    <>
      {children}
      <FileBrowserModal
        isOpen={isFileBrowserModalOpen}
        onClose={closeFileBrowserModal}
      />
      <NewDocumentModal
        isOpen={isNewDocumentModalOpen}
        onClose={closeNewDocumentModal}
      />
      {/* Other modals will be added here */}
    </>
  );
};

export default ModalManager; 