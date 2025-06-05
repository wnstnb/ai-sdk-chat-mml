import React from 'react';
import { FileText, Star } from 'lucide-react'; // Import FileText and Star icons
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
  // Potentially an onClick handler, href, etc. later
}

const DocumentCard: React.FC<DocumentCardProps> = (props) => {
  const { title, lastUpdated, snippet, id, is_starred } = props;
  const displayTitle = title || "(Untitled)";
  const formattedDate = formatRelativeDate(lastUpdated);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging, // Optional: use if you want to change style while dragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1, // Example: reduce opacity when dragging
    zIndex: isDragging ? 10 : 'auto', // Ensure dragging item is on top
  };

  // Generate unique IDs for aria-describedby relationships
  const dateId = `date-${id}`;
  const contentId = `content-${id}`;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] motion-reduce:hover:transform-none transition-all duration-300 ease-in-out motion-reduce:transition-none overflow-hidden w-full max-w-[256px] aspect-[3/4] touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--accent-color] dark:focus:ring-offset-gray-800"
      aria-labelledby={`title-${id}`}
      aria-describedby={`${dateId} ${contentId}`}
      role="button"
      tabIndex={0}
      aria-label={`Document: ${displayTitle}${is_starred ? ' (starred)' : ''}. Last updated ${formattedDate}. Click to open or use arrow keys to reorder.`}
    >
      {/* Screen reader only text for drag and drop context */}
      <div className="sr-only">
        Draggable document card. Use arrow keys to reorder, or press space to start dragging and arrow keys to move.
      </div>

      {/* Glass-like Top Section (approx 20%) */}
      <div className="h-[20%] bg-gray-100/30 dark:bg-gray-700/50 backdrop-blur-md p-3 flex items-center justify-end border-b border-gray-200/50 dark:border-gray-600/50">
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

export default DocumentCard; 