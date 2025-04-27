import React from 'react';
import { useFileMediaStore } from '@/stores/fileMediaStore';
import { FolderIcon } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';

interface FolderTreeProps {
  onNavigate: (folderId: string | null) => void;
}

const FolderTree: React.FC<FolderTreeProps> = ({ onNavigate }) => {
  // State selectors
  const allFolders = useFileMediaStore((state) => state.allFolders);
  const isLoading = useFileMediaStore((state) => state.isLoading);
  const error = useFileMediaStore((state) => state.error);
  const currentFolderId = useFileMediaStore((state) => state.currentFolderId);

  // --- Root Drop Zone Setup ---
  const rootDropZoneId = 'root-folder-tree-drop-zone'; // Unique ID for the root drop zone
  const { isOver: isOverRoot, setNodeRef: setRootNodeRef } = useDroppable({
    id: rootDropZoneId,
    data: { type: 'folder-tree-root', folderId: null, accepts: ['folder', 'document'] }, // Data for identification
  });
  const rootDropStyle = {
    backgroundColor: isOverRoot ? 'var(--drop-target-bg)' : 'transparent',
    // transition: 'background-color 0.2s ease',
  };
  // --- End Root Drop Zone Setup ---

  // TODO: Add drop zones for other folders in the tree later if needed

  const rootFolders = allFolders.filter(folder => folder.parent_folder_id === null);

  if (isLoading) {
    return <div className="text-xs text-center text-[--text-color-secondary] p-2">Loading tree...</div>;
  }

  if (error) {
    return <div className="text-xs text-center text-red-500 p-2">Error loading tree.</div>;
  }

  const handleRootClick = () => {
    onNavigate(null);
  };

  return (
    <div className="space-y-1">
      {/* Static Root Folder (Droppable) */}
      <button
        ref={setRootNodeRef} // Apply droppable ref
        style={rootDropStyle} // Apply drop highlight style
        onClick={handleRootClick}
        className={`flex items-center w-full p-1 rounded cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-blue-500 ${currentFolderId === null ? 'bg-[--selected-bg] font-medium' : 'hover:bg-[--hover-bg]'}`}
      >
        <FolderIcon className="w-4 h-4 mr-2 text-[--icon-color] flex-shrink-0" />
        <span className="text-xs truncate">My Files</span>
      </button>

      {/* Render Root Folders (Potentially make droppable later) */}
      {rootFolders.map((folder) => (
        // TODO: Add useDroppable here if direct dropping onto sidebar folders is desired
        <button
          key={folder.id}
          onClick={() => onNavigate(folder.id)}
          className={`flex items-center w-full p-1 rounded cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-blue-500 ${currentFolderId === folder.id ? 'bg-[--selected-bg] font-medium' : 'hover:bg-[--hover-bg]'}`}
        >
          <FolderIcon className="w-4 h-4 mr-2 text-[--icon-color] flex-shrink-0" />
          <span className="text-xs truncate">{folder.name}</span>
        </button>
      ))}
      {rootFolders.length === 0 && !isLoading && (
         <div className="text-xs text-center text-[--text-color-secondary] p-2">No top-level folders.</div>
      )}
    </div>
  );
};

export default FolderTree; 