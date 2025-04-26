import React from 'react';
import { useFileMediaStore } from '@/stores/fileMediaStore';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

interface BreadcrumbsProps {
  onNavigate: (folderId: string | null) => void;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ onNavigate }) => {
  const currentPath = useFileMediaStore((state) => state.currentPath);

  if (!currentPath || currentPath.length === 0) {
    return null; // Don't render if path is not set
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-1 text-sm text-[--text-color-secondary]">
      {currentPath.map((item, index) => (
        <React.Fragment key={item.id ?? 'root'}>
          {index > 0 && (
            <ChevronRight className="w-4 h-4 text-[--icon-color-secondary] flex-shrink-0" />
          )}
          {index < currentPath.length - 1 ? (
            // Link for previous segments
            <button
              onClick={() => onNavigate(item.id)}
              className="hover:underline hover:text-[--text-color] focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5"
            >
              {item.name}
            </button>
          ) : (
            // Current folder (not clickable)
            <span className="font-medium text-[--text-color] px-1 py-0.5" aria-current="page">
              {item.name}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumbs; 