'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
// Import FileManager as per documentation
import { FileManager } from '@cubone/react-file-manager'; 
// Revert CSS path to the file confirmed to exist in node_modules
import '@cubone/react-file-manager/dist/react-file-manager.css'; 
import { Document, Folder } from '@/types/supabase'; // Import types

// Define the structure expected by Cubone File Manager (matching docs)
type CuboneFileType = {
    name: string;
    isDirectory: boolean;
    path: string;
    updatedAt?: string; // Optional
    size?: number; // Optional
};

// Helper to map our DB structure to Cubone's expected structure
const mapToCuboneFiles = (documents: Document[], folders: Folder[]): CuboneFileType[] => {
    const mappedFolders: CuboneFileType[] = folders.map(f => ({
        name: f.name,
        isDirectory: true,
        path: `/${f.id}`, // Use ID as path segment for uniqueness, assuming root is '/' logic later
        updatedAt: f.updated_at,
        // We need a strategy to build full paths if nesting is deep
    }));
    const mappedDocuments: CuboneFileType[] = documents.map(d => ({
        name: d.name,
        isDirectory: false,
        path: `${d.folder_id ? '/'+d.folder_id : '/'}/${d.id}`, // Construct path based on parent folder
        updatedAt: d.updated_at,
        // size: calculateSize(d.content), // Needs implementation if size is desired
    }));
    // This mapping needs refinement for actual hierarchical paths if the library requires them.
    // For now, using IDs might work if the library handles structure internally based on a flat list.
    // A better approach might be to build a proper path string during mapping.

    // Let's try a simplified path for now, assuming root level
     const simpleMappedFolders: CuboneFileType[] = folders.map(f => ({
        name: f.name,
        isDirectory: true,
        path: `/${f.name}`, // Use name for path (simplistic)
        updatedAt: f.updated_at,
    }));
     const simpleMappedDocuments: CuboneFileType[] = documents.map(d => ({
        name: d.name,
        isDirectory: false,
        path: `/${d.name}`, // Use name for path (simplistic)
        updatedAt: d.updated_at,
    }));


    // return [...mappedFolders, ...mappedDocuments];
     return [...simpleMappedFolders, ...simpleMappedDocuments]; // Using simplified paths for now
};


