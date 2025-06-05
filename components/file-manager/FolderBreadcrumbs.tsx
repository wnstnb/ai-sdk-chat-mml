import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  id: string | null; // null for root
  name: string;
}

interface FolderBreadcrumbsProps {
  currentPath: BreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
}

const FolderBreadcrumbs: React.FC<FolderBreadcrumbsProps> = ({
  currentPath,
  onNavigate,
}) => {
  return (
    <nav 
      className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4 p-2 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg backdrop-blur-sm"
      aria-label="Folder navigation breadcrumbs"
    >
      {/* Root/Home button */}
      <button
        onClick={() => onNavigate(null)}
        className={`
          flex items-center space-x-1 px-2 py-1 rounded-md transition-colors
          hover:bg-gray-200/50 dark:hover:bg-gray-700/50
          ${currentPath.length === 1 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'hover:text-gray-900 dark:hover:text-gray-100'}
        `}
        aria-label="Navigate to root folder"
      >
        <Home className="w-4 h-4" />
        <span>All Files</span>
      </button>

      {/* Breadcrumb path */}
      {currentPath.slice(1).map((item, index) => (
        <React.Fragment key={item.id}>
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <button
            onClick={() => onNavigate(item.id)}
            className={`
              px-2 py-1 rounded-md transition-colors truncate max-w-[120px]
              hover:bg-gray-200/50 dark:hover:bg-gray-700/50
              ${index === currentPath.length - 2 
                ? 'text-blue-600 dark:text-blue-400 font-medium' 
                : 'hover:text-gray-900 dark:hover:text-gray-100'
              }
            `}
            title={item.name}
            aria-label={`Navigate to ${item.name} folder`}
          >
            {item.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
};

export default FolderBreadcrumbs; 