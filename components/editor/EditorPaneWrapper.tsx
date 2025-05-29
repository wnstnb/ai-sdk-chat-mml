import React from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import type { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { ChatInputUI } from './ChatInputUI'; // Assuming it's in the same directory
import { PinnedMessageBubble } from './PinnedMessageBubble'; // Import the new component
import { Button } from "@/components/ui/button"; // For the toggle icon button
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageSquare } from 'lucide-react'; // Icon for collapsed state toggle
import type { TaggedDocument } from '@/lib/types';

// Dynamically import BlockNoteEditorComponent with SSR disabled
// Define loading state consistent with page.tsx
const BlockNoteEditorComponent = dynamic(
    () => import('@/components/BlockNoteEditorComponent'),
    {
        ssr: false,
        loading: () => <p className="p-4 text-center text-[--muted-text-color]">Loading Editor...</p>,
    }
);

// Define props required by the EditorPaneWrapper and its potential children
interface EditorPaneWrapperProps {
    // For BlockNoteEditorComponent
    documentId: string; // Needed for key prop
    initialContent: PartialBlock<any>[] | undefined;
    editorRef: React.RefObject<BlockNoteEditor<any>>; 
    onEditorContentChange: (editor: BlockNoteEditor<any>) => void; // Renamed from handleEditorChange
    
    // For Collapsed Chat Input section
    isChatCollapsed: boolean;
    // NEW props for pinned message bubble
    lastMessageContent?: string | any; // Can be string or complex content part array
    lastAssistantMessageId?: string; // NEW: ID of the last assistant message for keying
    handleSendToEditor: (content: string) => Promise<void>; // Or appropriate return type
    // END NEW props
    
    // Props for the collapsed ChatInputUI (similar to ChatInputArea)
    // From useChatInteractions
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
    isLoading: boolean; 
    model: string;
    setModel: React.Dispatch<React.SetStateAction<string>>;
    stop: () => void;
    // From useFileUpload
    files: FileList | null;
    handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handlePaste: (event: React.ClipboardEvent<Element>) => void;
    handleUploadClick: () => void;
    isUploading: boolean;
    uploadError: string | null;
    uploadedImagePath: string | null;
    // From useFollowUpStore
    followUpContext: string | null;
    setFollowUpContext: (context: string | null) => void;
    // Refs needed by ChatInputUI or form
    formRef: React.RefCallback<HTMLFormElement>;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    fileInputRef: React.RefObject<HTMLInputElement>;
    // General event handlers
    handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;

    // --- NEW AUDIO PROPS ADDED ---
    isRecording: boolean;
    isTranscribing: boolean;
    micPermissionError: boolean;
    startRecording: () => void;
    stopRecording: (timedOut?: boolean) => void;
    // --- END NEW AUDIO PROPS ---
    // --- ADD AUDIO VISUALIZATION PROP ---
    audioTimeDomainData: Uint8Array | null;
    // --- END AUDIO VISUALIZATION PROP ---
    // --- ADD CLEAR PREVIEW PROP --- 
    clearPreview: () => void;
    // --- END CLEAR PREVIEW PROP ---
    // --- NEW: Props for shared tagged documents ---
    taggedDocuments: TaggedDocument[];
    setTaggedDocuments: React.Dispatch<React.SetStateAction<TaggedDocument[]>>;
    // --- END NEW ---

    /** Mini chat history pane state & toggle */
    isMiniPaneOpen: boolean;
    onToggleMiniPane: () => void;
}

