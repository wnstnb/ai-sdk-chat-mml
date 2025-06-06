import { useState, useCallback, useEffect } from 'react';

interface FolderExpansionState {
  expandedFolders: Set<string>;
  toggleFolder: (folderId: string) => void;
  expandFolder: (folderId: string) => void;
  collapseFolder: (folderId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  isExpanded: (folderId: string) => boolean;
  setExpandedFolders: (folderIds: string[]) => void;
}

const STORAGE_KEY = 'folder-expansion-state';

export function useFolderExpansion(persist: boolean = true): FolderExpansionState {
  const [expandedFolders, setExpandedFoldersState] = useState<Set<string>>(() => {
    if (persist && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsedState = JSON.parse(stored);
          return new Set(parsedState);
        }
      } catch (error) {
        console.warn('[useFolderExpansion] Failed to load expansion state from localStorage:', error);
      }
    }
    return new Set<string>();
  });

  // Persist state to localStorage when it changes
  useEffect(() => {
    if (persist && typeof window !== 'undefined') {
      try {
        const stateArray = Array.from(expandedFolders);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateArray));
      } catch (error) {
        console.warn('[useFolderExpansion] Failed to save expansion state to localStorage:', error);
      }
    }
  }, [expandedFolders, persist]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFoldersState(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }, []);

  const expandFolder = useCallback((folderId: string) => {
    setExpandedFoldersState(prev => {
      const newSet = new Set(prev);
      newSet.add(folderId);
      return newSet;
    });
  }, []);

  const collapseFolder = useCallback((folderId: string) => {
    setExpandedFoldersState(prev => {
      const newSet = new Set(prev);
      newSet.delete(folderId);
      return newSet;
    });
  }, []);

  const expandAll = useCallback(() => {
    // This would need a list of all folder IDs to be fully functional
    // For now, we'll implement it as a helper that can be used with folder data
    console.warn('[useFolderExpansion] expandAll requires folder data to be passed separately');
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedFoldersState(new Set<string>());
  }, []);

  const isExpanded = useCallback((folderId: string) => {
    return expandedFolders.has(folderId);
  }, [expandedFolders]);

  const setExpandedFolders = useCallback((folderIds: string[]) => {
    setExpandedFoldersState(new Set(folderIds));
  }, []);

  return {
    expandedFolders,
    toggleFolder,
    expandFolder,
    collapseFolder,
    expandAll,
    collapseAll,
    isExpanded,
    setExpandedFolders,
  };
} 