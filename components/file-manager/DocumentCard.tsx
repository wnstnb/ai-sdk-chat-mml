import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { FileText, Star, CheckSquare, Square } from 'lucide-react'; // Added CheckSquare, Square
import { formatRelativeDate } from '@/lib/utils/dateUtils'; // Import the new date utility
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
}

/**
 * DocumentCard component.
 * Displays an individual document as a card with its title, snippet, last updated date,
 * and star status. Supports selection, starring, drag-and-drop, and navigation.
 * @param {DocumentCardProps} props - The props for the component.
 * @returns {React.ReactElement} The rendered DocumentCard.
 */
const DocumentCard: React.FC<DocumentCardProps> = (props) => {
  const { title, lastUpdated, snippet, id, is_starred, isSelected = false, onToggleSelect, folderPath, onToggleStar } = props;
  
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
        targetElement.closest('[data-drag-handle="true"]') || 
        targetElement.closest('[data-interactive-element="true"]')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    window.location.href = `/editor/${id}`;
  }, [id, isDragging]);

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

  /** Memoized CSS class string for the card's main article element, managing styles for selection and hover. */
  const cardClassName = useMemo(() => 
    `group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md \
    transition-all duration-300 ease-in-out motion-reduce:transition-none overflow-hidden \
    w-full max-w-[256px] aspect-[3/4] touch-manipulation \
    focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 \
    ${isSelected ? 'ring-2 ring-[--accent-color] shadow-lg' : 'focus:ring-[--accent-color]'} \
    ${!isSelected ? 'hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none' : ''} \
    will-change-[transform,box-shadow,opacity]`
  , [isSelected]);

  /** Memoized CSS class string for the star icon, managing its appearance based on starred state. */
  const starIconClassName = useMemo(() => 
    `w-5 h-5 transition-colors ${is_starred ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500 dark:text-gray-400 hover:text-yellow-500 dark:hover:text-yellow-300'}`,
    [is_starred]
  );

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cardClassName}
      aria-labelledby={titleId}
      aria-describedby={`${dateId} ${contentId}`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleCardClick}
    >
      {/* Checkbox for selection - positioned absolutely */}
      {onToggleSelect && (
        <button 
          data-interactive-element="true" // Mark this button
          onClick={handleSelectToggle}
          className="absolute top-2 left-2 z-20 p-1 rounded hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition-colors"
          aria-label={isSelected ? `Deselect document ${displayTitle}` : `Select document ${displayTitle}`}
          title={isSelected ? `Deselect document ${displayTitle}` : `Select document ${displayTitle}`}
        >
          {isSelected ? <CheckSquare size={18} className="text-[var(--title-hover-color)]" /> : <Square size={18} className="text-gray-500 dark:text-gray-400" />}
        </button>
      )}

      {/* Glass-like Top Section (Drag Handle) */}
      <div 
        {...listeners} // <-- APPLY listeners ONLY to this drag handle element
        data-drag-handle="true" // Add data attribute to identify the drag handle
        className="h-[20%] bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md p-3 flex items-center justify-end border-b border-gray-200/50 dark:border-gray-600/50 cursor-grab active:cursor-grabbing"
      >
        {/* Icons container pushed to the right, now includes Star button and FileText */}
        <div className="flex items-center space-x-2" role="group" aria-label={`Document actions and indicators${is_starred ? ': starred document' : ''}`}>
          <button
            data-interactive-element="true"
            onClick={handleStarToggle}
            className="p-1.5 rounded-full hover:bg-gray-500/20 dark:hover:bg-gray-300/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--accent-color] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-700/50 transition-colors"
            aria-pressed={is_starred}
            aria-label={is_starred ? `Unstar document ${displayTitle}` : `Star document ${displayTitle}`}
            title={is_starred ? `Unstar document ${displayTitle}` : `Star document ${displayTitle}`}
          >
            <Star 
              className={starIconClassName}
              aria-hidden="true" // Decorative, button has aria-label
            />
          </button>
          
          <FileText 
            className="w-5 h-5 text-gray-600 dark:text-gray-400" 
            aria-label="Document file type"
            role="img" // role can be img if it's purely decorative in this context, or button if it becomes interactive
          />
        </div>
      </div>

      {/* Solid Body Section (approx 80%) */}
      {/* Using the same background as the card container for the body, or a slightly off shade like dark:bg-gray-750 if needed */}
      <div className="h-[80%] bg-white dark:bg-gray-800 px-4 py-3 flex flex-col space-y-1">
        {folderPath && (
          <p 
            className="text-xs text-gray-500 dark:text-gray-400 truncate"
            title={folderPath} // Show full path on hover
            aria-label={`Location: ${folderPath}`}
          >
            {folderPath}
          </p>
        )}
        <h3 
          id={titleId}
          title={displayTitle} // Show full title on hover
          className="text-lg font-semibold leading-normal flex-shrink-0 text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-[var(--title-hover-color)] transition-colors"
        >
          {displayTitle}
        </h3>
        <p 
          id={dateId}
          className="text-xs text-gray-500 dark:text-gray-400"
          aria-label={`Last updated ${formattedDate}`}
        >
          <span aria-hidden="true">Last updated: </span>
          <time dateTime={new Date(lastUpdated).toISOString()}>
            {formattedDate}
          </time>
        </p>
        <div 
          id={contentId}
          className="prose prose-sm dark:prose-invert overflow-y-auto flex-grow text-sm text-gray-700 dark:text-gray-300"
          aria-label={`Document preview: ${snippet}`}
        >
          {useMemo(() => (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{snippet}</ReactMarkdown>
          ), [snippet])}
        </div>
        {/* Optional: Action area or more details could go here */}
      </div>

      {/* Subtle hover effects - e.g., a slight scale or border highlight (optional) */}
      {/* <div className="absolute inset-0 rounded-lg border-2 border-transparent group-hover:border-blue-500 transition-all duration-300 pointer-events-none"></div> */}
    </article>
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
    prevProps.folderPath === nextProps.folderPath;
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