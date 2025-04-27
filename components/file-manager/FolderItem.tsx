import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Folder, Document } from '@/types/supabase';
import { FolderIcon, Edit2, Check, X, Trash2, ChevronRight, ChevronDown } from 'lucide-react'; // Add Chevrons
import { useFileData } from '@/hooks/useFileData';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useFileMediaStore } from '@/stores/fileMediaStore'; // Import store
import DocumentItem from './DocumentItem'; // Import DocumentItem for recursive rendering

interface FolderItemProps {
  folder: Folder;
  onNavigate: (folderId: string | null) => void;
  level?: number; // Indentation level for hierarchy
}

// Need to forwardRef for recursive components with refs
const FolderItem = React.forwardRef<
  HTMLDivElement, // Type of the element ref points to
  FolderItemProps
>(({ folder, onNavigate, level = 0 }, ref) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { renameFolder, deleteFolder } = useFileData();

  // Store state for expansion and children
  const {
    expandedFolderIds,
    toggleFolderExpansion,
    allFolders,
    allDocuments,
    selectedItemIds, // Get selected IDs
    toggleSelectItem, // Use the updated action
  } = useFileMediaStore();

  const isSelected = selectedItemIds.has(folder.id);
  const isExpanded = expandedFolderIds.has(folder.id);

  // Find children efficiently
  const childFolders = useMemo(() =>
    allFolders.filter((f: Folder) => f.parent_folder_id === folder.id),
    [allFolders, folder.id]
  );
  const childDocuments = useMemo(() =>
    allDocuments.filter((d: Document) => d.folder_id === folder.id),
    [allDocuments, folder.id]
  );
  const hasChildren = childFolders.length > 0 || childDocuments.length > 0;

  // --- Draggable Setup ---
  const {attributes, listeners, setNodeRef: setDraggableNodeRef, transform, isDragging} = useDraggable({
    id: folder.id,
    data: { type: 'folder', folder },
    disabled: isRenaming, // Disable dragging while renaming
  });

  const draggableStyle = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  } : {};
  // --- End Draggable Setup ---

  // --- Droppable Setup ---
  const {isOver, setNodeRef: setDroppableNodeRef} = useDroppable({
    id: folder.id,
    data: { type: 'folder', accepts: ['folder', 'document'] },
    disabled: isRenaming, // Allow dropping onto the folder item even when it's expanded
  });

  // Combine refs for the main div
  const setNodeRef = (node: HTMLDivElement | null) => {
      setDraggableNodeRef(node);
      setDroppableNodeRef(node);
      // Assign to forwarded ref if provided
      if (typeof ref === 'function') {
          ref(node);
      } else if (ref) {
          ref.current = node;
      }
  };

  const dropStyle = {
    backgroundColor: isOver && !isExpanded ? 'var(--drop-target-bg)' : 'transparent',
  };
  // --- End Droppable Setup ---

  // Effects
  useEffect(() => { setNewName(folder.name); }, [folder.name]);
  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  // Handlers
  const handleExpandClick = (event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent navigation
      toggleFolderExpansion(folder.id);
  };

  // Click handler for navigation ONLY (selection handled by checkbox)
  const handleNavigateClick = () => {
    // Only navigate if not renaming or dragging
    if (!isRenaming && !isDragging) {
      onNavigate(folder.id);
    }
  };

  // Checkbox change handler
  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Prevent click event on the row from firing
    event.stopPropagation();
    toggleSelectItem(folder.id);
  };

  // Rename Handlers
  const handleRenameClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setNewName(folder.name);
    setIsRenaming(true);
  };
  const handleRenameSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!newName.trim() || newName.trim() === folder.name) {
        setIsRenaming(false);
        return;
    }
    const success = await renameFolder(folder.id, newName);
    if (success) {
      setIsRenaming(false);
    }
  };
  const handleRenameCancel = () => {
    setIsRenaming(false);
    setNewName(folder.name);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleRenameSubmit();
    } else if (event.key === 'Escape') {
      handleRenameCancel();
    }
  };

  // Delete Handler
  const handleDeleteClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    await deleteFolder(folder.id);
  };

  const indentationStyle = { paddingLeft: `${level * 1.5}rem` }; // 1.5rem per level

  return (
    <>
      {/* Main Folder Row */}
      <div
        ref={setNodeRef} // Apply combined ref here
        style={{ ...draggableStyle, ...dropStyle, ...indentationStyle }} // Apply styles
        // Apply selection background based on isSelected
        className={`group flex items-center w-full p-2 rounded text-left relative 
                    ${isSelected ? 'bg-[--selected-bg]' : 'hover:bg-[--hover-bg]'}`}
        {...attributes} // Keep accessibility attributes
      >
        {/* Checkbox for Selection */}
        <span onClick={(e) => e.stopPropagation()} className="mr-2 flex-shrink-0">
          {/* Replace with actual Checkbox component if available */}
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={handleCheckboxChange}
            aria-label={`Select folder ${folder.name}`}
            className="cursor-pointer form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out rounded border-gray-300 focus:ring-blue-500"
          />
        </span>

        {/* Chevron for Expansion (Click handled separately) */}
        <span onClick={handleExpandClick} className="mr-1 p-0.5 rounded hover:bg-[--icon-hover-bg] cursor-pointer flex-shrink-0">
            {hasChildren ? (
                isExpanded ? <ChevronDown className="w-4 h-4 text-[--icon-color-secondary]" /> : <ChevronRight className="w-4 h-4 text-[--icon-color-secondary]" />
            ) : (
                <span className="w-4 h-4 inline-block"></span> // Placeholder for alignment
            )}
        </span>

        {/* Clickable & Draggable Area (Icon + Name/Form) - Handles navigation */}
        {/* Apply drag listeners and navigation click here */}
        <div className="flex items-center flex-grow cursor-pointer" onClick={handleNavigateClick} {...listeners}>
            <FolderIcon className="w-5 h-5 mr-2 text-[--icon-color] flex-shrink-0" />
            {isRenaming ? (
                <form onSubmit={handleRenameSubmit} onClick={(e) => e.stopPropagation()} className="flex-grow flex items-center">
                 {/* Rename form ... */}
                   <input
                        ref={inputRef}
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => handleRenameSubmit()}
                        className="flex-grow bg-transparent text-sm focus:outline-none mr-1 p-0.5 rounded ring-1 ring-blue-500"
                        maxLength={100}
                    />
                    <button type="submit" className="p-1 text-green-500 hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" disabled={!newName.trim() || newName.trim() === folder.name} aria-label="Save name"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={handleRenameCancel} className="p-1 text-red-500 hover:bg-[--hover-bg] rounded ml-1 flex-shrink-0" aria-label="Cancel rename"><X className="w-4 h-4" /></button>
                </form>
            ) : (
                <span className="text-sm truncate flex-grow">{folder.name}</span>
            )}
        </div>

        {/* Action buttons (Rename/Delete) */}
        {!isRenaming && (
            <div onClick={(e) => e.stopPropagation()} className="ml-auto flex items-center space-x-1 pl-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 flex-shrink-0">
                <button onClick={handleRenameClick} className="p-1 text-[--icon-color-secondary] hover:text-[--text-color] rounded focus:outline-none focus:ring-1 focus:ring-blue-500" aria-label={`Rename folder ${folder.name}`}><Edit2 className="w-4 h-4" /></button>
                <button onClick={handleDeleteClick} className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400 rounded focus:outline-none focus:ring-1 focus:ring-red-500" aria-label={`Delete folder ${folder.name}`}><Trash2 className="w-4 h-4" /></button>
            </div>
        )}
      </div>

      {/* Render Children if Expanded */}
      {isExpanded && (
        <div className="flex flex-col">
          {childFolders.map((childFolder: Folder) => (
            <FolderItem
              key={childFolder.id}
              folder={childFolder}
              onNavigate={onNavigate}
              level={level + 1} // Increase level for indentation
            />
          ))}
          {childDocuments.map((childDoc: Document) => (
            <DocumentItem
              key={childDoc.id}
              document={childDoc}
              level={level + 1} // Pass level for indentation
            />
          ))}
           {childFolders.length === 0 && childDocuments.length === 0 && (
              <div style={{ paddingLeft: `${(level + 1) * 1.5}rem` }} className="p-2 text-xs text-center text-[--text-color-secondary]">
                  - Empty -
              </div>
           )}
        </div>
      )}
    </>
  );
});

FolderItem.displayName = 'FolderItem'; // Needed for forwardRef with ESLint

export default FolderItem; 