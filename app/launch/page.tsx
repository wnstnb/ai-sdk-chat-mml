'use client';

import React, { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
// Import FileManager as per documentation
import { FileManager } from '@cubone/react-file-manager'; 
// Revert CSS path to the file confirmed to exist in node_modules
import '@cubone/react-file-manager/dist/react-file-manager.css'; 
import { Document, Folder } from '@/types/supabase'; // Import types
import { ChatInputUI } from '@/components/editor/ChatInputUI'; // Import the chat input UI
// import { ModelSelector } from '@/components/ModelSelector'; // Import if needed directly, ChatInputUI uses it

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
// const testFiles: CuboneFileType[] = [
//     { name: "Test Document 1.txt", isDirectory: false, path: "/test-doc-uuid-1", updatedAt: new Date().toISOString() },
//     { name: "Test Folder A", isDirectory: true, path: "/test-folder-uuid-a", updatedAt: new Date().toISOString() },
//     { name: "Another Doc.md", isDirectory: false, path: "/test-doc-uuid-2", updatedAt: new Date().toISOString() }
// ];

export default function LaunchPage() {
  const router = useRouter();
  // --- State for Chat Input ---
  const [input, setInput] = useState(''); // Replaces initialInputValue
  const [model, setModel] = useState('gemini-1.5-flash'); // Default model for input
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false); // Needed for ChatInputUI props
  const [uploadError, setUploadError] = useState<string | null>(null); // Needed for ChatInputUI props
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null); // Needed for ChatInputUI props
  const formRef = useRef<HTMLFormElement>(null); // Ref for the form

  // --- State for File Manager & Page ---
  const [cuboneFiles, setCuboneFiles] = useState<CuboneFileType[]>([]); 
  const [isLoading, setIsLoading] = useState(true); // For initial data fetch
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // For launch action

  // --- State for Typing Effect ---
  const [displayedText, setDisplayedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const fullText = "What do you want to focus on?";
  const typingSpeed = 80; // milliseconds per character

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
      // Reset input state on error?
      // setInput(''); 
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

  // Effect for typing animation
  useEffect(() => {
    let index = 0;
    setIsTypingComplete(false);
    setDisplayedText(''); // Reset text on mount/re-render

    const typeCharacter = () => {
        if (index < fullText.length) {
            const charToAdd = fullText.charAt(index);
            console.log(`[Typing Effect] Index: ${index}, Char: ${charToAdd}`); // <-- Add logging
            setDisplayedText((prev) => prev + charToAdd);
            index++;
            setTimeout(typeCharacter, typingSpeed);
        } else {
            console.log("[Typing Effect] Typing complete."); // <-- Add logging
            setIsTypingComplete(true); // Typing finished
        }
    };

    // Start typing after a short delay
    console.log("[Typing Effect] Starting typing..."); // <-- Add logging
    const timeoutId = setTimeout(typeCharacter, 500);

    // Cleanup function to clear timeout if component unmounts
    return () => {
        console.log("[Typing Effect] Cleanup effect."); // <-- Add logging
        clearTimeout(timeoutId);
    }
  }, [fullText, typingSpeed]); // Rerun if text or speed changes (though they are constant here)

  // --- Handlers for Chat Input ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Placeholder file handlers (can be implemented later if needed on launch)
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.warn("File change triggered on Launch page - not implemented yet.");
    toast.info("File attachments are not supported when starting a new document yet.");
    if (event.target) event.target.value = ''; // Reset file input
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    console.warn("Paste triggered on Launch page - not implemented yet.");
     // Basic check to prevent image paste for now
     const items = event.clipboardData?.items;
     if (items) {
        const containsFiles = Array.from(items).some(item => item.kind === 'file');
        if (containsFiles) {
            event.preventDefault(); // Prevent default paste behavior if files are detected
            toast.info("Pasting files is not supported when starting a new document yet.");
        }
     }
  };

  const handleUploadClick = () => {
    console.warn("Upload click triggered on Launch page - not implemented yet.");
    toast.info("File attachments are not supported when starting a new document yet.");
  };

  // Handle Enter key submission
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isSubmitting) {
        event.preventDefault();
        // Only submit if input is not empty
        if (input.trim()) {
            formRef.current?.requestSubmit(); // Trigger form submission
        }
    }
  };

  // --- Handler for Launch Submission (triggered by form onSubmit) ---
  const handleLaunchSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault(); // Prevent default form submission
    if (!input.trim() || isSubmitting) return; // Check the 'input' state

    console.log("[LaunchPage] Submitting with initial content:", input);
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the text content from the 'input' state
        body: JSON.stringify({ initialContent: input.trim() }), 
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: `Failed to launch (${response.status})`} }));
        throw new Error(errorData.error?.message || `Failed to launch document (${response.status})`);
      }
      const { data }: { data: { documentId: string } } = await response.json();
      console.log("[LaunchPage] Document created, redirecting to:", `/editor/${data.documentId}`);
      
      // Pass initial message via query parameter
      const initialMsgQuery = encodeURIComponent(input.trim());
      router.push(`/editor/${data.documentId}?initialMsg=${initialMsgQuery}`);
      
      // Clear input after successful submission start
      setInput(''); 

    } catch (err: any) {
      console.error("Launch submit error:", err);
      setError(err.message || 'An unknown error occurred during launch.');
      setIsSubmitting(false); // Ensure submit button is re-enabled on error
    } 
    // No finally block to reset isSubmitting, handled in success/error paths
  };


  // --- Handlers for Cubone File Manager Actions --- 
  // (Keep existing Cubone handlers as they are)
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

  const handleRename = useCallback(async (file: CuboneFileType, newName: string) => {
    console.log('Rename Request:', file.path, newName);
    const id = file.id;
    if (!id) { setError("Could not rename: Item ID is missing."); return; }
    const apiPath = file.isDirectory ? `/api/folders/${id}` : `/api/documents/${id}`;
    try {
        const response = await fetch(apiPath, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }),
        });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message || 'Failed to rename item'); }
        await fetchData(); // Refetch
    } catch (err: any) { setError(err.message); }
  }, [fetchData]);

  const handleDelete = useCallback(async (filesToDelete: CuboneFileType[]) => {
      console.log('Delete Request:', filesToDelete.map(f => f.path));
      setError(null);
      const results = await Promise.allSettled(filesToDelete.map(async (file) => {
          const id = file.id;
          if (!id) { throw new Error(`Missing ID for ${file.name}`); }
          const apiPath = file.isDirectory ? `/api/folders/${id}` : `/api/documents/${id}`;
          const response = await fetch(apiPath, { method: 'DELETE' });
          if (!response.ok) { const err = await response.json().catch(() => ({ error: { message: `Failed to delete ${file.name}` } })); throw new Error(err.error?.message || `Failed to delete ${file.name}`); }
      }));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) { setError(`Failed to delete ${failed.length} item(s).`); failed.forEach((fail: any) => console.error(fail.reason)); }
      await fetchData(); // Refetch
  }, [fetchData]);

  const handleFileOpen = useCallback((file: CuboneFileType) => {
      console.log("File Open Request:", file.path, "ID:", file.id);
      if (!file.isDirectory) {
           const id = file.id;
          if (id) { router.push(`/editor/${id}`); }
          else { console.error("Could not extract ID from file path:", file.path); setError("Could not open file: Invalid path."); }
      } 
      // Logic for folder navigation within Cubone would go here
  }, [router]);

   const handlePasteCubone = useCallback(async (sourceFiles: CuboneFileType[], destinationFolder: CuboneFileType, operationType: "copy" | "move") => {
        console.log(`Cubone Paste Request: ${operationType}`, sourceFiles.map(f=>f.path), `to dest: ${destinationFolder.path}`);
        setError("Move/Copy/Paste not implemented yet.");
        // TODO: Implement Cubone move/copy API calls
        // await fetchData();
    }, [fetchData]);


  return (
    <div className="flex flex-col h-full p-4 bg-[--bg-secondary] text-[--text-color]">
      {/* Updated Heading with Conditional Content */}
      <h1 className="text-2xl font-semibold mb-4 text-center font-uncut-sans h-8"> {/* Added h-8 for stable height */}
        {isSubmitting ? (
          <span className="loading-text">
            Loading
            <span className="dot1">.</span>
            <span className="dot2">.</span>
            <span className="dot3">.</span>
          </span>
        ) : (
          <>
            <span className="typing-text">{displayedText}</span>
            <span className="cursor blinking"></span>
          </>
        )}
      </h1>

      {/* Launch Input Form using ChatInputUI */}
      <form ref={formRef} onSubmit={handleLaunchSubmit} className="mb-6">
        {/* <label htmlFor="launch-input" className="sr-only">What do you want to focus on?</label> */}
         {/* We can hide the label since ChatInputUI has a placeholder */}
         <ChatInputUI
            files={files} // Pass null initially
            fileInputRef={fileInputRef} // Pass ref
            handleFileChange={handleFileChange} // Pass placeholder handler
            inputRef={inputRef} // Pass ref
            input={input} // Pass input state
            handleInputChange={handleInputChange} // Pass handler
            handleKeyDown={handleKeyDown} // Pass handler
            handlePaste={handlePaste} // Pass placeholder handler
            model={model} // Pass model state
            setModel={setModel} // Pass model setter
            handleUploadClick={handleUploadClick} // Pass placeholder handler
            isLoading={isSubmitting} // Use isSubmitting to disable input during launch
            isUploading={isUploading} // Pass state (false initially)
            uploadError={uploadError} // Pass state (null initially)
            uploadedImagePath={uploadedImagePath} // Pass state (null initially)
          />
        {/* The submit button is now inside ChatInputUI */}
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
            onCreateFolder={handleCreateFolder}
            onRenameFile={handleRename} // Use the correct prop name
            onDelete={handleDelete} // Correct prop name
            onFileOpen={handleFileOpen}
            onPaste={handlePasteCubone} // Use the renamed handler
            options={{}} // Customize options if needed
            style={{ height: 'calc(100% - 1px)', width: '100%' }}
          />
        )}
      </div>
    </div>
  );
} 