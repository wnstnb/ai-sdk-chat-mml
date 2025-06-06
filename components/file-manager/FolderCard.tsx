import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, MoreVertical, CheckSquare, Square } from 'lucide-react';

import { useDroppable } from '@dnd-kit/core';
import DocumentCard from './DocumentCard';
import type { MappedDocumentCardData } from '@/lib/mappers/documentMappers';

interface FolderCardProps {
  id: string;
  title: string;
  documentCount: number;
  isExpanded?: boolean;
  containedDocuments?: MappedDocumentCardData[];
  onToggleExpanded?: () => void;
  onFolderAction?: (action: 'rename' | 'delete') => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const FolderCard: React.FC<FolderCardProps> = ({
  id,
  title,
  documentCount,
  isExpanded = false,
  containedDocuments = [],
  onToggleExpanded,
  onFolderAction,
  isSelected = false,
  onToggleSelect,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayTitle = title || "(Untitled Folder)";

  // Droppable for document dropping (no longer sortable to prevent displacement)
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${id}`,
    data: {
      type: 'folder',
      folderId: id,
    },
  });

  // No transform styles since folders are no longer sortable
  const style = {};

  // Height is now controlled by aspect-ratio in className
  // const headerHeight = 80; // Height for folder header
  // const documentListHeight = Math.min(
  //   containedDocuments.length * 44 + 16, // Each doc item ~44px + padding
  //   200 // Max height to prevent cards from being too tall
  // );
  // const emptyStateHeight = 80; // Height for empty state
  // const totalHeight = headerHeight + (containedDocuments.length > 0 ? documentListHeight : emptyStateHeight);

  const handleFolderClick = (e: React.MouseEvent) => {
    // Prevent folder toggle when clicking on menu or other interactive elements
    if (e.target instanceof Element && e.target.closest('[data-menu]')) {
      return;
    }
    console.log('Folder click detected for folder:', id, 'isExpanded:', isExpanded);
    onToggleExpanded?.();
  };

  const handleMenuAction = (action: 'rename' | 'delete') => {
    setIsMenuOpen(false);
    onFolderAction?.(action);
  };

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isMenuOpen]);

  return (
    <article
      ref={setNodeRef}
      style={{
        ...style,
        // height: totalHeight, // Removed explicit height
        // minHeight: totalHeight, // Removed explicit minHeight
      }}

      className={`
        group relative flex flex-col rounded-lg 
        transition-all duration-300 ease-in-out motion-reduce:transition-none 
        ${isMenuOpen ? 'overflow-visible' : 'overflow-hidden'} w-full max-w-[256px] aspect-[3/4] touch-manipulation 
        focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 
        ${isSelected ? 'ring-2 ring-[--accent-color] shadow-md' : 'focus:ring-[--accent-color]'}
        ${isOver ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}
        ${!isSelected && (isExpanded ? 'hover:shadow-xl' : 'hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none')}
      `}
      aria-labelledby={`folder-title-${id}`}
      aria-describedby={`folder-count-${id}`}
      role="button"
      tabIndex={0}
      aria-label={`Folder: ${displayTitle}. Contains ${documentCount} documents. ${isExpanded ? 'Expanded' : 'Collapsed'}. Click to ${isExpanded ? 'collapse' : 'expand'}.`}
      onClick={handleFolderClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleFolderClick(e as any);
        }
      }}
    >
      {/* Screen reader only text for drag and drop context */}
      <div className="sr-only">
        Folder card. Drop documents here to add them to this folder.
      </div>

      {/* Full Glass Effect Container */}
      <div className="h-full flex flex-col bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/50 rounded-lg">
        
        {/* Checkbox for selection - positioned absolutely */}
        {onToggleSelect && (
          <button 
            onClick={(e) => {
              e.stopPropagation(); // Prevent card click/drag
              onToggleSelect(id);
            }}
            className="absolute top-2 left-2 z-20 p-1 rounded hover:bg-gray-300/70 dark:hover:bg-gray-600/70 transition-colors"
            aria-label={isSelected ? `Deselect folder ${title}` : `Select folder ${title}`}
            title={isSelected ? `Deselect folder ${title}` : `Select folder ${title}`}
          >
            {isSelected ? <CheckSquare size={18} className="text-blue-600 dark:text-blue-500" /> : <Square size={18} className="text-gray-500 dark:text-gray-400" />}
          </button>
        )}
        
        {/* Folder Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-200/30 dark:border-gray-600/30">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            {/* Drag Handle - Removed since folders are no longer draggable */}
            
            {/* Folder Icon */}
            <div className="flex-shrink-0">
              {isExpanded ? (
                <FolderOpen 
                  className="w-6 h-6 text-blue-500 dark:text-blue-400" 
                  aria-hidden="true"
                />
              ) : (
                <Folder 
                  className="w-6 h-6 text-blue-500 dark:text-blue-400" 
                  aria-hidden="true"
                />
              )}
            </div>
            
            {/* Folder Title and Count */}
            <div className="flex-1 min-w-0">
              <h3 
                id={`folder-title-${id}`}
                title={displayTitle}
                className="text-lg font-semibold leading-normal text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
              >
                {displayTitle}
              </h3>
              <p 
                id={`folder-count-${id}`}
                className="text-xs text-gray-500 dark:text-gray-400"
                aria-label={`Contains ${documentCount} ${documentCount === 1 ? 'document' : 'documents'}`}
              >
                {documentCount} {documentCount === 1 ? 'document' : 'documents'}
              </p>
            </div>
          </div>

          {/* Folder Actions Menu */}
          <div className="relative" data-menu>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="p-1 rounded-md hover:bg-gray-200/50 dark:hover:bg-gray-600/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Folder options"
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
            >
              <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            
            {isMenuOpen && (
              <div 
                ref={menuRef}
                className="absolute right-0 top-8 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 min-w-[120px]"
              >
                <button
                  onClick={() => handleMenuAction('rename')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  Rename
                </button>
                <button
                  onClick={() => handleMenuAction('delete')}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Folder Content Preview (always visible) */}
        <div className="p-3 pt-2 flex-1 min-h-0">
          {containedDocuments.length > 0 ? (
            <div className="h-full flex flex-col">
              {/* Document List */}
              <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {containedDocuments.map((doc, index) => (
                  <div 
                    key={doc.id} 
                    className="p-2 bg-white/50 dark:bg-gray-800/50 rounded-md border border-gray-200/30 dark:border-gray-600/30 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Navigate to document
                      window.location.href = `/editor/${doc.id}`;
                    }}
                    title={`${doc.title} - Click to open`}
                  >
                    <div className="flex items-start space-x-2">
                      {/* Document icon or star */}
                      <div className="flex-shrink-0 mt-0.5">
                        {doc.is_starred ? (
                          <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                        ) : (
                          <div className="w-3 h-3 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                        )}
                      </div>
                      
                      {/* Document info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                          {doc.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {new Date(doc.lastUpdated).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Scroll indicator for overflow */}
              {containedDocuments.length > 3 && (
                <div className="text-center pt-2 border-t border-gray-200/30 dark:border-gray-600/30 mt-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Scroll to see all {containedDocuments.length} documents
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-1">
                  Empty folder
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Drop documents here
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Drop overlay when dragging over */}
        {isOver && (
          <div className="absolute inset-0 bg-blue-500/20 border-2 border-blue-500 border-dashed rounded-lg flex items-center justify-center">
            <p className="text-blue-700 dark:text-blue-300 font-medium">
              Drop here to add to folder
            </p>
          </div>
        )}
      </div>
    </article>
  );
};

export default FolderCard; 