import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface UseFileUploadProps {
    documentId: string | undefined | null;
}

interface UseFileUploadReturn {
    files: FileList | null;
    isUploading: boolean;
    uploadError: string | null;
    uploadedImagePath: string | null; // Storage path
    uploadedImageSignedUrl: string | null; // Download URL for AI/UI
    selectAndUploadFile: (file: File) => void;
    handleFileSelectEvent: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleFilePasteEvent: (event: React.ClipboardEvent<Element>) => void; // Allow generic element for broader use
    handleFileDropEvent: (event: React.DragEvent<Element>) => void; // Allow generic element
    clearPreview: (options?: { deleteFromStorage?: boolean }) => Promise<void>;
    uploadFileForOrchestrator: (file: File) => Promise<string>; // Expose for orchestrator
    fetchDownloadUrlForPath: (filePath: string) => Promise<string>; // Expose for fetching download URL
}

// Helper function to fetch download URL - can be used by any consumer of the hook
async function fetchDownloadUrlLogic(filePath: string): Promise<string> {
    console.log(`[fetchDownloadUrlLogic] Fetching download URL for path: ${filePath}`);
    // Optional: Add a small delay if needed, though can be handled by caller if specific
    // await new Promise(resolve => setTimeout(resolve, 500)); 
    
    const downloadUrlRes = await fetch('/api/storage/signed-url/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
    });

    if (!downloadUrlRes.ok) {
        const err = await downloadUrlRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Failed to get download URL (${downloadUrlRes.status})`);
    }

    const { signedUrl: downloadUrl } = await downloadUrlRes.json();
    if (!downloadUrl) {
            throw new Error("Download URL response did not contain a signedUrl.");
    }
    console.log(`[fetchDownloadUrlLogic] Successfully obtained download URL for ${filePath}`);
    return downloadUrl;
}

export function useFileUpload({
    documentId,
}: UseFileUploadProps): UseFileUploadReturn {
    const [files, setFiles] = useState<FileList | null>(null); // For preview
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null); // Storage path
    const [uploadedImageSignedUrl, setUploadedImageSignedUrl] = useState<string | null>(null); // Download URL

    // Internal upload function - refactored to return Promise<string> (storagePath) and throw errors
    const _handleStartUpload = useCallback(async (file: File): Promise<string> => {
        if (!documentId) {
            throw new Error("Cannot upload: Document context missing.");
        }

        // Reset path and signed URL for the new upload attempt via this raw function
        // Consumers like selectAndUploadFile will manage their own state based on the outcome of this promise
        // setUploadedImagePath(null); // Managed by caller
        // setUploadedImageSignedUrl(null); // Managed by caller

        let storagePath: string | null = null;

        try {
            // 1. Get Signed UPLOAD URL
            console.log(`[useFileUpload _handleStartUpload] Fetching signed UPLOAD URL for: ${file.name}`);
            const signedUrlRes = await fetch('/api/storage/signed-url/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, contentType: file.type, documentId, fileSize: file.size })
            });
            if (!signedUrlRes.ok) {
                const err = await signedUrlRes.json().catch(() => ({}));
                throw new Error(err.error?.message || `Upload URL error for ${file.name} (${signedUrlRes.status})`);
            }
            const { data: urlData } = await signedUrlRes.json();
            const { signedUrl: uploadUrl, path: returnedPath } = urlData;

            if (!uploadUrl || !returnedPath) {
                 throw new Error("Upload URL response missing required URL or path.");
            }
            storagePath = returnedPath;
            // setUploadedImagePath(storagePath); // Managed by caller
            console.log(`[useFileUpload _handleStartUpload] Received upload URL and path: ${storagePath}`);

            // 2. Upload File using Signed UPLOAD URL
            console.log(`[useFileUpload _handleStartUpload] Uploading ${file.name} using signed upload URL...`);
            const uploadRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });
            if (!uploadRes.ok) {
                const storageErrorText = await uploadRes.text();
                console.error("[useFileUpload _handleStartUpload] Storage Upload Error Text:", storageErrorText);
                throw new Error(`Upload failed for ${file.name} (${uploadRes.status})`);
            }
            console.log(`[useFileUpload _handleStartUpload] Successfully uploaded ${file.name}. Path: ${storagePath}`);
            
            // NOTE: We return the storagePath. The caller (orchestrator or selectAndUploadFile)
            // will be responsible for fetching the download URL if needed for its specific use case.
            // This simplifies _handleStartUpload to focus on getting the file into storage and returning its path.

            return storagePath!;

        } catch (err: any) {
            console.error(`[useFileUpload _handleStartUpload] Upload error (${file.name}):`, err);
            // Re-throw the error for the caller to handle
            throw err;
        }
    }, [documentId]);

    // Function to set preview and initiate upload
    const selectAndUploadFile = useCallback(async (file: File) => {
        if (isUploading) {
            toast.info("Please wait for the current upload to finish.");
            return;
        }
        // Simple validation: Check if it's an image
        if (!file.type.startsWith('image/')) {
            toast.error("Only image files can be uploaded.");
            return;
        }

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        setFiles(dataTransfer.files); // Set for preview
        
        setIsUploading(true);
        setUploadError(null);
        setUploadedImagePath(null); 
        setUploadedImageSignedUrl(null);
        toast.info(`Uploading ${file.name}...`);

        try {
            const path = await _handleStartUpload(file); // Call the refactored internal upload function
            setUploadedImagePath(path); // Store permanent path

            // Now fetch the download URL using the common logic
            const downloadUrl = await fetchDownloadUrlLogic(path);
            setUploadedImageSignedUrl(downloadUrl);
            toast.success(`${file.name} uploaded and processed!`);

        } catch (err: any) {
            console.error(`[useFileUpload selectAndUploadFile] Error during upload process (${file.name}):`, err);
            const errorMsg = `Failed to upload ${file.name}: ${err.message}`;
            setUploadError(errorMsg);
            toast.error(errorMsg);
            setFiles(null); // Clear preview on error
            setUploadedImagePath(null);
            setUploadedImageSignedUrl(null);
        } finally {
            setIsUploading(false);
        }
    }, [isUploading, _handleStartUpload]);

    // Handler for file input change event
    const handleFileSelectEvent = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        let validImageSelected = false;
        if (event.target.files && event.target.files.length > 0) {
            const imageFiles = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                validImageSelected = true;
                selectAndUploadFile(imageFiles[0]); // Handle one file at a time
                if (imageFiles.length > 1) { toast.info("Selected the first image. Multiple file uploads coming soon!"); }
            } else {
                toast.error("No valid image files selected.");
            }
        }
        if (!validImageSelected) {
             setFiles(null); // Clear preview if invalid/no file selected
             setUploadedImageSignedUrl(null); // --> ADDED: Reset signed URL
        }
        // Reset input value to allow selecting the same file again
        if (event.target) {
            event.target.value = '';
        }
    }, [selectAndUploadFile]);

    // Handler for paste event
    const handleFilePasteEvent = useCallback((event: React.ClipboardEvent<Element>) => {
        const items = event.clipboardData?.items;
        if (!items) return;

        const clipboardFiles = Array.from(items).map(item => item.getAsFile()).filter((f): f is File => f !== null);

        if (clipboardFiles.length > 0) {
            const imageFiles = clipboardFiles.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                 // Prevent default paste behavior only if an image is found
                 event.preventDefault();
                 selectAndUploadFile(imageFiles[0]); // Handle one file at a time
                 if (imageFiles.length > 1) { toast.info("Pasted the first image. Multiple file uploads coming soon!"); }
            } else if (clipboardFiles.some(f => f.type.startsWith('text/'))) {
                console.log("Pasted content includes non-image files, allowing default paste behavior.");
                 // Don't reset signed URL here, as text might be pasted
            } else if (clipboardFiles.length > 0) {
                 // Prevent default paste behavior for non-image files as well
                 event.preventDefault();
                 setFiles(null); // Clear preview
                 setUploadedImageSignedUrl(null); // --> ADDED: Reset signed URL
                 toast.error('Only image files can be pasted as attachments.');
            }
        }
    }, [selectAndUploadFile]);

    // Handler for drop event
    const handleFileDropEvent = useCallback((event: React.DragEvent<Element>) => {
        // Prevent default drop behavior is handled by the caller's onDrop (which prevents default)
        const droppedFiles = event.dataTransfer.files;
        let validImageDropped = false;
        if (droppedFiles && droppedFiles.length > 0) {
            const imageFiles = Array.from(droppedFiles).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                validImageDropped = true;
                selectAndUploadFile(imageFiles[0]); // Handle one file at a time
                if (imageFiles.length > 1) { toast.info("Attached the first dropped image. Multiple file uploads coming soon!"); }
            } else {
                toast.error('Only image files accepted via drop.');
            }
        }
         if (!validImageDropped) {
             setFiles(null); // Clear preview
             setUploadedImageSignedUrl(null); // --> ADDED: Reset signed URL
        }
    }, [selectAndUploadFile]);

    // Function to manually clear the preview state AND delete from storage
    const clearPreview = useCallback(async (options?: { deleteFromStorage?: boolean }) => {
        console.log("[useFileUpload] clearPreview called with options:", options);
        const shouldDeleteFromStorage = options?.deleteFromStorage !== undefined ? options.deleteFromStorage : true;

        // --- ADDED: Delete from Storage ---
        const pathToDelete = uploadedImagePath; // Capture path before clearing state

        // Clear client-side state IMMEDIATELY for responsiveness
        setFiles(null);
        setUploadedImagePath(null);
        setUploadedImageSignedUrl(null);
        setUploadError(null);
        console.log("[useFileUpload] Client-side preview state cleared.");

        // If there was a path stored, attempt deletion based on shouldDeleteFromStorage
        if (pathToDelete && shouldDeleteFromStorage) {
            console.log(`[useFileUpload] Attempting to delete file from storage: ${pathToDelete}`);
            try {
                const response = await fetch('/api/storage/delete', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: pathToDelete }),
                });

                if (!response.ok) {
                    // Attempt to parse error message from backend
                    const errorData = await response.json().catch(() => ({ error: 'Failed to parse delete error response' }));
                    const errorMsg = errorData.details || errorData.error || `Failed with status ${response.status}`;
                    console.error(`[useFileUpload] Failed to delete file '${pathToDelete}' from storage: ${errorMsg}`);
                    toast.error(`Could not delete file: ${errorMsg}`);
                    // NOTE: We don't revert UI state here, preview is already cleared.
                } else {
                    console.log(`[useFileUpload] Successfully deleted file '${pathToDelete}' from storage.`);
                    toast.success("Image removed.");
                }
            } catch (error: any) {
                console.error(`[useFileUpload] Error calling delete API for '${pathToDelete}':`, error);
                toast.error(`Error removing file: ${error.message}`);
            }
        } else if (pathToDelete && !shouldDeleteFromStorage) {
            console.log(`[useFileUpload] Skipping storage deletion for path: ${pathToDelete} as per options.`);
        } else if (!pathToDelete) {
            console.log("[useFileUpload] No uploadedImagePath found, skipping storage deletion.");
        }
        // --- END ADDED ---

        // Note: Does not affect ongoing uploads
    }, [uploadedImagePath, setFiles, setUploadedImagePath, setUploadedImageSignedUrl, setUploadError]); // Include uploadedImagePath in deps

    return {
        files,
        isUploading,
        uploadError,
        uploadedImagePath,
        uploadedImageSignedUrl,
        selectAndUploadFile,
        handleFileSelectEvent,
        handleFilePasteEvent,
        handleFileDropEvent,
        clearPreview,
        uploadFileForOrchestrator: _handleStartUpload, // Expose the refactored upload function
        fetchDownloadUrlForPath: fetchDownloadUrlLogic, // Expose the download URL fetching logic
    };
} 