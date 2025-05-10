import React from 'react';

// Define TaggedDocument interface if not globally available
interface TaggedDocument {
  id: string;
  name: string;
}

interface DocumentTagDropdownProps {
  matchingDocuments: TaggedDocument[];
  onSelectDocument: (document: TaggedDocument) => void;
  isLoading: boolean;
  position: { top: number; left: number } | null; // Allow null if it can be hidden without position
  // activeIndex?: number; // For keyboard navigation - optional for now
}

const DocumentTagDropdown: React.FC<DocumentTagDropdownProps> = ({
  matchingDocuments,
  onSelectDocument,
  isLoading,
  position,
  // activeIndex,
}) => {
  if (!position) return null; // Don't render if position is not set

  return (
    <div 
      className="absolute z-50 bg-[--bg-primary] border border-[--border-color] rounded-md shadow-lg dark:bg-zinc-800 dark:border-zinc-700"
      style={{ top: `${position.top}px`, left: `${position.left}px`, minWidth: '200px' }} // Apply position
    >
      {isLoading && <div className="px-3 py-2 text-sm text-[--text-secondary]">Loading...</div>}
      {!isLoading && matchingDocuments.length === 0 && (
        <div className="px-3 py-2 text-sm text-[--text-secondary]">No matching documents found.</div>
      )}
      {!isLoading && matchingDocuments.length > 0 && (
        <ul className="py-1 max-h-60 overflow-y-auto">
          {matchingDocuments.map((doc, index) => (
            <li 
              key={doc.id}
              className="px-3 py-2 hover:bg-[--bg-hover] dark:hover:bg-zinc-700 cursor-pointer text-sm text-[--text-primary]"
              onClick={() => onSelectDocument(doc)}
              // TODO: Add active state based on activeIndex for keyboard nav
            >
              {doc.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DocumentTagDropdown; 