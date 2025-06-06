import React from 'react';
import { Star, FileText } from 'lucide-react'; // FileText can be a default icon
import { formatRelativeDate } from '@/lib/utils/dateUtils';
import type { MappedDocumentCardData } from '@/lib/mappers/documentMappers';

// Use MappedDocumentCardData to ensure consistency with what FolderCard receives
interface DocumentCardMiniProps extends Pick<MappedDocumentCardData, 'id' | 'title' | 'lastUpdated' | 'is_starred'> {}

const DocumentCardMini: React.FC<DocumentCardMiniProps> = React.memo(({
  id,
  title,
  lastUpdated,
  is_starred,
}) => {
  const displayTitle = title || "(Untitled)";
  const formattedDate = formatRelativeDate(lastUpdated);

  return (
    <a 
      href={`/editor/${id}`}
      className="flex items-center justify-between p-1.5 rounded hover:bg-gray-200/70 dark:hover:bg-gray-600/70 text-xs group transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      title={`Open document: ${displayTitle}`}
      onClick={(e) => {
        // Prevent drag-and-drop from triggering navigation if this item becomes draggable later
        if (e.target instanceof Element && e.target.closest('[draggable="true"]')) {
          e.stopPropagation(); 
        }
      }}
    >
      <div className="flex items-center space-x-2 min-w-0">
        {is_starred ? (
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" aria-label="Starred" />
        ) : (
          <FileText className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" aria-label="Document" />
        )}
        <span className="text-gray-700 dark:text-gray-200 truncate group-hover:text-[var(--title-hover-color)] leading-tight">
          {displayTitle}
        </span>
      </div>
      <span className="text-gray-500 dark:text-gray-400 text-xxs leading-tight flex-shrink-0 ml-2">
        {formattedDate}
      </span>
    </a>
  );
});

DocumentCardMini.displayName = 'DocumentCardMini';

export default DocumentCardMini; 