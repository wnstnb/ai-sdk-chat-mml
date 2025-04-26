import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import { Document } from '@/types/supabase'; // Assuming types are defined here
import { FileTextIcon, Edit2, Check, X, Trash2 } from 'lucide-react'; // Using lucide-react for icons
import { useFileData } from '@/hooks/useFileData'; // Import hook
import { useDraggable } from '@dnd-kit/core'; // Import useDraggable
import { CSS } from '@dnd-kit/utilities'; // Import CSS utility

// --- NEW: Define a type for props that includes SearchResult fields --- 
// Make Document fields optional, ensure SearchResult fields are present.
type DocumentLike = Partial<Document> & { 
  id: string; 
  name: string; 
  folder_id: string | null; // Keep folder_id, though not directly used here
};

interface DocumentItemProps {
  document: DocumentLike; // Use the combined type
  level?: number; // Add optional level prop
}

const DocumentItem: React.FC<DocumentItemProps> = ({ document, level = 0 }) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(document.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { renameDocument, deleteDocument } = useFileData(); // Get rename and delete functions
  const router = useRouter(); // Get router instance

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

  // Handle click for navigation
  const handleClick = () => {
    // Prevent navigation if a drag action just occurred or is in progress
    if (!isRenaming && !isDragging) {
      router.push(`/editor/${document.id}`);
    }
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
      // Keep the outer button clickable for navigation
      className={`group flex items-center w-full p-2 rounded text-left relative ${isRenaming ? 'bg-[--selected-bg]' : 'hover:bg-[--hover-bg] cursor-pointer'} focus:outline-none focus:ring-1 ${isRenaming ? 'focus:ring-transparent' : 'focus:ring-blue-500'}`}
      onClick={handleClick}
      disabled={isRenaming}
      // Remove listeners and attributes from the main button
    >
      {/* Inner container for content and drag handle */} 
      <div
        className="flex-grow flex items-center"
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