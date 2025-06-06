import React, { useState, useCallback } from 'react';
import FolderCard from './FolderCard';
import DocumentCard from './DocumentCard';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderWithChildren } from '@/hooks/useFolders';
import { Document } from '@/types/supabase';
import { mapDocumentsToMappedCardData, type MappedDocumentCardData } from '@/lib/mappers/documentMappers';

interface FolderHierarchyProps {
  folders: FolderWithChildren[];
  documents: Document[];
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onFolderAction: (folderId: string, action: 'rename' | 'delete') => void;
  onCreateFolder?: (parentId?: string | null) => void;
  level?: number;
  maxLevel?: number;
}

interface FolderNodeProps {
  folder: FolderWithChildren;
  documents: Document[];
  isExpanded: boolean;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onFolderAction: (folderId: string, action: 'rename' | 'delete') => void;
  onCreateFolder?: (parentId?: string | null) => void;
  level: number;
  maxLevel: number;
}

// Individual folder node component
const FolderNode: React.FC<FolderNodeProps> = ({
  folder,
  documents,
  isExpanded,
  expandedFolders,
  onToggleFolder,
  onFolderAction,
  onCreateFolder,
  level,
  maxLevel,
}) => {
  // Get documents that belong to this folder
  const folderDocuments = documents.filter(doc => doc.folder_id === folder.id);
  const mappedDocuments = mapDocumentsToMappedCardData(folderDocuments);
  
  // Calculate total items (direct children only for display)
  const directChildrenCount = (folder.children?.length || 0) + folderDocuments.length;

  const handleToggleExpanded = useCallback(() => {
    onToggleFolder(folder.id);
  }, [folder.id, onToggleFolder]);

  const handleFolderAction = useCallback((action: 'rename' | 'delete') => {
    onFolderAction(folder.id, action);
  }, [folder.id, onFolderAction]);

  return (
    <div className="folder-node">
      {/* Folder Card */}
      <FolderCard
        id={folder.id}
        title={folder.name}
        documentCount={directChildrenCount}
        isExpanded={isExpanded}
        containedDocuments={isExpanded ? mappedDocuments : []}
        onToggleExpanded={handleToggleExpanded}
        onFolderAction={handleFolderAction}
      />

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={`mt-4 ml-6 space-y-4 ${level < maxLevel ? 'border-l-2 border-gray-200/50 dark:border-gray-600/50 pl-4' : ''}`}>
              {/* Render child folders recursively */}
              {folder.children && folder.children.length > 0 && (
                <FolderHierarchy
                  folders={folder.children}
                  documents={documents}
                  expandedFolders={expandedFolders} // Pass through the expansion state
                  onToggleFolder={onToggleFolder}
                  onFolderAction={onFolderAction}
                  onCreateFolder={onCreateFolder}
                  level={level + 1}
                  maxLevel={maxLevel}
                />
              )}

              {/* Render documents in this folder */}
              {folderDocuments.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {mappedDocuments.map((doc) => (
                    <motion.div 
                      key={doc.id} 
                      layout 
                      className="contents"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <DocumentCard
                        id={doc.id}
                        title={doc.title}
                        lastUpdated={doc.lastUpdated}
                        snippet={doc.snippet}
                        is_starred={doc.is_starred}
                      />
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Empty folder state */}
              {(!folder.children || folder.children.length === 0) && folderDocuments.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    This folder is empty
                  </p>
                  {onCreateFolder && (
                    <button
                      onClick={() => onCreateFolder(folder.id)}
                      className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Create subfolder
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Main folder hierarchy component
const FolderHierarchy: React.FC<FolderHierarchyProps> = ({
  folders,
  documents,
  expandedFolders,
  onToggleFolder,
  onFolderAction,
  onCreateFolder,
  level = 0,
  maxLevel = 5,
}) => {
  if (folders.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          No folders at this level
        </p>
        {level === 0 && onCreateFolder && (
          <button
            onClick={() => onCreateFolder(null)}
            className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Create your first folder
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="folder-hierarchy space-y-4">
      {folders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          documents={documents}
          isExpanded={expandedFolders.has(folder.id)}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onFolderAction={onFolderAction}
          onCreateFolder={onCreateFolder}
          level={level}
          maxLevel={maxLevel}
        />
      ))}
    </div>
  );
};

export default FolderHierarchy; 