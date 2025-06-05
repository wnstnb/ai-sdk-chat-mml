import { useState, useCallback, useMemo } from 'react';

export interface BreadcrumbItem {
  id: string | null; // null for root
  name: string;
}

export interface FolderNavigationState {
  currentFolderId: string | null;
  breadcrumbPath: BreadcrumbItem[];
  isInFolderView: boolean;
  navigateToFolder: (folderId: string | null, folderName?: string) => void;
  navigateToRoot: () => void;
  goBack: () => void;
  canGoBack: boolean;
}

const ROOT_BREADCRUMB: BreadcrumbItem = {
  id: null,
  name: 'All Files'
};

export function useFolderNavigation(): FolderNavigationState {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbPath, setBreadcrumbPath] = useState<BreadcrumbItem[]>([ROOT_BREADCRUMB]);

  const isInFolderView = currentFolderId !== null;
  const canGoBack = breadcrumbPath.length > 1;

  const navigateToFolder = useCallback((folderId: string | null, folderName?: string) => {
    setCurrentFolderId(folderId);
    
    if (folderId === null) {
      // Navigate to root
      setBreadcrumbPath([ROOT_BREADCRUMB]);
    } else {
      // Navigate to specific folder
      const newBreadcrumb: BreadcrumbItem = {
        id: folderId,
        name: folderName || `Folder ${folderId}`
      };
      
      // Check if we're already in this folder
      const currentIndex = breadcrumbPath.findIndex(item => item.id === folderId);
      
      if (currentIndex >= 0) {
        // Navigate back to existing folder in path
        setBreadcrumbPath(breadcrumbPath.slice(0, currentIndex + 1));
      } else {
        // Navigate deeper into folder hierarchy
        setBreadcrumbPath(prev => [...prev, newBreadcrumb]);
      }
    }
  }, [breadcrumbPath]);

  const navigateToRoot = useCallback(() => {
    navigateToFolder(null);
  }, [navigateToFolder]);

  const goBack = useCallback(() => {
    if (canGoBack) {
      const newPath = breadcrumbPath.slice(0, -1);
      const previousFolder = newPath[newPath.length - 1];
      setBreadcrumbPath(newPath);
      setCurrentFolderId(previousFolder.id);
    }
  }, [breadcrumbPath, canGoBack]);

  return {
    currentFolderId,
    breadcrumbPath,
    isInFolderView,
    navigateToFolder,
    navigateToRoot,
    goBack,
    canGoBack,
  };
} 