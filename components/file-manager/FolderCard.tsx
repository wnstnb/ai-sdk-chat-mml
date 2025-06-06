import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, MoreVertical, CheckSquare, Square, ChevronDown, ChevronRight, Loader2, ChevronUp } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/dateUtils';

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
  loadFolderSpecificContents?: (folderId: string) => Promise<void>;
  isLoadingContents?: boolean;
  isLoadingChildren?: boolean;
}

const FolderCard: React.FC<FolderCardProps> = React.memo(({
  id,
  title,
  documentCount,
  isExpanded = false,
  containedDocuments = [],
  onToggleExpanded,
  onFolderAction,
  isSelected = false,
  onToggleSelect,
  loadFolderSpecificContents,
  isLoadingContents = false,
  isLoadingChildren,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayTitle = title || "(Untitled Folder)";

  const [isInternalPreviewExpanded, setIsInternalPreviewExpanded] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${id}`,
    data: {
      type: 'folder',
      folderId: id,
    },
  });

  const style = {};

  const handleFolderClick = (e: React.MouseEvent) => {
    if (e.target instanceof Element && (e.target.closest('[data-menu]') || e.target.closest('[data-preview-toggle]'))) {
      return;
    }
    console.log('Folder navigation click detected for folder:', id);
    onToggleExpanded?.();
  };

  const handleToggleInternalPreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newPreviewState = !isInternalPreviewExpanded;
    setIsInternalPreviewExpanded(newPreviewState);
    if (newPreviewState && containedDocuments.length === 0 && documentCount > 0 && loadFolderSpecificContents) {
      await loadFolderSpecificContents(id);
    }
  };

  const handleMenuAction = (action: 'rename' | 'delete') => {
    setIsMenuOpen(false);
    onFolderAction?.(action);
  };

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

  const cardHeightClass = isInternalPreviewExpanded 
    ? 'aspect-[3/4]'
    : 'h-48';

  return (
    <article
      ref={setNodeRef}
      style={{
        ...style,
      }}

      className={`
        group relative flex flex-col rounded-lg 
        transition-all duration-300 ease-in-out motion-reduce:transition-none 
        ${isMenuOpen ? 'overflow-visible' : 'overflow-hidden'} w-full max-w-[256px] ${cardHeightClass} touch-manipulation 
        focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 
        ${isSelected ? 'ring-2 ring-[var(--accent-color)] shadow-md' : 'focus:ring-[var(--accent-color)]'}
        ${isOver ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}
        ${!isSelected && 'hover:shadow-lg motion-reduce:hover:transform-none'}
        ${!isSelected && !isInternalPreviewExpanded && 'hover:-translate-y-1 hover:scale-[1.02]'}
      `}
      aria-labelledby={`folder-title-${id}`}
      aria-describedby={`folder-count-${id} folder-preview-status-${id}`}
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
      <div className="sr-only">
        Folder card. Drop documents here to add them to this folder.
      </div>

      <div className="h-full flex flex-col bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md border border-gray-200/50 dark:border-gray-600/50 rounded-lg">
        
        {onToggleSelect && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(id);
            }}
            className="absolute top-2 left-2 z-20 p-1 rounded hover:bg-gray-300/70 dark:hover:bg-gray-600/70 transition-colors"
            aria-label={isSelected ? `Deselect folder ${title}` : `Select folder ${title}`}
            title={isSelected ? `Deselect folder ${title}` : `Select folder ${title}`}
          >
            {isSelected ? <CheckSquare size={18} className="text-blue-600 dark:text-blue-500" /> : <Square size={18} className="text-gray-500 dark:text-gray-400" />}
          </button>
        )}
        
        <div className="p-4 flex items-center justify-between border-b border-gray-200/30 dark:border-gray-600/30">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            
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

        <div className="flex-grow flex flex-col min-h-0 p-3 pt-1">
          <div 
            data-preview-toggle
            onClick={handleToggleInternalPreview}
            className="flex items-center justify-between w-full py-2 px-3 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-600/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            aria-expanded={isInternalPreviewExpanded}
            aria-controls={`folder-preview-${id}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { 
              if (e.key === 'Enter' || e.key === ' ') { 
                e.preventDefault(); 
                handleToggleInternalPreview(e as any); 
              }
            }}
          >
            <span>{isInternalPreviewExpanded ? 'Hide' : 'Show'} Files ({documentCount})</span>
            {isLoadingChildren ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            ) : isLoadingContents ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            ) : (
              <span className="p-1" aria-hidden="true">
                {isInternalPreviewExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            )}
          </div>
          <div id={`folder-preview-status-${id}`} className="sr-only">
            {isInternalPreviewExpanded ? 'File preview is expanded.' : 'File preview is collapsed.'}
          </div>

          {isInternalPreviewExpanded && (
            <div id={`folder-preview-${id}`} className="flex-grow overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
              {isLoadingContents && (
                <div className="flex items-center justify-center h-full text-xs text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Loading files...
                </div>
              )}
              {!isLoadingContents && containedDocuments.length === 0 && documentCount > 0 && (
                 <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-2">No files loaded yet. Click &quot;Show Files&quot; again or ensure files exist.</p>
              )}
              {!isLoadingContents && containedDocuments.length === 0 && documentCount === 0 && (
                <p className="text-xs text-center text-gray-400 dark:text-gray-500 py-2">This folder is empty.</p>
              )}
              {!isLoadingContents && containedDocuments.map((doc) => (
                <a 
                  key={doc.id} 
                  href={`/editor/${doc.id}`}
                  onClick={(e) => {
                    if (e.target instanceof Element && e.target.closest('[draggable="true"]')) {
                      e.stopPropagation(); 
                    }
                  }}
                  className="block p-1.5 rounded hover:bg-gray-200/70 dark:hover:bg-gray-600/70 text-xs transition-colors"
                  title={`Open document: ${doc.title}`}
                >
                  <p className="text-gray-700 dark:text-gray-200 truncate">{doc.title}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-xxs">{formatRelativeDate(doc.lastUpdated)}</p>
                </a>
              ))}
            </div>
          )}
        </div>

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
});

// ADD: Set display name for the memoized FolderCard component
FolderCard.displayName = 'FolderCard';

// REMOVE the incorrect MemoizedFolderCard wrapper and its export
// const MemoizedFolderCard = React.memo(FolderCard);
// MemoizedFolderCard.displayName = 'FolderCard';
// export default MemoizedFolderCard;

// RESTORE: Export the original FolderCard
export default FolderCard; 