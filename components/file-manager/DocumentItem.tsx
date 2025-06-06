import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import { Document } from '@/types/supabase'; // Assuming types are defined here
import { FileTextIcon, Edit2, Check, X, Trash2, Star } from 'lucide-react'; // Using lucide-react for icons
import { useFileData } from '@/hooks/useFileData'; // Import hook
import { useDraggable } from '@dnd-kit/core'; // Import useDraggable
import { CSS } from '@dnd-kit/utilities'; // Import CSS utility
import { useFileMediaStore } from '@/stores/fileMediaStore'; // Import the store

// --- NEW: Define a type for props that includes SearchResult fields --- 
// Make Document fields optional, ensure SearchResult fields are present.
type DocumentLike = Partial<Document> & { 
  id: string; 
  name: string; 
  folder_id: string | null; // Keep folder_id, though not directly used here
  is_starred?: boolean; // Add is_starred
};

interface DocumentItemProps {
  document: DocumentLike; // Use the combined type
  level?: number; // Add optional level prop
  onFileSelect?: (documentId: string, documentName?: string) => void; // Added prop
  isStarred: boolean; // ADD isStarred prop
  onToggleStar: (documentId: string) => void; // ADD onToggleStar prop
}

const DocumentItem: React.FC<DocumentItemProps> = ({ document, level = 0, onFileSelect, isStarred, onToggleStar }) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(document.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { renameDocument, deleteDocument } = useFileData(); // Get rename and delete functions
  const router = useRouter(); // Get router instance

  // Get selection state and actions from the store
  const { selectedItemIds, toggleSelectItem } = useFileMediaStore();
  const isSelected = selectedItemIds.has(document.id);

  // --- Draggable Setup ---
  const {attributes, listeners, setNodeRef, transform, isDragging} = useDraggable({
    id: document.id, // Use document ID
    data: { type: 'document', document }, // Pass data for identification
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  } : {};
  // --- End Draggable Setup ---

  // Update local name state if document prop changes (e.g., after refetch)
  useEffect(() => {
    setNewName(document.name);
  }, [document.name]);

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const handleRenameClick = (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent potential future navigation actions
    setNewName(document.name);
    setIsRenaming(true);
  };

  const handleRenameSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!newName.trim() || newName.trim() === document.name) {
        setIsRenaming(false);
        return;
    }
    const success = await renameDocument(document.id, newName);
    if (success) {
      setIsRenaming(false);
    }
    // Error toast handled in hook
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
    setNewName(document.name);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleRenameSubmit();
    } else if (event.key === 'Escape') {
      handleRenameCancel();
    }
  };

  // Handle click for navigation/opening ONLY (selection is via checkbox)
  const handleClick = () => {
    // Only navigate if not renaming or dragging
    if (!isRenaming && !isDragging) {
      if (onFileSelect) { // Check if the callback is provided
        onFileSelect(document.id, document.name);
      } else {
        router.push(`/editor/${document.id}`);
      }
    }
  };

  // Checkbox change handler
  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Prevent click event on the row from firing
    event.stopPropagation();
    toggleSelectItem(document.id);
  };

  // --- Delete Handler ---
  const handleDeleteClick = async (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent navigation
    // Confirmation is handled within the deleteDocument hook
    await deleteDocument(document.id);
    // UI updates via refetch triggered by deleteDocument
  };
  // --- End Delete Handler ---

  const indentationStyle = { paddingLeft: `${level * 1.5}rem` }; // Calculate indentation

  return (
    <button
      ref={setNodeRef} // Draggable ref attached here
      style={{ ...style, ...indentationStyle }} // Apply indentation style
      type="button"
      // Apply selection background based on isSelected
      className={`group flex items-center w-full p-2 rounded text-left relative 
                  ${isSelected ? 'bg-[--selected-bg]' : 'hover:bg-[--hover-bg] cursor-pointer'} 
                  focus:outline-none focus:ring-1 ${isRenaming ? 'focus:ring-transparent' : 'focus:ring-blue-500'}`}
      disabled={isRenaming}
    >
      {/* Checkbox for Selection */}
      <span onClick={(e) => e.stopPropagation()} className="mr-2 flex-shrink-0">
        {/* Replace with actual Checkbox component if available */}
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={handleCheckboxChange}
          aria-label={`Select document ${document.name}`}
          className="cursor-pointer form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out rounded border-gray-300 focus:ring-blue-500"
        />
      </span>
      {/* Inner container for content and drag handle - Handles navigation/opening click */}
      <div
        className="flex-grow flex items-center cursor-pointer"
        onClick={handleClick}
        {...attributes} // Apply accessibility attributes here
        {...listeners} // Apply drag listeners here
      >
        <FileTextIcon className="w-5 h-5 mr-2 text-[--icon-color] flex-shrink-0" />
        {isRenaming ? (
          // Pass stopPropagation to the form to prevent the outer button click
          <form onSubmit={handleRenameSubmit} onClick={(e) => e.stopPropagation()} className="flex-grow flex items-center">
            {/* Rename form remains the same */}
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
            <button type="submit" className="p-1 text-green-500 hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" disabled={!newName.trim() || newName.trim() === document.name} aria-label="Save name">
              <Check className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleRenameCancel} className="p-1 text-red-500 hover:bg-[--hover-bg] rounded ml-1 flex-shrink-0" aria-label="Cancel rename">
              <X className="w-4 h-4" />
            </button>
          </form>
        ) : (
          // Document name now inside the draggable div
          <span className="text-sm truncate flex-grow">{document.name}</span>
        )}
      </div>

      {/* Action Buttons container - outside the inner draggable div */}
      {!isRenaming && (
        <div onClick={(e) => e.stopPropagation()} className="ml-auto flex items-center space-x-1 pl-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 flex-shrink-0">
            {/* Star Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleStar(document.id); }}
              className="p-1 text-yellow-500 hover:text-yellow-400 rounded focus:outline-none focus:ring-1 focus:ring-yellow-500"
              aria-label={isStarred ? `Unstar document ${document.name}` : `Star document ${document.name}`}
              title={isStarred ? "Unstar document" : "Star document"}
            >
              {isStarred ? <Star size={16} className="fill-current" /> : <Star size={16} />}
            </button>
            {/* Rename button */}
            <button
                onClick={handleRenameClick}
                className="p-1 text-[--icon-color-secondary] hover:text-[--text-color] rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label={`Rename document ${document.name}`}
            >
                <Edit2 className="w-4 h-4" />
            </button>
            {/* Delete Button */}
            <button
                onClick={handleDeleteClick}
                className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                aria-label={`Delete document ${document.name}`}
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
      )}
    </button>
  );
};

export default DocumentItem; 