import { useState, useCallback, useMemo } from 'react';

/**
 * Represents a single item in the breadcrumb path for folder navigation.
 */
export interface BreadcrumbItem {
  /** The ID of the folder, or null if it represents the root. */
  id: string | null;
  /** The display name of the folder or root. */
  name: string;
}

/**
 * Defines the state and actions provided by the useFolderNavigation hook.
 */
export interface FolderNavigationState {
  /** The ID of the currently active folder. Null indicates the root view. */
  currentFolderId: string | null;
  /** An array of BreadcrumbItem objects representing the current navigation path. */
  breadcrumbPath: BreadcrumbItem[];
  /** Boolean indicating if the current view is inside a folder (i.e., not the root). */
  isInFolderView: boolean;
  /** 
   * Navigates to a specific folder or the root.
   * @param {string | null} folderId - The ID of the folder to navigate to, or null for the root.
   * @param {string} [folderName] - Optional name of the folder, used for breadcrumb creation if navigating to a new folder.
   */
  navigateToFolder: (folderId: string | null, folderName?: string) => void;
  /** Navigates to the root folder view. */
  navigateToRoot: () => void;
  /** Navigates to the previous folder in the breadcrumb path, if possible. */
  goBack: () => void;
  /** Boolean indicating if it's possible to navigate back (i.e., not at the root). */
  canGoBack: boolean;
}

/** The default breadcrumb item representing the root folder. */
const ROOT_BREADCRUMB: BreadcrumbItem = {
  id: null,
  name: 'All Files'
};

/**
 * Custom hook for managing folder navigation state and actions.
 * It tracks the current folder, maintains the breadcrumb path, and provides functions
 * for navigating the folder hierarchy.
 * @returns {FolderNavigationState} The folder navigation state and action handlers.
 */
export function useFolderNavigation(): FolderNavigationState {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbPath, setBreadcrumbPath] = useState<BreadcrumbItem[]>([ROOT_BREADCRUMB]);

  const isInFolderView = currentFolderId !== null;
  const canGoBack = breadcrumbPath.length > 1;

  /**
   * Navigates to the specified folder ID.
   * Updates the current folder ID and adjusts the breadcrumb path accordingly.
   * If folderId is null, navigates to the root.
   * If navigating to a folder already in the path, it truncates the path.
   * If navigating deeper, it appends to the path.
   */
  const navigateToFolder = useCallback((folderId: string | null, folderName?: string) => {
    setCurrentFolderId(folderId);
    
    if (folderId === null) {
      setBreadcrumbPath([ROOT_BREADCRUMB]);
    } else {
      const newBreadcrumb: BreadcrumbItem = {
        id: folderId,
        name: folderName || `Folder ${folderId}` // Default name if not provided
      };
      
      const currentIndex = breadcrumbPath.findIndex(item => item.id === folderId);
      
      if (currentIndex >= 0) {
        setBreadcrumbPath(breadcrumbPath.slice(0, currentIndex + 1));
      } else {
        setBreadcrumbPath(prev => [...prev, newBreadcrumb]);
      }
    }
  }, [breadcrumbPath]);

  /**
   * Convenience function to navigate directly to the root folder.
   */
  const navigateToRoot = useCallback(() => {
    navigateToFolder(null);
  }, [navigateToFolder]);

  /**
   * Navigates one level up in the folder hierarchy, if not already at the root.
   * Updates the current folder ID and breadcrumb path.
   */
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