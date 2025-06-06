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
  const [folders, setFolders] = useState<FolderWithChildren[]>([]);
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
      const rootFoldersFromAPI = (data?.folders || []) as any[]; // API returns folders with document_count
      
      const typedRootFolders: FolderWithChildren[] = rootFoldersFromAPI.map(folder => ({
        ...folder, // Spread properties from API Folder object
        document_count: folder.document_count || 0, // Ensure document_count is a number
        children: [], // Initialize with empty array for FolderWithChildren
        childrenLoaded: false, // Initialize for FolderWithChildren
      }));
      
      setFolders(typedRootFolders);
      setFolderTree(typedRootFolders.map(folder => ({ // Also ensure folderTree items are fully typed
        ...folder, // folder is already FolderWithChildren from typedRootFolders map
        children: [], // This re-map might be redundant if typedRootFolders is already perfect
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
      // API should return { data: { folders: Folder[] } } for the parentId (containing subfolders)
      // The API response for /api/folders?parentId=ID already provides folders with document_count
      const response = await fetch(`/api/folders?parentId=${parentId}`); 
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to fetch subfolders for ${parentId} (${response.status})`);
      }
      const { data } = await response.json(); 
      const fetchedSubFoldersFromAPI = (data?.folders || []) as any[]; // These are Folder + document_count

      // Map to FolderWithChildren for consistency
      const typedFetchedSubFolders: FolderWithChildren[] = fetchedSubFoldersFromAPI.map(sf => ({
        ...sf,
        document_count: sf.document_count || 0,
        children: [],
        childrenLoaded: false,
      }));

      // Add new folders to the flat list, avoiding duplicates
      setFolders(prevFolders => {
        const newFoldersToAdd = typedFetchedSubFolders.filter(sf => !prevFolders.some(f => f.id === sf.id));
        return [...prevFolders, ...newFoldersToAdd];
      });

      // Update the folderTree
      setFolderTree(prevTree => {
        const updateNodeChildren = (nodes: FolderWithChildren[]): FolderWithChildren[] => {
          return nodes.map(node => {
            if (node.id === parentId) {
              return {
                ...node,
                children: typedFetchedSubFolders.map(sf => ({
                  ...sf, 
                  // children: [], // already initialized in typedFetchedSubFolders
                  // childrenLoaded: false, // already initialized in typedFetchedSubFolders
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
      
      // Prepare the new folder object for state update
      // API response for POST already includes id, user_id, name, parent_folder_id, created_at, updated_at
      // We need to add document_count (defaults to 0 for new folders), children, and childrenLoaded
      const newFolderForState: FolderWithChildren = {
        ...newFolder,
        document_count: (newFolder as any).document_count || 0, // Should be 0 for a new folder
        children: [],       // New folders have no children initially
        childrenLoaded: true, // No children to load, so effectively loaded
      };

      setFolders(prevFolders => [...prevFolders, newFolderForState]);

      setFolderTree(prevTree => {
        if (!parentId) { // Root folder
          // Add to the root level
          return [...prevTree, newFolderForState];
        } else { // Child folder
          // Recursively find the parent and add to its children
          const addRecursively = (nodes: FolderWithChildren[]): FolderWithChildren[] => {
            return nodes.map(node => {
              if (node.id === parentId) {
                // Ensure children array exists
                const updatedChildren = node.children ? [...node.children, newFolderForState] : [newFolderForState];
                return { ...node, children: updatedChildren, childrenLoaded: true }; // Parent's children are now known/updated
              }
              // If the current node has children, recurse
              if (node.children && node.children.length > 0) {
                return { ...node, children: addRecursively(node.children) };
              }
              return node; // No match, return node as is
            });
          };
          return addRecursively(prevTree);
        }
      });

      toast.success(`Folder "${newFolder.name}" created successfully.`);
      return newFolder;
    } catch (err: any) {
      console.error('[useFolders] Error creating folder:', err);
      toast.error(`Failed to create folder: ${err.message}`);
      return null;
    }
  }, []);

  // Update folder
  const updateFolder = useCallback(async (
    id: string, 
    updates: { name?: string; parentFolderId?: string | null }
  ): Promise<Folder | null> => {
    let originalFolder: FolderWithChildren | undefined;
    let originalParentId: string | null | undefined;

    // Optimistically find the folder for potential rollback or tree manipulation
    setFolderTree(prevTree => {
      const findFolder = (nodes: FolderWithChildren[], targetId: string): FolderWithChildren | undefined => {
        for (const node of nodes) {
          if (node.id === targetId) return node;
          if (node.children) {
            const found = findFolder(node.children, targetId);
            if (found) return found;
          }
        }
        return undefined;
      };
      originalFolder = findFolder(prevTree, id);
      originalParentId = originalFolder?.parent_folder_id;
      return prevTree; // No change yet
    });


    try {
      // Optimistic UI Update for folder move
      if (updates.parentFolderId !== undefined && originalFolder) {
        const movedFolder = { ...originalFolder, parent_folder_id: updates.parentFolderId === undefined ? originalFolder.parent_folder_id : updates.parentFolderId };
        
        // 1. Update flat list
        setFolders(prevFolders =>
          prevFolders.map(f => (f.id === id ? { ...f, parent_folder_id: updates.parentFolderId ?? null } : f))
        );

        // 2. Update tree: Remove from old position, add to new position
        setFolderTree(prevTree => {
          // Helper to remove a node
          const removeNode = (nodes: FolderWithChildren[], nodeId: string): FolderWithChildren[] => {
            return nodes
              .filter(node => node.id !== nodeId)
              .map(node => ({
                ...node,
                children: node.children ? removeNode(node.children, nodeId) : [],
              }));
          };

          // Helper to add a node
          const addNode = (nodes: FolderWithChildren[], targetParentId: string | null | undefined, nodeToAdd: FolderWithChildren): FolderWithChildren[] => {
            if (targetParentId === null || targetParentId === undefined) { // Add to root
              return [...nodes, nodeToAdd];
            }
            return nodes.map(node => {
              if (node.id === targetParentId) {
                return {
                  ...node,
                  children: node.children ? [...node.children, nodeToAdd] : [nodeToAdd],
                  childrenLoaded: true, // Assume children are now known
                };
              }
              return {
                ...node,
                children: node.children ? addNode(node.children, targetParentId, nodeToAdd) : [],
              };
            });
          };

          let treeWithoutMovedFolder = removeNode(prevTree, id);
          return addNode(treeWithoutMovedFolder, updates.parentFolderId, movedFolder);
        });
      } else if (updates.name && originalFolder) {
        // Optimistic update for name change (already partially handled by previous edit)
        setFolders(prevFolders =>
          prevFolders.map(f => (f.id === id ? { ...f, name: updates.name ?? f.name } : f))
        );
        setFolderTree(prevTree => {
          const updateNameRecursively = (nodes: FolderWithChildren[]): FolderWithChildren[] => {
            return nodes.map(node => {
              if (node.id === id) return { ...node, name: updates.name ?? node.name };
              if (node.children) return { ...node, children: updateNameRecursively(node.children) };
              return node;
            });
          };
          return updateNameRecursively(prevTree);
        });
      }

      const response = await fetch(`/api/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Failed to update folder (${response.status})`);
      }

      const { data } = await response.json();
      const updatedFolderFromAPI = data as Folder; // API returns base Folder type

      // If it was a move, the optimistic update is already done.
      // If it was just a name change, we also did an optimistic update.
      // We need to ensure the API response (which might have updated timestamps or other fields) is reflected.
      
      setFolders(prevFolders =>
        prevFolders.map(f =>
          f.id === id ? { ...f, ...updatedFolderFromAPI, document_count: (f as FolderWithChildren).document_count } : f
        )
      );
      setFolderTree(prevTree => {
        const syncWithAPI = (nodes: FolderWithChildren[]): FolderWithChildren[] => {
          return nodes.map(node => {
            if (node.id === id) {
              return { 
                ...node, // Keep local structure like children, childrenLoaded
                ...updatedFolderFromAPI, // Apply API data (name, timestamps, parent_folder_id if it changed)
                document_count: (node as FolderWithChildren).document_count, // Retain local document_count
                 // Ensure parent_folder_id from updates is correctly set if it was part of the API update
                parent_folder_id: updatedFolderFromAPI.parent_folder_id !== undefined ? updatedFolderFromAPI.parent_folder_id : node.parent_folder_id
              };
            }
            if (node.children) {
              return { ...node, children: syncWithAPI(node.children) };
            }
            return node;
          });
        };
        return syncWithAPI(prevTree);
      });


      toast.success('Folder updated successfully.');
      return updatedFolderFromAPI; // Return the API response

    } catch (err: any) {
      console.error('[useFolders] Error updating folder:', err);
      toast.error(`Failed to update folder: ${err.message}`);
      // Rollback optimistic update on error
      if (updates.parentFolderId !== undefined && originalFolder) {
         // This is a simplified rollback; a more robust one might involve restoring the exact previous tree.
         // For now, just re-fetch to ensure consistency after a failed move.
        await fetchFolders();
      } else if (updates.name && originalFolder) {
        const originalName = originalFolder.name; // Capture the name
        // Rollback name change
        setFolders(prevFolders =>
          prevFolders.map(f => (f.id === id ? { ...f, name: originalName } : f))
        );
        setFolderTree(prevTree => {
          const revertName = (nodes: FolderWithChildren[]): FolderWithChildren[] => {
            return nodes.map(node => {
              if (node.id === id) {
                 return { ...node, name: originalName }; // Use captured name
              }
              if (node.children) return { ...node, children: revertName(node.children) };
              return node;
            });
          };
          return revertName(prevTree);
        });
      }
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

      // Remove from flat list
      setFolders(prevFolders => prevFolders.filter(f => f.id !== id));

      // Recursively remove from tree
      setFolderTree(prevTree => {
        const removeRecursively = (nodes: FolderWithChildren[], targetId: string): FolderWithChildren[] => {
          return nodes
            .filter(node => node.id !== targetId) // Filter out the target node
            .map(node => { // For remaining nodes, recurse on their children
              if (node.children) {
                return { ...node, children: removeRecursively(node.children, targetId) };
              }
              return node;
            });
        };
        return removeRecursively(prevTree, id);
      });

      toast.success('Folder deleted successfully.');
      return true;
    } catch (err: any) {
      console.error('[useFolders] Error deleting folder:', err);
      toast.error(`Failed to delete folder: ${err.message}`);
      return false;
    }
  }, []);

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

      toast.success('Document deleted successfully.');
      // Removed: await fetchFolders(); 
      // Consider if a direct document list refresh is needed or if useAllDocuments handles this via its own mechanisms
      // For document_count on folders, this will be updated on the next full folder fetch or via real-time updates.
      return true;
    } catch (err: any) {
      console.error('[useFolders] Error deleting document:', err);
      toast.error(`Failed to delete document: ${err.message}`);
      return false;
    }
  }, []);

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