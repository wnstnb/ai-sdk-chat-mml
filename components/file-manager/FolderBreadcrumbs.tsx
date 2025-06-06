import React, { useMemo, useRef, useEffect } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { useDroppable, useDndContext } from '@dnd-kit/core';

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
  // Track if a drag operation is currently in progress
  const isDragActiveRef = useRef(false);
  const { active } = useDndContext();

  // Track when drag starts/ends to prevent click navigation during drops
  useEffect(() => {
    if (active) {
      console.log('[DEBUG] Drag detected in breadcrumbs - setting drag active flag');
      isDragActiveRef.current = true;
    } else {
      console.log('[DEBUG] Drag ended in breadcrumbs - scheduling drag flag reset');
      // Reset drag flag after a short delay to allow drop to complete
      const timer = setTimeout(() => {
        console.log('[DEBUG] Resetting drag active flag in breadcrumbs');
        isDragActiveRef.current = false;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [active]);

  // Handle breadcrumb navigation with drag conflict prevention
  const handleBreadcrumbClick = (folderId: string | null, e: React.MouseEvent) => {
    console.log('[DEBUG] Breadcrumb click triggered:', {
      folderId,
      isDragActive: isDragActiveRef.current,
      hasActiveElement: !!active,
      timestamp: new Date().toISOString(),
      eventType: e.type,
      target: e.target
    });
    
    // Prevent navigation if a drag operation was recently active OR if we have an active drag
    if (isDragActiveRef.current || active) {
      console.log('[DEBUG] Preventing breadcrumb navigation due to active drag');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    console.log('[DEBUG] Allowing breadcrumb navigation to:', folderId);
    onNavigate(folderId);
  };

  // Set up drop functionality for the root "All Files" button
  const { isOver: isOverRoot, setNodeRef: setRootDropRef } = useDroppable({
    id: 'breadcrumb-root',
    data: { 
      type: 'breadcrumb-root', 
      folderId: null, 
      accepts: ['document', 'folder'] 
    },
  });

  // Debug: Log when root breadcrumb is being hovered over during drag
  useEffect(() => {
    if (isOverRoot && active) {
      console.log('[DEBUG] Root breadcrumb is being hovered during drag:', {
        isOverRoot,
        activeItem: active.id,
        timestamp: new Date().toISOString()
      });
    }
  }, [isOverRoot, active]);

  // Create breadcrumb folders array (excluding root)
  const breadcrumbFolders = useMemo(() => currentPath.slice(1), [currentPath]);
  
  // Create a fixed number of droppable hooks (max 10 levels deep)
  // This ensures we always call the same number of hooks on each render
  const maxFolders = 10;
  
  const hook0 = useDroppable({
    id: breadcrumbFolders[0]?.id ? `breadcrumb-folder-${breadcrumbFolders[0].id}` : 'breadcrumb-unused-0',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[0]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[0],
  });
  
  const hook1 = useDroppable({
    id: breadcrumbFolders[1]?.id ? `breadcrumb-folder-${breadcrumbFolders[1].id}` : 'breadcrumb-unused-1',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[1]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[1],
  });
  
  const hook2 = useDroppable({
    id: breadcrumbFolders[2]?.id ? `breadcrumb-folder-${breadcrumbFolders[2].id}` : 'breadcrumb-unused-2',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[2]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[2],
  });
  
  const hook3 = useDroppable({
    id: breadcrumbFolders[3]?.id ? `breadcrumb-folder-${breadcrumbFolders[3].id}` : 'breadcrumb-unused-3',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[3]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[3],
  });
  
  const hook4 = useDroppable({
    id: breadcrumbFolders[4]?.id ? `breadcrumb-folder-${breadcrumbFolders[4].id}` : 'breadcrumb-unused-4',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[4]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[4],
  });
  
  const hook5 = useDroppable({
    id: breadcrumbFolders[5]?.id ? `breadcrumb-folder-${breadcrumbFolders[5].id}` : 'breadcrumb-unused-5',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[5]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[5],
  });
  
  const hook6 = useDroppable({
    id: breadcrumbFolders[6]?.id ? `breadcrumb-folder-${breadcrumbFolders[6].id}` : 'breadcrumb-unused-6',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[6]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[6],
  });
  
  const hook7 = useDroppable({
    id: breadcrumbFolders[7]?.id ? `breadcrumb-folder-${breadcrumbFolders[7].id}` : 'breadcrumb-unused-7',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[7]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[7],
  });
  
  const hook8 = useDroppable({
    id: breadcrumbFolders[8]?.id ? `breadcrumb-folder-${breadcrumbFolders[8].id}` : 'breadcrumb-unused-8',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[8]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[8],
  });
  
  const hook9 = useDroppable({
    id: breadcrumbFolders[9]?.id ? `breadcrumb-folder-${breadcrumbFolders[9].id}` : 'breadcrumb-unused-9',
    data: { type: 'breadcrumb-folder', folderId: breadcrumbFolders[9]?.id || null, accepts: ['document', 'folder'] },
    disabled: !breadcrumbFolders[9],
  });

  // Create array of hooks in stable order
  const folderDropHooks = useMemo(() => [
    hook0, hook1, hook2, hook3, hook4, hook5, hook6, hook7, hook8, hook9
  ], [hook0, hook1, hook2, hook3, hook4, hook5, hook6, hook7, hook8, hook9]);

  return (
    <nav 
      className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4 p-2 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg backdrop-blur-sm"
      aria-label="Folder navigation breadcrumbs"
    >
      {/* Root/Home button - droppable */}
      <button
        ref={(node) => {
          setRootDropRef(node);
          if (node) {
            console.log('[DEBUG] Root breadcrumb drop ref set:', {
              nodeType: node.tagName,
              id: 'breadcrumb-root',
              hasActiveItem: !!active
            });
          }
        }}
        onClick={(e) => handleBreadcrumbClick(null, e)}
        className={`
          flex items-center space-x-1 px-3 py-2 rounded-md transition-all duration-200
          hover:bg-gray-200/50 dark:hover:bg-gray-700/50
          ${currentPath.length === 1 ? 'text-[var(--title-hover-color)] font-medium' : 'hover:text-gray-900 dark:hover:text-gray-100'}
          ${isOverRoot ? 'ring-2 ring-[var(--title-hover-color)] bg-[#C79553]/20 scale-105' : ''}
        `}
        aria-label="Navigate to root folder or drop items to move to root"
      >
        <Home className="w-4 h-4" />
        <span>All Files</span>
      </button>

      {/* Breadcrumb path - each folder is droppable */}
      {breadcrumbFolders.map((item, index) => {
        if (index >= maxFolders) return null; // Safety check
        const { isOver, setNodeRef } = folderDropHooks[index];
        
        return (
          <React.Fragment key={item.id || `breadcrumb-${index}`}>
            <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            <button
              ref={setNodeRef}
              onClick={(e) => handleBreadcrumbClick(item.id, e)}
              className={`
                px-3 py-2 rounded-md transition-all duration-200 truncate max-w-[120px]
                hover:bg-gray-200/50 dark:hover:bg-gray-700/50
                ${index === breadcrumbFolders.length - 1 
                  ? 'text-[var(--title-hover-color)] font-medium' 
                  : 'hover:text-gray-900 dark:hover:text-gray-100'}
                ${isOver ? 'ring-2 ring-[var(--title-hover-color)] bg-[#C79553]/20 scale-105' : ''}
              `}
              title={item.name}
              aria-label={`Navigate to ${item.name} folder or drop items to move to this folder`}
            >
              {item.name}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default FolderBreadcrumbs; 