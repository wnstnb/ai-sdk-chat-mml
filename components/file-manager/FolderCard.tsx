import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, MoreVertical, CheckSquare, Square, ChevronDown, ChevronRight, Loader2, ChevronUp } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/dateUtils';

import { useDroppable } from '@dnd-kit/core';
import DocumentCard from './DocumentCard';
import type { MappedDocumentCardData } from '@/lib/mappers/documentMappers';
import DocumentCardMini from './DocumentCardMini';

/**
 * Props for the FolderCard component.
 */
interface FolderCardProps {
  /** Unique identifier for the folder. */
  id: string;
  /** The title or name of the folder. */
  title: string;
  /** The number of documents directly contained within this folder. */
  documentCount: number;
  /** Optional boolean indicating if the folder card is currently expanded (e.g., in a tree view or showing preview). Defaults to false. */
  isExpanded?: boolean;
  /** Optional array of document data for previewing contents when expanded. */
  containedDocuments?: MappedDocumentCardData[];
  /** Optional callback invoked when the folder's expanded state is toggled (e.g., by clicking the card). */
  onToggleExpanded?: () => void;
  /** Optional callback invoked when a folder action (rename, delete) is selected from the menu. */
  onFolderAction?: (action: 'rename' | 'delete') => void;
  /** Optional boolean indicating if the card is currently selected. Defaults to false. */
  isSelected?: boolean;
  /** Optional callback function to toggle the selection state of the card. */
  onToggleSelect?: (id: string) => void;
  /** Optional async function to load specific contents (documents) for the folder preview. */
  loadFolderSpecificContents?: (folderId: string) => Promise<void>;
  /** Optional boolean indicating if the folder-specific contents (for preview) are currently loading. */
  isLoadingContents?: boolean;
  /** Optional boolean indicating if child items (subfolders/documents) are loading, typically for tree view expansion. */
  isLoadingChildren?: boolean;
}

// ADD: Custom comparison function for React.memo
const areFolderCardPropsEqual = (prevProps: FolderCardProps, nextProps: FolderCardProps): boolean => {
  // Compare contained documents by length and IDs (shallow comparison)
  const documentsEqual = prevProps.containedDocuments?.length === nextProps.containedDocuments?.length &&
    (prevProps.containedDocuments?.every((doc, index) => 
      doc.id === nextProps.containedDocuments?.[index]?.id &&
      doc.title === nextProps.containedDocuments?.[index]?.title &&
      doc.is_starred === nextProps.containedDocuments?.[index]?.is_starred
    ) ?? true);

  const areEqual = 
    prevProps.id === nextProps.id &&
    prevProps.title === nextProps.title &&
    prevProps.documentCount === nextProps.documentCount &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isLoadingContents === nextProps.isLoadingContents &&
    prevProps.isLoadingChildren === nextProps.isLoadingChildren &&
    documentsEqual;
    // Exclude function props from comparison as they can change reference

  return areEqual;
};

