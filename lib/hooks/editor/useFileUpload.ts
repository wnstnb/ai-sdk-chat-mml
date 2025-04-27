import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface UseFileUploadProps {
    documentId: string | undefined | null;
}

interface UseFileUploadReturn {
    files: FileList | null;
    isUploading: boolean;
    uploadError: string | null;
    uploadedImagePath: string | null;
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
    const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);

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
        // Keep existing file preview during upload, but reset path
        setUploadedImagePath(null); 
        toast.info(`Uploading ${file.name}...`);

        try {
            // 1. Get Signed URL
            const signedUrlRes = await fetch('/api/storage/signed-url/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, contentType: file.type, documentId })
            });
            if (!signedUrlRes.ok) {
                const err = await signedUrlRes.json().catch(() => ({}));
                throw new Error(err.error?.message || `Upload URL error for ${file.name} (${signedUrlRes.status})`);
            }
            const { data: urlData } = await signedUrlRes.json(); // Gets { signedUrl, path }

            // 2. Upload File using Signed URL
            const uploadRes = await fetch(urlData.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });
            if (!uploadRes.ok) {
                const storageErrorText = await uploadRes.text();
                console.error("Storage Upload Error Text:", storageErrorText);
                throw new Error(`Upload failed for ${file.name} (${uploadRes.status})`);
            }

            // 3. Success
            setUploadedImagePath(urlData.path);
            toast.success(`${file.name} uploaded successfully!`);

        } catch (err: any) {
            console.error(`Upload error (${file.name}):`, err);
            const errorMsg = `Failed to upload ${file.name}: ${err.message}`;
            setUploadError(errorMsg);
            toast.error(errorMsg);
            setFiles(null); // Clear preview on error
            setUploadedImagePath(null);
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
        _handleStartUpload(file); // Start the upload

    }, [isUploading, _handleStartUpload]);

    // Handler for file input change event
    const handleFileSelectEvent = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const imageFiles = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                selectAndUploadFile(imageFiles[0]); // Handle one file at a time
                if (imageFiles.length > 1) { toast.info("Selected the first image. Multiple file uploads coming soon!"); }
            } else {
                toast.error("No valid image files selected.");
                setFiles(null); // Clear preview if invalid file selected
            }
        } else {
            setFiles(null); // Clear preview if no file selected
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
            } else if (clipboardFiles.length > 0) {
                 // Prevent default paste behavior for non-image files as well
                 event.preventDefault(); 
                 toast.error('Only image files can be pasted as attachments.');
            }
        }
    }, [selectAndUploadFile]);

    // Handler for drop event
    const handleFileDropEvent = useCallback((event: React.DragEvent<Element>) => {
        // Prevent default drop behavior is handled by the caller's onDrop (which prevents default)
        const droppedFiles = event.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
            const imageFiles = Array.from(droppedFiles).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                selectAndUploadFile(imageFiles[0]); // Handle one file at a time
                if (imageFiles.length > 1) { toast.info("Attached the first dropped image. Multiple file uploads coming soon!"); }
            } else {
                toast.error('Only image files accepted via drop.');
            }
        }
    }, [selectAndUploadFile]);
    
    // Function to manually clear the preview state
    const clearPreview = useCallback(() => {
        setFiles(null);
        setUploadedImagePath(null);
        setUploadError(null);
        // Note: Does not affect ongoing uploads
    }, []);

    return {
        files,
        isUploading,
        uploadError,
        uploadedImagePath,
        selectAndUploadFile,
        handleFileSelectEvent,
        handleFilePasteEvent,
        handleFileDropEvent,
        clearPreview,
    };
} 