import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder, FolderPlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFolders } from '@/hooks/useFolders';
import { toast } from 'sonner';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentFolderId?: string | null;
  onFolderCreated?: (folderId: string) => void;
}

const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  parentFolderId,
  onFolderCreated,
}) => {
  const [folderName, setFolderName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(parentFolderId || null);
  const [isCreating, setIsCreating] = useState(false);
  
  const { folders, createFolder, isLoading, fetchFolders } = useFolders();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFolderName('');
      setSelectedParentId(parentFolderId || null);
      // Refresh folders when modal opens to get latest list
      fetchFolders();
    }
  }, [isOpen, parentFolderId, fetchFolders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!folderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }

    setIsCreating(true);
    
    try {
      const newFolder = await createFolder(folderName.trim(), selectedParentId);
      if (newFolder) {
        toast.success(`Folder "${folderName}" created successfully!`);
        onFolderCreated?.(newFolder.id);
        onClose();
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      onClose();
    }
  };

  const modalVariants = {
    hidden: { 
      opacity: 0,
      scale: 0.95,
      y: -20,
    },
    visible: { 
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        damping: 25,
        stiffness: 500,
      }
    },
    exit: { 
      opacity: 0,
      scale: 0.95,
      y: -20,
      transition: {
        duration: 0.2,
      }
    }
  };

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { duration: 0.2 }
    },
    exit: { 
      opacity: 0,
      transition: { duration: 0.2 }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={handleClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />
        
        {/* Modal */}
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <FolderPlus className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Create New Folder
              </h2>
            </div>
            <button
              onClick={handleClose}
              disabled={isCreating}
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* Folder Name Input */}
              <div>
                <label htmlFor="folderName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Folder Name
                </label>
                <input
                  id="folderName"
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={100}
                  disabled={isCreating}
                  autoFocus
                />
              </div>

              {/* Parent Folder Selection */}
              <div>
                <label htmlFor="parentFolder" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Parent Folder
                </label>
                <select
                  id="parentFolder"
                  value={selectedParentId || ''}
                  onChange={(e) => setSelectedParentId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isCreating || isLoading}
                >
                  <option value="">Root Folder</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.parent_folder_id ? '└─ ' : ''}{folder.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Choose where to create the new folder. Leave as "Root Folder" to create at the top level.
                </p>
              </div>

              {/* Preview */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600">
                <div className="flex items-center space-x-2 text-sm">
                  <Folder className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  <span className="text-gray-600 dark:text-gray-400">Preview:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedParentId ? 
                      `${folders.find(f => f.id === selectedParentId)?.name} / ${folderName || 'New Folder'}` :
                      folderName || 'New Folder'
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!folderName.trim() || isCreating}
                className="flex items-center space-x-2"
              >
                {isCreating ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Create Folder</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CreateFolderModal; 