import { useState, useEffect, useCallback } from 'react';
import { Folder, Document } from '@/types/supabase';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

/**
 * Represents a folder with its children (for hierarchical tree structures).
 * Extends the base Folder type.
 */
export interface FolderWithChildren extends Folder {
  /** Array of child folders, or null if children haven't been loaded yet. */
  children: FolderWithChildren[] | null;
  /** Boolean indicating if the children of this folder have been loaded. */
  childrenLoaded: boolean;
  /** The number of documents directly within this folder. Often provided by API. */
  document_count: number;
}

/**
 * Represents a folder along with its direct contents (subfolders and documents).
 * Typically used when fetching details for a specific folder.
 */
export interface FolderWithContents extends Folder {
  /** Array of direct subfolders. */
  subfolders: Folder[];
  /** Array of documents directly within this folder. */
  documents: Document[];
  /** Total number of items (subfolders + documents) within this folder. */
  totalItems: number;
}

/**
 * Defines the state and actions provided by the useFolders hook.
 */
interface UseFoldersReturn {
  /** A flat array of all fetched folders, typed as FolderWithChildren for consistency in tree building. */
  folders: Folder[]; // Should ideally be FolderWithChildren[] if that's what it holds
  /** A hierarchical tree structure of folders, where each node is FolderWithChildren. */
  folderTree: FolderWithChildren[];
  /** Boolean indicating if the initial set of folders is currently loading. */
  isLoading: boolean;
  /** Error message string if an error occurred during folder operations, otherwise null. */
  error: string | null;
  /**
   * Creates a new folder.
   * @param {string} name - The name for the new folder.
   * @param {string | null} [parentId] - Optional ID of the parent folder. Null or undefined for a root folder.
   * @returns {Promise<Folder | null>} A promise that resolves to the created Folder object, or null on failure.
   */
  createFolder: (name: string, parentId?: string | null) => Promise<Folder | null>;
  /**
   * Updates an existing folder (e.g., rename or move).
   * @param {string} id - The ID of the folder to update.
   * @param {{ name?: string; parentFolderId?: string | null }} updates - An object containing the updates.
   * @returns {Promise<Folder | null>} A promise that resolves to the updated Folder object, or null on failure.
   */
  updateFolder: (id: string, updates: { name?: string; parentFolderId?: string | null }) => Promise<Folder | null>;
  /**
   * Deletes a folder.
   * @param {string} id - The ID of the folder to delete.
   * @returns {Promise<boolean>} A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteFolder: (id: string) => Promise<boolean>;
  /** Fetches the initial (root-level) folders and populates the folder tree. */
  fetchFolders: () => Promise<void>;
  /**
   * Fetches the contents (subfolders and documents) of a specific folder.
   * @param {string} folderId - The ID of the folder whose contents are to be fetched.
   * @returns {Promise<FolderWithContents | null>} A promise that resolves to the folder with its contents, or null on failure.
   */
  getFolderContents: (folderId: string) => Promise<FolderWithContents | null>;
  /**
   * Moves a document to a specified folder (or to the root).
   * @param {string} documentId - The ID of the document to move.
   * @param {string | null} folderId - The ID of the target folder, or null to move to the root.
   * @returns {Promise<boolean>} A promise that resolves to true if successful, false otherwise.
   */
  moveDocument: (documentId: string, folderId: string | null) => Promise<boolean>;
  /**
   * Deletes a document.
   * @param {string} id - The ID of the document to delete.
   * @returns {Promise<boolean>} A promise that resolves to true if successful, false otherwise.
   */
  deleteDocument: (id: string) => Promise<boolean>;
  /**
   * Loads the direct subfolders for a given parent folder ID and updates the folder tree.
   * @param {string} parentId - The ID of the parent folder for which to load subfolders.
   * @returns {Promise<void>}
   */
  loadSubFolders: (parentId: string) => Promise<void>;
  /** A Set containing the IDs of parent folders whose subfolders are currently being loaded. */
  loadingSubFolders: Set<string>;
}

/**
 * Custom hook for managing all folder-related operations and state.
 * This includes fetching, creating, updating, deleting folders, managing the folder tree structure,
 * loading subfolders on demand, and moving/deleting documents in relation to folders.
 * It interacts with backend APIs for persistence and provides optimistic updates for a better UX.
 * @returns {UseFoldersReturn} An object containing folder data, loading/error states, and action functions.
 */
export function useFolders(): UseFoldersReturn {
  const [folders, setFolders] = useState<FolderWithChildren[]>([]);
  const [folderTree, setFolderTree] = useState<FolderWithChildren[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSubFolders, setLoadingSubFolders] = useState<Set<string>>(new Set());

  /**
   * Fetches the initial set of root-level folders from the API.
   * Populates the flat `folders` list and the hierarchical `folderTree`.
   */
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

  /**
   * Loads the direct subfolders for a given parent folder ID.
   * Fetches subfolders from the API and updates both the flat `folders` list
   * and the `folderTree` by appending children to the specified parent node.
   * Manages a loading state for the parent ID during the fetch.
   */
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

  /**
   * Creates a new folder via an API call.
   * On success, updates the local `folders` list and `folderTree` optimistically.
   * Shows toast notifications for success or failure.
   */
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

  /**
   * Updates an existing folder (name or parent) via an API call.
   * Implements optimistic updates for the folder tree for name changes and moves.
   * Handles potential rollbacks if the API call fails.
   * Shows toast notifications for success or failure.
   */
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

  /**
   * Deletes a folder via an API call.
   * Optimistically removes the folder from the local `folders` list and `folderTree`.
   * Handles rollbacks if the API call fails. Recursively deletes children in the optimistic update.
   * Shows toast notifications for success or failure.
   */
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

  /**
   * Fetches the detailed contents (subfolders and documents) of a specific folder by its ID.
   * This is typically used when a user navigates into a folder that doesn't just show a preview.
   */
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

  /**
   * Moves a document to a different folder (or to the root) via an API call.
   * Shows toast notifications for success or failure. This function primarily handles the API call;
   * UI updates related to document lists are expected to be managed by other state/hooks.
   */
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

  /**
   * Deletes a document by its ID via an API call.
   * Shows toast notifications for success or failure. Similar to `moveDocument`,
   * this primarily handles the API interaction for document deletion.
   */
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
    let isSubscribed = false;
    let channel: any = null;
    
    try {
      channel = client
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
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[useFolders] Realtime subscription error:', err);
            toast.error('Realtime update connection issue.');
          }
        });
    } catch (error) {
      console.error('[useFolders] Error setting up subscription:', error);
    }

    // Cleanup subscription on component unmount
    return () => {
      if (channel && isSubscribed) {
        try {
          client.removeChannel(channel);
        } catch (error) {
          console.error('[useFolders] Error removing channel:', error);
        }
      }
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