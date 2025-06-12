'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DocumentReplacementConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

const DocumentReplacementConfirmationModal: React.FC<DocumentReplacementConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isProcessing = false
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(openState) => { if (!openState && !isProcessing) onClose(); }}>
      <DialogContent 
        className="bg-[var(--editor-bg)] text-[--text-color] max-w-md" 
        style={{ zIndex: 1050 }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Replace entire document?
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-[--muted-text-color]">
            <p className="mb-3">
              This will replace <strong>all existing content</strong> with new AI-generated text.
            </p>
            <p className="mb-3">
              You can undo this action using:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4 text-xs">
              <li>Keyboard shortcuts: <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">Ctrl+Z</kbd> (Windows) or <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">Cmd+Z</kbd> (Mac)</li>
              <li>The Undo button in the toast notification after replacement</li>
            </ul>
          </div>
          
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              <strong>Note:</strong> This action will replace your entire document content. Make sure you&apos;re ready to proceed.
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button 
            variant="outline" 
            onClick={handleCancel}
            disabled={isProcessing}
            className="text-sm"
          >
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleConfirm}
            disabled={isProcessing}
            className="text-sm"
          >
            {isProcessing ? 'Replacing...' : 'Replace Everything'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentReplacementConfirmationModal; 