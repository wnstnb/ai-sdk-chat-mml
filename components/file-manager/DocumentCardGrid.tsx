'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAllDocuments } from '@/hooks/useDocumentLists';
import DocumentCard from './DocumentCard';
import CardSkeleton from './CardSkeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw, FileText, FolderPlus, CheckSquare, Square, FileText as FileTextIcon, Folder as FolderIcon, Search, X } from 'lucide-react';
import CreateFolderModal from './CreateFolderModal';
import { useFolders } from '@/hooks/useFolders';
import { useFolderNavigation } from '@/hooks/useFolderNavigation';
import FolderCard from './FolderCard';
import FolderBreadcrumbs from './FolderBreadcrumbs';
import { Input } from '@/components/ui/input';
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
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Folder } from '@/types/supabase';

// Define types for sorting
type SortKey = 'lastUpdated' | 'title' | 'is_starred';
type SortDirection = 'asc' | 'desc';

// Define breakpoints and corresponding column counts
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536, // Assuming you might have 2xl for 5 columns
};

const getNumberOfColumns = (width: number): number => {
  if (width >= BREAKPOINTS['2xl']) return 5;
  if (width >= BREAKPOINTS.xl) return 5; // Tailwind's xl:grid-cols-5
  if (width >= BREAKPOINTS.lg) return 4; // Tailwind's lg:grid-cols-4
  if (width >= BREAKPOINTS.md) return 3; // Tailwind's md:grid-cols-3
  if (width >= BREAKPOINTS.sm) return 2; // Tailwind's sm:grid-cols-2
  return 1; // Default to 1 column
};

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
    loadSubFolders,
    loadingSubFolders,
  } = useFolders();
  const { currentFolderId, breadcrumbPath, isInFolderView, navigateToFolder, navigateToRoot } = useFolderNavigation();
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [folderContents, setFolderContents] = useState<Record<string, MappedDocumentCardData[]>>({});

  // ADD: State for search query
  const [searchQuery, setSearchQuery] = useState('');
  // ADD: State for search loading and error
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // ADD: State for search results
  const [searchResults, setSearchResults] = useState<MappedDocumentCardData[]>([]);

  // ADD: State for tracking which folder previews are loading
  const [loadingPreviewFolderIds, setLoadingPreviewFolderIds] = useState<Set<string>>(new Set());

  // ADD: Ref for the scrollable element
  const parentRef = useRef<HTMLDivElement>(null);

  // ADD: State for number of columns
  const [numberOfColumns, setNumberOfColumns] = useState(1);

  // ADD: Effect to update number of columns on resize
  useEffect(() => {
    const updateCols = () => {
      if (typeof window !== 'undefined') {
        setNumberOfColumns(getNumberOfColumns(window.innerWidth));
      }
    };
    updateCols(); // Initial check
    window.addEventListener('resize', updateCols);
    return () => window.removeEventListener('resize', updateCols);
  }, []);

  // Effect to handle search
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const handler = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search-documents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: searchQuery }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch search results');
        }
        const data = await response.json(); // This will be an array of search results
        
        // Map results from POST response to MappedDocumentCardData
        const mappedResults: MappedDocumentCardData[] = (data || []).map((doc: any) => ({
          id: doc.id,
          title: doc.name, // POST route returns 'name'
          snippet: doc.summary || 'No summary available.', // POST route may return 'summary'
          lastUpdated: doc.lastUpdated || new Date().toISOString(), // Default if not present
          is_starred: doc.is_starred || false, // Default if not present
          folder_id: doc.folder_id || null, // Include if available
          // Add any other fields required by MappedDocumentCardData with defaults
        }));
        setSearchResults(mappedResults);
      } catch (err: any) {
        setSearchError(err.message || 'An unexpected error occurred');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  const currentPathString = useMemo(() => {
    if (!isInFolderView || !breadcrumbPath || breadcrumbPath.length === 0) {
      return "";
    }
    return breadcrumbPath.map(folder => folder.name).join(' / ');
  }, [isInFolderView, breadcrumbPath]);

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

  // ADD: Function to handle loading of specific folder preview contents
  const handleLoadFolderPreview = useCallback(async (folderId: string) => {
    setLoadingPreviewFolderIds(prev => new Set(prev).add(folderId));
    try {
      await loadFolderContents(folderId); // This already updates folderContents state
    } catch (error) {
      console.error(`Error loading preview for folder ${folderId}:`, error);
      // Optionally, show a toast or specific error message for this folder
    } finally {
      setLoadingPreviewFolderIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(folderId);
        return newSet;
      });
    }
  }, [loadFolderContents]);

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
      
      console.log('[DEBUG] Processing drop target:', {
        overIdStr,
        overData: over.data?.current,
        overType: over.data?.current?.type
      });
      
      if (overIdStr.startsWith('folder-')) {
        // Dropped on a folder card
        targetFolderId = overIdStr.replace('folder-', '');
        console.log('[DEBUG] Folder card drop target detected:', targetFolderId);
      } else if (overIdStr.startsWith('breadcrumb-')) {
        // Dropped on a breadcrumb button - check data for folder ID
        const overData = over.data?.current;
        console.log('[DEBUG] Breadcrumb drop detected:', {
          overIdStr,
          overData,
          isValidBreadcrumb: overData && (overData.type === 'breadcrumb-root' || overData.type === 'breadcrumb-folder')
        });
        
        if (overData && (overData.type === 'breadcrumb-root' || overData.type === 'breadcrumb-folder')) {
          targetFolderId = overData.folderId; // null for root, string for folders
          console.log('[DEBUG] Breadcrumb target folder ID:', targetFolderId);
        }
      }

      console.log('[DEBUG] Final drop target decision:', {
        targetFolderId,
        isBreadcrumb: overIdStr.startsWith('breadcrumb-'),
        hasValidTarget: targetFolderId !== null || overIdStr.startsWith('breadcrumb-')
      });

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
    if (searchQuery) {
      // If a search query is active, display search results (documents only)
      return {
        folders: [], // No folders in search results view
        documents: searchResults,
      };
    }

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
  }, [
    isInFolderView, 
    currentFolderId, 
    folderContents, 
    folderTree, 
    fetchedDocs, 
    sortKey, 
    sortDirection, 
    sortDocuments,
    searchQuery, // Added dependency
    searchResults, // Added dependency
  ]);

  // Get all folder IDs for drag and drop context
  const getAllDisplayFolderIds = useCallback((folders: any[]): string[] => {
    return folders.map(folder => `folder-${folder.id}`);
  }, []);

  // Handle folder navigation
  const handleFolderNavigate = useCallback(async (folderId: string, folderName: string) => {
    // Find the folder in the current display to check its status
    // The folderTree from useFolders is the source of truth for childrenLoaded
    const findInTree = (nodes: any[], id: string): any | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findInTree(node.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const folderToNavigate = findInTree(folderTree, folderId);

    if (folderToNavigate && !folderToNavigate.childrenLoaded && !loadingSubFolders.has(folderId)) {
      try {
        await loadSubFolders(folderId); // Load children before navigating
      } catch (err) {
        console.error(`Failed to load subfolders for ${folderId} before navigation:`, err);
        // Optionally, toast an error and don't navigate, or navigate anyway if preferred
        // For now, we'll proceed to navigate even if subfolder loading fails, 
        // as the folder itself exists.
      }
    }
    navigateToFolder(folderId, folderName);
  }, [navigateToFolder, loadSubFolders, loadingSubFolders, folderTree]);

  // Get current display items
  const currentDisplayItems = getCurrentDisplayItems();

  // ADD: Combine folders and documents for virtualization
  const allItems = useMemo(() => {
    const items: Array<(MappedDocumentCardData & { itemType: 'document' }) | (Folder & { itemType: 'folder' }) > = [];
    // Ensure currentDisplayItems.folders and currentDisplayItems.documents are always arrays
    (currentDisplayItems.folders || []).forEach(folder => {
      items.push({ ...folder, id: `folder-${folder.id}`, itemType: 'folder' });
    });
    (currentDisplayItems.documents || []).forEach(doc => {
      items.push({ ...doc, itemType: 'document' });
    });
    return items;
  }, [currentDisplayItems.folders, currentDisplayItems.documents]);

  const rowVirtualizer = useVirtualizer({
    // UPDATE: count based on rows
    count: Math.ceil(allItems.length / numberOfColumns),
    getScrollElement: () => parentRef.current,
    // Estimate: approx height of a card (341px for 256px width, 3/4 aspect) + gap (24px for gap-6)
    estimateSize: () => 365,
    getItemKey: useCallback((index: number) => `row-${index}`, []), // Key for rows
    overscan: 1, // Render 1 extra row out of view
  });

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
    clearSelection();
  };

  const displayItems = currentDisplayItems;

  // Function to render the main content of the grid (items, loading, errors, empty states)
  const renderGridContent = () => {
    // Initial loading (only if not searching)
    if (isLoading && (!fetchedDocs || fetchedDocs.length === 0) && !searchQuery) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-4">
          {Array.from({ length: numberOfColumns * 3 }).map((_, index) => ( // Show a few rows of skeletons
            <CardSkeleton key={`initial-skeleton-${index}`} />
          ))}
        </div>
      );
    }

    // Initial error (only if not searching)
    if (error && !searchQuery) {
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

    // Search specific states
    if (searchQuery) {
      if (isSearching) {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-4">
            {Array.from({ length: numberOfColumns * 3 }).map((_, index) => (
              <CardSkeleton key={`search-skeleton-${index}`} />
            ))}
          </div>
        );
      }
      if (searchError) {
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mb-4" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-2">Search Error</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6" role="alert" aria-live="polite">
              {searchError}
            </p>
            <Button onClick={() => { setSearchQuery(''); setSearchError(null); setIsSearching(false); setSearchResults([]); }} variant="outline">
              Clear Search
            </Button>
          </div>
        );
      }
      if (!isSearching && searchResults.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <FileTextIcon className="w-16 h-16 text-gray-400 mb-4" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Results Found</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              No documents matched your search for "<strong>{searchQuery}</strong>".
            </p>
            <Button onClick={() => setSearchQuery('')} variant="outline">
              Clear Search
            </Button>
          </div>
        );
      }
    }

    // Generic empty states (if not searching and no items in current view)
    if (!searchQuery && !isLoading && !error && allItems.length === 0) {
      if (isInFolderView) {
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <FolderIcon className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">This Folder is Empty</h2>
            <p className="text-gray-500 dark:text-gray-400">There are no documents or subfolders here.</p>
            {/* Optionally, add a button to go up or create content */}
          </div>
        );
      } else { // Root view is empty
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <FileTextIcon className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">No Items Found</h2>
            <p className="text-gray-500 dark:text-gray-400">There are no documents or folders to display.</p>
            {/* Optionally, add a button to create a document or folder */}
          </div>
        );
      }
    }

    // Actual grid of items
    return (
      <SortableContext
        items={[
          ...allItems.filter(item => item.itemType === 'document').map(item => item.id)
          // Note: Folders are not sortable in this example, but their drop zone is part of DndContext
        ]}
        strategy={rectSortingStrategy}
      >
        <main ref={parentRef} className="overflow-auto flex-grow" style={{ height: 'calc(100vh - 250px)' /* Approximate height, adjust based on controls height */ }}>
          <h1 className="sr-only">Document Library</h1>
          <motion.div 
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
            role="grid"
            aria-label={`Document grid with ${allItems.length} items. Sorted by ${sortKey} in ${sortDirection === 'asc' ? 'ascending' : 'descending'} order. Use arrow keys to navigate between items.`}
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * numberOfColumns;
              const endIndex = Math.min(startIndex + numberOfColumns, allItems.length);
              const itemsInRow = allItems.slice(startIndex, endIndex);

              if (itemsInRow.length === 0 && allItems.length > 0) { 
                // This might happen if virtualizer count is off or items filtered out post-virtualization logic
                // For robust rendering, ensure this case is handled or prevented.
                // console.warn('Empty itemsInRow but allItems has content. Check virtualizer count and filtering.');
                return null;
              }
              if (itemsInRow.length === 0 && allItems.length === 0 && !searchQuery && !isLoading && !error) {
                  // This case is now handled by the main empty states above.
                  // However, if it were still possible to reach here with no items,
                  // ensure it doesn't cause an error.
                  return null; 
              }


              return (
                <div
                  key={`row-${virtualRow.index}`}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%', 
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 p-4">
                    {itemsInRow.map((item) => {
                      const originalFolderId = item.itemType === 'folder' ? (item as Folder & { itemType: 'folder' }).id.replace('folder-', '') : null;
                      return (
                      <div key={item.id} className="flex items-start">
                        {item.itemType === 'folder' ? (
                          <FolderCard
                            id={originalFolderId!}
                            title={(item as Folder & { itemType: 'folder' }).name}
                            documentCount={(item as any).document_count || 0}
                            isExpanded={false}
                            containedDocuments={folderContents[originalFolderId!] || []}
                            onToggleExpanded={() => handleFolderNavigate(originalFolderId!, (item as Folder & { itemType: 'folder' }).name)}
                            onFolderAction={(action: 'rename' | 'delete') => handleFolderAction(originalFolderId!, action)}
                            isSelected={selectedItemIds.has((item as Folder & { itemType: 'folder' }).id)}
                            onToggleSelect={() => toggleSelectItem((item as Folder & { itemType: 'folder' }).id)}
                            loadFolderSpecificContents={handleLoadFolderPreview}
                            isLoadingContents={loadingPreviewFolderIds.has(originalFolderId!)}
                            isLoadingChildren={loadingSubFolders.has(originalFolderId!)}
                          />
                        ) : (
                          <DocumentCard
                            key={item.id} // DocumentCard already has a key, but outer div needs one too
                            id={item.id}
                            title={(item as MappedDocumentCardData).title}
                            lastUpdated={(item as MappedDocumentCardData).lastUpdated}
                            snippet={(item as MappedDocumentCardData).snippet}
                            is_starred={(item as MappedDocumentCardData).is_starred}
                            isSelected={selectedItemIds.has(item.id)}
                          />
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </main>
      </SortableContext>
    );
  };
  

  return (
    <>
      {/* Search Bar */}
      <div className="mb-4 relative px-4 pt-4"> {/* Added padding to match grid */}
        <Search className="absolute left-7 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" /> {/* Adjusted left for padding */}
        <Input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10 w-full"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-5 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0" /* Adjusted right for padding */
            onClick={() => { setSearchQuery(''); setSearchError(null); setIsSearching(false); setSearchResults([]); }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Sorting Controls & New Folder Button */}
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
          className="ml-auto" /* Pushes this group to the right */
          aria-label={`Sort direction: ${sortDirection === 'asc' ? 'Ascending' : 'Descending'}. Click to change to ${sortDirection === 'asc' ? 'descending' : 'ascending'}.`}
        >
          {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        </Button>
        
        <Button 
          variant="default"
          size="sm"
          onClick={handleCreateFolder}
          className="flex items-center gap-2" // Removed ml-2, relies on gap-2 from parent
        >
          <FolderPlus className="w-4 h-4" />
          New Folder
        </Button>
        <div id="sort-help" className="sr-only">
          Choose how to sort the document list. Current sort: {sortKey} in {sortDirection === 'asc' ? 'ascending' : 'descending'} order.
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const collision = pointerWithin(args);
          // console.log('[DEBUG] Collision detection result:', {
          //   droppableEntries: args.droppableContainers.map(c => ({ id: c.id, rect: c.rect.current })),
          //   pointerCoordinates: args.pointerCoordinates,
          //   collisionResult: collision?.map(c => ({ id: c.id, data: c.data?.current })) || null
          // });
          return collision;
        }}
        onDragStart={handleDragStart}
        onDragOver={() => setHasActuallyDragged(true)}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Breadcrumb Navigation - moved inside DndContext for potential drop targets */}
        <div className="px-4 pt-2 pb-2"> {/* Added some padding around breadcrumbs */}
          <FolderBreadcrumbs
            currentPath={breadcrumbPath}
            onNavigate={navigateToFolder} // Changed from handleFolderNavigate as it includes subfolder loading
          />
        </div>
        
        {/* Call the function to render the main grid content */}
        {renderGridContent()}

      </DndContext>
      
      {draggedItems && draggedItems.length > 0 && (
        <DragOverlay dropAnimation={null}>
          {draggedItems.map((item) => (
            <div key={item.id} className="pointer-events-none rounded bg-blue-500/10 dark:bg-blue-400/20 px-3 py-2 text-sm text-blue-700 dark:text-blue-300 shadow-lg ring-1 ring-blue-500/30 dark:ring-blue-400/40 flex items-center space-x-2">
              {item.type === 'folder' ? (
                <FolderIcon className="w-4 h-4 flex-shrink-0" />
              ) : (
                <FileTextIcon className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="truncate max-w-[200px]">{item.name}</span>
            </div>
          ))}
        </DragOverlay>
      )}

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