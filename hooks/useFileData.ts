import { useCallback } from 'react';
import { useFileMediaStore } from '@/stores/fileMediaStore';
import { Document, Folder } from '@/types/supabase'; // Assuming types are defined here
import { toast } from 'sonner'; // Import toast for feedback

// Define the expected shape of the API response data (assuming it returns ALL items for now)
interface FetchDataResponse {
  data: {
    documents: Document[];
    folders: Folder[];
  };
  // Include other potential response fields if necessary (e.g., error)
}

export const useFileData = () => {
  const {
    setIsLoading,
    setError,
    setAllFolders,
    setAllDocuments,
    setCurrentViewItems,
    setCurrentFolder,
    currentFolderId, // Get currentFolderId to use as parent_folder_id
    allFolders, // Needed for setCurrentFolder
    currentViewDocuments, // Needed for confirmation message
    updateDocumentInStore, // Added for optimistic updates
  } = useFileMediaStore();

  // Function to fetch data for a specific folder (or root if null)
  const fetchData = useCallback(async (folderId: string | null) => {
    console.log(`[useFileData] Attempting to fetch data for folderId: ${folderId}...`);
    setIsLoading(true);
    setError(null);
    try {
      // Fetch ALL data from the single endpoint for now
      // TODO: Adapt API to accept folderId (e.g., /api/file-manager?folderId=${folderId || 'root'})
      const response = await fetch('/api/file-manager'); 
      console.log("[useFileData] Fetch response status:", response.status);

      if (!response.ok) {
        let errorData = { error: { message: `HTTP error ${response.status}` } };
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.error("[useFileData] Failed to parse error response JSON:", parseError);
        }
        throw new Error(errorData.error?.message || `Failed to fetch data (${response.status})`);
      }

      const result: FetchDataResponse = await response.json();
      const allDocs = result.data.documents || [];
      const allFoldersResult = result.data.folders || [];
      console.log("[useFileData] Fetched all data:", { allDocs, allFolders: allFoldersResult });

      // Update the store with ALL folders and documents
      setAllFolders(allFoldersResult);
      setAllDocuments(allDocs);

      // --- Client-side filtering ---
      const currentViewFolders = allFoldersResult.filter(folder => folder.parent_folder_id === folderId);
      const currentViewDocuments = allDocs.filter(doc => doc.folder_id === folderId);
      console.log("[useFileData] Filtered view items:", { currentViewFolders, currentViewDocuments });

      setCurrentViewItems(currentViewFolders, currentViewDocuments);

      // Pass allFoldersResult to setCurrentFolder
      setCurrentFolder(folderId, allFoldersResult);

    } catch (err: any) {
      console.error("[useFileData] Error inside fetchData:", err);
      setError(err.message || 'An unknown error occurred while fetching files.');
      // Clear data on error
      setAllFolders([]);
      setAllDocuments([]);
      setCurrentViewItems([], []);
      setCurrentFolder(null, []); // Reset to root on error
    } finally {
      setIsLoading(false);
      console.log("[useFileData] Finished fetchData execution.");
    }
  }, [setIsLoading, setError, setAllFolders, setAllDocuments, setCurrentViewItems, setCurrentFolder]); // Added store setters

  // Function to create a new folder
  const createFolder = useCallback(async (folderName: string) => {
    if (!folderName || folderName.trim().length === 0) {
      toast.error("Folder name cannot be empty.");
      return false; // Indicate failure
    }

    console.log(`[useFileData] Attempting to create folder "${folderName}" in ${currentFolderId || 'root'}...`);
    // Consider adding a specific loading state for creation if needed
    // setIsLoading(true); // Maybe reuse general loading or add a new state
    setError(null);

    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName.trim(),
          parent_folder_id: currentFolderId, // Use the current folder ID from the store
        }),
      });

      console.log("[useFileData] Create folder response status:", response.status);

      if (!response.ok) {
        let errorData = { error: { message: `HTTP error ${response.status}` } };
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.error("[useFileData] Failed to parse error response JSON:", parseError);
        }
        throw new Error(errorData.error?.message || `Failed to create folder (${response.status})`);
      }

      // const { data: newFolder } = await response.json(); // Get the newly created folder data
      // console.log("[useFileData] Created folder:", newFolder);
      toast.success(`Folder "${folderName}" created successfully.`);

      // Refetch data for the current folder to show the new folder
      await fetchData(currentFolderId);
      return true; // Indicate success

    } catch (err: any) {
      console.error("[useFileData] Error inside createFolder:", err);
      const errorMsg = err.message || 'An unknown error occurred while creating the folder.';
      setError(errorMsg);
      toast.error(`Failed to create folder: ${errorMsg}`);
      return false; // Indicate failure
    } finally {
      // setIsLoading(false); // Reset loading state if specific one was used
      console.log("[useFileData] Finished createFolder execution.");
    }
  }, [currentFolderId, setIsLoading, setError, fetchData]); // Add dependencies

  // Function to rename a folder
  const renameFolder = useCallback(async (folderId: string, newName: string) => {
    if (!newName || newName.trim().length === 0) {
      toast.error("Folder name cannot be empty.");
      return false; // Indicate failure
    }
    if (!folderId) {
        toast.error("Cannot rename: Folder ID is missing.");
        return false;
    }

    const trimmedName = newName.trim();
    console.log(`[useFileData] Attempting to rename folder ${folderId} to "${trimmedName}"...`);
    // Consider adding a specific loading state if needed
    setError(null);

    try {
      const response = await fetch(`/api/folders/${folderId}`, { // Use the specific folder ID endpoint
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }), // Only send the name field
      });

      console.log("[useFileData] Rename folder response status:", response.status);

      if (!response.ok) {
        let errorData = { error: { message: `HTTP error ${response.status}` } };
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.error("[useFileData] Failed to parse error response JSON:", parseError);
        }
        throw new Error(errorData.error?.message || `Failed to rename folder (${response.status})`);
      }

      // const { data: updatedFolder } = await response.json();
      toast.success(`Folder renamed to "${trimmedName}" successfully.`);

      // Refetch data for the current folder to update the view
      await fetchData(currentFolderId);
      return true; // Indicate success

    } catch (err: any) {
      console.error("[useFileData] Error inside renameFolder:", err);
      const errorMsg = err.message || 'An unknown error occurred while renaming the folder.';
      setError(errorMsg);
      toast.error(`Failed to rename folder: ${errorMsg}`);
      return false; // Indicate failure
    } finally {
      // Reset specific loading state if used
      console.log("[useFileData] Finished renameFolder execution.");
    }
  }, [currentFolderId, setError, fetchData]); // Dependencies

  // Function to delete a folder
  const deleteFolder = useCallback(async (folderId: string) => {
    if (!folderId) {
        toast.error("Cannot delete: Folder ID is missing.");
        return false;
    }

    // --- Confirmation Step --- (Simple window.confirm for now)
    // Find the folder name for the confirmation message
    const folderToDelete = useFileMediaStore.getState().allFolders.find(f => f.id === folderId);
    const folderName = folderToDelete ? folderToDelete.name : 'this folder';
    // REMOVE individual confirmation prompt
    // if (!window.confirm(`Are you sure you want to delete the folder "${folderName}"? This action cannot be undone.`)) {
    //  return false; // User cancelled
    // }
    // --- End Confirmation ---

    console.log(`[useFileData] Attempting to delete folder ${folderId}...`);
    // Consider specific loading state
    setError(null);

    try {
      const response = await fetch(`/api/folders/${folderId}`, { // Use the specific folder ID endpoint
        method: 'DELETE',
      });

      console.log("[useFileData] Delete folder response status:", response.status);

      if (!response.ok) {
        // Handle cases like 404 Not Found gracefully if needed
        if (response.status === 404) {
           throw new Error("Folder not found. It might have already been deleted.");
        }
        let errorData = { error: { message: `HTTP error ${response.status}` } };
        try {
          errorData = await response.json();
        } catch (parseError) {
          // Ignore if no JSON body
        }
        throw new Error(errorData.error?.message || `Failed to delete folder (${response.status})`);
      }

      // No JSON body expected on successful DELETE typically
      toast.success(`Folder "${folderName}" deleted successfully.`);

      // Refetch data for the current folder to update the view
      await fetchData(currentFolderId);
      return true; // Indicate success

    } catch (err: any) {
      console.error("[useFileData] Error inside deleteFolder:", err);
      const errorMsg = err.message || 'An unknown error occurred while deleting the folder.';
      setError(errorMsg);
      toast.error(`Failed to delete folder: ${errorMsg}`);
      return false; // Indicate failure
    } finally {
      // Reset specific loading state if used
      console.log("[useFileData] Finished deleteFolder execution.");
    }
  }, [currentFolderId, setError, fetchData]); // Dependencies

  // Function to rename a document
  const renameDocument = useCallback(async (documentId: string, newName: string) => {
    if (!newName || newName.trim().length === 0) {
      toast.error("Document name cannot be empty.");
      return false; // Indicate failure
    }
    if (!documentId) {
        toast.error("Cannot rename: Document ID is missing.");
        return false;
    }

    const trimmedName = newName.trim();
    console.log(`[useFileData] Attempting to rename document ${documentId} to "${trimmedName}"...`);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, { // Use the specific document ID endpoint
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }), // Only send the name field
      });

      console.log("[useFileData] Rename document response status:", response.status);

      if (!response.ok) {
        let errorData = { error: { message: `HTTP error ${response.status}` } };
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.error("[useFileData] Failed to parse error response JSON:", parseError);
        }
        throw new Error(errorData.error?.message || `Failed to rename document (${response.status})`);
      }

      // Refetch data for the current folder to update the view
      await fetchData(currentFolderId);
      return true; // Indicate success

    } catch (err: any) {
      console.error("[useFileData] Error inside renameDocument:", err);
      const errorMsg = err.message || 'An unknown error occurred while renaming the document.';
      setError(errorMsg);
      toast.error(`Failed to rename document: ${errorMsg}`);
      return false; // Indicate failure
    } finally {
      console.log("[useFileData] Finished renameDocument execution.");
    }
  }, [currentFolderId, setError, fetchData]); // Dependencies

  // Function to delete a document
  const deleteDocument = useCallback(async (documentId: string) => {
    if (!documentId) {
        toast.error("Cannot delete: Document ID is missing.");
        return false;
    }

    // --- Confirmation Step ---
    const docToDelete = useFileMediaStore.getState().allDocuments.find(d => d.id === documentId);
    const docName = docToDelete ? docToDelete.name : 'this document';
    // REMOVE individual confirmation prompt
    // if (!window.confirm(`Are you sure you want to delete the document "${docName}"? This action cannot be undone.`)) {
    //     return false; // User cancelled
    // }
    // --- End Confirmation ---

    console.log(`[useFileData] Attempting to delete document ${documentId}...`);
    setError(null);

    try {
        const response = await fetch(`/api/documents/${documentId}`, { // Use the specific document ID endpoint
            method: 'DELETE',
        });

        console.log("[useFileData] Delete document response status:", response.status);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("Document not found. It might have already been deleted.");
            }
            let errorData = { error: { message: `HTTP error ${response.status}` } };
            try {
                errorData = await response.json();
            } catch (parseError) {
                // Ignore if no JSON body
            }
            throw new Error(errorData.error?.message || `Failed to delete document (${response.status})`);
        }

        toast.success(`Document "${docName}" deleted successfully.`);

        // Refetch data for the current folder to update the view
        await fetchData(currentFolderId);
        return true; // Indicate success

    } catch (err: any) {
        console.error("[useFileData] Error inside deleteDocument:", err);
        const errorMsg = err.message || 'An unknown error occurred while deleting the document.';
        setError(errorMsg);
        toast.error(`Failed to delete document: ${errorMsg}`);
        return false; // Indicate failure
    } finally {
        console.log("[useFileData] Finished deleteDocument execution.");
    }
  }, [currentFolderId, setError, fetchData]); // Dependencies

  // --- NEW: Function to toggle star status of a document ---
  const toggleStarDocument = useCallback(async (documentId: string) => {
    if (!documentId) {
      toast.error("Cannot star/unstar: Document ID is missing.");
      return false;
    }

    const currentDoc = useFileMediaStore.getState().allDocuments.find(d => d.id === documentId);
    if (!currentDoc) {
      toast.error("Document not found.");
      return false;
    }

    const newStarredStatus = !currentDoc.is_starred;
    console.log(`[useFileData] Attempting to toggle star for document ${documentId} to ${newStarredStatus}`);

    // Optimistic update in the store
    updateDocumentInStore(documentId, { is_starred: newStarredStatus });

    try {
      const response = await fetch(`/api/documents/${documentId}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // No body needed, the endpoint toggles based on current state
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to toggle star status.'}));
        throw new Error(errorData.message || `Failed to toggle star status (${response.status})`);
      }

      const result = await response.json();
      if (result.success) {
        // Confirm update with server response
        updateDocumentInStore(documentId, { is_starred: result.is_starred });
        toast.success(`Document "${currentDoc.name}" ${result.is_starred ? 'starred' : 'unstarred'}.`);
        // Optionally, refetch if other parts of the UI depend on a full refresh
        // await fetchData(currentFolderId); 
        return true;
      } else {
        throw new Error(result.message || 'Failed to toggle star status on server.');
      }
    } catch (err: any) {
      console.error("[useFileData] Error inside toggleStarDocument:", err);
      const errorMsg = err.message || 'An unknown error occurred while toggling star status.';
      toast.error(`Error: ${errorMsg}`);
      // Revert optimistic update on error
      updateDocumentInStore(documentId, { is_starred: currentDoc.is_starred });
      return false;
    }
  }, [updateDocumentInStore, fetchData, currentFolderId]); // Added updateDocumentInStore and potentially fetchData

  // Function to move an item (folder or document) to a new folder
  const moveItem = useCallback(async (itemId: string, itemType: 'folder' | 'document', targetFolderId: string | null) => {
    if (!itemId || !itemType) {
        toast.error("Cannot move: Item information missing.");
        return false;
    }

    // Prevent dropping a folder into itself (targetFolderId should not equal itemId if itemType is folder)
    if (itemType === 'folder' && itemId === targetFolderId) {
        toast.warning("Cannot move a folder into itself.");
        return false;
    }

    console.log(`[useFileData] Attempting to move ${itemType} ${itemId} to folder ${targetFolderId || 'root'}...`);
    setError(null);
    // Optionally add a specific loading state for move operations

    try {
        let apiUrl: string;
        let body: Record<string, any>;

        if (itemType === 'folder') {
            apiUrl = `/api/folders/${itemId}`;
            body = { parentFolderId: targetFolderId };
        } else { // itemType === 'document'
            apiUrl = `/api/documents/${itemId}`;
            body = { folderId: targetFolderId };
        }

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        console.log(`[useFileData] Move ${itemType} response status:`, response.status);

        if (!response.ok) {
            let errorData = { error: { message: `HTTP error ${response.status}` } };
            try {
                errorData = await response.json();
            } catch (parseError) { /* Ignore */ }
            throw new Error(errorData.error?.message || `Failed to move ${itemType} (${response.status})`);
        }

        toast.success(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} moved successfully.`);

        // Refetch data for the current folder to update the view
        // Note: If moving *out* of the current folder, the item will disappear.
        // If moving *into* the current folder, it might appear if not already visible (though current logic fetches all).
        await fetchData(currentFolderId);
        return true; // Indicate success

    } catch (err: any) {
        console.error(`[useFileData] Error inside moveItem (${itemType}):`, err);
        const errorMsg = err.message || `An unknown error occurred while moving the ${itemType}.`;
        setError(errorMsg);
        toast.error(`Failed to move ${itemType}: ${errorMsg}`);
        return false; // Indicate failure
    } finally {
        // Reset specific loading state if used
        console.log("[useFileData] Finished moveItem execution.");
    }
  }, [currentFolderId, setError, fetchData]); // Dependencies

  // Return the functions so components can call them
  return {
    fetchData,
    createFolder,
    renameFolder,
    deleteFolder,
    renameDocument,
    deleteDocument,
    moveItem, // Expose the moveItem function
    toggleStarDocument, // Expose the new function
  };
}; 