import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, UploadCloud, Link2, AlertCircle, Loader2, FileText, BotMessageSquare, FilePlus2, ChevronDown, BookOpenText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useModalStore } from '@/stores/useModalStore';
import { type BlockNoteEditor, type PartialBlock, type BlockIdentifier, type Block } from '@blocknote/core';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const MAX_PDF_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const ACCEPTED_FILE_TYPES = ['application/pdf'];

type ProcessingType = 'extract' | 'summarize';
type InsertionTarget = 'current' | 'new';

interface PDFModalProps {
  isOpen: boolean;
  onClose: () => void;
  setBlockStatus?: (blockId: string, status: any, action?: 'insert' | 'update' | 'delete', message?: string) => void;
}

export const PDFModal: React.FC<PDFModalProps> = ({ isOpen, onClose, setBlockStatus: propSetBlockStatus }) => {
  const editorRef = useModalStore(state => state.editorRef);
  const storeSetBlockStatus = useModalStore(state => state.setBlockStatus);
  const setBlockStatus = propSetBlockStatus || storeSetBlockStatus;
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasActiveDocument = !!editorRef?.current;

  const [activeTab, setActiveTab] = useState('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  
  const [processingType, setProcessingType] = useState<ProcessingType>('extract');
  const [extractedResult, setExtractedResult] = useState<string | null>(null);
  const [summarizedResult, setSummarizedResult] = useState<string | null>(null);
  const [insertionTarget, setInsertionTarget] = useState<InsertionTarget>('current');
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Helper function to check if there is unsaved content
  const hasUnsavedContent = useCallback(() => {
    return (extractedResult && extractedResult.trim() !== '') || (summarizedResult && summarizedResult.trim() !== '');
  }, [extractedResult, summarizedResult]);

  // Enhanced close handler with confirmation
  const handleCloseModal = useCallback(() => {
    if (hasUnsavedContent() && !isProcessing) {
      if (window.confirm('You have processed PDF content that hasn\'t been saved. Discard this content and close?')) {
        onClose();
      }
      // If user chooses not to discard, modal remains open
    } else {
      // No unsaved content or currently processing, close immediately
      onClose();
    }
  }, [hasUnsavedContent, isProcessing, onClose]);

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => {
        reject(error);
      };
    });
  };

  const resetInputStates = useCallback(() => {
    setSelectedFile(null);
    setPdfUrl('');
    setFileError(null);
    setUrlError(null);
    setIsDraggingOver(false);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }, []);

  const resetProcessingAndResults = useCallback(() => {
    setIsProcessing(false);
    setProcessingStatus(null);
    setExtractedResult(null);
    setSummarizedResult(null);
  }, []);

  const resetAllStates = useCallback(() => {
    if (hasUnsavedContent()) {
      if (window.confirm('This will clear all processed content. Are you sure?')) {
        resetInputStates();
        resetProcessingAndResults();
        setActiveTab('file');
        setProcessingType('extract');
        setInsertionTarget('current');
      }
    } else {
      resetInputStates();
      resetProcessingAndResults();
      setActiveTab('file');
      setProcessingType('extract');
      setInsertionTarget('current');
    }
  }, [resetInputStates, resetProcessingAndResults, hasUnsavedContent]);

  const validateFile = (file: File | null): boolean => {
    if (isProcessing) return true;
    if (!file) {
      setFileError('Please select a PDF file.');
      return false;
    }
    // Check file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.pdf')) {
      setFileError('Invalid file type. File must have a .pdf extension.');
      return false;
    }
    // Check MIME type
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setFileError('Invalid file type. Only PDF files are accepted (based on MIME type).');
      return false;
    }
    // Check file size
    if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
      setFileError(`File is too large. Maximum size is ${MAX_PDF_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
      return false;
    }
    setFileError(null);
    return true;
  };

  const validateUrl = (url: string): boolean => {
    if (isProcessing) return true;
    if (!url.trim()) {
      setUrlError('Please enter a PDF URL.');
      return false;
    }
    try {
      const newUrl = new URL(url);
      if (newUrl.protocol !== 'http:' && newUrl.protocol !== 'https:') {
        setUrlError('Invalid URL protocol. Must be http or https.');
        return false;
      }
      
      // Check for known PDF-serving domains that don't use .pdf extensions
      const hostname = newUrl.hostname.toLowerCase();
      const pathname = newUrl.pathname.toLowerCase();
      
      // Known PDF-serving patterns
      const isKnownPdfDomain = 
        // ArXiv PDFs
        (hostname.includes('arxiv.org') && pathname.startsWith('/pdf/')) ||
        // ResearchGate PDFs  
        (hostname.includes('researchgate.net') && pathname.includes('/publication/')) ||
        // IEEE Xplore PDFs
        (hostname.includes('ieee.org') && pathname.includes('/document/')) ||
        // ACM Digital Library PDFs
        (hostname.includes('acm.org') && pathname.includes('/doi/')) ||
        // Other domains that commonly serve PDFs via URL parameters or special paths
        pathname.includes('/pdf') ||
        newUrl.searchParams.has('pdf') ||
        // Direct .pdf file links
        pathname.endsWith('.pdf');
      
      if (!isKnownPdfDomain) {
        setUrlError('URL does not appear to point to a PDF. Please ensure the URL serves PDF content (e.g., direct .pdf links, arXiv, ResearchGate, IEEE, etc.).');
        return false;
      }
    } catch (_error) {
      setUrlError('Invalid URL format. Please ensure it is a complete and valid URL.');
      return false;
    }
    setUrlError(null);
    return true;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) return;
    const file = event.target.files && event.target.files[0];
    if (file) {
        setSelectedFile(file);
        resetProcessingAndResults();
        validateFile(file);
    } else {
        if (!selectedFile) setFileError('Please select a PDF file.');
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isProcessing) return;
    setIsDraggingOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isProcessing) return;
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
        return;
    }
    setIsDraggingOver(false);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isProcessing) return; 
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (isProcessing) return;

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      if (files.length > 1) {
        setFileError("Please drop only one PDF file at a time.");
        setSelectedFile(null);
        return;
      }
      const droppedFile = files[0];
      if (!ACCEPTED_FILE_TYPES.includes(droppedFile.type)) {
        setFileError('Invalid file type. Only PDF files are accepted.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(droppedFile);
      resetProcessingAndResults();
      validateFile(droppedFile);
    } else {
        setFileError('No file was dropped or the browser does not support this action.');
    }
  };

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) return;
    const newUrl = event.target.value;
    setPdfUrl(newUrl);
    resetProcessingAndResults();
    validateUrl(newUrl);
  };

  useEffect(() => {
    if (!isOpen) {
      resetAllStates();
    }
  }, [isOpen, resetAllStates]);

  useEffect(() => {
    if (!isProcessing && !extractedResult && !summarizedResult) {
        setFileError(null);
        setUrlError(null);
    } else if (isProcessing) {
        setFileError(null);
        setUrlError(null);
    }
  }, [activeTab, isProcessing, extractedResult, summarizedResult]);

  const handleProcessPDF = async (explicitProcessingType?: ProcessingType) => {
    console.log('[PDFModal] handleProcessPDF called.');
    console.log('[PDFModal] current isProcessing state:', isProcessing);
    if (isProcessing) {
      console.log('[PDFModal] Exiting: Already processing.');
      toast.info("Processing is already underway.");
      return;
    }

    const currentProcessingType = explicitProcessingType || processingType;

    let isValid = false;
    let requestBody: any = { processingType: currentProcessingType };

    console.log('[PDFModal] Active tab:', activeTab);

    if (activeTab === 'file') {
      console.log('[PDFModal] File tab selected. Selected file:', selectedFile);
      isValid = validateFile(selectedFile);
      console.log('[PDFModal] File validation result:', isValid, 'File error state:', fileError);
      if (!isValid || !selectedFile) {
        toast.error(fileError || 'Please select a valid PDF file.');
        console.log('[PDFModal] Exiting: File validation failed or no file selected.');
        return;
      }
      try {
        console.log('[PDFModal] Attempting to convert file to Base64...');
        const base64Pdf = await convertFileToBase64(selectedFile);
        requestBody.fileBlobBase64 = base64Pdf;
        requestBody.fileName = selectedFile.name;
        console.log('[PDFModal] File converted to Base64 successfully. FileName:', selectedFile.name);
      } catch (error) {
        console.error("[PDFModal] Error converting file to Base64:", error);
        toast.error("Error preparing file for processing. Check console for details.");
        setProcessingStatus("Error: Could not read file.");
        return;
      }
    } else if (activeTab === 'url') {
      console.log('[PDFModal] URL tab selected. PDF URL:', pdfUrl);
      isValid = validateUrl(pdfUrl);
      console.log('[PDFModal] URL validation result:', isValid, 'URL error state:', urlError);
      if (!isValid || !pdfUrl) {
        toast.error(urlError || 'Please enter a valid PDF URL.');
        console.log('[PDFModal] Exiting: URL validation failed or URL empty.');
        return;
      }
      requestBody.sourceUrl = pdfUrl;
      console.log('[PDFModal] URL is valid for processing.');
    } else {
      console.error('[PDFModal] Exiting: Invalid active tab:', activeTab);
      toast.error("Invalid tab selected. Please refresh and try again.");
      return;
    }

    console.log('[PDFModal] Proceeding to make API call. Request body (without fileBlobBase64 if too long):', { ...requestBody, fileBlobBase64: requestBody.fileBlobBase64 ? 'Present (too long to log)' : undefined });
    setIsProcessing(true);
    setProcessingStatus(`Starting ${currentProcessingType}...`);
    setExtractedResult(null);
    setSummarizedResult(null);

    const endpoint = currentProcessingType === 'summarize' ? '/api/pdf/summarize' : '/api/pdf/extract';
    console.log('[PDFModal] Target endpoint:', endpoint);

    try {
      console.log('[PDFModal] Entering TRY block for fetch.');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      console.log('[PDFModal] Fetch call completed. Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response from server.' }));
        console.error('[PDFModal] API Error Response:', errorData);
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[PDFModal] Successfully processed PDF. API Result:', result);
      setExtractedResult(result.extractedText || result.summary || result.text || 'No content found.');
      setSummarizedResult(result.summary || result.text || 'No summary found.');
      setProcessingStatus('Text processed successfully!');
      setFileError(null);
      setUrlError(null);
      toast.success('PDF processed successfully!');
    } catch (error: any) {
      console.error('[PDFModal] CATCH block: Error processing PDF:', error);
      const errorMessage = error.message || 'An unknown error occurred during PDF processing.';
      toast.error(`Error: ${errorMessage}`);
      setExtractedResult(null);
      setSummarizedResult(null);
      setProcessingStatus(`Error: ${errorMessage}`);
      if (activeTab === 'file') {
        setFileError(errorMessage);
      } else {
        setUrlError(errorMessage);
      }
    } finally {
      console.log('[PDFModal] FINALLY block: Setting isProcessing to false.');
      setIsProcessing(false);
    }
  };

  const handleInsertContent = async () => {
    if (!editorRef?.current) {
      toast.error("Editor instance not found.");
      return;
    }

    const contentToInsert = extractedResult;

    if (!contentToInsert) {
      toast.info("No content to insert.");
      return;
    }

    try {
      // Use improved preprocessing for consistent block creation
      const { preprocessAIContent } = await import('@/lib/utils/contentPreprocessing');
      const preprocessingResult = await preprocessAIContent(contentToInsert, editorRef.current);
      
      if (!preprocessingResult.success || preprocessingResult.blocks.length === 0) {
        toast.info("Content preprocessing failed or resulted in empty blocks. Nothing to insert.");
        return;
      }
      
      const blocksToInsert = preprocessingResult.blocks;

      const currentDocumentBlocks = editorRef.current.document;
      let insertedBlocks: any = [];
      if (currentDocumentBlocks.length === 0) {
        insertedBlocks = editorRef.current.insertBlocks(blocksToInsert, editorRef.current.getTextCursorPosition().block, 'before');
      } else {
        const lastBlock = currentDocumentBlocks[currentDocumentBlocks.length - 1];
        if (lastBlock) {
          insertedBlocks = editorRef.current.insertBlocks(blocksToInsert, lastBlock.id, 'after');
        } else {
          // Fallback if lastBlock is somehow undefined, though currentDocumentBlocks.length > 0
          insertedBlocks = editorRef.current.insertBlocks(blocksToInsert, editorRef.current.getTextCursorPosition().block, 'before');
        }
      }
      
      // Trigger highlighting for manually added PDF content
      if (setBlockStatus && Array.isArray(insertedBlocks)) {
        insertedBlocks.forEach((block: any) => {
          if (block?.id) {
            setBlockStatus(block.id, 'MODIFIED', 'insert');
          }
        });
      }
      
      // Use enhanced toast with block navigation
      if (Array.isArray(insertedBlocks) && insertedBlocks.length > 0) {
        const insertedBlockIds = insertedBlocks
          .map((block: any) => block?.id)
          .filter((id): id is string => Boolean(id));
        
        if (insertedBlockIds.length > 0) {
          const { createBlockStatusToast } = await import('@/lib/utils/aiToast');
          createBlockStatusToast(
            insertedBlockIds,
            'modified',
            'insert',
            `PDF content inserted (${insertedBlockIds.length} block${insertedBlockIds.length > 1 ? 's' : ''})`
          );
        } else {
          toast.success("Content inserted into the editor.");
        }
      } else {
        toast.success("Content inserted into the editor.");
      }
      onClose();
    } catch (error) {
      console.error("Error inserting content into BlockNote editor:", error);
      toast.error("Failed to insert content. See console for details.");
    }
  };

  const handleCreateNewDocumentWithContent = async () => {
    const contentToSave = extractedResult;
    if (!contentToSave) {
      toast.error("No content available to create a new document.");
      return;
    }

    setIsProcessing(true);
    setProcessingStatus("Creating new document...");

    let blocksForNewDocument: PartialBlock[];

    if (editorRef?.current) {
      try {
        // Use improved preprocessing for consistent block creation
        const { preprocessAIContent } = await import('@/lib/utils/contentPreprocessing');
        const preprocessingResult = await preprocessAIContent(contentToSave, editorRef.current);
        
        if (preprocessingResult.success && preprocessingResult.blocks.length > 0) {
          blocksForNewDocument = preprocessingResult.blocks;
        } else {
          // Fallback for failed preprocessing
          blocksForNewDocument = [{ type: 'paragraph', content: [{ type: 'text', text: contentToSave, styles: {} }] }];
        }
      } catch (parseError) {
        console.error("[PDFModal] Error preprocessing content, falling back to simple paragraph:", parseError);
        toast.info("Could not fully parse content for new document; formatting will be simplified.");
        blocksForNewDocument = [{ type: 'paragraph', content: [{ type: 'text', text: contentToSave, styles: {} }] }];
      }
    } else {
      console.warn("[PDFModal] Editor instance not available for preprocessing. Creating document with content in a single paragraph. Advanced formatting may be lost.");
      blocksForNewDocument = [{ type: 'paragraph', content: [{ type: 'text', text: contentToSave, styles: {} }] }];
    }

    // Ensure blocksForNewDocument is not empty if contentToSave was just whitespace or parsing failed completely
    if (blocksForNewDocument.length === 0 && contentToSave.trim() !== '') {
      // This case should ideally be caught above, but as a safeguard if blocksForNewDocument became empty unexpectedly
      blocksForNewDocument = [{ type: 'paragraph', content: [{ type: 'text', text: contentToSave, styles: {} }] }];
    } else if (blocksForNewDocument.length === 0) { // Handles if contentToSave was empty or parsing resulted in nothing valid
      toast.info("Content is effectively empty. Cannot create new document.");
      setIsProcessing(false);
      setProcessingStatus(null);
      return;
    }

    try {
      const response = await fetch('/api/documents/create-with-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: `PDF Extraction - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour12: false })}`,
          content: blocksForNewDocument 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Failed to create new document. Please try again.' } }));
        throw new Error(errorData.error?.message || 'Failed to create new document.');
      }
      const result = await response.json();
      const newDocumentId = result.data?.documentId;

      if (newDocumentId) {
        toast.success("New document created successfully!");
        router.push(`/editor/${newDocumentId}`);
        onClose();
      } else {
        throw new Error("Failed to get new document ID from server response.");
      }

    } catch (error: any) {
      console.error("Error creating new document:", error);
      toast.error(`Error creating new document: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
    }
  };

  const isSubmitButtonDisabled = 
    isProcessing || 
    (activeTab === 'file' && (!selectedFile || !!fileError)) || 
    (activeTab === 'url' && (!pdfUrl || !!urlError));

  const showResults = !!(extractedResult || summarizedResult);

  // Determine the actual processing type for the API call
  // 'extract' for "Full Text", 'summarize' for "Summarize (AI)"
  const apiProcessingType = processingType; // Keep as is, or map if state values change

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { handleCloseModal(); } }}>
      <DialogContent 
        className="bg-[var(--editor-bg)] text-[--text-color] p-0 max-w-2xl max-h-[95vh] flex flex-col gap-0"
        style={{ zIndex: 1050 }}
        onPointerDownOutside={(e) => {
          // Allow interaction with toasts
          if ((e.target as HTMLElement).closest('[data-sonner-toast]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
             // Allow interaction with toasts
          if ((e.target as HTMLElement).closest('[data-sonner-toast]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[--border-color]">
          <DialogTitle className="text-xl font-semibold">Process PDF</DialogTitle>
          <DialogDescription className="text-sm text-[--muted-text-color]">
            Upload a PDF file or provide a URL to extract text or generate an AI summary.
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-6 py-4 space-y-4">
          <Tabs 
            value={activeTab} 
            onValueChange={(newTab) => { 
              if (!isProcessing) setActiveTab(newTab); 
            }} 
            className="flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file" disabled={isProcessing}><UploadCloud className="mr-2 h-4 w-4" /> Upload File</TabsTrigger>
              <TabsTrigger value="url" disabled={isProcessing}><Link2 className="mr-2 h-4 w-4" /> From URL</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="mt-4">
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className={`p-6 py-1 border-2 border-dashed rounded-md text-center cursor-pointer transition-colors
                  ${isDraggingOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'}
                  ${fileError ? 'border-destructive bg-destructive/5' : ''}
                  ${isProcessing ? 'cursor-not-allowed opacity-60' : ''}
                `}
              >
                <Input 
                  ref={fileInputRef} 
                  id="pdf-file-upload" 
                  type="file" 
                  accept={ACCEPTED_FILE_TYPES.join(',')} 
                  onChange={handleFileChange} 
                  disabled={isProcessing} 
                  className="hidden"
                />
                <UploadCloud 
                  className={`mx-auto h-10 w-10 mb-3
                    ${isDraggingOver ? 'text-primary' : 'text-muted-foreground'}
                    ${fileError ? 'text-destructive' : ''}
                  `} 
                />
                <p className="text-sm text-muted-foreground">
                  <span className={`font-medium ${isDraggingOver || fileError ? (fileError ? 'text-destructive': 'text-primary') : 'text-foreground'}`}>
                    {isDraggingOver ? 'Drop your PDF here' : 'Drag & drop PDF or click to browse'}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Max file size: {MAX_PDF_FILE_SIZE_BYTES / (1024 * 1024)}MB. Only .pdf files.
                </p>
                {selectedFile && !fileError && !isDraggingOver && (
                  <p className="mt-2 text-xs text-green-600 font-medium">
                    Selected: {selectedFile.name}
                  </p>
                )}
                {fileError && !isDraggingOver && (
                  <p className="mt-2 text-sm text-destructive flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 mr-1.5 flex-shrink-0" /> {fileError}
                  </p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="url" className="mt-4">
              <div className="space-y-2">
                <Label htmlFor="pdf-url-input">PDF URL</Label>
                <Input id="pdf-url-input" type="url" placeholder="https://example.com/document.pdf" value={pdfUrl} onChange={handleUrlChange} disabled={isProcessing} className={`${urlError ? 'border-destructive' : ''}`} />
                {urlError && <p className="text-sm text-destructive flex items-center"><AlertCircle className="h-4 w-4 mr-1" /> {urlError}</p>}
                <p className="text-xs text-muted-foreground pt-1">Enter the direct URL to a publicly accessible PDF file.</p>
              </div>
            </TabsContent>
            <div className="space-y-2 mt-4">
              <Label>Processing Type</Label>
              <RadioGroup 
                value={processingType} 
                onValueChange={(value: string) => setProcessingType(value as ProcessingType)} 
                className="flex space-x-4"
                disabled={isProcessing || showResults} // Disable if processing or results are shown
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="extract" id="extract-text" />
                  <Label htmlFor="extract-text" className="font-normal">Full Text</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="summarize" id="summarize-ai" />
                  <Label htmlFor="summarize-ai" className="font-normal">Summarize (AI)</Label>
                </div>
              </RadioGroup>
            </div>
          </Tabs>
        </div>

        <div className="px-6 py-4 flex-grow overflow-y-auto min-h-[200px] border-t border-[--border-color]">
          {isProcessing && processingStatus ? (
            <div className="h-full flex flex-col items-center justify-center">
              <Loader2 size={28} className="animate-spin text-[--text-color]" />
              <p className="mt-3 text-sm text-[--muted-text-color]">{processingStatus}</p>
            </div>
          ) : showResults && extractedResult ? (
            <div className="p-3 border border-[--border-color] rounded-md bg-[--input-bg] prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words h-full">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{extractedResult}</ReactMarkdown>
            </div>
          ) : showResults && !extractedResult ? (
            <div className="p-3 border border-[--border-color] rounded-md bg-[--input-bg] h-full flex items-center justify-center">
              <p className="text-sm text-[--muted-text-color]">No content available to preview.</p>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-[--muted-text-color]">PDF content will appear here after processing.</p>
            </div>
          )}
        </div>
        
        <DialogFooter className="px-6 py-4 bg-[var(--subtle-bg)] border-t border-[--border-color] flex-wrap justify-between sm:justify-end gap-2">
          {!showResults ? (
            <>
              <Button
                onClick={() => handleProcessPDF(apiProcessingType)}
                disabled={isSubmitButtonDisabled}
                variant="default"
                className="order-1 sm:order-2 flex-1 sm:flex-initial min-w-[150px]"
              >
                {isProcessing ? (
                  <Loader2 size={16} className="mr-2 animate-spin" /> 
                ) : (
                  <BookOpenText size={16} className="mr-2" />
                )}
                {isProcessing ? 'Processing...' : 'Process PDF'}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center rounded-md order-1 sm:order-2" role="radiogroup" aria-labelledby="target-document-label-pdf">
                <span id="target-document-label-pdf" className="sr-only">Select target document</span>
                <Button
                  onClick={() => setInsertionTarget('current')}
                  variant={insertionTarget === 'current' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-r-none text-xs px-3"
                  disabled={!hasActiveDocument || isProcessing}
                  aria-pressed={insertionTarget === 'current'}
                >
                  Current Doc
                </Button>
                <Button
                  onClick={() => setInsertionTarget('new')}
                  variant={insertionTarget === 'new' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-l-none border-l-0 text-xs px-3"
                  disabled={isProcessing}
                  aria-pressed={insertionTarget === 'new'}
                >
                  New Doc
                </Button>
              </div>

              <Button
                onClick={() => {
                  if (insertionTarget === 'current') {
                    handleInsertContent();
                  } else {
                    handleCreateNewDocumentWithContent();
                  }
                }}
                disabled={
                  isProcessing ||
                  (insertionTarget === 'current' && !hasActiveDocument) ||
                  (!extractedResult && !summarizedResult)
                }
                variant="default"
                className="order-2 sm:order-3 flex-1 sm:flex-initial min-w-[180px]"
              >
                <FilePlus2 size={16} className="mr-2" />
                {insertionTarget === 'current' ? 'Insert to Current' : 'Create New Document'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 