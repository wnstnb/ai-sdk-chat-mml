'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useModalStore } from '@/stores/useModalStore';
import NewFileManager from '@/components/file-manager/NewFileManager';

interface FileBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Renamed original component
const ActualFileBrowserModal: React.FC<FileBrowserModalProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();
  const closeModal = useModalStore(state => state.closeFileBrowserModal);

  if (!isOpen) {
    return null;
  }

  const handleFileSelection = (documentId: string, documentName?: string) => {
    closeModal();
    onClose(); // Also call the onClose prop to notify parent component
    router.push(`/editor/${documentId}`);
    // Optionally, you could toast `documentName` being opened.
    // import { toast } from 'sonner';
    // if (documentName) toast.info(`Opening ${documentName}...`);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out"
      onClick={onClose}
    >
      <div
        className="bg-[--bg-color] p-6 rounded-lg shadow-xl w-full max-w-2xl h-[70vh] flex flex-col text-[--text-color] transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modalFadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold flex items-center">
            {/* Icon for file browser can be added here later e.g. <FolderOpen className="mr-2 h-5 w-5" /> */}
            Browse Files
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-[--hover-bg]"
            aria-label="Close file browser"
          >
            <X size={24} />
          </button>
        </div>

        {/* Placeholder for file browser content */}
        <div className="flex-grow overflow-y-auto min-h-0 pr-2">
          <NewFileManager onFileSelect={handleFileSelection} />
        </div>
      </div>
    </div>
  );
};

// Wrapper component that includes the style tag
const FileBrowserModal: React.FC<FileBrowserModalProps> = (props) => {
  return (
    <>
      <ActualFileBrowserModal {...props} />
      {/* Conditionally render style tag to ensure it's present when modal is open */}
      {props.isOpen && (
        <style jsx global>{`
          @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          .animate-modalFadeIn {
            animation: modalFadeIn 0.3s ease-out forwards;
          }
        `}</style>
      )}
    </>
  );
};

export { FileBrowserModal }; // Export the wrapper with the original name 