/**
 * FolderCard component.
 * Displays a folder as a card, showing its name, document count, and an optional preview of contained documents.
 * Supports selection, expansion to show previews, drag-and-drop (as a droppable target),
 * and a context menu for actions like rename and delete.
 * @param {FolderCardProps} props - The props for the component.
 * @returns {React.ReactElement} The rendered FolderCard.
 */
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
  loadFolderSpecificContents,
  isLoadingContents = false,
  isLoadingChildren,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Memoized display title for the folder, defaults to "(Untitled Folder)". */
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

  /** 
   * Handles clicks on the main folder card area.
   * Triggers folder expansion/collapse if `onToggleExpanded` is provided.
   * Prevents action if the click originated from the context menu or preview toggle.
   * @param {React.MouseEvent} e - The mouse event.
   */
  const handleFolderClick = (e: React.MouseEvent) => {
    if (e.target instanceof Element && (e.target.closest('[data-menu]') || e.target.closest('[data-preview-toggle]'))) {
      return;
    }
    console.log('Folder navigation click detected for folder:', id);
    onToggleExpanded?.();
  };

  /**
   * Toggles the internal preview section of the folder card (showing contained documents).
   * Loads folder contents via `loadFolderSpecificContents` if expanding and contents are not already loaded.
   * @param {React.MouseEvent} e - The mouse event.
   */
  const handleToggleInternalPreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newPreviewState = !isInternalPreviewExpanded;
    setIsInternalPreviewExpanded(newPreviewState);
    if (newPreviewState && containedDocuments.length === 0 && documentCount > 0 && loadFolderSpecificContents) {
      await loadFolderSpecificContents(id);
    }
  };

  /**
   * Handles actions selected from the folder's context menu (e.g., rename, delete).
   * Closes the menu and calls the `onFolderAction` prop.
   * @param {'rename' | 'delete'} action - The action selected from the menu.
   */
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
        group relative flex flex-col rounded-lg bg-white dark:bg-gray-800
        transition-all duration-300 ease-in-out motion-reduce:transition-none 
        ${isMenuOpen ? 'overflow-visible' : 'overflow-hidden'} w-full max-w-[256px] ${cardHeightClass} touch-manipulation 
        focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 
        ${isSelected ? 'ring-2 ring-[var(--accent-color)] shadow-md' : 'focus:ring-[var(--accent-color)]'}
        ${isOver ? 'ring-2 ring-[var(--title-hover-color)] ring-opacity-50' : ''}
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

      <div className="h-full flex flex-col rounded-lg">
        
        <div className="p-4 flex items-start justify-between border-b border-gray-200/50 dark:border-gray-600/50 bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md rounded-t-lg">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            {onToggleSelect && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(id);
                }}
                className="flex-shrink-0 p-1 rounded hover:bg-gray-300/70 dark:hover:bg-gray-600/70 transition-colors mt-1"
                aria-label={isSelected ? `Deselect folder ${title}` : `Select folder ${title}`}
                title={isSelected ? `Deselect folder ${title}` : `Select folder ${title}`}
              >
                {isSelected ? 
                  <CheckSquare size={18} className="text-[var(--title-hover-color)]" /> : 
                  <Square size={18} className="text-gray-500 dark:text-gray-400" />
                }
              </button>
            )}
            
            <div className="flex-shrink-0 mt-0.5">
              {isExpanded ? (
                <FolderOpen 
                  className="w-6 h-6 text-[var(--title-hover-color)] transition-colors"
                  aria-hidden="true"
                />
              ) : (
                <Folder 
                  className="w-6 h-6 text-[var(--title-hover-color)] transition-colors"
                  aria-hidden="true"
                />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 
                id={`folder-title-${id}`}
                title={displayTitle}
                className="text-lg font-semibold leading-normal text-gray-900 dark:text-gray-100 truncate group-hover:text-[var(--title-hover-color)] transition-colors"
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

          <div className="relative flex-shrink-0" data-menu>
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

        <div className="flex-grow flex flex-col min-h-0 p-3 pt-1 bg-white dark:bg-gray-800 rounded-b-lg">
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
                <DocumentCardMini 
                  key={doc.id} 
                  id={doc.id}
                  title={doc.title}
                  lastUpdated={doc.lastUpdated}
                  is_starred={doc.is_starred}
                />
              ))}
            </div>
          )}
        </div>

        {isOver && (
          <div className="absolute inset-0 bg-[#C79553]/20 border-2 border-[var(--title-hover-color)] border-dashed rounded-lg flex items-center justify-center">
            <p className="text-[var(--title-hover-color)] font-medium">
              Drop here to add to folder
            </p>
          </div>
        )}
      </div>
    </article>
  );
};

// ADD: Set display name for the memoized FolderCard component
FolderCard.displayName = 'FolderCard';

export default React.memo(FolderCard, areFolderCardPropsEqual); 