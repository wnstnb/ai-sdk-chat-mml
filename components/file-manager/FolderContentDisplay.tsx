import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, FolderOpen, FileText, Plus } from 'lucide-react';
import FolderCard from './FolderCard';
import DocumentCard from './DocumentCard';
import { FolderWithContents } from '@/hooks/useFolders';
import { mapDocumentsToMappedCardData } from '@/lib/mappers/documentMappers';
import { Button } from '@/components/ui/button';

interface FolderContentDisplayProps {
  folder: FolderWithContents;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onCreateSubfolder?: () => void;
  onCreateDocument?: () => void;
  onFolderAction?: (action: 'rename' | 'delete') => void;
  onToggleStar?: (documentId: string) => void;
  level?: number;
  showControls?: boolean;
}

const FolderContentDisplay: React.FC<FolderContentDisplayProps> = ({
  folder,
  isExpanded,
  onToggleExpanded,
  onCreateSubfolder,
  onCreateDocument,
  onFolderAction,
  onToggleStar,
  level = 0,
  showControls = true,
}) => {
  const [loadingContent, setLoadingContent] = useState(false);
  const mappedDocuments = mapDocumentsToMappedCardData(folder.documents);
  
  const hasContent = folder.subfolders.length > 0 || folder.documents.length > 0;
  const totalItems = folder.subfolders.length + folder.documents.length;

  const handleToggleExpanded = useCallback(async () => {
    if (!isExpanded && hasContent) {
      setLoadingContent(true);
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 200));
      setLoadingContent(false);
    }
    onToggleExpanded();
  }, [isExpanded, hasContent, onToggleExpanded]);

  const expandVariants = {
    collapsed: { 
      height: 0, 
      opacity: 0,
      scale: 0.95,
    },
    expanded: { 
      height: 'auto', 
      opacity: 1,
      scale: 1,
      transition: {
        height: { duration: 0.3, ease: 'easeInOut' },
        opacity: { duration: 0.2, delay: 0.1 },
        scale: { duration: 0.2, delay: 0.1 },
      }
    },
  };

  const contentVariants = {
    hidden: { opacity: 0, y: -10 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      }
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: -5, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { duration: 0.2 }
    },
  };

  return (
    <div className="folder-content-display">
      {/* Folder Header */}
      <div className="flex items-center space-x-2 p-3 rounded-lg bg-gray-50/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50">
        
        {/* Expand/Collapse Button */}
        <button
          onClick={handleToggleExpanded}
          className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-200/50 dark:hover:bg-gray-600/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
          disabled={!hasContent}
        >
          {loadingContent ? (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : hasContent ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )
          ) : (
            <div className="w-4 h-4" /> // Placeholder for alignment
          )}
        </button>

        {/* Folder Icon */}
        <FolderOpen className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />

        {/* Folder Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {folder.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {totalItems === 0 ? 'Empty folder' : `${totalItems} item${totalItems !== 1 ? 's' : ''}`}
            {folder.subfolders.length > 0 && folder.documents.length > 0 && 
              ` (${folder.subfolders.length} folder${folder.subfolders.length !== 1 ? 's' : ''}, ${folder.documents.length} document${folder.documents.length !== 1 ? 's' : ''})`}
          </p>
        </div>

        {/* Action Controls */}
        {showControls && (
          <div className="flex items-center space-x-1">
            {onCreateSubfolder && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onCreateSubfolder}
                className="h-7 w-7 p-0"
                title="Create subfolder"
              >
                <Plus className="w-3 h-3" />
              </Button>
            )}
            {onCreateDocument && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onCreateDocument}
                className="h-7 w-7 p-0"
                title="Create document"
              >
                <FileText className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            variants={expandVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="overflow-hidden"
          >
            <motion.div
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              className={`mt-3 space-y-4 ${level > 0 ? 'ml-6 pl-4 border-l-2 border-gray-200/30 dark:border-gray-600/30' : ''}`}
            >
              {/* Subfolders */}
              {folder.subfolders.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Subfolders ({folder.subfolders.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {folder.subfolders.map((subfolder) => (
                      <motion.div key={subfolder.id} variants={itemVariants}>
                        <FolderCard
                          id={subfolder.id}
                          title={subfolder.name}
                          documentCount={0} // This would need to be calculated if we want subfolder document counts
                          isExpanded={false}
                          containedDocuments={[]}
                          onToggleExpanded={() => {}}
                          onFolderAction={onFolderAction}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents */}
              {folder.documents.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    Documents ({folder.documents.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {mappedDocuments.map((doc) => (
                      <motion.div key={doc.id} variants={itemVariants}>
                        <DocumentCard
                          id={doc.id}
                          title={doc.title}
                          lastUpdated={doc.lastUpdated}
                          snippet={doc.snippet}
                          is_starred={doc.is_starred}
                          isSelected={false} // No selection in folder preview
                          onToggleSelect={() => {}} // No-op for folder preview
                          onToggleStar={onToggleStar || (() => console.log('No onToggleStar handler provided for folder preview'))}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {totalItems === 0 && (
                <motion.div 
                  variants={itemVariants}
                  className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="space-y-3">
                    <FolderOpen className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto" />
                    <div>
                      <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                        Empty Folder
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        This folder doesn&apos;t contain any documents or subfolders yet.
                      </p>
                      <div className="flex justify-center space-x-2">
                        {onCreateSubfolder && (
                          <Button size="sm" variant="outline" onClick={onCreateSubfolder}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Subfolder
                          </Button>
                        )}
                        {onCreateDocument && (
                          <Button size="sm" variant="outline" onClick={onCreateDocument}>
                            <FileText className="w-4 h-4 mr-2" />
                            Add Document
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FolderContentDisplay; 