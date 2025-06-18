import React, { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import type { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { ChatInputUI } from './ChatInputUI'; // Assuming it's in the same directory
import { BlockHighlightWrapper } from './BlockHighlightWrapper'; // Import our new highlighting wrapper
import type { TaggedDocument } from '@/lib/types';
import { AttachedToastContainer } from '@/components/chat/AttachedToastContainer';
import { useAttachedToastContext } from '@/contexts/AttachedToastContext';
import { ChatMessagesList } from './ChatMessagesList';
import { useAuthStore } from '@/lib/stores/useAuthStore';


// Dynamically import CollaborativeBlockNoteEditor with SSR disabled
// Define loading state consistent with page.tsx
const CollaborativeBlockNoteEditor = dynamic(
    () => import('@/components/editor/CollaborativeBlockNoteEditor'),
    {
        ssr: false,
        loading: () => <p className="p-4 text-center text-[--muted-text-color]">Loading Collaborative Editor...</p>,
    }
);

// Define props required by the EditorPaneWrapper and its potential children
interface EditorPaneWrapperProps {
    // For CollaborativeBlockNoteEditor
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
    sendMessage: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
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
    recordingDuration: number; // Duration in seconds
    onSilenceDetected?: () => void; // Silence detection callback
    // --- END AUDIO VISUALIZATION PROP ---
    // --- ADD CLEAR PREVIEW PROP --- 
    clearPreview: () => void;
    // --- END CLEAR PREVIEW PROP ---
    // --- NEW: Props for shared tagged documents ---
    taggedDocuments: TaggedDocument[];
    setTaggedDocuments: React.Dispatch<React.SetStateAction<TaggedDocument[]>>;
    // --- END NEW ---
    // --- NEW: Props for Mini-Pane toggle ---
    isMiniPaneOpen?: boolean;
    onToggleMiniPane?: () => void;
    isMainChatCollapsed?: boolean;
    miniPaneToggleRef?: React.RefObject<HTMLButtonElement>; // Ref for the toggle button
    unreadMiniPaneCount?: number; // Count of unread messages for indicator
    // --- NEW: Props for Mini-Pane content ---
    miniPaneMessages?: any[]; // Chat messages for mini pane
    miniPaneIsLoadingMessages?: boolean;
    miniPaneIsAiLoading?: boolean;
    miniPaneMessagesEndRef?: React.RefObject<HTMLDivElement>;
    // --- END NEW ---
    currentTheme: 'light' | 'dark'; // CHANGED: Made non-optional
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
    sendMessage,
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
    recordingDuration,
    onSilenceDetected,
    // --- END AUDIO VISUALIZATION PROP ---
    // --- DESTRUCTURE CLEAR PREVIEW PROP ---
    clearPreview,
    // --- END DESTRUCTURE CLEAR PREVIEW PROP ---
    // --- NEW: Destructure shared tagged documents props ---
    taggedDocuments,
    setTaggedDocuments,
    // --- END NEW ---
    // --- NEW: Destructure Mini-Pane props ---
    isMiniPaneOpen,
    onToggleMiniPane,
    isMainChatCollapsed,
    miniPaneToggleRef, // Destructure the ref
    unreadMiniPaneCount, // Destructure the unread count
    // --- NEW: Destructure Mini-Pane content props ---
    miniPaneMessages,
    miniPaneIsLoadingMessages,
    miniPaneIsAiLoading,
    miniPaneMessagesEndRef,
    // --- END NEW ---
    currentTheme, // ADDED: Destructure currentTheme
}) => {
    // Initialize attached toasts for collapsed chat input
    const { toasts } = useAttachedToastContext();
    
    // Get current user from auth store
    const { user } = useAuthStore();
    
    // Debug user data
    console.log('[EditorPaneWrapper] User data for collaboration:', {
        userId: user?.id,
        userName: user?.user_metadata?.name || user?.email || 'Anonymous User',
        hasUser: !!user,
        userObject: user
    });
    
    // Refs for click-off behavior
    const miniPaneRef = React.useRef<HTMLDivElement>(null);
    const chatInputAreaRef = React.useRef<HTMLDivElement>(null);
    
    // Debug mini pane messages
    React.useEffect(() => {
        if (isMiniPaneOpen) {
            console.log('[MiniPane] Debug - Messages:', {
                miniPaneMessages: miniPaneMessages?.length || 0,
                isMiniPaneOpen,
                isMainChatCollapsed,
                firstMessage: miniPaneMessages?.[0]
            });
        }
    }, [isMiniPaneOpen, miniPaneMessages, isMainChatCollapsed]);

    // Click-off behavior for mini chat pane
    React.useEffect(() => {
        if (!isMiniPaneOpen || !onToggleMiniPane) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            
            // Don't close if clicking inside the mini pane
            if (miniPaneRef.current?.contains(target)) {
                return;
            }
            
            // Don't close if clicking inside the chat input area
            if (chatInputAreaRef.current?.contains(target)) {
                return;
            }
            
            // Don't close if clicking the toggle button (it has its own handler)
            if (miniPaneToggleRef?.current?.contains(target)) {
                return;
            }
            
            // Close the mini pane for all other clicks
            onToggleMiniPane();
        };

        // Add event listener to document
        document.addEventListener('mousedown', handleClickOutside);
        
        // Cleanup
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMiniPaneOpen, onToggleMiniPane, miniPaneToggleRef]);
    


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

    // Memoize the form ref callback to prevent infinite loops
    const formRefCallback = useCallback((node: HTMLFormElement | null) => {
        // Handle multiple refs for the form element
        if (typeof formRef === 'function') {
            formRef(node);
        }
        
        // Also assign to our chat input area ref
        (chatInputAreaRef as React.MutableRefObject<HTMLFormElement | null>).current = node;
    }, [formRef]);

    return (
        <div className="flex-1 flex flex-col relative bg-[--editor-bg] overflow-hidden">
            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto py-4 px-0 styled-scrollbar border-t border-[--border-color]">
                <BlockHighlightWrapper 
                    isDarkTheme={currentTheme === 'dark'}
                >
                    <CollaborativeBlockNoteEditor
                        key={documentId} // FIXED: Use only documentId for key to prevent unnecessary remounts
                        documentId={documentId}
                        editorRef={editorRef}
                        initialContent={initialContent || []} // Provide empty array as fallback
                        onEditorContentChange={onEditorContentChange}
                        theme={currentTheme} // Pass the theme to CollaborativeBlockNoteEditor
                        userId={user?.id}
                        userName={user?.user_metadata?.name || user?.email || 'Anonymous User'}
                        userColor={undefined} // Let the component generate a color based on userId
                        useCollaboration={true} // EXPLICITLY ENABLE: Real-time collaboration
                        enableComments={false} // DISABLED: Comments temporarily disabled - see comment-system-challenges-prd.md
                    />
                </BlockHighlightWrapper>
            </div>

            {/* Collapsed Chat Input (Rendered conditionally at the bottom) */}
            {isChatCollapsed && (
                // Apply width constraints and centering to this relative parent
                <div className="relative max-w-[800px] mx-auto w-full">


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
                    <div className="pt-4 z-10 bg-[--editor-bg] flex-shrink-0 w-full relative">
                        {/* Attached Toast Container for collapsed chat */}
                        <AttachedToastContainer toasts={toasts} />
                        
                        {/* Mini Chat Pane - positioned exactly like toast container */}
                        {isMiniPaneOpen && (
                            <div ref={miniPaneRef} className="absolute bottom-full left-0 right-0 mb-2 z-40">
                                <div className="flex flex-col gap-2 px-4">
                                    <div className="w-full max-w-[780px] mx-auto max-h-[350px] overflow-y-auto bg-[--input-bg] border border-[--border-color] rounded-md shadow-lg flex flex-col">
                                        <div className="flex-1 overflow-y-auto styled-scrollbar p-2">
                                            {miniPaneMessages && miniPaneMessages.length > 0 ? (
                                                <ChatMessagesList 
                                                    chatMessages={miniPaneMessages}
                                                    isLoadingMessages={miniPaneIsLoadingMessages || false}
                                                    isChatLoading={miniPaneIsAiLoading || false}
                                                    handleSendToEditor={handleSendToEditor}
                                                    messagesEndRef={miniPaneMessagesEndRef || { current: null }}
                                                    onAddTaggedDocument={handleAddTaggedDocument}
                                                    displayMode="mini"
                                                />
                                            ) : (
                                                <div className="text-sm text-[--muted-text-color] p-4 text-center">
                                                    {miniPaneMessages ? `No messages (${miniPaneMessages.length})` : 'No chat history available'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <form ref={formRefCallback} onSubmit={sendMessage} className="w-full flex flex-col items-center">
                            {/* Use ChatInputUI directly here */}
                            <ChatInputUI 
                                key={isChatCollapsed ? 'collapsed-input' : 'unmounted'}
                                // Pass down the toggle button only when appropriate
                                renderCollapsedMessageToggle={undefined}
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
                                recordingDuration={recordingDuration}
                                onSilenceDetected={onSilenceDetected}
                                clearPreview={clearPreview}
                                taggedDocuments={taggedDocuments}
                                onAddTaggedDocument={handleAddTaggedDocument}
                                onRemoveTaggedDocument={handleRemoveTaggedDocument}
                                // --- NEW: Pass Mini-Pane props to ChatInputUI ---
                                isMiniPaneOpen={isMiniPaneOpen}
                                onToggleMiniPane={onToggleMiniPane}
                                isMainChatCollapsed={isMainChatCollapsed}
                                miniPaneToggleRef={miniPaneToggleRef} // Pass the ref down
                                unreadMiniPaneCount={unreadMiniPaneCount} // Pass the unread count
                                // --- END NEW ---
                            />
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}; 