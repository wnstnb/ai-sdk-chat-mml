import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useFileMediaStore } from '@/stores/fileMediaStore';
import { useFileData } from '@/hooks/useFileData';
import FolderItem from './FolderItem';
import DocumentItem from './DocumentItem';
import FolderTree from './FolderTree';
import Breadcrumbs from './Breadcrumbs';
import { FolderPlus, Check, X } from 'lucide-react'; // Icons for create folder UI
import {
  DndContext,
  closestCenter,
  rectIntersection, // Import rectIntersection
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent, // Import DragEndEvent type
  useDroppable, // Import useDroppable
} from '@dnd-kit/core';
import {
  // arrayMove, // We might need this later
  SortableContext,
  sortableKeyboardCoordinates,
  // verticalListSortingStrategy, // We might use different strategies
} from '@dnd-kit/sortable';
import { toast } from 'sonner';

const NewFileManager = () => {
  // Get state and setters from Zustand store
  const {
    currentFolderId,
    currentViewFolders,
    currentViewDocuments,
    allFolders,
    isLoading,
    error,
    setCurrentFolder,
  } = useFileMediaStore();

  // Get fetch and create functions from the custom hook
  const { fetchData, createFolder, moveItem } = useFileData();

  // State for inline folder creation UI
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const createFolderInputRef = useRef<HTMLInputElement>(null);

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
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !active.data.current || !over.data.current) {
        console.log("Drag cancelled: Missing active or over data");
        return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeType = active.data.current.type as 'folder' | 'document';
    // Adjust overType possibilities
    const overType = over.data.current.type as 'folder' | 'main-area' | 'folder-tree-root';

    if (activeId === overId) {
        console.log("Drag cancelled: Item dropped on itself");
        return;
    }

    console.log("Processing DragEnd:", {
        activeId,
        activeType,
        activeData: active.data.current,
        overId,
        overType,
        overData: over.data.current,
      });

    let targetFolderId: string | null = null;

    // Determine target folder ID based on drop zone type
    if (overType === 'folder') {
      // Dropped onto a folder item in the main view
      targetFolderId = overId;
    } else if (overType === 'main-area') {
      // Dropped onto the background area of the current folder
      targetFolderId = over.data.current.folderId; // This is the currentFolderId (or null for root)
    } else if (overType === 'folder-tree-root') {
        // Dropped onto the "My Files" root in the sidebar
        targetFolderId = null;
    } else {
        console.log("Drag cancelled: Invalid drop target type", overType);
        return; // Invalid drop target
    }

    // Perform checks (moving folder into itself, moving to current parent)
    if (activeType === 'folder' && activeId === targetFolderId) {
        toast.warning("Cannot move a folder into itself.");
        return;
    }

    const currentParentId = activeType === 'folder'
        ? active.data.current.folder?.parent_folder_id
        : active.data.current.document?.folder_id;

    if (currentParentId === targetFolderId) {
        console.log(`Drag cancelled: ${activeType} dropped onto its current parent folder.`);
        // Optionally add a user-facing toast message here if desired
        // toast.info("Item is already in this folder.");
        return;
    }

    // Call the moveItem function from the hook
    moveItem(activeId, activeType, targetFolderId);

  };

  // --- Main Area Drop Zone ---
  const dropZoneId = `folder-drop-zone-${currentFolderId || 'root'}`;
  const { isOver: isOverMainArea, setNodeRef: setMainAreaNodeRef } = useDroppable({
    id: dropZoneId,
    data: { type: 'main-area', folderId: currentFolderId, accepts: ['folder', 'document'] },
  });
  const mainAreaStyle = {
    backgroundColor: isOverMainArea ? 'var(--drop-target-bg)' : 'transparent',
    transition: 'background-color 0.2s ease',
    minHeight: '100px', // Ensure drop zone has some height even when empty
  };
  // --- End Main Area Drop Zone ---

  // Determine content to display based on state
  let mainContent;
  if (isLoading && !isCreatingFolder) { // Don't show loading if only creating
    mainContent = <div className="p-4 text-center text-[--text-color-secondary]">Loading files...</div>;
  } else if (error) {
    mainContent = <div className="p-4 text-center text-red-500">Error: {error}</div>;
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection} // Change from closestCenter
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

          {/* File/Folder Listing - Apply droppable ref and style */}
          <div
             ref={setMainAreaNodeRef} // Set ref for droppable
             style={mainAreaStyle} // Apply drop highlight style
             className="flex-grow h-full overflow-auto p-2 flex flex-col space-y-1" // Added flex-col and space-y
          >
            {mainContent}
          </div>
        </div>

        {/* Optional Footer/Status Bar */}
        {/* <div className="flex-shrink-0 p-1 border-t border-[--border-color] text-xs text-[--text-color-secondary]">
          Status Bar
        </div> */}
      </div>
    </DndContext>
  );
};

export default NewFileManager; 