import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useFileMediaStore } from '@/stores/fileMediaStore';
import { useFileData } from '@/hooks/useFileData';
import { useSearchStore } from '@/stores/useSearchStore';
import FolderItem from './FolderItem';
import DocumentItem from './DocumentItem';
import FolderTree from './FolderTree';
import Breadcrumbs from './Breadcrumbs';
import { FolderPlus, Check, X, Loader2 } from 'lucide-react'; // Icons for create folder UI
import {
  DndContext,
  closestCenter,
  rectIntersection, // Import rectIntersection
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent, // Import DragEndEvent type
  DragStartEvent, // Correct type for onDragStart
  useDroppable, // Import useDroppable
  DragOverlay,   // Import DragOverlay
  pointerWithin, // Import pointerWithin
} from '@dnd-kit/core';
import {
  // arrayMove, // We might need this later
  SortableContext,
  sortableKeyboardCoordinates,
  // verticalListSortingStrategy, // We might use different strategies
} from '@dnd-kit/sortable';
import { toast } from 'sonner';
// Import icons needed for overlay
import { FileTextIcon, FolderIcon } from 'lucide-react';

const NewFileManager = () => {
  // Get state and setters from Zustand store
  const {
    currentFolderId,
    currentViewFolders,
    currentViewDocuments,
    allFolders,
    allDocuments,
    isLoading: isLoadingFiles,
    error: fileError,
    setCurrentFolder,
    selectedItemIds, // Get selected IDs
    clearSelection,  // Get clear selection action
    toggleSelectItem, // Added toggleSelectItem
  } = useFileMediaStore();

  // Get Search State
  const {
    isSearching,
    searchResults,
    isLoadingSearch,
    searchError,
  } = useSearchStore();

  // Get fetch and create functions from the custom hook
  const { fetchData, createFolder, moveItem } = useFileData();

  // State for inline folder creation UI
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const createFolderInputRef = useRef<HTMLInputElement>(null);

  // NEW: State to track IDs being dragged in a multi-select scenario
  const [draggedItemIds, setDraggedItemIds] = useState<Set<string> | null>(null);

  // Fetch data whenever the currentFolderId changes
  useEffect(() => {
    // Reset create folder state when navigating
    setIsCreatingFolder(false);
    setNewFolderName('');
    fetchData(currentFolderId);
  }, [currentFolderId, fetchData]);

  // Focus input when create folder UI appears
  useEffect(() => {
    if (isCreatingFolder) {
      createFolderInputRef.current?.focus();
    }
  }, [isCreatingFolder]);

  // Navigation handler
  const handleNavigate = useCallback((folderId: string | null) => {
    setCurrentFolder(folderId, allFolders);
  }, [setCurrentFolder, allFolders]);

  // --- Folder Creation Handlers ---
  const handleCreateFolderClick = () => {
    setIsCreatingFolder(true); // Show the input form
  };

  const handleCreateFolderSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newFolderName.trim()) return; // Basic validation

    const success = await createFolder(newFolderName);
    if (success) {
      setIsCreatingFolder(false); // Hide form on success
      setNewFolderName(''); // Reset input
    }
    // Error handling is done via toast within createFolder hook
  };

  const handleCreateFolderCancel = () => {
    setIsCreatingFolder(false);
    setNewFolderName('');
  };
  // --- End Folder Creation Handlers ---

  // --- Drag & Drop Setup ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require the mouse to move by 5 pixels before starting a drag
      // Adjust this value as needed
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // NEW: Handle Drag Start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = active.id as string;
    let newDraggedIds: Set<string>; // Define variable to hold the set

    // Check if the item drag started on is currently selected via checkbox
    if (selectedItemIds.has(activeId)) {
      // If starting drag on an already selected item, drag all selected items
      newDraggedIds = new Set(selectedItemIds);
    } else {
      // If starting drag on an unselected item:
      // 1. Clear the previous selection.
      // 2. Select only the item being dragged.
      // 3. Set only this item to be dragged.
      clearSelection();
      toggleSelectItem(activeId); // Select the single item
      newDraggedIds = new Set([activeId]); // Drag only this one item
    }
    setDraggedItemIds(newDraggedIds);
    console.log("[handleDragStart] Dragged IDs set to:", Array.from(newDraggedIds)); // Log the IDs being set
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const currentDraggedIds = draggedItemIds; // Capture the state at the start of the function
    setDraggedItemIds(null); // Reset dragged items state immediately

    // Log the state right before the check
    console.log("[handleDragEnd] Event:", { 
      activeId: active?.id,
      activeData: active?.data?.current,
      overId: over?.id,
      overData: over?.data?.current,
      currentDraggedIds: currentDraggedIds ? Array.from(currentDraggedIds) : null 
    });

    // Check if essential active data is missing or if nothing was actually being dragged
    if (!active.data.current || !currentDraggedIds || currentDraggedIds.size === 0) {
        console.log("Drag cancelled: Missing active data or no items were being dragged.");
        return;
    }

    // We still use the original `active` data for type determination
    const activeId = active.id as string;
    const activeType = active.data.current.type as 'folder' | 'document';

    let targetFolderId: string | null = null;
    let overId: string | null = null;
    let overType: string | null = null;

    // --- Determine Target Folder --- 
    if (over && over.data.current) {
        // Drop occurred over a registered droppable zone
        overId = over.id as string;
        overType = over.data.current.type as string; // Get type
        console.log(`Drop detected over known zone: ${overId}, Type: ${overType}`);

        // Don't allow dropping a selection onto one of the items within the selection
        if (currentDraggedIds.has(overId) && (overType === 'folder' || overType === 'document')) {
            console.log("Drag cancelled: Cannot drop selection onto itself.");
            return;
        }

        if (overType === 'folder' || overType === 'breadcrumb-folder') {
            targetFolderId = overId;
        } else if (overType === 'main-area') {
            targetFolderId = over.data.current.folderId;
        } else if (overType === 'folder-tree-root') {
            targetFolderId = null;
        } else {
            // Dropped over something registered but not a valid target type for us
            console.log(`Drag cancelled: Dropped over registered but unsupported zone type: ${overType}`);
            return;
        }
    } else {
        // Drop occurred somewhere else (assume background of current view)
        console.log("Drop detected outside known zones. Assuming drop onto current view background.");
        targetFolderId = currentFolderId; // Use the current folder ID as the target
        // overId and overType remain null
    }
    // --- End Determine Target Folder --- 

    console.log(`Processing DragEnd for ${currentDraggedIds.size} items:`, {
        draggedIds: Array.from(currentDraggedIds),
        activeTriggerId: activeId, 
        activeType,
        determinedTargetFolderId: targetFolderId, // Log the finally determined target
        detectedOverId: overId, // Log the detected overId (if any)
        detectedOverType: overType, // Log the detected overType (if any)
    });

    // --- Perform Move Operation for ALL Dragged Items ---
    const itemsToMove = Array.from(currentDraggedIds);

    // Get details for all items being moved (needed for parent checks)
    // This assumes itemsToMove contains only IDs. We need to get their types and current parents.
    // We might need to fetch this data from the store if not readily available in `active.data`
    // For now, we simplify and use the initial active item's type and data for checks,
    // *but this is a limitation if dragging mixed types or checking individual parent folders*

    // Simplified Check: Check if the *initiating* item is being moved into itself (if it's a folder)
    if (activeType === 'folder' && itemsToMove.includes(activeId) && activeId === targetFolderId) {
        toast.warning("Cannot move a folder into itself.");
        return;
    }

    // Simplified Check: Check if the *initiating* item is dropped onto its current parent
    // This won't prevent moving other selected items if they have different parents.
    const initialItemParentId = activeType === 'folder'
        ? active.data.current.folder?.parent_folder_id
        : active.data.current.document?.folder_id;

    if (itemsToMove.length === 1 && initialItemParentId === targetFolderId) {
        console.log(`Drag cancelled: ${activeType} dropped onto its current parent folder.`);
        return;
    }

    // TODO: Implement more robust checks for multi-drag:
    // 1. Prevent moving multiple folders if one is an ancestor of the targetFolderId.
    // 2. Iterate through itemsToMove and check *each* item's currentParentId against targetFolderId.
    //    Only move items that are actually changing parent.

    console.log(`Attempting to move items: ${itemsToMove.join(', ')} to targetFolderId: ${targetFolderId}`);

    // Call moveItem for each dragged item
    // Note: moveItem likely needs to accept an array or be called in a loop
    // Assuming moveItem handles individual moves for now.
    itemsToMove.forEach(itemId => {
        // Determine type based on ID (requires looking up in allFolders/allDocuments)
        const folder = allFolders.find(f => f.id === itemId);
        const doc = allDocuments.find(d => d.id === itemId);
        const itemType = folder ? 'folder' : (doc ? 'document' : null);

        if (itemType) {
            const currentParent = folder ? folder.parent_folder_id : doc?.folder_id;
            // Add specific logging here
            console.log(`Item ID: ${itemId}, Type: ${itemType}, Current Parent: ${currentParent}, Target Folder: ${targetFolderId}`);
            // Update check: Move if parents are different OR if target is root (null)
            if (currentParent !== targetFolderId || targetFolderId === null) {
                 console.log(`--> Calling moveItem(${itemId}, ${itemType}, ${targetFolderId})`);
                 moveItem(itemId, itemType, targetFolderId);
            } else {
                console.log(`--> Skipping move for ${itemId}: Already in target folder.`);
            }
        } else {
            console.error(`Could not determine type for dragged item ID: ${itemId}`);
        }
    });

  };

  // --- Main Area Drop Zone ---
  const dropZoneId = `folder-drop-zone-${currentFolderId || 'root'}`;
  const { isOver: isOverMainArea, setNodeRef: setMainAreaNodeRef } = useDroppable({
    id: dropZoneId,
    data: { type: 'main-area', folderId: currentFolderId, accepts: ['folder', 'document'] },
  });
  // Re-apply style directly for the main container
  const mainAreaStyle = {
    backgroundColor: isOverMainArea ? 'var(--drop-target-bg)' : 'transparent',
    transition: 'background-color 0.2s ease',
    minHeight: '100px', // Ensure drop zone has some height even when empty
    position: 'relative' as const, // Keep relative for potential children like inline form
  };

  // Log when the hover state changes
  useEffect(() => {
    console.log(`[useDroppable] isOverMainArea changed: ${isOverMainArea}`);
  }, [isOverMainArea]);

  // --- End Main Area Drop Zone ---

  // Determine content to display based on state
  let mainContent;

  // --- NEW: Handle Search View --- 
  if (isLoadingSearch) {
    mainContent = (
        <div className="flex justify-center items-center h-full p-4">
            <Loader2 className="h-6 w-6 animate-spin text-[--text-color-secondary]" />
            <span className="ml-2 text-[--text-color-secondary]">Searching documents...</span>
        </div>
    );
  } else if (searchError) {
      mainContent = <div className="p-4 text-center text-red-500">Search Error: {searchError}</div>;
  } else if (isSearching) {
      if (searchResults && searchResults.length > 0) {
          mainContent = (
              <>
                {searchResults.map((doc) => (
                  // Assuming DocumentItem can handle the SearchResult structure
                  // Or create a specific SearchResultItem component
                  <DocumentItem key={doc.id} document={doc} />
                ))}
              </>
          );
      } else {
           mainContent = <div className="p-4 text-center text-[--text-color-secondary]">No search results found.</div>;
      }
  // --- END NEW --- 
  } else { // Original File/Folder View
      if (isLoadingFiles && !isCreatingFolder) { // Don't show loading if only creating
        mainContent = <div className="p-4 text-center text-[--text-color-secondary]">Loading files...</div>;
      } else if (fileError) {
        mainContent = <div className="p-4 text-center text-red-500">Error: {fileError}</div>;
      } else if (!isCreatingFolder && currentViewFolders.length === 0 && currentViewDocuments.length === 0) {
        mainContent = (
          <div className="p-4 text-center text-[--text-color-secondary]">
            This folder is empty.
            {/* Optionally show create button here too? */}
          </div>
        );
      } else {
        // Combine folders and documents for SortableContext
        const items = [
            ...currentViewFolders.map(f => ({...f, type: 'folder'})), // Add type indicator
            ...currentViewDocuments.map(d => ({...d, type: 'document'})) // Add type indicator
        ];

        mainContent = (
          <>
            {/* Inline Create Folder Form */}
            {isCreatingFolder && (
              <form onSubmit={handleCreateFolderSubmit} className="flex items-center p-2 mb-2 border border-[--border-color] rounded bg-[--bg-secondary]">
                <FolderPlus className="w-5 h-5 mr-2 text-[--icon-color] flex-shrink-0" />
                <input
                  ref={createFolderInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name..."
                  className="flex-grow bg-transparent text-sm focus:outline-none mr-2 p-1"
                  maxLength={100} // Add a reasonable max length
                />
                <button
                  type="submit"
                  className="p-1 text-green-500 hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!newFolderName.trim()}
                  aria-label="Create folder"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCreateFolderCancel}
                  className="p-1 text-red-500 hover:bg-[--hover-bg] rounded ml-1"
                  aria-label="Cancel creation"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Render Folders */}
            {currentViewFolders.map((folder) => (
              <FolderItem key={folder.id} folder={folder} onNavigate={handleNavigate} />
            ))}
            {/* Render Documents */}
            {currentViewDocuments.map((doc) => (
              <DocumentItem key={doc.id} document={doc} />
            ))}
          </>
        );
      }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full w-full text-[--text-color]">
        {/* Toolbar / Breadcrumbs Area */}
        <div className="flex items-center justify-between p-2 border-b border-[--border-color]">
          <Breadcrumbs onNavigate={handleNavigate} />
          {/* Create Folder Button */}
          {!isCreatingFolder && (
            <button
              onClick={handleCreateFolderClick}
              className="flex items-center px-2 py-1 text-sm bg-[--button-bg] text-[--button-text] hover:bg-[--button-hover-bg] rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <FolderPlus className="w-4 h-4 mr-1" />
              Create Folder
            </button>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex flex-grow overflow-hidden">
          {/* Sidebar */}
          <div className="w-1/4 h-full border-r border-[--border-color] overflow-auto p-2">
            <FolderTree onNavigate={handleNavigate} />
          </div>

          {/* File/Folder Listing Container - Apply drop zone ref/style again */}
          <div
            ref={setMainAreaNodeRef} // Apply drop zone ref here
            style={mainAreaStyle} // Apply drop zone style here
            className="flex-grow h-full overflow-auto p-2 flex flex-col space-y-1 relative" // Keep relative positioning
          >
            {/* Remove the dedicated background drop zone and the extra content wrapper */}
            {mainContent}
          </div>
        </div>

        {/* Optional Footer/Status Bar */}
        {/* <div className="flex-shrink-0 p-1 border-t border-[--border-color] text-xs text-[--text-color-secondary]">
          Status Bar
        </div> */}
      </div>

      {/* Drag Overlay for Custom Previews */}
      <DragOverlay dropAnimation={null}> 
        {draggedItemIds && draggedItemIds.size > 0 ? (
          <div className="pointer-events-none rounded bg-[--selected-bg] px-3 py-2 text-sm shadow-lg ring-1 ring-black ring-opacity-5">
            {draggedItemIds.size === 1 ? (
              // Single item preview
              (() => {
                const itemId = Array.from(draggedItemIds)[0];
                const folder = allFolders.find(f => f.id === itemId);
                const document = allDocuments.find(d => d.id === itemId);
                const item = folder || document;
                const itemType = folder ? 'folder' : (document ? 'document' : null);

                if (!item || !itemType) return <span>Loading preview...</span>;

                return (
                  <span className="flex items-center">
                    {itemType === 'folder' ? 
                      <FolderIcon className="w-4 h-4 mr-2 text-[--icon-color]" /> : 
                      <FileTextIcon className="w-4 h-4 mr-2 text-[--icon-color]" />
                    }
                    <span className="truncate">{item.name}</span>
                  </span>
                );
              })()
            ) : (
              // Multi-item preview
              <span>Moving {draggedItemIds.size} items</span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default NewFileManager; 