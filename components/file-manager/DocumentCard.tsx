import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  FileText, 
  Star, 
  CheckSquare, 
  Square, 
  Loader2, 
  StarOff, 
  Clock,
  Crown,
  Edit3,
  MessageSquare,
  Eye,
  Users,
  UserCheck,
  ExternalLink
} from 'lucide-react'; // Added missing icons
import { formatRelativeDate } from '@/lib/utils/dateUtils'; // Import the new date utility
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Badge } from "@/components/ui/badge"; // Added Badge component
import { motion } from 'framer-motion'; // Added framer-motion for animations

/**
 * Props for the DocumentCard component.
 */
interface DocumentCardProps {
  /** Unique identifier for the document, used for dnd-kit and keys. */
  id: string;
  /** The title of the document. */
  title: string;
  /** The last updated timestamp for the document (string, Date object, or number). */
  lastUpdated: string | Date | number;
  /** A short snippet or preview of the document content. */
  snippet: string;
  /** Boolean indicating if the document is starred/favorited. */
  is_starred: boolean;
  /** Optional boolean indicating if the card is currently selected. Defaults to false. */
  isSelected?: boolean;
  /** Optional callback function to toggle the selection state of the card. */
  onToggleSelect?: (id: string) => void;
  /** Callback function invoked when the star icon is toggled. */
  onToggleStar: (documentId: string) => void;
  /** Optional path of the folder containing the document. */
  folderPath?: string;
  /** Optional boolean to indicate if the card is in a loading state. */
  isLoading?: boolean;
  /** Optional callback for when the card is clicked, typically to set loading state. */
  onClick?: () => void;
  /** Optional document permission level for showing permission badges */
  permission_level?: 'owner' | 'editor' | 'commenter' | 'viewer';
  /** Optional access type to show sharing indicators */
  access_type?: 'shared' | 'private';
  /** Optional owner email for shared documents */
  owner_email?: string;
  /** Optional flag to show owner information */
  showOwnerInfo?: boolean;
  /** Optional compact mode for smaller card display */
  compact?: boolean;
  /** Optional flag indicating if this document is shared with others */
  is_shared_with_others?: boolean;
}

/**
 * DocumentCard component.
 * Displays an individual document as a card with its title, snippet, last updated date,
 * and star status. Supports selection, starring, drag-and-drop, and navigation.
 * @param {DocumentCardProps} props - The props for the component.
 * @returns {React.ReactElement} The rendered DocumentCard.
 */
