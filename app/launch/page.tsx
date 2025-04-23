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
    id?: string;
    name: string;
    isDirectory: boolean;
    path: string;
    updatedAt?: string; // Optional
    size?: number; // Optional
};

// Helper to map our DB structure to Cubone's expected structure
const mapToCuboneFiles = (documents: Document[], folders: Folder[]): CuboneFileType[] => {
    // Using names for paths to allow rendering, but adding UUID to 'id' field
    const mappedFolders: CuboneFileType[] = folders
        .filter(f => f && typeof f.name === 'string' && f.name.trim() !== '') // Ensure folder name is valid
        .map(f => ({
            id: f.id, // <-- Populate ID
            name: f.name,
            isDirectory: true,
            path: `/${f.name}`, // Use name for path
            updatedAt: f.updated_at,
        }));
     const mappedDocuments: CuboneFileType[] = documents
        .filter(d => d && typeof d.name === 'string' && d.name.trim() !== '') // Ensure document name is valid
        .map(d => ({
            id: d.id, // <-- Populate ID
            name: d.name,
            isDirectory: false,
            path: `/${d.name}`, // Use name for path
            updatedAt: d.updated_at,
        }));

    return [...mappedFolders, ...mappedDocuments];
};

// Hardcoded test data to isolate rendering issue
const testFiles: CuboneFileType[] = [
    { name: "Test Document 1.txt", isDirectory: false, path: "/test-doc-uuid-1", updatedAt: new Date().toISOString() },
    { name: "Test Folder A", isDirectory: true, path: "/test-folder-uuid-a", updatedAt: new Date().toISOString() },
    { name: "Another Doc.md", isDirectory: false, path: "/test-doc-uuid-2", updatedAt: new Date().toISOString() }
];

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
    console.log("[LaunchPage] Attempting to fetch data..."); // Log start
    setIsLoading(true);
    setError(null);
    try {
      console.log("[LaunchPage] Calling fetch('/api/file-manager')..."); // Log before fetch
      const response = await fetch('/api/file-manager');
      console.log("[LaunchPage] Fetch response status:", response.status); // Log status

      if (!response.ok) {
        let errorData = { error: { message: `HTTP error ${response.status}`}};
        try {
          errorData = await response.json(); // Try to parse error JSON
        } catch (parseError) {
          console.error("[LaunchPage] Failed to parse error response JSON:", parseError);
        }
        throw new Error(errorData.error?.message || `Failed to fetch data (${response.status})`);
      }
      const { data }: { data: { documents: Document[], folders: Folder[] } } = await response.json();
      console.log("[LaunchPage] Fetched data:", data); // Log received data

      // Map fetched data to CuboneFile structure using the helper
      const mappedData = mapToCuboneFiles(data.documents, data.folders);
      console.log("[LaunchPage] Mapped data for FileManager:", mappedData); // Log mapped data
      setCuboneFiles(mappedData);

    } catch (err: any) {
      console.error("[LaunchPage] Error inside fetchData:", err); // Log fetch error
      setError(err.message || 'An unknown error occurred while fetching files.');
    } finally {
      setIsLoading(false);
      console.log("[LaunchPage] Finished fetchData execution."); // Log end
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    console.log("[LaunchPage] useEffect triggered to call fetchData."); // Log effect trigger
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
    // Use the ID directly from the file object
    const id = file.id;
    if (!id) {
        setError("Could not rename: Item ID is missing.");
        return;
    }
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
          // Use the ID directly from the file object
          const id = file.id;
          if (!id) {
             throw new Error(`Missing ID for ${file.name}`); // Skip items without ID
          }
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
      console.log("File Open Request:", file.path, "ID:", file.id);
      if (!file.isDirectory) {
          // Use the ID directly from the file object
           const id = file.id;
          if (id) {
              router.push(`/editor/${id}`); // Use the actual UUID
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
    // Use CSS variables for background and text color
    <div className="flex flex-col h-full p-4 bg-[--bg-secondary] text-[--text-color]">
      <h1 className="text-2xl font-semibold mb-4 text-center">Launch Pad</h1>

      {/* Launch Input Form */}
      <form onSubmit={handleLaunchSubmit} className="mb-6">
        <label htmlFor="launch-input" className="sr-only">What do you want to focus on?</label>
        <input
          id="launch-input"
          placeholder="What do you want to focus on?"
          // Use CSS variables for input background and border
          className="w-full px-4 py-2 border border-[--border-color] rounded-md shadow-sm focus:outline-none focus:ring-none focus:border-[--tab-active-border] bg-[--input-bg] disabled:opacity-50"
          type="text"
          value={initialInputValue}
          onChange={(e) => setInitialInputValue(e.target.value)}
          disabled={isSubmitting} // Disable input while submitting
        />
        <button
          type="submit"
          disabled={!initialInputValue.trim() || isSubmitting} // Disable button if input is empty or submitting
          // Use CSS variables for button background, text, and hover state
          className="mt-2 w-full px-4 py-2 bg-[--primary-color-dark] text-[--button-primary-text] rounded-md hover:bg-[--tab-active-border] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-none disabled:opacity-50"
        >
          {isSubmitting ? 'Launching...' : 'Start New Document'}
        </button>
      </form>

      {/* Error Message Display */}
      {error && <div className="mb-4 p-2 text-red-700 bg-red-100 border border-red-400 rounded text-center">{error}</div>}

      {/* File Manager Section */}
      {/* Use CSS variables for border */}
      <div className="flex-grow overflow-hidden border border-[--border-color] rounded-md shadow-sm">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">Loading files...</div>
        ) : (
          <FileManager
            files={cuboneFiles} // Use the correctly typed state
            // Note: Using path as ID for now, but should use actual UUIDs
            // files={testFiles} // <-- Switch to test data if API is problematic
            onCreateFolder={handleCreateFolder}
            onRenameFile={handleRename} // Use the correct prop name
            onDeleteFile={handleDelete} // Use the correct prop name
            onFileOpen={handleFileOpen}
            // onPaste={handlePaste} // Enable if implemented
            // Other props like onCopy, onMove, onDownload can be added here
            options={{
              // Customize options if needed
              // Example: Disable certain actions
              // disableDragAndDrop: true,
              // disableContextMenu: true,
            }}
            style={{
              // Use a CSS variable for height or set explicitly
              height: 'calc(100% - 1px)', // Fill container, adjust if needed
              width: '100%',
              // '--file-manager-primary-color': '#your-color', // Example of overriding CSS var
              // Consider setting font family via global CSS instead
            }}
          />
        )}
      </div>
    </div>
  );
} 