import React, { useState, useEffect, useCallback } from 'react';
import { X, FilePlus2, FilePenLine } from 'lucide-react';
import { useModalStore } from '@/stores/useModalStore';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
// import { type BlockNoteEditor, type PartialBlock } from '@blocknote/core'; // For later when inserting content
import { useRouter } from 'next/navigation'; // Added import
import { toast } from 'sonner';
import webScraperApiClient from '@/lib/services/webScrapeService';
import type { PartialBlock } from '@blocknote/core'; // Added import

interface WebScrapingModalProps {
  isOpen: boolean;
  onClose: () => void;
  // onScrape: (urls: string[], processingType: string) => Promise<any>; // Placeholder for actual scraping
  // onInsert: (target: 'new' | 'current', content: any) => void; // Placeholder for insertion
}

type TargetDocumentType = 'current' | 'new';

export const WebScrapingModal: React.FC<WebScrapingModalProps> = ({
  isOpen,
  onClose,
  // onScrape,
  // onInsert,
}) => {
  const editorRef = useModalStore(state => state.editorRef);
  const hasActiveDocument = !!editorRef?.current;
  const router = useRouter(); // Instantiated router

  const [urls, setUrls] = useState('');
  const [processingType, setProcessingType] = useState('full_text');
  const [scrapedContent, setScrapedContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [targetDocument, setTargetDocument] = useState<TargetDocumentType>('new');

  const prevIsOpenRef = React.useRef<boolean>(isOpen);

  // Effect to manage targetDocument based on document availability and modal state
  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current) { // Modal was previously closed and is now open
        if (hasActiveDocument) {
          setTargetDocument('current');
        } else {
          setTargetDocument('new');
        }
      } else { // Modal was already open
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
    setScrapedContent(null);
    
    try {
      // const result = await onScrape(urlsArray, processingType); // Use urlsArray here
      // Replace with actual API call using urlsArray
      // await new Promise(resolve => setTimeout(resolve, 1500)); 
      // const exampleContent = `Scraped content for: ${urlsArray.join(', ')}. Processing type: ${processingType}`;
      const response = await webScraperApiClient.scrapeWebContent(urlsArray, processingType as 'full_text' | 'summarize');
      
      let combinedContent = "";
      if (response.overallError) {
        combinedContent = `Error during scraping: ${response.overallError}`;
        toast.error(response.overallError);
      } else if (response.results && response.results.length > 0) {
        response.results.forEach(result => {
          if (result.status === 'success') {
            combinedContent += `URL: ${result.url}\nTitle: ${result.title || 'N/A'}\nContent:\n${result.content || 'No content extracted.'}\n\n---\n\n`;
          } else {
            combinedContent += `URL: ${result.url}\nError: ${result.error || 'Unknown error for this URL.'}\n\n---\n\n`;
          }
        });
        toast.success('Content scraped successfully!');
      } else {
        combinedContent = "No content was returned from scraping.";
        toast.info("Scraping finished, but no content was returned.");
      }
      setScrapedContent(combinedContent.trim());
    } catch (error: any) {
      console.error('Error scraping content:', error);
      const errorMessage = error.message || 'Failed to scrape content. See console for details.';
      toast.error(errorMessage);
      setScrapedContent(`Error fetching content: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsert = async (content: string | null, target: TargetDocumentType) => {
    if (!content) {
        toast.error("No content to insert.");
        return;
    }

    setIsLoading(true);

    if (target === 'current') {
        if (!hasActiveDocument || !editorRef?.current) {
            toast.error("No active document to insert into. Please open a document or choose 'Insert into New Document'.");
            setIsLoading(false);
            return;
        }
        try {
            const editor = editorRef.current;
            let blocksToInsert: PartialBlock[] = await editor.tryParseMarkdownToBlocks(content);
            if (blocksToInsert.length === 0 && content.trim() !== '') {
                blocksToInsert = [{ type: 'paragraph', content: content.trim() }];
            }

            if (blocksToInsert.length > 0) {
                const currentPosition = editor.getTextCursorPosition();
                const referenceBlock = currentPosition.block || editor.document[editor.document.length - 1];
                editor.insertBlocks(blocksToInsert, referenceBlock || editor.document[0], referenceBlock ? 'after' : 'before');
                toast.success('Content inserted into current document.');
            } else {
                toast.info("No content to insert after formatting.");
            }
            onClose();
        } catch (error) {
            console.error("Error inserting content into current document:", error);
            toast.error("Failed to insert content. See console for details.");
        }
    } else { // target === 'new'
        try {
            let blocksToInsert: PartialBlock[] = [];
            if (editorRef?.current) { // Use editor to parse if available
                blocksToInsert = await editorRef.current.tryParseMarkdownToBlocks(content);
            }
            // Fallback if editor not available or parsing fails but content exists
            if (blocksToInsert.length === 0 && content.trim() !== '') {
                blocksToInsert = [{ type: 'paragraph', content: content.trim() }];
            }

            if (blocksToInsert.length === 0) {
                toast.info("No content available to create a new document after formatting.");
                setIsLoading(false);
                return;
            }

            const response = await fetch('/api/documents/create-with-content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    // Title could be derived or set to a default
                    title: `Scraped Content - ${new Date().toLocaleDateString()}`,
                    content: blocksToInsert,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: 'Failed to create new document.' } }));
                throw new Error(errorData.error?.message || 'Failed to create new document.');
            }

            const result = await response.json();
            const newDocumentId = result.data?.documentId;

            if (!newDocumentId) {
                throw new Error('Failed to get new document ID from response.');
            }

            toast.success('New document created successfully with scraped content!');
            router.push(`/editor/${newDocumentId}`);
            onClose();
        } catch (error: any) {
            console.error('Error creating new document with content:', error);
            toast.error(error.message || 'An unexpected error occurred while creating the document.');
        }
    }
    setIsLoading(false);
  };

  const handleCloseModal = () => {
    // Reset state if needed, or just close
    // setUrls('');
    // setProcessingType('full_text');
    // setScrapedContent(null);
    // setIsLoading(false);
    onClose();
  }

  if (!isOpen) {
    return null;
  }

  const numUrls = urls.split(',').map(url => url.trim()).filter(url => url).length;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out"
      onClick={handleCloseModal}
    >
      <div
        className="bg-[var(--editor-bg)] p-6 rounded-lg shadow-xl w-full max-w-2xl flex flex-col text-[var(--text-color)] transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modalFadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <h2 className="text-xl font-semibold">Web Scrape Content</h2>
          <button
            onClick={handleCloseModal}
            className="p-1 rounded-full hover:bg-[var(--hover-bg)] text-[var(--text-color)]"
            aria-label="Close web scraping modal"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 mb-6 flex-grow overflow-y-auto pr-2">
          <div>
            <Label htmlFor="urls-input" className="block text-sm font-medium text-[var(--muted-text-color)] mb-1">
              Enter URL(s)
            </Label>
            <Input
              id="urls-input"
              type="text"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="https://example.com, https://another.com"
              className="bg-[var(--input-bg)] border-[var(--border-color)] focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)]"
              disabled={isLoading}
            />
            <p className="text-xs text-[var(--muted-text-color)] mt-1">
              Enter one or more URLs, separated by commas.
            </p>
          </div>

          {numUrls > 0 && (
            <div>
              <Label className="block text-sm font-medium text-[var(--muted-text-color)] mb-2">
                Processing Options
              </Label>
              {numUrls > 1 ? (
                <div className="p-3 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)]">
                  <p className="text-sm">Get Full Text Content for all {numUrls} URLs.</p>
                  {/* Implicitly set processingType to 'full_text_multiple' or handle in backend */}
                </div>
              ) : (
                <RadioGroup
                  value={processingType}
                  onValueChange={setProcessingType}
                  className="space-y-2"
                  disabled={isLoading}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="full_text" id="full_text" className="text-[var(--primary-color)] border-[var(--border-color)]" />
                    <Label htmlFor="full_text" className="font-normal">Get Full Text Content</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="summarize" id="summarize" className="text-[var(--primary-color)] border-[var(--border-color)]" />
                    <Label htmlFor="summarize" className="font-normal">Get Text Snippet & AI Summary</Label>
                  </div>
                </RadioGroup>
              )}
            </div>
          )}
          
          <Button 
            onClick={handleScrape} 
            disabled={isLoading || !urls.trim()}
            className="w-full bg-[var(--primary-color)] text-[var(--button-text-color)] hover:bg-[var(--primary-color-hover)] disabled:opacity-60"
          >
            {isLoading ? (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[var(--button-text-color)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : null}
            {isLoading ? 'Scraping...' : 'Scrape Content'}
          </Button>

          {scrapedContent && (
            <div className="mt-4 p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-bg)] max-h-60 overflow-y-auto">
              <h3 className="text-sm font-semibold mb-2">Scraped Content Preview:</h3>
              <pre className="text-xs whitespace-pre-wrap break-all">{scrapedContent}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 flex-shrink-0 pt-4 border-t border-[var(--border-color)]">
          <Button
            onClick={handleCloseModal}
            variant="outline"
            className="border-[var(--border-color)] hover:bg-[var(--hover-bg)]"
            disabled={isLoading}
          >
            Cancel
          </Button>
          {scrapedContent && (
            <>
              <Button
                onClick={() => handleInsert(scrapedContent, 'new')}
                className="bg-[var(--secondary-color)] text-[var(--button-text-color)] hover:bg-[var(--secondary-color-hover)] disabled:opacity-60 flex items-center"
                disabled={isLoading}
              >
                <FilePlus2 className="mr-2 h-4 w-4" />
                Insert into New Document
              </Button>
              <Button
                onClick={() => handleInsert(scrapedContent, 'current')}
                className="bg-[var(--primary-color)] text-[var(--button-text-color)] hover:bg-[var(--primary-color-hover)] disabled:opacity-60 flex items-center"
                disabled={isLoading || !hasActiveDocument}
                title={!hasActiveDocument ? "No active document to insert into." : "Insert into current document"}
              >
                <FilePenLine className="mr-2 h-4 w-4" />
                Insert into Current Document
              </Button>
            </>
          )}
        </div>
      </div>
      {/* Keyframes for modal animation (same as VersionHistoryModal) */}
      <style jsx global>{`
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-modalFadeIn {
          animation: modalFadeIn 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default WebScrapingModal; 