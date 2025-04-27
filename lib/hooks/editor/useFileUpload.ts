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
    clearPreview: () => void;
}

export function useFileUpload({
    documentId,
}: UseFileUploadProps): UseFileUploadReturn {
    const [files, setFiles] = useState<FileList | null>(null); // For preview
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null); // Storage path
    const [uploadedImageSignedUrl, setUploadedImageSignedUrl] = useState<string | null>(null); // Download URL

    // Internal upload function (modified from page.tsx handleStartUpload)
    const _handleStartUpload = useCallback(async (file: File) => {
        if (!documentId) {
            toast.error("Cannot upload: Document context missing.");
            return;
        }
        // Note: We don't check isUploading here, as the caller (selectAndUploadFile)
        // might decide how to handle concurrent requests if needed.
        // However, setting state should prevent UI overlaps.

        setIsUploading(true);
        setUploadError(null);
        // Keep existing file preview during upload, but reset path and signed URL
        setUploadedImagePath(null);
        setUploadedImageSignedUrl(null); // --> ADDED: Reset signed URL on new upload
        toast.info(`Uploading ${file.name}...`);

        let storagePath: string | null = null; // Variable to hold path after upload

        try {
            // 1. Get Signed UPLOAD URL
            console.log(`[useFileUpload] Fetching signed UPLOAD URL for: ${file.name}`);
            const signedUrlRes = await fetch('/api/storage/signed-url/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, contentType: file.type, documentId })
            });
            if (!signedUrlRes.ok) {
                const err = await signedUrlRes.json().catch(() => ({}));
                throw new Error(err.error?.message || `Upload URL error for ${file.name} (${signedUrlRes.status})`);
            }
            // --> Expect ONLY signedUrl (for upload) and path
            const { data: urlData } = await signedUrlRes.json();
            const { signedUrl: uploadUrl, path: returnedPath } = urlData;

            if (!uploadUrl || !returnedPath) {
                 throw new Error("Upload URL response missing required URL or path.");
            }
            // Store the path immediately
            storagePath = returnedPath;
            setUploadedImagePath(storagePath); // Store permanent path
            setUploadedImageSignedUrl(null); // Reset download URL initially
            console.log(`[useFileUpload] Received upload URL and path: ${storagePath}`);

            // 2. Upload File using Signed UPLOAD URL
            console.log(`[useFileUpload] Uploading ${file.name} using signed upload URL...`);
            const uploadRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });
            if (!uploadRes.ok) {
                const storageErrorText = await uploadRes.text();
                console.error("Storage Upload Error Text:", storageErrorText);
                throw new Error(`Upload failed for ${file.name} (${uploadRes.status})`);
            }
            console.log(`[useFileUpload] Successfully uploaded ${file.name}. Path: ${storagePath}`);

            // 3. Add Delay
            console.log(`[useFileUpload] Waiting briefly before fetching download URL...`);
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

            // 4. Get Signed DOWNLOAD URL (Separate API Call)
            if (!storagePath) {
                 throw new Error("Consistency error: Storage path lost before fetching download URL.");
            }
            console.log(`[useFileUpload] Fetching download URL for path: ${storagePath}`);
            const downloadUrlRes = await fetch('/api/storage/signed-url/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: storagePath })
            });

            if (!downloadUrlRes.ok) {
                const err = await downloadUrlRes.json().catch(() => ({}));
                // Log specific error status from download endpoint
                throw new Error(err.error?.message || `Failed to get download URL (${downloadUrlRes.status})`);
            }

            const { signedUrl: downloadUrl } = await downloadUrlRes.json();
            if (!downloadUrl) {
                 throw new Error("Download URL response did not contain a signedUrl.");
            }

            // 5. Success - Set download URL
            console.log(`[useFileUpload] Successfully obtained download URL.`);
            setUploadedImageSignedUrl(downloadUrl); // Store the usable download URL
            toast.success(`${file.name} uploaded and processed!`); // Update success message slightly

        } catch (err: any) {
            console.error(`Upload or Download URL error (${file.name}):`, err);
            const errorMsg = `Failed to upload ${file.name}: ${err.message}`;
            setUploadError(errorMsg);
            toast.error(errorMsg);
            setFiles(null); // Clear preview on error
            setUploadedImagePath(null);
            setUploadedImageSignedUrl(null); // --> ADDED: Ensure signed URL reset on error
        } finally {
            setIsUploading(false);
        }
    }, [documentId]);

    // Function to set preview and initiate upload
    const selectAndUploadFile = useCallback((file: File) => {
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
        setUploadError(null); // Clear previous errors
        setUploadedImagePath(null); // Clear previous path
        setUploadedImageSignedUrl(null); // --> ADDED: Clear previous signed URL
        _handleStartUpload(file); // Start the upload

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

    // Function to manually clear the preview state
    const clearPreview = useCallback(() => {
        setFiles(null);
        setUploadedImagePath(null);
        setUploadedImageSignedUrl(null); // --> ADDED: Reset signed URL
        setUploadError(null);
        // Note: Does not affect ongoing uploads
    }, []);

    return {
        files,
        isUploading,
        uploadError,
        uploadedImagePath,
        uploadedImageSignedUrl, // --> MODIFIED: Return the signed download URL
        selectAndUploadFile,
        handleFileSelectEvent,
        handleFilePasteEvent,
        handleFileDropEvent,
        clearPreview,
    };
} 