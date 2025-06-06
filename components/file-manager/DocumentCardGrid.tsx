'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAllDocuments } from '@/hooks/useDocumentLists';
import DocumentCard from './DocumentCard';
import CardSkeleton from './CardSkeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw, FileText, FolderPlus, CheckSquare, Square, FileText as FileTextIcon, Folder as FolderIcon } from 'lucide-react';
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
  DragOverlay,
  pointerWithin,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type { MappedDocumentCardData } from '@/lib/mappers/documentMappers';
import { toast } from 'sonner';

// Define types for sorting
type SortKey = 'lastUpdated' | 'title' | 'is_starred';
type SortDirection = 'asc' | 'desc';

const DocumentCardGrid: React.FC = () => {
  const { mappedDocuments: fetchedDocs, isLoading, error, fetchDocuments } = useAllDocuments();
  
  // State for sorting
  const [sortKey, setSortKey] = useState<SortKey>('lastUpdated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [draggedItems, setDraggedItems] = useState<Array<{id: string, type: 'document' | 'folder', name: string}> | null>(null);
  
  // Track drag state to distinguish actual drags from clicks
  const [hasActuallyDragged, setHasActuallyDragged] = useState(false);
  const dragStartTimeRef = useRef<number>(0);

  // Folder functionality
  const {
    folderTree,
    folders,
    isLoading: foldersLoading,
    deleteFolder,
    updateFolder,
    moveDocument,
    getFolderContents,
    deleteDocument,
  } = useFolders();
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
        distance: 8, // Reduced distance for more responsive drag
        delay: 250,  // Increased delay to prevent accidental drags
        tolerance: 10, // More tolerance for movement
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleRetry = () => {
    fetchDocuments();
  };

  const handleDragStart = (event: DragStartEvent) => {
    document.body.style.cursor = 'grabbing';
    
    // Reset drag tracking
    setHasActuallyDragged(false);
    dragStartTimeRef.current = Date.now();
    
    const { active } = event;
    const activeId = String(active.id);
    // Ensure active.data.current exists and has properties before trying to access them
    const activeType = active.data?.current?.type as 'document' | 'folder' | undefined;
    const activeName = active.data?.current?.name || active.data?.current?.title || 'Item';

    if (!activeType) {
      // console.warn('[handleDragStart] Active item has no type. This might indicate an issue with item data setup.');
      // Potentially set draggedItems to a default or skip setting it if type is crucial
      // For now, proceed cautiously, an item without a type may not be draggable correctly.
    }

    const currentSelection = new Set(selectedItemIds); // Capture current selection

    if (currentSelection.has(activeId)) {
      const itemsToDrag = Array.from(currentSelection).map(id => {
        // Prioritize finding in current view first for efficiency, then fallback to all items
        const currentViewFolder = currentDisplayItems.folders.find(f => f.id === id);
        if (currentViewFolder) return { id, type: 'folder' as 'folder', name: currentViewFolder.name };

        const currentViewDoc = currentDisplayItems.documents.find(d => d.id === id);
        if (currentViewDoc) return { id, type: 'document' as 'document', name: currentViewDoc.title };

        // Fallback to all folders and documents in the store
        const folder = folders.find(f => f.id === id);
        if (folder) return { id, type: 'folder' as 'folder', name: folder.name };
        
        const doc = fetchedDocs.find(d => d.id === id);
        if (doc) return { id, type: 'document' as 'document', name: doc.title };
        
        return { id, type: (activeType || 'document'), name: 'Selected Item' }; // Generic fallback
      }).filter(item => item.name !== 'Selected Item'); // Filter out unresolved items if necessary
      setDraggedItems(itemsToDrag);
    } else {
      clearSelection(); 
      toggleSelectItem(activeId);
      // If activeType wasn't resolved, default to document for single drag for now
      setDraggedItems([{ id: activeId, type: (activeType || 'document'), name: activeName }]); 
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    document.body.style.cursor = '';

    const itemsSuccessfullyMovedIds = new Set<string>();
    const itemsFailedToMoveNames: string[] = [];
    const localDraggedItems = draggedItems; // Capture state before it's cleared

    console.log('[DEBUG] handleDragEnd called:', {
      active: active ? { id: active.id, data: active.data?.current } : null,
      over: over ? { id: over.id, data: over.data?.current } : null,
      localDraggedItems: localDraggedItems?.length || 0,
      timestamp: new Date().toISOString()
    });

    if (!active) {
      console.log('[DEBUG] No active item in drag end');
      return;
    }
    
    setDraggedItems(null); 

    if (!localDraggedItems || localDraggedItems.length === 0) {
      // console.log('[handleDragEnd] No items were being dragged actively.');
      // This can happen if drag was cancelled or if logic in handleDragStart didn't set draggedItems
      // Also, handle the click-as-drag scenario if active and over are present
      if (active && over && String(active.id) === String(over.id)) {
        const activeIdStr = String(active.id);
        const activeItemTypeFromData = active.data?.current?.type;
        if (activeItemTypeFromData === 'document') {
          window.location.href = `/editor/${activeIdStr}`;
          return; 
        }
      }
      return; // Exit if no items to process
    }

    if (active && over) {
      const activeIdStr = String(active.id); // Original item that initiated the drag
      const overIdStr = String(over.id);

      // Click-as-drag: If the primary active item is dropped on itself
      // This check is now more specific to the initiating item, not all draggedItems
      if (activeIdStr === overIdStr) {
        const activeItemTypeFromData = active.data?.current?.type;
        const dragDuration = Date.now() - dragStartTimeRef.current;
        
        console.log('[DEBUG] Item dropped on itself:', {
          hasActuallyDragged,
          dragDuration,
          activeItemType: activeItemTypeFromData,
          isDocument: activeItemTypeFromData === 'document',
          isSingleItem: localDraggedItems.length === 1
        });
        
        // Only navigate if it was a quick click without actual dragging
        if (activeItemTypeFromData === 'document' && 
            localDraggedItems.length === 1 && 
            localDraggedItems[0].id === activeIdStr &&
            !hasActuallyDragged &&
            dragDuration < 500) { // Quick click threshold
          console.log('[DEBUG] Treating as document click - navigating');
          window.location.href = `/editor/${activeIdStr}`;
          return;
        }
        console.log('[DEBUG] Item dropped on itself but was an actual drag or too slow - no navigation');
        return; // No D&D operation if dropped on self in other cases (folder click, multi-select no-op)
      }
      
      // Determine target folder ID from various drop target types
      let targetFolderId: string | null = null;
      
      if (overIdStr.startsWith('folder-')) {
        // Dropped on a folder card
        targetFolderId = overIdStr.replace('folder-', '');
      } else if (overIdStr.startsWith('breadcrumb-')) {
        // Dropped on a breadcrumb button - check data for folder ID
        const overData = over.data?.current;
        if (overData && (overData.type === 'breadcrumb-root' || overData.type === 'breadcrumb-folder')) {
          targetFolderId = overData.folderId; // null for root, string for folders
        }
      }

      if (targetFolderId !== null || overIdStr.startsWith('breadcrumb-')) { // We have a valid drop target
        for (const itemToMove of localDraggedItems) {
          const currentItem = itemToMove.type === 'folder' 
            ? folders.find(f => f.id === itemToMove.id)
            : fetchedDocs.find(d => d.id === itemToMove.id);

          const currentParentId = itemToMove.type === 'folder' 
            ? (currentItem as any)?.parent_folder_id // Cast needed if Folder type doesn't have parent_folder_id directly
            : (currentItem as MappedDocumentCardData)?.folder_id;
          
          if (itemToMove.id === targetFolderId && itemToMove.type === 'folder') {
            // console.log(`[handleDragEnd] Skipping move: Cannot move folder ${itemToMove.name} into itself.`);
            itemsFailedToMoveNames.push(itemToMove.name);
            continue;
          }
          if (currentParentId === targetFolderId && !(currentParentId === null && targetFolderId === null)) { // Check if not already in target, unless both are root
             if(currentParentId === null && targetFolderId === null && itemToMove.type === 'document'){
                // This means a root document was dragged to the root area, which is a no-op unless we implement reordering.
             } else {
                // console.log(`[handleDragEnd] Skipping move: ${itemToMove.name} is already in target folder ${targetFolderId}.`);
                // If it's a multi-drag, we might just silently skip. If single, maybe toast.info?
                continue;
             }
          }

          let success = false;
          if (itemToMove.type === 'document') {
            success = await moveDocument(itemToMove.id, targetFolderId);
          } else if (itemToMove.type === 'folder') {
            // Assuming updateFolder can change parent_folder_id and returns the updated folder or null/throws
            const updatedFolder = await updateFolder(itemToMove.id, { parentFolderId: targetFolderId }); // Changed to parentFolderId
            success = !!updatedFolder; // Check if updatedFolder is truthy
          }

          if (success) {
            itemsSuccessfullyMovedIds.add(itemToMove.id);
          } else {
            itemsFailedToMoveNames.push(itemToMove.name);
          }
        }

        if (itemsSuccessfullyMovedIds.size > 0) {
          toast.success(`${itemsSuccessfullyMovedIds.size} item(s) moved successfully.`);
          fetchDocuments();
          loadAllFolderContents();
          if (currentFolderId) loadFolderContents(currentFolderId); // Refresh current folder if in one
          // Optionally, clear selection of moved items or all selection
          // clearSelection(); 
        }
        if (itemsFailedToMoveNames.length > 0) {
          toast.error(`Failed to move: ${itemsFailedToMoveNames.join(', ')}.`);
        }

      } else {
        // console.log('[handleDragEnd] No valid drop target identified.');
        if (localDraggedItems.length > 0) {
          toast.info('Items can only be dropped into folders or breadcrumb navigation.');
        }
      }
    } else {
      console.log('[DEBUG] Drag ended without valid over target. Checking for navigation...');
      const dragDuration = Date.now() - dragStartTimeRef.current;
      
      if (active && String(active.id) && localDraggedItems && localDraggedItems.length === 1 && 
          localDraggedItems[0].id === String(active.id) && active.data?.current?.type === 'document') {
        
        console.log('[DEBUG] Single document drag ended without over target:', {
          hasActuallyDragged,
          dragDuration,
          activeId: active.id
        });
        
        // Only treat as click if it was quick and didn't actually drag
        if (!hasActuallyDragged && dragDuration < 500) {
          console.log('[DEBUG] Treating as document navigation click');
          window.location.href = `/editor/${String(active.id)}`;
          return;
        } else {
          console.log('[DEBUG] Was an actual drag attempt - no navigation');
        }
      }
      console.log('[DEBUG] No navigation condition met');
    }
    clearSelection(); // Clear selection after drag operation attempt
  };

  const handleDragCancel = (event: DragCancelEvent) => {
    document.body.style.cursor = '';
    setDraggedItems(null);
    setHasActuallyDragged(false);
    console.log('[DEBUG] Drag cancelled - no navigation');
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

  // Load all folder contents for preview cards - sequentially to avoid rate limits
  const loadAllFolderContents = useCallback(async () => {
    const allFolderIds = getAllDisplayFolderIds(currentDisplayItems.folders).map(id => id.replace('folder-', ''));
    console.log('[loadAllFolderContents] Fetching contents for folders:', allFolderIds);
    for (const folderId of allFolderIds) {
      // Check if contents are already loaded or being loaded to prevent redundant fetches
      // This simple check might need to be more robust if component re-renders frequently
      if (!folderContents[folderId]) {
        console.log(`[loadAllFolderContents] Fetching for ${folderId}`);
        await loadFolderContents(folderId); 
        // Optional: Add a small delay between requests if rate limiting is still an issue
        // await new Promise(resolve => setTimeout(resolve, 100)); 
      }
    }
    console.log('[loadAllFolderContents] Finished fetching all folder contents.');
  }, [loadFolderContents, currentDisplayItems.folders, folderContents]);

  // Load folder contents when folders array changes or component mounts with folders
  useEffect(() => {
    if (currentDisplayItems.folders.length > 0) {
      loadAllFolderContents();
    }
  }, [currentDisplayItems.folders, loadAllFolderContents]);

  // Selection Handlers
  const toggleSelectItem = useCallback((id: string) => {
    setSelectedItemIds(prevSelectedIds => {
      const newSelectedIds = new Set(prevSelectedIds);
      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id);
      } else {
        newSelectedIds.add(id);
      }
      return newSelectedIds;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItemIds(new Set());
  }, []);

  const handleDeleteSelected = async () => {
    const itemsToDelete = Array.from(selectedItemIds);
    if (itemsToDelete.length === 0) {
      toast.info("No items selected to delete.");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${itemsToDelete.length} selected item(s)? This action cannot be undone.`)) {
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    const failedItems: string[] = [];

    // Determine type and call appropriate delete function
    for (const id of itemsToDelete) {
      let deleted = false;
      const isFolder = folders.some(folder => folder.id === id);
      if (isFolder) {
        deleted = await deleteFolder(id); 
      } else {
        deleted = await deleteDocument(id);
      }

      if (deleted) {
        successCount++;
      } else {
        failureCount++;
        // Attempt to get item name for error message
        const folder = folders.find(f => f.id === id);
        const doc = fetchedDocs.find(d => d.id === id);
        failedItems.push(folder?.name || doc?.title || id);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} item(s) deleted successfully.`);
    }
    if (failureCount > 0) {
      toast.error(`Failed to delete ${failureCount} item(s): ${failedItems.join(', ')}.`);
    }

    // Refresh data and clear selection
    fetchDocuments();
    loadAllFolderContents(); 
    if (currentFolderId) loadFolderContents(currentFolderId);
    clearSelection();
  };

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
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={() => setHasActuallyDragged(true)}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={[
            // Exclude folders from sortable context to prevent displacement when dragged over
            // Folders will only act as drop targets, not sortable items
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
                <div key={folder.id} className="flex items-start space-x-1 p-0.5">
                  <FolderCard
                    id={folder.id}
                    title={folder.name}
                    documentCount={folderContents[folder.id]?.length || 0}
                    isExpanded={false} // Navigation mode doesn't use inline expansion for height calc
                    containedDocuments={folderContents[folder.id] || []}
                    onToggleExpanded={() => handleFolderNavigate(folder.id, folder.name)}
                    onFolderAction={(action: 'rename' | 'delete') => handleFolderAction(folder.id, action)}
                    isSelected={selectedItemIds.has(folder.id)}
                    onToggleSelect={toggleSelectItem}
                  />
                </div>
              ))}
              
              {/* Render documents */}
              {displayItems.documents.map((doc) => (
                <div key={doc.id} className="flex items-start space-x-1 p-0.5">
                  <DocumentCard
                    id={doc.id}
                    title={doc.title}
                    lastUpdated={doc.lastUpdated}
                    snippet={doc.snippet}
                    is_starred={doc.is_starred}
                    isSelected={selectedItemIds.has(doc.id)}
                    onToggleSelect={toggleSelectItem}
                  />
                </div>
              ))}
            </motion.div>
          </main>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {draggedItems ? (
            <div className="pointer-events-none rounded bg-blue-500/10 dark:bg-blue-400/20 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 shadow-lg ring-1 ring-blue-500/30 dark:ring-blue-400/40 flex items-center space-x-2">
              {draggedItems.length === 1 ? (
                <>
                  {draggedItems[0].type === 'folder' ? 
                    <FolderIcon className="w-4 h-4 flex-shrink-0" /> : 
                    <FileTextIcon className="w-4 h-4 flex-shrink-0" />
                  }
                  <span className="truncate max-w-[200px]">{draggedItems[0].name}</span>
                </>
              ) : (
                <>
                  <FolderIcon className="w-4 h-4 flex-shrink-0" /> 
                  <FileTextIcon className="w-4 h-4 flex-shrink-0 -ml-2" /> 
                  <span>Moving {draggedItems.length} items</span>
                </>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        onClose={() => setShowCreateFolderModal(false)}
        onFolderCreated={handleFolderCreated}
      />

      {/* Toolbar for selected items */}
      {selectedItemIds.size > 0 && (
        <div className="p-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between sticky top-0 z-20">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {selectedItemIds.size} item(s) selected
          </span>
          <div>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="mr-2">
              Clear Selection
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              Delete Selected
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default DocumentCardGrid; 