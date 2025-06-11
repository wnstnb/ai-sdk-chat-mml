import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, FilePlus2, FilePenLine, Shovel, Loader2 } from 'lucide-react';
import { useModalStore } from '@/stores/useModalStore';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { BlockNoteEditor, type PartialBlock, BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import webScraperApiClient from '@/lib/services/webScrapeService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ScrapedUrlResult {
  url: string;
  title?: string;
  content?: string;
  rawHtml?: string;
  processedDate: string;
  error?: string;
  status: 'success' | 'error' | 'pending';
}

interface WebScrapingModalProps {
  isOpen: boolean;
  onClose: () => void;
  setBlockStatus?: (blockId: string, status: any, action?: 'insert' | 'update' | 'delete', message?: string) => void;
}

type TargetDocumentType = 'current' | 'new';

const BNSchema = BlockNoteSchema.create({ blockSpecs: defaultBlockSpecs });

export const WebScrapingModal: React.FC<WebScrapingModalProps> = ({
  isOpen,
  onClose,
  setBlockStatus: propSetBlockStatus,
}) => {
  const editorRef = useModalStore(state => state.editorRef as React.RefObject<BlockNoteEditor | null> | null);
  const storeSetBlockStatus = useModalStore(state => state.setBlockStatus);
  const setBlockStatus = propSetBlockStatus || storeSetBlockStatus;
  const hasActiveDocument = !!editorRef?.current;
  const router = useRouter();

  const [urls, setUrls] = useState('');
  const [processingType, setProcessingType] = useState<'full_text' | 'summarize'>('full_text');
  const [scrapedResults, setScrapedResults] = useState<ScrapedUrlResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [targetDocument, setTargetDocument] = useState<TargetDocumentType>('new');

  const prevIsOpenRef = React.useRef<boolean>(isOpen);
  const scrapedContentAreaRef = useRef<HTMLDivElement>(null);

  // Helper function to check if there is unsaved content
  const hasUnsavedContent = useCallback(() => {
    return scrapedResults && scrapedResults.length > 0 && scrapedResults.some(result => result.status === 'success' && result.content);
  }, [scrapedResults]);

  // Enhanced close handler with confirmation
  const handleCloseModal = useCallback(() => {
    if (hasUnsavedContent() && !isLoading) {
      if (window.confirm('You have scraped content that hasn\'t been saved. Discard this content and close?')) {
        onClose();
      }
      // If user chooses not to discard, modal remains open
    } else {
      // No unsaved content or currently loading, close immediately
      onClose();
    }
  }, [hasUnsavedContent, isLoading, onClose]);

  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current) {
        if (hasActiveDocument) {
          setTargetDocument('current');
        } else {
          setTargetDocument('new');
        }
        setUrls('');
        setScrapedResults(null);
        setIsLoading(false);
      } else {
        if (!hasActiveDocument && targetDocument === 'current') {
          setTargetDocument('new');
        }
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, hasActiveDocument, targetDocument]);

  const handleScrape = async () => {
    const urlsArray = urls
      .split(',')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (urlsArray.length === 0) {
      toast.error('Please enter at least one valid URL.');
      return;
    }

    const invalidUrls = urlsArray.filter(url => !url.startsWith('http://') && !url.startsWith('https://'));
    if (invalidUrls.length > 0) {
      toast.error(`Invalid URL(s) found: ${invalidUrls.join(', ')}. Please ensure URLs start with http:// or https://.`);
      return;
    }

    setIsLoading(true);
    setScrapedResults(null);
    
    try {
      const response = await webScraperApiClient.scrapeWebContent(urlsArray, processingType);
      
      if (response.overallError) {
        toast.error(`Scraping failed: ${response.overallError}`);
        setScrapedResults(response.results || [{
          url: urlsArray.join(', '),
          status: 'error',
          error: response.overallError,
          processedDate: new Date().toISOString(),
        }]);
      } else if (response.results && response.results.length > 0) {
        setScrapedResults(response.results);
        toast.success('Content scraped successfully! Review below and choose an action.');
      } else {
        toast.info("Scraping finished, but no content or specific errors were returned.");
        setScrapedResults([]);
      }
    } catch (error: any) {
      console.error('Error scraping content:', error);
      setScrapedResults([{
        url: urlsArray.join(', '),
        status: 'error',
        error: error.message || 'Client-side error during scraping operation.',
        processedDate: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsert = async (resultsToInsert: ScrapedUrlResult[] | null, target: TargetDocumentType) => {
    if (!resultsToInsert || resultsToInsert.length === 0) {
        toast.error("No content to insert.");
        return;
    }

    let editorForParsing: BlockNoteEditor | null = null;

    if (target === 'current') {
      if (!editorRef?.current) {
        toast.error("Editor instance not available for 'current document'. Please open a document.");
        setIsLoading(false);
        return;
      }
      editorForParsing = editorRef.current;
    } else { // target === 'new'
      // For new documents, create a temporary editor instance for parsing
      // This doesn't need to be rendered or attached to a DOM element.
      editorForParsing = BlockNoteEditor.create({ schema: BNSchema });
    }

    if (!editorForParsing) { // Should not happen if logic above is correct, but as a safeguard
        toast.error("Failed to initialize editor for parsing Markdown.");
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    let allBlocksToInsert: PartialBlock[] = [];

    for (const result of resultsToInsert) {
      if (result.status === 'success' && result.content) {
        allBlocksToInsert.push({
          type: 'heading',
          props: { level: 3 }, 
          content: [{ type: 'text', text: `Content from: ${result.url}`, styles: {} }],
        });
        if (result.title) {
            allBlocksToInsert.push({
                type: 'paragraph',
                content: [{ type: 'text', text: `Title: ${result.title}`, styles: {italic: true} }],
            });
        }

        try {
          // Use the determined editorForParsing instance
          let parsedContentBlocks: PartialBlock[] = await editorForParsing.tryParseMarkdownToBlocks(result.content);
          if (parsedContentBlocks.length === 0 && result.content.trim() !== '') {
            parsedContentBlocks = [{ type: 'paragraph', content: [{ type: 'text', text: result.content.trim(), styles: {} }] }];
          }
          allBlocksToInsert.push(...parsedContentBlocks);
        } catch (parseError) {
          console.error(`Error parsing Markdown for ${result.url}:`, parseError);
          allBlocksToInsert.push({
            type: 'paragraph',
            content: [{ type: 'text', text: `Error parsing content for ${result.url}. Raw content:\n${result.content.trim()}`, styles: {} }],
          });
        }
        allBlocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: '---', styles: {} }] });
      } else if (result.error) {
         allBlocksToInsert.push({
          type: 'heading',
          props: { level: 3 }, 
          content: [{ type: 'text', text: `Failed to scrape: ${result.url}`, styles: {} }],
        });
        allBlocksToInsert.push({
          type: 'paragraph',
          content: [{ type: 'text', text: `Error: ${result.error}`, styles: { bold: true } }], 
        });
        allBlocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: '---', styles: {} }] });
      }
    }

    if (allBlocksToInsert.length === 0) {
        toast.info("No processable content found to insert after formatting.");
        setIsLoading(false);
        return;
    }

    if (target === 'current') {
        if (!editorRef?.current) { // Re-check active editor for actual insertion
             toast.error("No active document to insert into. Please open a document.");
             setIsLoading(false);
             return;
        }
        try {
            const activeEditor = editorRef.current;
            const currentPosition = activeEditor.getTextCursorPosition();
            const referenceBlock = currentPosition.block || activeEditor.document[activeEditor.document.length - 1];
            const insertedBlocks = activeEditor.insertBlocks(allBlocksToInsert, referenceBlock || activeEditor.document[0], referenceBlock ? 'after' : 'before');
            
            // Trigger highlighting for manually added web scraped content
            if (setBlockStatus && Array.isArray(insertedBlocks)) {
              insertedBlocks.forEach((block: any) => {
                if (block?.id) {
                  setBlockStatus(block.id, 'MODIFIED', 'insert');
                }
              });
            }
            
            toast.success('Content inserted into current document.');
            onClose();
        } catch (error) {
            console.error("Error inserting content into current document:", error);
            toast.error("Failed to insert content. See console for details.");
        }
    } else { // target === 'new'
        try {
            const response = await fetch('/api/documents/create-with-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `Scraped Content - ${new Date().toLocaleDateString()}`,
                    content: allBlocksToInsert,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: 'Failed to create new document.' } }));
                throw new Error(errorData.error?.message || 'Failed to create new document.');
            }
            const result = await response.json();
            const newDocumentId = result.data?.documentId;
            if (!newDocumentId) throw new Error('Failed to get new document ID.');
            
            toast.success('New document created successfully!');
            router.push(`/editor/${newDocumentId}`);
            onClose();
        } catch (error: any) {
            console.error('Error creating new document with content:', error);
            toast.error(error.message || 'An unexpected error occurred.');
        }
    }
    setIsLoading(false);
  };

  const handleClear = () => {
    if (hasUnsavedContent()) {
      if (window.confirm('This will clear all scraped content. Are you sure?')) {
        setUrls('');
        setScrapedResults(null);
        toast.info("Cleared URLs and scraped content.");
      }
    } else {
      setUrls('');
      setScrapedResults(null);
      toast.info("Cleared URLs and scraped content.");
    }
  };

  useEffect(() => {
    if (scrapedResults && scrapedContentAreaRef.current) {
      scrapedContentAreaRef.current.scrollTop = 0;
    }
  }, [scrapedResults]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(openState) => { if (!openState) handleCloseModal(); }}>
      <DialogContent 
        className="bg-[var(--editor-bg)] text-[--text-color] p-6 max-w-2xl max-h-[90vh] flex flex-col"
        style={{ zIndex: 1050 }}
      >
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold text-[--text-color]">Web Scrape Content</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mb-4">
          <div>
            <Label htmlFor="urls-input" className="block text-sm font-medium text-[--text-color] mb-1">
              Enter URLs (comma-separated)
            </Label>
            <Input
              id="urls-input"
              type="text"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="e.g., https://example.com, https://another.com"
              className="bg-[--input-bg] text-[--text-color] border-[--border-color]"
            />
          </div>
          <div>
            <Label className="block text-sm font-medium text-[--text-color] mb-1">Processing Type</Label>
            <RadioGroup
              value={processingType}
              onValueChange={(value: 'full_text' | 'summarize') => setProcessingType(value)}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full_text" id="full_text" />
                <Label htmlFor="full_text" className="text-[--text-color]">Full Text</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="summarize" id="summarize" />
                <Label htmlFor="summarize" className="text-[--text-color]">Summarize (AI)</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <div className="flex space-x-2 mb-4">
          <Button onClick={handleScrape} disabled={isLoading} className="flex-1">
            {isLoading ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Shovel size={16} className="mr-2" />
            )}
            {isLoading ? 'Scraping...' : 'Scrape Content'}
          </Button>
          <Button onClick={handleClear} variant="outline" disabled={isLoading}>
            Clear
          </Button>
        </div>
        
        {scrapedResults && (
          <div className="flex-grow overflow-y-auto border border-[--border-color] p-3 rounded-md bg-[--input-bg] mb-4 min-h-[200px]" ref={scrapedContentAreaRef}>
            {scrapedResults.length === 0 && <p className="text-[--muted-text-color]">No content or errors to display.</p>}
            {scrapedResults.map((result, index) => (
              <div key={index} className="mb-4 pb-4 border-b border-[--border-color] last:border-b-0 last:pb-0 text-[--text-color]">
                <h4 className="font-semibold">URL: <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{result.url}</a></h4>
                {result.title && <p className="text-sm italic">Title: {result.title}</p>}
                {result.status === 'success' && result.content && (
                  <div className="mt-2 prose prose-sm max-w-none text-[--text-color] dark:prose-invert 
                                  prose-headings:text-[--text-color] prose-p:text-[--text-color] 
                                  prose-strong:text-[--text-color] prose-em:text-[--text-color]
                                  prose-a:text-blue-500 prose-blockquote:text-[--muted-text-color]
                                  prose-code:text-[--text-color] prose-li:text-[--text-color]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
                  </div>
                )}
                {result.error && (
                  <p className="mt-2 text-red-500 text-sm">Error: {result.error}</p>
                )}
                <p className="text-xs text-[--muted-text-color] mt-1">Status: {result.status} | Processed: {new Date(result.processedDate).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}

        {scrapedResults && scrapedResults.length > 0 && (
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mt-auto pt-4 border-t border-[--border-color]">
            <div className="flex items-center space-x-2">
              <Label htmlFor="target-doc" className="text-sm text-[--text-color]">Insert into:</Label>
              <RadioGroup
                id="target-doc"
                value={targetDocument}
                onValueChange={(value: TargetDocumentType) => setTargetDocument(value)}
                className="flex"
                disabled={isLoading}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="current" id="current-doc" disabled={!hasActiveDocument || isLoading} />
                  <Label htmlFor="current-doc" className={`text-sm ${!hasActiveDocument ? 'text-[--muted-text-color]' : 'text-[--text-color]'}`}>Current Document</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="new-doc" disabled={isLoading} />
                  <Label htmlFor="new-doc" className="text-sm text-[--text-color]">New Document</Label>
                </div>
              </RadioGroup>
            </div>
            <Button 
              onClick={() => handleInsert(scrapedResults, targetDocument)} 
              disabled={isLoading || !scrapedResults || scrapedResults.filter(r => r.status === 'success' && r.content).length === 0 || (targetDocument === 'current' && !hasActiveDocument) }
              className="flex-1 sm:flex-none"
            >
              {targetDocument === 'current' ? <FilePenLine size={18} className="mr-2" /> : <FilePlus2 size={18} className="mr-2" />}
              {isLoading ? 'Processing...' : (targetDocument === 'current' ? 'Insert into Current' : 'Create New with Content')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WebScrapingModal; 