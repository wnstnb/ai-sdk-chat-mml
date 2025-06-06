import { useState, useEffect, useCallback } from 'react';
import { Folder, Document } from '@/types/supabase';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

// Extended folder type with children for hierarchical rendering
export interface FolderWithChildren extends Folder {
  children: FolderWithChildren[] | null; // Can be null if not loaded
  childrenLoaded: boolean;
  document_count: number;
}

// Folder with contents (documents and subfolders)
export interface FolderWithContents extends Folder {
  subfolders: Folder[];
  documents: Document[];
  totalItems: number;
}

interface UseFoldersReturn {
  folders: Folder[];
  folderTree: FolderWithChildren[];
  isLoading: boolean;
  error: string | null;
  createFolder: (name: string, parentId?: string | null) => Promise<Folder | null>;
  updateFolder: (id: string, updates: { name?: string; parentFolderId?: string | null }) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<boolean>;
  fetchFolders: () => Promise<void>;
  getFolderContents: (folderId: string) => Promise<FolderWithContents | null>;
  moveDocument: (documentId: string, folderId: string | null) => Promise<boolean>;
  deleteDocument: (id: string) => Promise<boolean>;
  loadSubFolders: (parentId: string) => Promise<void>;
  loadingSubFolders: Set<string>;
}

export function useFolders(): UseFoldersReturn {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderTree, setFolderTree] = useState<FolderWithChildren[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSubFolders, setLoadingSubFolders] = useState<Set<string>>(new Set());

  // Fetch initial (root-level) folders
  const fetchFolders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch root-level folders (API needs to support this, e.g., /api/folders or /api/folders?parentId=root)
      const response = await fetch('/api/folders'); // Assuming /api/folders now returns root folders by default
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch root folders (${response.status})`);
      }
      const { data } = await response.json();
      const rootFolders = (data?.folders || []) as Folder[];
      
      setFolders(rootFolders);
      setFolderTree(rootFolders.map(folder => ({
        ...folder,
        document_count: (folder as any).document_count || 0,
        children: [], // Initialize with empty array, to be populated by loadSubFolders
        childrenLoaded: false,
      })));

    } catch (err: any) {
      console.error('[useFolders] Error fetching root folders:', err);
      setError(err.message);
      setFolders([]);
      setFolderTree([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // New function to load subfolders for a given parent
  const loadSubFolders = useCallback(async (parentId: string) => {
    if (loadingSubFolders.has(parentId)) return; // Already loading

    setLoadingSubFolders(prev => new Set(prev).add(parentId));
    setError(null);

    try {
      // API should return { subfolders: Folder[], documents: Document[] } for the parentId
      const response = await fetch(`/api/folders?parentId=${parentId}`); 
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch subfolders for ${parentId} (${response.status})`);
      }
      const { data } = await response.json(); 
      const fetchedSubFolders = (data?.subfolders || []) as Folder[];
      // const fetchedDocuments = (data?.documents || []) as Document[]; // Assuming API returns documents too

      // Add new folders to the flat list, avoiding duplicates
      setFolders(prevFolders => {
        const newFoldersToAdd = fetchedSubFolders.filter(sf => !prevFolders.some(f => f.id === sf.id));
        return [...prevFolders, ...newFoldersToAdd];
      });

      // Update the folderTree
      setFolderTree(prevTree => {
        const updateNodeChildren = (nodes: FolderWithChildren[]): FolderWithChildren[] => {
          return nodes.map(node => {
            if (node.id === parentId) {
              return {
                ...node,
                children: fetchedSubFolders.map(sf => ({
                  ...sf,
                  document_count: (sf as any).document_count || 0,
                  children: [],
                  childrenLoaded: false
                })),
                childrenLoaded: true,
              };
            }
            if (node.children) {
              return { ...node, children: updateNodeChildren(node.children) };
            }
            return node;
          });
        };
        return updateNodeChildren(prevTree);
      });

      // TODO: Handle fetchedDocuments - likely update folderContents in DocumentCardGrid or a similar store
      // For now, this hook primarily manages the folder structure.

    } catch (err: any) {
      console.error(`[useFolders] Error loading subfolders for ${parentId}:`, err);
      setError(err.message);
      // Optionally, revert childrenLoaded status on error or handle specific UI updates
    } finally {
      setLoadingSubFolders(prev => {
        const newSet = new Set(prev);
        newSet.delete(parentId);
        return newSet;
      });
    }
  }, [loadingSubFolders]);

  // Create new folder
  const createFolder = useCallback(async (name: string, parentId?: string | null): Promise<Folder | null> => {
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          parentFolderId: parentId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to create folder (${response.status})`);
      }

      const { data } = await response.json();
      const newFolder = data as Folder;
      
      // Refresh folder list
      await fetchFolders();
      toast.success(`Folder "${name}" created successfully.`);
      return newFolder;
    } catch (err: any) {
      console.error('[useFolders] Error creating folder:', err);
      toast.error(`Failed to create folder: ${err.message}`);
      return null;
    }
  }, [fetchFolders]);

  // Update folder
  const updateFolder = useCallback(async (
    id: string, 
    updates: { name?: string; parentFolderId?: string | null }
  ): Promise<Folder | null> => {
    try {
      const response = await fetch(`/api/folders/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to update folder (${response.status})`);
      }

      const { data } = await response.json();
      const updatedFolder = data as Folder;
      
      // Refresh folder list
      await fetchFolders();
      toast.success('Folder updated successfully.');
      return updatedFolder;
    } catch (err: any) {
      console.error('[useFolders] Error updating folder:', err);
      toast.error(`Failed to update folder: ${err.message}`);
      return null;
    }
  }, [fetchFolders]);

  // Delete folder
  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/folders/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to delete folder (${response.status})`);
      }

      // Refresh folder list
      await fetchFolders();
      toast.success('Folder deleted successfully.');
      return true;
    } catch (err: any) {
      console.error('[useFolders] Error deleting folder:', err);
      toast.error(`Failed to delete folder: ${err.message}`);
      return false;
    }
  }, [fetchFolders]);

  // Get folder contents (subfolders and documents)
  const getFolderContents = useCallback(async (folderId: string): Promise<FolderWithContents | null> => {
    try {
      // This might now primarily be used for fetching documents if subfolders are handled by loadSubFolders
      // Or, this could be the primary way to get children if API for /api/folders/${folderId} is rich
      const response = await fetch(`/api/folders/${folderId}`); // API for specific folder details + contents
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch folder contents (${response.status})`);
      }

      const { data } = await response.json();
      return {
        ...data.folder,
        subfolders: data.subfolders || [],
        documents: data.documents || [],
        totalItems: data.totalItems || 0,
      } as FolderWithContents;
    } catch (err: any) {
      console.error('[useFolders] Error fetching folder contents:', err);
      toast.error(`Failed to load folder contents: ${err.message}`);
      return null;
    }
  }, []);

  // Move document to folder
  const moveDocument = useCallback(async (documentId: string, folderId: string | null): Promise<boolean> => {
    try {
      const response = await fetch(`/api/documents/${documentId}/move`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to move document (${response.status})`);
      }

      const { message } = await response.json();
      toast.success(message || 'Document moved successfully.');
      return true;
    } catch (err: any) {
      console.error('[useFolders] Error moving document:', err);
      toast.error(`Failed to move document: ${err.message}`);
      return false;
    }
  }, []);

  // Delete document (New function)
  const deleteDocument = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to delete document (${response.status})`);
      }

      // No specific data returned on 204 No Content for DELETE usually
      toast.success('Document deleted successfully.');
      // Refresh relevant data - fetchFolders also indirectly causes document lists to refresh if dependent
      await fetchFolders(); 
      // Consider if a direct document list refresh is needed or if useAllDocuments handles this via its own mechanisms
      return true;
    } catch (err: any) {
      console.error('[useFolders] Error deleting document:', err);
      toast.error(`Failed to delete document: ${err.message}`);
      return false;
    }
  }, [fetchFolders]);

  // Initial fetch
  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Realtime subscription for folder changes
  useEffect(() => {
    const client = createClient();
    const channel = client
      .channel('folders-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'folders' },
        (payload) => {
          // Re-fetch folders when a change occurs
          toast.info('Folder list updated.', { duration: 2000 });
          fetchFolders();
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[useFolders] Realtime subscription error:', err);
          toast.error('Realtime update connection issue.');
        }
      });

    // Cleanup subscription on component unmount
    return () => {
      client.removeChannel(channel);
    };
  }, [fetchFolders]);

  return {
    folders,
    folderTree,
    isLoading,
    error,
    createFolder,
    updateFolder,
    deleteFolder,
    fetchFolders,
    getFolderContents,
    moveDocument,
    deleteDocument,
    loadSubFolders,
    loadingSubFolders,
  };
} 