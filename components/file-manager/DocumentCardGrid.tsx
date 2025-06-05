'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAllDocuments } from '@/hooks/useDocumentLists';
import DocumentCard from './DocumentCard';
import CardSkeleton from './CardSkeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw, FileText, FolderPlus } from 'lucide-react';
import CreateFolderModal from './CreateFolderModal';
import { useFolders } from '@/hooks/useFolders';
import { useFolderNavigation } from '@/hooks/useFolderNavigation';
import FolderCard from './FolderCard';
import FolderBreadcrumbs from './FolderBreadcrumbs';
import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragCancelEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import type { MappedDocumentCardData } from '@/lib/mappers/documentMappers';

// Define types for sorting
type SortKey = 'lastUpdated' | 'title' | 'is_starred';
type SortDirection = 'asc' | 'desc';

const DocumentCardGrid: React.FC = () => {
  const { mappedDocuments: fetchedDocs, isLoading, error, fetchDocuments } = useAllDocuments();
  
  // State for sorting
  const [sortKey, setSortKey] = useState<SortKey>('lastUpdated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Folder functionality
  const { folderTree, folders, isLoading: foldersLoading, deleteFolder, updateFolder, moveDocument, getFolderContents } = useFolders();
  const { currentFolderId, breadcrumbPath, isInFolderView, navigateToFolder, navigateToRoot } = useFolderNavigation();
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [folderContents, setFolderContents] = useState<Record<string, MappedDocumentCardData[]>>({});

  // Helper function to sort documents
  const sortDocuments = useCallback((items: MappedDocumentCardData[], key: SortKey, direction: SortDirection): MappedDocumentCardData[] => {
    const sortedItems = [...items]; // Create a shallow copy to avoid mutating the original array

    sortedItems.sort((a, b) => {
      let comparison = 0;
      if (key === 'lastUpdated') {
        comparison = new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(); // Default to descending for dates
      } else if (key === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (key === 'is_starred') {
        if (a.is_starred === b.is_starred) {
          comparison = a.title.localeCompare(b.title); // Secondary sort by title for starred items
        } else {
          comparison = a.is_starred ? -1 : 1; // Starred items first
        }
      }

      return direction === 'asc' ? comparison : -comparison;
    });

    return sortedItems;
  }, []);

  // Load folder contents for preview on cards and navigation
  const loadFolderContents = useCallback(async (folderId: string) => {
    try {
      const folderData = await getFolderContents(folderId);
      if (folderData && folderData.documents) {
        // Map folder documents to the same format as document cards
        const mappedDocs = folderData.documents.map(doc => ({
          id: doc.id,
          title: doc.name || 'Untitled Document',
          lastUpdated: doc.updated_at || doc.created_at,
          snippet: doc.searchable_content?.substring(0, 150) + '...' || 'No preview available.',
          is_starred: doc.is_starred || false,
        }));
        
        setFolderContents(prev => ({
          ...prev,
          [folderId]: mappedDocs
        }));
      }
    } catch (error) {
      console.error('Failed to load folder contents:', error);
    }
  }, [getFolderContents]);

  // This will be called after displayItems is available

  // Load contents when navigating to a folder
  useEffect(() => {
    if (currentFolderId) {
      loadFolderContents(currentFolderId);
    }
  }, [currentFolderId, loadFolderContents]);

  // Documents are now handled by getCurrentDisplayItems based on navigation state

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // px
        delay: 10,   // ms
        tolerance: 3, // px
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleRetry = () => {
    fetchDocuments();
  };

  const handleDragStart = (event: DragStartEvent) => {
    document.body.style.cursor = 'grabbing';
    console.log('Drag start:', { activeId: event.active.id, activeData: event.active.data });
  };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    document.body.style.cursor = '';
    const { active, over } = event;
    
    console.log('Drag end event:', { 
      activeId: active.id, 
      activeData: active.data?.current,
      overId: over?.id, 
      overData: over?.data?.current 
    });
    
    if (over && active.id !== over.id) {
      const activeId = active.id.toString();
      const overId = over.id.toString();
      
      // Check if dragging a document (not a folder) onto a folder
      if (!activeId.startsWith('folder-') && overId.startsWith('folder-')) {
        const folderId = overId.replace('folder-', '');
        const documentId = activeId;
        
        console.log(`Attempting to move document ${documentId} to folder ${folderId}`);
        
        // Move document to folder using the hook's moveDocument function
        const success = await moveDocument(documentId, folderId);
        if (success) {
          console.log(`Successfully moved document ${documentId} to folder ${folderId}`);
          // Refresh documents list and folder contents
          fetchDocuments();
          loadFolderContents(folderId);
        } else {
          console.error(`Failed to move document ${documentId} to folder ${folderId}`);
        }
      } else {
        console.log('Regular item reordering or folder-to-folder move - not implemented in navigation mode');
        // Note: In navigation mode, we don't support in-grid reordering
      }
    } else {
      console.log('No valid drop target or same element');
    }
  }, [moveDocument, fetchDocuments]);

  const handleDragCancel = (event: DragCancelEvent) => {
    document.body.style.cursor = '';
  };

  // Handlers for sorting UI
  const handleSortKeyChange = (key: SortKey) => {
    setSortKey(key);
    // Optional: Reset to default direction when key changes, or keep current direction
    // setSortDirection('desc'); 
  };

  const handleSortDirectionToggle = () => {
    setSortDirection((prevDirection) => (prevDirection === 'asc' ? 'desc' : 'asc'));
  };

  // Folder handlers
  const handleFolderAction = useCallback(async (folderId: string, action: 'rename' | 'delete') => {
    if (action === 'delete') {
      if (window.confirm('Are you sure you want to delete this folder?')) {
        await deleteFolder(folderId);
      }
    } else if (action === 'rename') {
      const newName = window.prompt('Enter new folder name:');
      if (newName && newName.trim()) {
        await updateFolder(folderId, { name: newName.trim() });
      }
    }
  }, [deleteFolder, updateFolder]);

  const handleCreateFolder = useCallback(() => {
    setShowCreateFolderModal(true);
  }, []);

  const handleFolderCreated = useCallback((folderId: string) => {
    console.log('Folder created:', folderId);
    // Could navigate to the new folder or expand it
  }, []);

  // Get folders and documents to display based on current navigation
  const getCurrentDisplayItems = useCallback(() => {
    if (isInFolderView && currentFolderId) {
      // Show documents in current folder + subfolders of current folder
      const currentFolderDocs = folderContents[currentFolderId] || [];
      const currentFolderSubfolders = folderTree.find(f => f.id === currentFolderId)?.children || [];
      
      return {
        folders: currentFolderSubfolders,
        documents: currentFolderDocs
      };
    } else {
      // Show root level folders and documents
      const rootLevelDocs = fetchedDocs ? fetchedDocs.filter(doc => !doc.folder_id) : [];
      return {
        folders: folderTree,
        documents: sortDocuments(rootLevelDocs, sortKey, sortDirection)
      };
    }
  }, [isInFolderView, currentFolderId, folderContents, folderTree, fetchedDocs, sortKey, sortDirection, sortDocuments]);

  // Get all folder IDs for drag and drop context
  const getAllDisplayFolderIds = useCallback((folders: any[]): string[] => {
    return folders.map(folder => `folder-${folder.id}`);
  }, []);

  // Handle folder navigation
  const handleFolderNavigate = useCallback((folderId: string, folderName: string) => {
    console.log('Navigating to folder:', folderId, folderName);
    navigateToFolder(folderId, folderName);
  }, [navigateToFolder]);

  // Get current display items
  const currentDisplayItems = getCurrentDisplayItems();

  // Load all folder contents for preview cards
  const loadAllFolderContents = useCallback(async () => {
    const allFolders = getAllDisplayFolderIds(currentDisplayItems.folders).map(id => id.replace('folder-', ''));
    await Promise.all(allFolders.map(folderId => loadFolderContents(folderId)));
  }, [loadFolderContents, currentDisplayItems.folders]);

  // Load folder contents when folders change
  useEffect(() => {
    if (currentDisplayItems.folders.length > 0) {
      loadAllFolderContents();
    }
  }, [currentDisplayItems.folders, loadAllFolderContents]);

  if (isLoading && (!fetchedDocs || fetchedDocs.length === 0)) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-4">
        {Array.from({ length: 10 }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-2">Error Loading Documents</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-6" role="alert" aria-live="polite">{error}</p>
        <Button onClick={handleRetry} variant="outline" aria-describedby="retry-description">
          <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" /> Retry
        </Button>
        <div id="retry-description" className="sr-only">
          Click to retry loading the documents
        </div>
      </div>
    );
  }

  if (!isLoading && (!fetchedDocs || fetchedDocs.length === 0) && !isInFolderView) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FileText className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Documents Found</h2>
        <p className="text-gray-500 dark:text-gray-400">There are no documents to display in this view.</p>
      </div>
    );
  }

  const displayItems = currentDisplayItems;

  return (
    <>
      {/* Sorting Controls */}
      <div className="p-4 flex flex-wrap items-center gap-2 border-b border-[--border-color]" role="toolbar" aria-label="Document sorting controls">
        <span className="text-sm font-medium mr-2" id="sort-label">Sort by:</span>
        <div className="flex gap-2" role="group" aria-labelledby="sort-label">
          <Button 
            variant={sortKey === 'lastUpdated' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSortKeyChange('lastUpdated')}
            aria-pressed={sortKey === 'lastUpdated'}
            aria-describedby="sort-help"
          >
            Last Updated
          </Button>
          <Button 
            variant={sortKey === 'title' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSortKeyChange('title')}
            aria-pressed={sortKey === 'title'}
            aria-describedby="sort-help"
          >
            Title
          </Button>
          <Button 
            variant={sortKey === 'is_starred' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSortKeyChange('is_starred')}
            aria-pressed={sortKey === 'is_starred'}
            aria-describedby="sort-help"
          >
            Starred
          </Button>
        </div>
        <Button 
          variant="outline"
          size="sm"
          onClick={handleSortDirectionToggle}
          className="ml-auto"
          aria-label={`Sort direction: ${sortDirection === 'asc' ? 'Ascending' : 'Descending'}. Click to change to ${sortDirection === 'asc' ? 'descending' : 'ascending'}.`}
        >
          {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        </Button>
        
        {/* New Folder Button */}
        <Button 
          variant="default"
          size="sm"
          onClick={handleCreateFolder}
          className="flex items-center gap-2"
        >
          <FolderPlus className="w-4 h-4" />
          New Folder
        </Button>
        <div id="sort-help" className="sr-only">
          Choose how to sort the document list. Current sort: {sortKey} in {sortDirection === 'asc' ? 'ascending' : 'descending'} order.
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="px-4">
        <FolderBreadcrumbs
          currentPath={breadcrumbPath}
          onNavigate={navigateToFolder}
        />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={[
            ...getAllDisplayFolderIds(displayItems.folders),
            ...displayItems.documents.map(item => item.id)
          ]}
          strategy={rectSortingStrategy}
        >
          <main>
            <h1 className="sr-only">Document Library</h1>
            <motion.div 
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-4"
              role="grid"
              aria-label={`Document grid with ${displayItems.documents.length} documents and ${displayItems.folders.length} folders. Sorted by ${sortKey} in ${sortDirection === 'asc' ? 'ascending' : 'descending'} order. Use arrow keys to navigate between items.`}
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Render folders first */}
              {displayItems.folders.map((folder) => (
                <motion.div 
                  key={`folder-${folder.id}`} 
                  layout 
                  className="contents" 
                  role="gridcell"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <FolderCard
                    id={folder.id}
                    title={folder.name}
                    documentCount={folderContents[folder.id]?.length || 0}
                    isExpanded={false} // Navigation mode doesn't use inline expansion for height calc
                    containedDocuments={folderContents[folder.id] || []}
                    onToggleExpanded={() => handleFolderNavigate(folder.id, folder.name)}
                    onFolderAction={(action: 'rename' | 'delete') => handleFolderAction(folder.id, action)}
                  />
                </motion.div>
              ))}
              
              {/* Render documents */}
              {displayItems.documents.map((doc) => (
                <motion.div 
                  key={doc.id} 
                  layout 
                  className="contents" 
                  role="gridcell"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
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
            </motion.div>
          </main>
        </SortableContext>
      </DndContext>

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        onClose={() => setShowCreateFolderModal(false)}
        onFolderCreated={handleFolderCreated}
      />
    </>
  );
};

export default DocumentCardGrid; 