import React, { useRef, useEffect } from 'react';
import { FileText, Star, CheckSquare, Square } from 'lucide-react'; // Added CheckSquare, Square
import { formatRelativeDate } from '@/lib/utils/dateUtils'; // Import the new date utility
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DocumentCardProps {
  id: string; // Added for dnd-kit
  title: string;
  lastUpdated: string | Date | number; // Allow various date input types
  snippet: string;
  is_starred: boolean; // Added for star icon
  isSelected?: boolean; // Added
  onToggleSelect?: (id: string) => void; // Added
  folderPath?: string; // Path of the folder containing the document
  // Potentially an onClick handler, href, etc. later
}

const DocumentCard: React.FC<DocumentCardProps> = (props) => {
  const { title, lastUpdated, snippet, id, is_starred, isSelected = false, onToggleSelect, folderPath } = props;
  const displayTitle = title || "(Untitled)";
  const formattedDate = formatRelativeDate(lastUpdated);
  const isDragStartedRef = useRef(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging, // Optional: use if you want to change style while dragging
  } = useSortable({ id, data: { type: 'document', id, title: displayTitle } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1, // Example: reduce opacity when dragging
    zIndex: isDragging ? 10 : 'auto', // Ensure dragging item is on top
  };

  // Track drag state changes
  useEffect(() => {
    if (isDragging) {
      isDragStartedRef.current = true;
    } else {
      // Reset drag flag after a short delay to allow for click prevention
      const timer = setTimeout(() => {
        isDragStartedRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isDragging]);

  // Generate unique IDs for aria-describedby relationships
  const dateId = `date-${id}`;
  const contentId = `content-${id}`;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md 
        transition-all duration-300 ease-in-out motion-reduce:transition-none overflow-hidden 
        w-full max-w-[256px] aspect-[3/4] touch-manipulation 
        focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 
        ${isSelected ? 'ring-2 ring-[--accent-color] shadow-lg' : 'focus:ring-[--accent-color]'}
        ${!isSelected ? 'hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none' : ''}
      `}
      aria-labelledby={`title-${id}`}
      aria-describedby={`${dateId} ${contentId}`}
      role="button"
      tabIndex={0}
      aria-label={`Document: ${displayTitle}${is_starred ? ' (starred)' : ''}. Last updated ${formattedDate}. Click to open or use arrow keys to reorder.`}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        const targetElement = e.target as HTMLElement;
        
        console.log('[DEBUG] DocumentCard click triggered:', {
          documentId: id,
          isDragStarted: isDragStartedRef.current,
          isDragging: isDragging,
          targetElement: targetElement.tagName,
          isFromDragHandle: !!targetElement.closest('[data-drag-handle="true"]'),
          isFromInteractiveElement: !!targetElement.closest('[data-interactive-element="true"]'),
          timestamp: new Date().toISOString()
        });
        
        // Check if drag was started recently or if click originated from drag handle/interactive elements
        if (isDragStartedRef.current || 
            targetElement.closest('[data-drag-handle="true"]') || 
            targetElement.closest('[data-interactive-element="true"]')) {
          console.log('[DEBUG] Preventing DocumentCard navigation due to drag/interactive element');
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        
        console.log('[DEBUG] Allowing DocumentCard navigation to:', `/editor/${id}`);
        window.location.href = `/editor/${id}`;
      }}
    >
      {/* Checkbox for selection - positioned absolutely */}
      {onToggleSelect && (
        <button 
          data-interactive-element="true" // Mark this button
          onClick={(e) => {
            e.stopPropagation(); // ESSENTIAL: Prevent event from bubbling
            onToggleSelect(id);
          }}
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
        {/* Icons container pushed to the right */}
        <div className="flex items-center space-x-2" role="img" aria-label={`Document indicators${is_starred ? ': starred document' : ': regular document'}`}>
          {is_starred && (
            <Star 
              className="w-5 h-5 text-yellow-400 fill-yellow-400" 
              aria-label="Starred document"
              role="img"
            />
          )}
          <FileText 
            className="w-5 h-5 text-gray-600 dark:text-gray-400" 
            aria-label="Document file"
            role="img"
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
          id={`title-${id}`}
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{snippet}</ReactMarkdown>
        </div>
        {/* Optional: Action area or more details could go here */}
      </div>

      {/* Subtle hover effects - e.g., a slight scale or border highlight (optional) */}
      {/* <div className="absolute inset-0 rounded-lg border-2 border-transparent group-hover:border-blue-500 transition-all duration-300 pointer-events-none"></div> */}
    </article>
  );
};

export default React.memo(DocumentCard); 