const DocumentCard: React.FC<DocumentCardProps> = (props) => {
  const { 
    title, 
    lastUpdated, 
    snippet, 
    id, 
    is_starred, 
    isSelected = false, 
    onToggleSelect, 
    folderPath, 
    onToggleStar, 
    isLoading, 
    onClick,
    // NEW PROPS
    permission_level,
    access_type,
    owner_email,
    showOwnerInfo = true,
    compact = false,
    is_shared_with_others = false
  } = props;
  
  /** Memoized display title, defaults to "(Untitled)" if title is not provided. */
  const displayTitle = useMemo(() => title || "(Untitled)", [title]);
  /** Memoized formatted relative date string for display. */
  const formattedDate = useMemo(() => formatRelativeDate(lastUpdated), [lastUpdated]);
  /** Memoized unique ID for the date element for ARIA. */
  const dateId = useMemo(() => `date-${id}`, [id]);
  /** Memoized unique ID for the content snippet element for ARIA. */
  const contentId = useMemo(() => `content-${id}`, [id]);
  /** Memoized unique ID for the title element for ARIA. */
  const titleId = useMemo(() => `title-${id}`, [id]);
  
  const isDragStartedRef = useRef(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: 'document', id, title: displayTitle } });

  /** Memoized style object for drag-and-drop transformations and visual feedback. */
  const style = useMemo(() => ({
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }), [transform, transition, isDragging]);

  // Track drag state changes
  useEffect(() => {
    if (isDragging) {
      isDragStartedRef.current = true;
    } else {
      const timer = setTimeout(() => {
        isDragStartedRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isDragging]);

  /** 
   * Memoized click handler for the card.
   * Navigates to the document editor page, preventing navigation if a drag was just completed
   * or if the click originated from an interactive element within the card.
   * @param {React.MouseEvent<HTMLElement>} e - The mouse event.
   */
  const handleCardClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const targetElement = e.target as HTMLElement;

    if (isDragStartedRef.current ||
        targetElement.closest('[data-interactive-element="true"]')) {
      e.preventDefault();
      e.stopPropagation();
      return; // If it's a drag or click on interactive element, do nothing further
    }

    // If we reach here, it's a valid navigation click
    onClick?.(); // MOVED HERE: Call to set loading state right before navigation
    window.location.href = `/editor/${id}`;
  }, [id, onClick]); // Updated dependencies: isDragStartedRef is a ref, isDragging not directly used here

  /**
   * Memoized handler to toggle the selection state of the card.
   * Stops event propagation to prevent card navigation.
   * @param {React.MouseEvent} e - The mouse event.
   */
  const handleSelectToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(id);
  }, [onToggleSelect, id]);

  /**
   * Memoized handler to toggle the star status of the document.
   * Stops event propagation to prevent card navigation.
   * @param {React.MouseEvent} e - The mouse event.
   */
  const handleStarToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar(id);
  }, [onToggleStar, id]);

  /** Memoized ARIA label for the card, providing accessibility information. */
  const ariaLabel = useMemo(() => 
    `Document: ${displayTitle}${is_starred ? ' (starred)' : ''}. Last updated ${formattedDate}. Click to open or use arrow keys to reorder.`,
    [displayTitle, is_starred, formattedDate]
  );

  // Permission level details - adapted from SharedDocumentCard
  const getPermissionInfo = useMemo(() => {
    if (!permission_level) return null;
    
    switch (permission_level) {
      case 'owner':
        return { 
          icon: Crown, 
          label: 'Owner', 
          color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          description: 'Full access'
        };
      case 'editor':
        return { 
          icon: Edit3, 
          label: 'Editor', 
          color: 'bg-green-100 text-green-800 border-green-200',
          description: 'Can edit and comment'
        };
      case 'commenter':
        return { 
          icon: MessageSquare, 
          label: 'Commenter', 
          color: 'bg-blue-100 text-blue-800 border-blue-200',
          description: 'Can comment only'
        };
      case 'viewer':
        return { 
          icon: Eye, 
          label: 'Viewer', 
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          description: 'Read-only access'
        };
      default:
        return { 
          icon: Users, 
          label: 'Shared', 
          color: 'bg-purple-100 text-purple-800 border-purple-200',
          description: 'Shared document'
        };
    }
  }, [permission_level]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`
        group relative flex flex-col rounded-lg bg-white dark:bg-gray-800 shadow-md 
        transition-all duration-300 ease-in-out motion-reduce:transition-none 
        overflow-hidden w-full max-w-[220px] aspect-[3/4] touch-manipulation 
        focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 
        ${isSelected ? 'ring-2 ring-[var(--title-hover-color)] shadow-lg' : 'focus:ring-[var(--title-hover-color)]'}
        ${!isSelected ? 'hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none' : ''}
        will-change-[transform,box-shadow,opacity]
        cursor-pointer
      `}
      aria-labelledby={titleId}
      aria-describedby={`${dateId} ${contentId}`}
      aria-label={ariaLabel}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e as any);
        }
      }}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-30 rounded-lg">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

            {/* Glass Header Section (Top 20%) - Functions as large drag handle */}
      <div 
        {...listeners}
        className="relative h-[20%] p-3 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-600/50 bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md rounded-t-lg cursor-grab active:cursor-grabbing"
      >
        {/* Selection Checkbox */}
        {onToggleSelect && (
          <button 
            onClick={handleSelectToggle}
            data-interactive-element="true"
            className="flex-shrink-0 p-1 rounded hover:bg-gray-300/70 dark:hover:bg-gray-600/70 transition-colors"
            aria-label={isSelected ? `Deselect document ${title}` : `Select document ${title}`}
            title={isSelected ? `Deselect document ${title}` : `Select document ${title}`}
          >
            {isSelected ? 
              <CheckSquare size={16} className="text-[var(--title-hover-color)]" /> : 
              <Square size={16} className="text-gray-500 dark:text-gray-400" />
            }
          </button>
        )}

        {/* Star Button */}
        <button
          onClick={handleStarToggle}
          data-interactive-element="true"
          className={`flex-shrink-0 p-1 rounded-md hover:bg-gray-200/50 dark:hover:bg-gray-600/50 transition-colors transition-opacity ${
            is_starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-label={is_starred ? 'Remove from favorites' : 'Add to favorites'}
          title={is_starred ? 'Remove from favorites' : 'Add to favorites'}
        >
          {is_starred ? (
            <Star className="w-4 h-4 text-yellow-500 fill-current" />
          ) : (
            <StarOff className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          )}
        </button>
        
      </div>

      {/* Content Section (Bottom 80%) */}
      <div className="flex-1 flex flex-col p-3 bg-white dark:bg-gray-800 rounded-b-lg min-h-0">
        {/* Title */}
        <h3 
          id={titleId}
          title={displayTitle}
          className="text-base font-semibold leading-tight text-gray-900 dark:text-gray-100 truncate mb-2"
        >
          {displayTitle}
        </h3>
        
        {/* Folder Path */}
        {folderPath && (
          <p 
            className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2"
            title={folderPath}
            aria-label={`Location: ${folderPath}`}
          >
            {folderPath}
          </p>
        )}
        
        {/* Content Snippet */}
        {!compact && (
          <div 
            id={contentId}
            className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-3 flex-1"
            aria-label={`Document preview: ${snippet}`}
          >
            {snippet}
          </div>
        )}
        
        {/* Footer with Owner Info (top row) and Date/Badges (bottom row) */}
        <div className="mt-auto space-y-1">
          {/* Top Row: Owner Info */}
          {showOwnerInfo && access_type === 'shared' && owner_email && (
            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
              <UserCheck className="w-3 h-3 text-blue-500" />
              <span className="truncate" title={owner_email}>
                {owner_email.split('@')[0]}
              </span>
            </div>
          )}
          
          {/* Bottom Row: Date and Badges */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <time 
                id={dateId}
                dateTime={new Date(lastUpdated || Date.now()).toISOString()}
                aria-label={`Last updated ${formattedDate}`}
              >
                {formattedDate}
              </time>
            </div>
            
            {/* Badge Icons */}
            <div className="flex items-center gap-2">
              {permission_level && getPermissionInfo && (
                <Badge 
                  variant="outline" 
                  className={`${getPermissionInfo.color} flex items-center justify-center w-5 h-5 p-0 rounded-full`}
                  title={`${getPermissionInfo.label}: ${getPermissionInfo.description}`}
                >
                  <getPermissionInfo.icon className="w-2.5 h-2.5" />
                </Badge>
              )}
              
              {access_type === 'shared' && (
                <Badge 
                  variant="outline" 
                  className="bg-blue-50 text-blue-700 border-blue-200 flex items-center justify-center w-5 h-5 p-0 rounded-full"
                  title="Shared document"
                >
                  <Users className="w-2.5 h-2.5" />
                </Badge>
              )}
              
              {/* Indicator for documents shared with others */}
              {is_shared_with_others && !access_type && (
                <Badge 
                  variant="outline" 
                  className="bg-blue-50 text-blue-700 border-blue-200 flex items-center justify-center w-5 h-5 p-0 rounded-full"
                  title="Shared document"
                >
                  <Users className="w-2.5 h-2.5" />
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hover overlay for external link indication */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <ExternalLink className="w-3 h-3 text-gray-400" />
      </div>
    </motion.article>
  );
};

/**
 * Custom comparison function for React.memo to optimize DocumentCard re-renders.
 * Compares relevant props to determine if a re-render is necessary.
 * Function props (`onToggleSelect`, `onToggleStar`) are intentionally excluded from comparison
 * to allow optimistic updates from parent components without being blocked by stale closures.
 * @param {DocumentCardProps} prevProps - The previous props.
 * @param {DocumentCardProps} nextProps - The next props.
 * @returns {boolean} True if props are equal (no re-render needed), false otherwise.
 */
// Custom comparison function for React.memo
const areDocumentCardPropsEqual = (prevProps: DocumentCardProps, nextProps: DocumentCardProps) => {
  const areEqual = 
    prevProps.id === nextProps.id &&
    prevProps.title === nextProps.title &&
    prevProps.lastUpdated === nextProps.lastUpdated &&
    prevProps.snippet === nextProps.snippet &&
    prevProps.is_starred === nextProps.is_starred &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.folderPath === nextProps.folderPath &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.onClick === nextProps.onClick &&
    // NEW PROPS FOR SHARED DOCUMENT CARD STYLE
    prevProps.permission_level === nextProps.permission_level &&
    prevProps.access_type === nextProps.access_type &&
    prevProps.owner_email === nextProps.owner_email &&
    prevProps.showOwnerInfo === nextProps.showOwnerInfo &&
    prevProps.compact === nextProps.compact &&
    prevProps.is_shared_with_others === nextProps.is_shared_with_others;
    // Removed function comparisons as they prevent proper optimistic updates

  // if (!areEqual) {
  //   console.log('[DEBUG] DocumentCard re-rendering. Props changed:', {
  //     prev: {
  //       id: prevProps.id,
  //       title: prevProps.title,
  //       is_starred: prevProps.is_starred,
  //       isSelected: prevProps.isSelected,
  //     },
  //     next: {
  //       id: nextProps.id,
  //       title: nextProps.title,
  //       is_starred: nextProps.is_starred,
  //       isSelected: nextProps.isSelected,
  //     }
  //   });
  // }
  return areEqual;
};

export default React.memo(DocumentCard, areDocumentCardPropsEqual); 