export default function LaunchPage() {
  const router = useRouter();
  const [initialInputValue, setInitialInputValue] = useState('');
  // State for Cubone-formatted files/folders
  const [cuboneFiles, setCuboneFiles] = useState<CuboneFileType[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); 

  // Fetch initial file/folder data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/file-manager');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Failed to fetch data (${response.status})`);
      }
      const { data }: { data: { documents: Document[], folders: Folder[] } } = await response.json();

      // Map fetched data to CuboneFile structure using the helper
      const mappedData = mapToCuboneFiles(data.documents, data.folders);
      setCuboneFiles(mappedData);

    } catch (err: any) {
      console.error("Fetch error:", err);
      setError(err.message || 'An unknown error occurred while fetching files.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handler for Launch Input Submission
  const handleLaunchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!initialInputValue.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialContent: initialInputValue.trim() }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Failed to launch document (${response.status})`);
      }
      const { data }: { data: { documentId: string } } = await response.json();
      router.push(`/editor/${data.documentId}`); 
    } catch (err: any) {
      console.error("Launch submit error:", err);
      setError(err.message || 'An unknown error occurred during launch.');
      setIsSubmitting(false); 
    }
  };


  // --- Handlers for Cubone File Manager Actions --- 
  // Note: These handlers need to align with the props expected by <FileManager>
  // The arguments might differ slightly (e.g., onDelete might receive Array<File>)

  // onCreateFolder prop expects: (name: string, parentFolder: File) => void
  // Our old handler: (name: string, parentId: string | null) => void
  // We need to adapt or assume parentFolder might be null/undefined for root
  const handleCreateFolder = useCallback(async (name: string /*, parentFolder: CuboneFileType | null */) => {
    console.log('Create Folder Request:', name /*, parentFolder?.path */);
    setError(null);
    try {
        // Determine parentId based on parentFolder if needed, assuming root for now
        const parentId = null; // Simplification: Assume creating in root for now
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parentFolderId: parentId }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Failed to create folder');
        }
        await fetchData(); // Refetch data after creation
    } catch (err: any) {
        setError(err.message);
    }
  }, [fetchData]);

  // onRename prop expects: (file: File, newName: string) => void
  // Our old handlers took ID and name
  const handleRename = useCallback(async (file: CuboneFileType, newName: string) => {
    console.log('Rename Request:', file.path, newName);
    setError(null);
    // Extract ID from path (assuming simple path format used in mapping)
    const id = file.path.substring(file.path.lastIndexOf('/') + 1);
    const apiPath = file.isDirectory ? `/api/folders/${id}` : `/api/documents/${id}`; 
    try {
        const response = await fetch(apiPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName }),
        });
        if (!response.ok) {
             const err = await response.json();
            throw new Error(err.error?.message || 'Failed to rename item');
        }
        await fetchData(); // Refetch
    } catch (err: any) {
        setError(err.message);
    }
  }, [fetchData]);

  // onDelete prop expects: (files: Array<File>) => void
  const handleDelete = useCallback(async (filesToDelete: CuboneFileType[]) => {
      console.log('Delete Request:', filesToDelete.map(f => f.path));
      setError(null);
      // Process deletes individually
      const results = await Promise.allSettled(filesToDelete.map(async (file) => {
          const id = file.path.substring(file.path.lastIndexOf('/') + 1);
          const apiPath = file.isDirectory ? `/api/folders/${id}` : `/api/documents/${id}`;
          const response = await fetch(apiPath, { method: 'DELETE' });
          if (!response.ok) {
               const err = await response.json().catch(() => ({ error: { message: `Failed to delete ${file.name}` } }));
               throw new Error(err.error?.message || `Failed to delete ${file.name}`);
           }
      }));

      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
          setError(`Failed to delete ${failed.length} item(s).`);
          // Log specific errors
           failed.forEach((fail: any) => console.error(fail.reason));
      }
      await fetchData(); // Refetch regardless of partial failure
  }, [fetchData]);

   // onFileOpen prop expects: (file: File) => void
  const handleFileOpen = useCallback((file: CuboneFileType) => {
      console.log("File Open Request:", file.path);
      if (!file.isDirectory) {
          // Extract ID from path (requires consistent path mapping)
           const id = file.path.substring(file.path.lastIndexOf('/') + 1);
          if (id) {
              router.push(`/editor/${id}`);
          } else {
               console.error("Could not extract ID from file path:", file.path);
               setError("Could not open file: Invalid path.");
          }
      } 
      // Add logic here if clicking a folder should navigate *within* the file manager component
      // This might involve setting an internal path state for the FileManager if supported,
      // or refetching data filtered by the clicked folder's path/ID.
      // Currently, clicking a folder does nothing.
  }, [router]);

  // --- Add other handlers as needed based on props (onDownload, onCopy, onPaste, onMove, etc.) ---
  // Placeholder for onMove/onPaste - complex logic involving source/destination
   const handlePaste = useCallback(async (sourceFiles: CuboneFileType[], destinationFolder: CuboneFileType, operationType: "copy" | "move") => {
        console.log(`Paste Request: ${operationType}`, sourceFiles.map(f=>f.path), `to dest: ${destinationFolder.path}`);
        setError("Move/Copy/Paste not implemented yet.");
        // TODO: Implement API calls for move/copy
        // Need PUT /api/documents/[id] or /api/folders/[id] with new parentFolderId/folderId
        // Requires robust path-to-ID mapping or passing IDs if library allows
        // await fetchData();
    }, [fetchData]);


  return (
    <div className="flex flex-col h-screen p-4 bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-semibold mb-4 text-center">Launch Pad</h1>

      {/* Launch Input Form */}
      <form onSubmit={handleLaunchSubmit} className="mb-6">
        <label htmlFor="launch-input" className="sr-only">What do you want to focus on?</label>
         <input
           id="launch-input"
           type="text"
           value={initialInputValue}
           onChange={(e) => setInitialInputValue(e.target.value)}
           placeholder="What do you want to focus on?"
           disabled={isSubmitting}
           className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 disabled:opacity-50"
         />
         <button
           type="submit"
           disabled={isSubmitting || !initialInputValue.trim()}
           className="mt-2 w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
         >
           {isSubmitting ? 'Launching...' : 'Start New Document'}
         </button>
      </form>

      {error && <p className="text-red-500 mb-4 text-center bg-red-100 dark:bg-red-900 p-2 rounded border border-red-300 dark:border-red-700">Error: {error}</p>}

      {/* --- File Manager Container --- */}
       <div className="flex-grow border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden bg-white dark:bg-gray-800">
            {isLoading ? (
                <div className="flex justify-center items-center h-full">Loading files...</div>
            ) : (
                /* Use the single FileManager component */
                <FileManager 
                    files={cuboneFiles} // Pass the mapped files
                    isLoading={isLoading} // Pass loading state
                    // Pass handlers matching the documentation props
                    onCreateFolder={handleCreateFolder}
                    onRename={handleRename} // Single handler for files/folders
                    onDelete={handleDelete}
                    onFileOpen={handleFileOpen} 
                    onPaste={handlePaste} // Handle move/copy via paste
                    // Add other necessary props like onRefresh, language, etc.
                    onRefresh={fetchData} // Allow user to refresh data
                    // onError={(err, file) => setError(`FileManager Error (${err.type}): ${err.message}`)} // Basic error display
                    // Customization props (optional)
                    // height="calc(100vh - 250px)" // Example dynamic height 
                    // layout="list" 
                    // primaryColor="#E97451" 
                />
            )}
        </div>
    </div>
  );
} 