export const EditorPaneWrapper: React.FC<EditorPaneWrapperProps> = ({
    documentId,
    initialContent,
    editorRef,
    onEditorContentChange,
    isChatCollapsed,
    // Destructure new props
    lastMessageContent,
    lastAssistantMessageId,
    handleSendToEditor,
    // Destructure all props needed for collapsed ChatInputUI
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    model,
    setModel,
    stop,
    files,
    handleFileChange,
    handlePaste,
    handleUploadClick,
    isUploading,
    uploadError,
    uploadedImagePath,
    followUpContext,
    setFollowUpContext,
    formRef,
    inputRef,
    fileInputRef,
    handleKeyDown,
    // --- NEW AUDIO PROPS DESTRUCTURED ---
    isRecording,
    isTranscribing,
    micPermissionError,
    startRecording,
    stopRecording,
    // --- END NEW AUDIO PROPS DESTRUCTURED ---
    // --- DESTRUCTURE AUDIO VISUALIZATION PROP ---
    audioTimeDomainData,
    // --- END AUDIO VISUALIZATION PROP ---
    // --- DESTRUCTURE CLEAR PREVIEW PROP ---
    clearPreview,
    // --- END DESTRUCTURE CLEAR PREVIEW PROP ---
    // --- NEW: Destructure shared tagged documents props ---
    taggedDocuments,
    setTaggedDocuments,
    isMiniPaneOpen,
    onToggleMiniPane,
    // --- END NEW ---
}) => {
    // State for the pinned message bubble collapse state
    const [isMessageBubbleCollapsed, setIsMessageBubbleCollapsed] = React.useState(false);

    // Handler to add a tagged document (uses prop setter)
    const handleAddTaggedDocument = (docToAdd: TaggedDocument) => {
        setTaggedDocuments((prevDocs) => {
            // Prevent duplicates
            if (prevDocs.find(doc => doc.id === docToAdd.id)) {
                return prevDocs;
            }
            return [...prevDocs, docToAdd];
        });
    };

    // Handler to remove a tagged document (uses prop setter)
    const handleRemoveTaggedDocument = (docIdToRemove: string) => {
        setTaggedDocuments((prevDocs) => 
            prevDocs.filter(doc => doc.id !== docIdToRemove)
        );
    };

    // Effect to auto-collapse message bubble when follow-up context appears
    React.useEffect(() => {
        if (followUpContext) {
            setIsMessageBubbleCollapsed(true);
        }
    }, [followUpContext]);

    // NEW: Effect to show bubble for new messages
    React.useEffect(() => {
        // If a new assistant message arrives (indicated by ID change)
        // and there's no follow-up context,
        // ensure the message bubble is not considered "collapsed" from a previous message.
        if (lastAssistantMessageId && !followUpContext) {
            setIsMessageBubbleCollapsed(false);
        }
    }, [lastAssistantMessageId, followUpContext]);

    // Memoize the toggle button element to avoid re-creating it on every render
    const collapsedMessageToggle = React.useMemo(() => {
        if (!lastMessageContent) return null;

        // Extract text for tooltip preview
        const textPreview = typeof lastMessageContent === 'string' 
            ? lastMessageContent 
            : (lastMessageContent as any)?.text || "View last message";

        return (
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground" // Match other input action buttons style/size
                            onClick={() => setIsMessageBubbleCollapsed(false)}
                            aria-label="Show last message"
                        >
                            <MessageSquare size={18} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[300px] whitespace-pre-wrap break-words bg-background text-foreground border shadow-md">
                        <p className="line-clamp-3">{textPreview}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }, [lastMessageContent]); // Re-create only if last message content changes

    // Mini pane toggle button – always visible when chat is collapsed
    const miniPaneToggle = React.useMemo(() => (
        <TooltipProvider delayDuration={100}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={onToggleMiniPane}
                        aria-label={isMiniPaneOpen ? 'Hide chat history' : 'Show chat history'}
                    >
                        <MessageSquare size={18} className={isMiniPaneOpen ? 'text-primary' : ''} />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-background text-foreground border shadow-md">
                    {isMiniPaneOpen ? 'Hide chat history' : 'Show chat history'}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    ), [isMiniPaneOpen, onToggleMiniPane]);

    return (
        <div className="flex-1 flex flex-col relative bg-[--editor-bg] overflow-hidden">
            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto py-4 px-0 styled-scrollbar border-t border-[--border-color]">
                {initialContent !== undefined ? (
                    <BlockNoteEditorComponent
                        key={documentId} 
                        editorRef={editorRef}
                        initialContent={initialContent}
                        onEditorContentChange={onEditorContentChange} 
                    />
                ) : (
                    // Consistent loading state
                    <p className="p-4 text-center text-[--muted-text-color]">Initializing editor...</p>
                )}
            </div>

            {/* Collapsed Chat Input (Rendered conditionally at the bottom) */}
            {isChatCollapsed && (
                // Apply width constraints and centering to this relative parent
                <div className="relative max-w-[800px] mx-auto w-full">
                    {/* Conditional Rendering for Bubbles */} 
                    {!followUpContext && lastMessageContent && !isMessageBubbleCollapsed && (
                         <div className="w-full mb-2">
                             <PinnedMessageBubble 
                                key={lastAssistantMessageId}
                                messageContent={lastMessageContent} 
                                onSendToEditor={handleSendToEditor} 
                                onCollapse={() => setIsMessageBubbleCollapsed(true)}
                             />
                         </div>
                    )}

                    {/* Restore original Follow Up Context styling from ChatInputArea */}
                    {followUpContext && (
                        <div className="w-full mb-2 p-2 border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 rounded-md relative text-sm text-blue-800 dark:text-blue-200">
                            <button 
                                type="button"
                                onClick={() => setFollowUpContext(null)}
                                className="absolute top-1 right-1 p-0.5 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800"
                                title="Clear follow-up context"
                            >
                                <X size={14} />
                            </button>
                            <p className="font-medium mb-1 text-blue-600 dark:text-blue-300">Follow-up Context:</p>
                            <p className="line-clamp-2">{followUpContext}</p>
                        </div>
                    )}
                    
                    {/* --- NEW: Render Tagged Document Pills - REMOVE/COMMENT OUT THIS BLOCK --- */}
                    {/* {taggedDocuments && taggedDocuments.length > 0 && (
                        <div className="w-full mb-2 flex flex-wrap gap-2 px-3 py-2 border border-[--border-color] rounded-md bg-[--subtle-bg]">
                            {taggedDocuments.map((doc) => (
                                <div 
                                    key={doc.id} 
                                    className="flex items-center gap-1.5 bg-[--pill-bg] text-[--pill-text-color] px-2 py-0.5 rounded-full text-xs border border-[--pill-border-color] shadow-sm"
                                >
                                    <span>{doc.name}</span>
                                    <button 
                                        type="button"
                                        onClick={() => handleRemoveTaggedDocument(doc.id)}
                                        className="text-[--pill-remove-icon-color] hover:text-[--pill-remove-icon-hover-color] rounded-full focus:outline-none focus:ring-1 focus:ring-[--accent-color]"
                                        aria-label={`Remove ${doc.name}`}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )} */}
                    {/* --- END NEW: Render Tagged Document Pills --- */}

                    {/* Pinned Input Area - Remove max-width/centering from here */}
                    <div className="pt-4 border-t border-[--border-color] z-10 bg-[--editor-bg] flex-shrink-0 w-full">
                        <form ref={formRef} onSubmit={handleSubmit} className="w-full flex flex-col items-center">
                            {/* Use ChatInputUI directly here */}
                            <ChatInputUI 
                                key={isChatCollapsed ? 'collapsed-input' : 'unmounted'}
                                // Pass down the toggle button only when appropriate
                                renderCollapsedMessageToggle={
                                    <div className="flex items-center gap-1">
                                        {/* Bubble recall toggle */}
                                        {!followUpContext && lastMessageContent && isMessageBubbleCollapsed && collapsedMessageToggle}
                                        {/* Mini pane toggle */}
                                        {miniPaneToggle}
                                    </div>
                                }
                                files={files} 
                                fileInputRef={fileInputRef} 
                                handleFileChange={handleFileChange} 
                                inputRef={inputRef} 
                                input={input} 
                                handleInputChange={handleInputChange} 
                                handleKeyDown={handleKeyDown} 
                                handlePaste={handlePaste} 
                                model={model} 
                                setModel={setModel} 
                                handleUploadClick={handleUploadClick} 
                                isLoading={isLoading} 
                                isUploading={isUploading} 
                                uploadError={uploadError} 
                                uploadedImagePath={uploadedImagePath} 
                                onStop={stop}
                                isRecording={isRecording}
                                isTranscribing={isTranscribing}
                                micPermissionError={micPermissionError}
                                startRecording={startRecording}
                                stopRecording={stopRecording}
                                audioTimeDomainData={audioTimeDomainData}
                                clearPreview={clearPreview}
                                taggedDocuments={taggedDocuments}
                                onAddTaggedDocument={handleAddTaggedDocument}
                                onRemoveTaggedDocument={handleRemoveTaggedDocument}
                            />
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}; 