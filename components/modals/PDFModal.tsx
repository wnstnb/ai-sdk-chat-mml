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
import { X, UploadCloud, Link2, AlertCircle, Loader2, FileText, BotMessageSquare, FilePlus2, ChevronDown } from 'lucide-react';
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
}

export const PDFModal: React.FC<PDFModalProps> = ({ isOpen, onClose }) => {
  const editorRef = useModalStore(state => state.editorRef);
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
  const [activePreviewTab, setActivePreviewTab] = useState<'summary' | 'fullText'>('summary');
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

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
    resetInputStates();
    resetProcessingAndResults();
    setActiveTab('file');
    setProcessingType('extract');
    setInsertionTarget('current');
    setActivePreviewTab('summary');
  }, [resetInputStates, resetProcessingAndResults]);

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
      if (!newUrl.pathname.toLowerCase().endsWith('.pdf')) {
        setUrlError('URL must point to a .pdf file.');
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
    if (!isProcessing) {
        setFileError(null);
        setUrlError(null);
    } else {
        setFileError(null);
        setUrlError(null);
        setExtractedResult(null);
        setSummarizedResult(null);
    }
  }, [activeTab, isProcessing]);

  const handleProcessPDF = async () => {
    if (isProcessing) return;
    let isValid = false;
    if (activeTab === 'file') {
      isValid = validateFile(selectedFile);
      if (!isValid || !selectedFile) return;
    } else if (activeTab === 'url') {
      isValid = validateUrl(pdfUrl);
      if (!isValid || !pdfUrl) return;
    }
    if (!isValid) return;

    setIsProcessing(true);
    const initialProcessingMessage = processingType === 'extract' ? 'Extracting text...' : 'Summarizing and extracting text...';
    setProcessingStatus(initialProcessingMessage);
    setExtractedResult(null);
    setSummarizedResult(null);

    try {
      let data;
      if (activeTab === 'file' && selectedFile) {
        setProcessingStatus('Converting and processing file...');
        const fileBase64 = await convertFileToBase64(selectedFile);
        const response = await fetch('/api/pdf/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileBlobBase64: fileBase64 }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to process PDF file.' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        data = await response.json();

      } else if (activeTab === 'url' && pdfUrl) {
        setProcessingStatus(`Fetching and processing PDF from URL...`);
        const response = await fetch('/api/pdf/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sourceUrl: pdfUrl }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to process PDF from URL.' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        data = await response.json();
      }

      if (data?.extractedText) {
        setExtractedResult(data.extractedText);
        if (processingType === 'summarize') {
          // TODO: Call summarization API if processingType is 'summarize'
          // For now, if summarize is selected with URL, we only have extracted text.
          // We can use a placeholder or inform user summarization for URL will be separate.
          // For this step, we assume /api/pdf/extract only gives extractedText.
          // So, for URL summarization, we will set a dummy summary for now.
          const dummySummarizedText = `Summary for ${pdfUrl} (actual summarization to be implemented via /api/pdf/summarize).`;
          setSummarizedResult(dummySummarizedText);
          setActivePreviewTab('summary');
           setProcessingStatus('Text extracted. Summarization step placeholder.');
        } else {
          setActivePreviewTab('fullText');
          setProcessingStatus('Text extracted successfully!');
        }
      } else {
        throw new Error('No extracted text received from server.');
      }

    } catch (error) {
      console.error("Error processing PDF:", error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      setProcessingStatus(`Error: ${errorMessage}`);
      toast.error(`Processing failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInsertContent = async () => {
    if (!editorRef?.current) {
      toast.error("Editor instance not found.");
      return;
    }

    const contentToInsert = activePreviewTab === 'summary' && summarizedResult ? summarizedResult : extractedResult;

    if (!contentToInsert) {
      toast.info("No content to insert.");
      return;
    }

    try {
      const blocksToInsert: PartialBlock[] = await editorRef.current.tryParseMarkdownToBlocks(contentToInsert);

      if (blocksToInsert.length === 0 && contentToInsert.trim() !== '') {
        // If parsing to blocks results in empty array but there was text, create a simple paragraph
        blocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: contentToInsert, styles: {} }] });
      }
      
      if (blocksToInsert.length === 0) {
        toast.info("Content parsed to empty blocks. Nothing to insert.");
        return;
      }

      const currentDocumentBlocks = editorRef.current.document;
      if (currentDocumentBlocks.length === 0) {
        editorRef.current.insertBlocks(blocksToInsert, editorRef.current.getTextCursorPosition().block, 'before');
      } else {
        const lastBlock = currentDocumentBlocks[currentDocumentBlocks.length - 1];
        if (lastBlock) {
          editorRef.current.insertBlocks(blocksToInsert, lastBlock.id, 'after');
        } else {
          // Fallback if lastBlock is somehow undefined, though currentDocumentBlocks.length > 0
          editorRef.current.insertBlocks(blocksToInsert, editorRef.current.getTextCursorPosition().block, 'before');
        }
      }
      toast.success("Content inserted into the editor.");
      onClose();
    } catch (error) {
      console.error("Error inserting content into BlockNote editor:", error);
      toast.error("Failed to insert content. See console for details.");
    }
  };

  const handleCreateNewDocumentWithContent = async () => {
    const contentToSave = activePreviewTab === 'summary' && summarizedResult ? summarizedResult : extractedResult;
    if (!contentToSave) {
      toast.error("No content available to create a new document.");
      return;
    }
    if (!editorRef?.current) {
        toast.error("Editor instance not available to format content.");
        return;
    }

    setIsProcessing(true); // Reuse isProcessing to indicate new doc creation process
    setProcessingStatus("Creating new document..."); // Update status message

    try {
      let blocksForNewDocument: PartialBlock[] = await editorRef.current.tryParseMarkdownToBlocks(contentToSave);

      if (blocksForNewDocument.length === 0 && contentToSave.trim() !== '') {
         blocksForNewDocument = [{ type: 'paragraph', content: [{ type: 'text', text: contentToSave, styles: {} }] }];
      }

      if (blocksForNewDocument.length === 0) {
        toast.info("Formatted content is empty. Cannot create new document.");
        setIsProcessing(false);
        setProcessingStatus(null);
        return;
      }

      // Simulate API call to create a new document
      // In a real app, this would be:
      const response = await fetch('/api/documents/create-with-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          // title: `PDF Import - ${new Date().toLocaleDateString()}`, // Optional: Add a title
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

  const showResults = !!(extractedResult || summarizedResult) && !isProcessing;

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[650px] md:max-w-[750px] lg:max-w-[850px] xl:max-w-[950px] flex flex-col h-[85vh] max-h-[900px]">
        <DialogHeader>
          <DialogTitle>Process PDF Document</DialogTitle>
          <DialogDescription>
            Extract text or summarize content from your PDF files by uploading or providing a URL.
          </DialogDescription>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute top-4 right-4" disabled={isProcessing}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <fieldset disabled={isProcessing && !showResults} className="flex-grow flex flex-col min-h-0">
          <div className="p-1 pr-3 space-y-4 mb-4">
            <Tabs value={activeTab} onValueChange={(newTab) => {if (!isProcessing) { setActiveTab(newTab); resetProcessingAndResults();}}} className="w-full">
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
                  className={`p-6 py-10 border-2 border-dashed rounded-md text-center cursor-pointer transition-colors
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
            </Tabs>

            <div className="space-y-2">
              <Label>Processing Type</Label>
              <RadioGroup defaultValue="extract" value={processingType} onValueChange={(value: string) => setProcessingType(value as ProcessingType)} className="flex space-x-4" disabled={isProcessing}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="extract" id="extract" />
                  <Label htmlFor="extract" className="font-normal">Extract Text</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="summarize" id="summarize" />
                  <Label htmlFor="summarize" className="font-normal">Summarize & Extract</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {(isProcessing || processingStatus || extractedResult || summarizedResult) && (
            <div className="border-t pt-4 flex-grow flex flex-col min-h-0">
              {isProcessing && (
                <div className="flex items-center justify-center p-4 space-x-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{processingStatus || 'Processing...'}</span>
                </div>
              )}
              {!isProcessing && processingStatus && !(extractedResult || summarizedResult) && (
                 <div className={`flex items-center justify-center p-4 space-x-2 text-sm ${processingStatus.includes('Error') || processingStatus.includes('Failed') ? 'text-destructive' : 'text-green-600'}`}>
                  <span>{processingStatus}</span>
                </div>
              )}

              {showResults && (
                <div className="flex-grow flex flex-col min-h-0">
                  {processingType === 'summarize' && summarizedResult && extractedResult && (
                    <Tabs value={activePreviewTab} onValueChange={(value) => setActivePreviewTab(value as 'summary' | 'fullText')} className="w-full flex-shrink-0 mb-2">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="summary" onClick={() => setActivePreviewTab('summary')}><BotMessageSquare className="mr-2 h-4 w-4" />Summary</TabsTrigger>
                        <TabsTrigger value="fullText" onClick={() => setActivePreviewTab('fullText')}><FileText className="mr-2 h-4 w-4" />Full Text</TabsTrigger>
                      </TabsList>
                      <TabsContent value="summary" className="mt-2 p-2 border rounded-md max-h-60 overflow-y-auto bg-muted/30">
                        {summarizedResult ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {summarizedResult}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Summary will appear here.</p>
                        )}
                      </TabsContent>
                      <TabsContent value="fullText" className="mt-2 p-2 border rounded-md max-h-60 overflow-y-auto bg-muted/30">
                        {extractedResult ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {extractedResult}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Extracted text will appear here.</p>
                        )}
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              )}
            </div>
          )}
        </fieldset>

        <DialogFooter className="mt-auto pt-4 border-t flex-col sm:flex-row sm:justify-between items-center">
          <div className="flex items-center space-x-2 mb-2 sm:mb-0">
            {showResults && (
              <>
                <Label htmlFor="insertion-target" className="text-sm">Insert to:</Label>
                <Select value={insertionTarget} onValueChange={(value) => setInsertionTarget(value as InsertionTarget)} disabled={isProcessing}>
                    <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder="Select target..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="current" disabled={!editorRef?.current}>Current Document</SelectItem>
                        <SelectItem value="new">New Document</SelectItem>
                    </SelectContent>
                </Select>
              </>
            )}
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
            <Button 
              onClick={
                processingType === 'extract' || processingType === 'summarize'
                  ? handleProcessPDF
                  : insertionTarget === 'current'
                    ? handleInsertContent
                    : handleCreateNewDocumentWithContent
              } 
              disabled={isProcessing || (!selectedFile && !pdfUrl) || !!fileError || !!urlError || (!extractedResult && !summarizedResult && (processingType !== 'extract' && processingType !== 'summarize'))}
              className="w-full"
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (insertionTarget === 'current' ? <FileText className="mr-2 h-4 w-4"/> : <FilePlus2 className="mr-2 h-4 w-4"/>)}
              {isProcessing ? 'Processing...' : (insertionTarget === 'current' ? 'Insert to Current' : 'Create New & Insert')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 