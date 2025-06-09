'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChatInputUI } from '@/components/editor/ChatInputUI';
import { useModalStore } from '@/stores/useModalStore';
import { usePreferenceStore } from '@/lib/stores/preferenceStore'; // For default model
import type { TaggedDocument } from '@/lib/types'; // Import TaggedDocument type
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Define a default model fallback (used if store isn't ready)
const defaultModelFallback = 'gemini-1.5-flash'; // Or your preferred default

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NewDocumentModal: React.FC<NewDocumentModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  // const closeSelf = useModalStore((state) => state.closeNewDocumentModal); // Not used directly, onClose prop is used

  const {
    default_model: preferredModel,
    isInitialized: isPreferencesInitialized,
  } = usePreferenceStore();

  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(() => 
    isPreferencesInitialized && preferredModel ? preferredModel : defaultModelFallback
  );
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [taggedDocuments, setTaggedDocuments] = useState<TaggedDocument[]>([]); // State for tagged documents

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dummyFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isPreferencesInitialized && preferredModel && model !== preferredModel) {
      setModel(preferredModel);
    }
  }, [isPreferencesInitialized, preferredModel, model]);

  useEffect(() => {
    if (isOpen) {
      if (inputRef.current) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    } else {
      setInput('');
      setCreationError(null);
      setIsCreating(false);
      setTaggedDocuments([]); // Reset tagged documents when modal closes
    }
  }, [isOpen]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setInput(e.target.value);
  };

  const handleAddTaggedDocument = (doc: TaggedDocument) => {
    setTaggedDocuments((prevDocs) => {
      if (!prevDocs.find(d => d.id === doc.id)) {
        return [...prevDocs, doc];
      }
      return prevDocs;
    });
  };

  const handleRemoveTaggedDocument = (docId: string) => {
    setTaggedDocuments((prevDocs) => prevDocs.filter(d => d.id !== docId));
  };

  const handleCreateDocumentInModal = async (event?: React.FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
    if (!input.trim()) {
      toast.error('Please enter a prompt for your new document.');
      return;
    }

    setIsCreating(true);
    setCreationError(null);

    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initialContent: input,
          model: model,
          taggedDocuments: taggedDocuments, // Include tagged documents in API call
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to create document. Please try again.' } }));
        throw new Error(errorData.error?.message || 'Failed to create document.');
      }

      const result = await response.json();
      const newDocumentId = result.data?.documentId;

      if (!newDocumentId) {
        throw new Error('Failed to get new document ID from response.');
      }

      toast.success('New document created successfully!');
      onClose(); 
      router.push(`/editor/${newDocumentId}?initialMsg=${encodeURIComponent(input)}`);
    } catch (error: any) {
      console.error('Error creating new document:', error);
      const errorMessage = error.message || 'An unexpected error occurred.';
      setCreationError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isCreating) {
      event.preventDefault();
      if (input.trim()) {
        handleCreateDocumentInModal();
      } else {
        toast.info('Please enter a prompt for your new document.');
      }
    }
  };

  const clearPreview = () => {};

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(openState) => { if (!openState) onClose(); }}>
      <DialogContent 
        className="bg-[var(--editor-bg)] text-[--text-color] max-w-2xl" 
        style={{ zIndex: 1050 }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Create New Document</DialogTitle>
        </DialogHeader>
        
        {creationError && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-400">
                <p className="text-sm font-medium">Error</p>
                <p className="text-xs">{creationError}</p>
            </div>
        )}

        <form onSubmit={handleCreateDocumentInModal} ref={formRef}>
          <ChatInputUI
            inputRef={inputRef}
            input={input}
            handleInputChange={handleInputChange}
            model={model}
            setModel={setModel}
            isLoading={isCreating}
            files={null}
            fileInputRef={dummyFileInputRef}
            handleFileChange={() => {}}
            handleKeyDown={handleKeyDown}
            handlePaste={() => {}}
            handleUploadClick={() => {}}
            isUploading={false}
            uploadError={null}
            uploadedImagePath={null}
            onStop={() => setIsCreating(false)}
            clearPreview={clearPreview}
            isRecording={false}
            isTranscribing={false}
            micPermissionError={false}
            taggedDocuments={taggedDocuments}
            onAddTaggedDocument={handleAddTaggedDocument}
            onRemoveTaggedDocument={handleRemoveTaggedDocument}
          />
        </form>

        <div className="flex justify-end space-x-2 mt-6">
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewDocumentModal; 