import React, { useState, RefObject, MouseEvent as ReactMouseEvent } from 'react';
// import { motion } from 'framer-motion'; // No longer needed here
import type { Message } from 'ai/react';
import { ChatMessagesList } from './ChatMessagesList';
import { ChatInputArea } from './ChatInputArea';
// import { Resizable } from 're-resizable'; // No longer needed
import { type ToolInvocation } from '@ai-sdk/ui-utils';
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions';
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { isAnyOperationInProgress, getOperationStatusText } from '@/app/lib/clientChatOperationState';

// Define TaggedDocument interface if not globally available (copy from ChatInputArea for now)
interface TaggedDocument {
    id: string;
    name: string;
}

// Define props required by ChatPaneWrapper and its children
interface ChatPaneWrapperProps {
    // From useChatPane (Some might be unused now, but keep for potential future needs or cleanup)
    isChatCollapsed: boolean;
    // chatPaneWidth: number | null; // No longer needed by Resizable
    // dragHandleRef: RefObject<HTMLDivElement>; // No longer needed by Resizable
    // handleMouseDownResize: (e: ReactMouseEvent<HTMLDivElement>) => void; // No longer needed by Resizable
    
    // Props for ChatMessagesList
    chatMessages: Message[]; // Keep for backwards compatibility if needed
    displayedMessages: Message[] | null; // NEW: Paginated messages for display
    isLoadingMessages: boolean;
    isChatLoading: boolean; // Passed to ChatMessagesList and ChatInputArea
    handleSendToEditor: (content: string) => Promise<void>;
    messagesEndRef: RefObject<HTMLDivElement>;
    messageLoadBatchSize: number;
    // NEW: Load More functionality props
    canLoadMore: boolean;
    isLoadingMore: boolean;
    loadMoreMessages: () => Promise<void>;
    
    // Props for ChatInputArea
    input: string;
    setInput: (value: string) => void;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    sendMessage: (event?: React.FormEvent<HTMLFormElement>, options?: { data?: any }) => Promise<void>;
    model: string;
    setModel: React.Dispatch<React.SetStateAction<string>>;
    stop: () => void;
    files: FileList | null;
    handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handlePaste: (event: React.ClipboardEvent<Element>) => void;
    handleUploadClick: () => void;
    isUploading: boolean;
    uploadError: string | null;
    uploadedImagePath: string | null;
    followUpContext: string | null;
    setFollowUpContext: (context: string | null) => void;
    formRef: React.RefCallback<HTMLFormElement>;
    inputRef: RefObject<HTMLTextAreaElement>;
    fileInputRef: RefObject<HTMLInputElement>;
    handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;

    // REMOVED: initialChatPaneWidthPercent and minChatPaneWidthPx as they are no longer used
    // initialChatPaneWidthPercent: number;
    // minChatPaneWidthPx: number;

    // --- NEW AUDIO PROPS ADDED TO INTERFACE --- 
    isRecording: boolean;
    isTranscribing: boolean;
    micPermissionError: boolean;
    startRecording: () => void;
    stopRecording: (timedOut?: boolean) => void;
    onCancelRecording?: () => void; // Cancel recording without sending
    audioTimeDomainData: AudioTimeDomainData;
    recordingDuration: number; // Duration in seconds
    onSilenceDetected?: () => void; // Silence detection callback
    // --- END NEW AUDIO PROPS --- 

    // --- ADD CLEAR PREVIEW PROP --- 
    clearPreview: () => void;
    // --- END CLEAR PREVIEW PROP ---

    // ADDED: For document tagging, passed from useChatInteractions hook result
    taggedDocuments: TaggedDocument[];
    setTaggedDocuments: React.Dispatch<React.SetStateAction<TaggedDocument[]>>;
    // --- NEW: Props for Mini-Pane toggle (passed to ChatInputArea) ---
    isMiniPaneOpen?: boolean;
    onToggleMiniPane?: () => void;
    isMainChatCollapsed?: boolean;
    miniPaneToggleRef?: React.RefObject<HTMLButtonElement>; // Ref for the toggle button
    // --- END NEW ---
    currentTheme: 'light' | 'dark'; // ADDED: For dynamic BlockNote theme

    // --- NEW: Props for Mobile Chat Drawer integration ---
    isMobile?: boolean;
    activeMobilePane?: 'editor' | 'chat';
    onToggleMobilePane?: () => void;

    // --- NEW: Orchestrator file upload props ---
    orchestratorHandleFileUploadStart?: (file: File) => Promise<string | null>;
    orchestratorCancelFileUpload?: () => void;
    orchestratorPendingFile?: any; // Will be properly typed later
    orchestratorIsFileUploadInProgress?: () => boolean;
    orchestratorIsChatInputBusy?: boolean;
    orchestratorCurrentOperationStatusText?: string | null;
    // --- END NEW ---
}

export const ChatPaneWrapper: React.FC<ChatPaneWrapperProps> = ({
    // Destructure all props
    isChatCollapsed,
    // chatPaneWidth, // No longer needed for Resizable
    // dragHandleRef, // No longer needed for Resizable
    // handleMouseDownResize, // No longer needed for Resizable
    chatMessages,
    displayedMessages, // NEW: Paginated messages for display
    isLoadingMessages,
    isChatLoading,
    handleSendToEditor,
    messagesEndRef,
    messageLoadBatchSize,
    // NEW: Load More functionality props
    canLoadMore,
    isLoadingMore,
    loadMoreMessages,
    input,
    setInput,
    handleInputChange,
    sendMessage,
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
    isRecording,
    isTranscribing,
    micPermissionError,
    startRecording,
    stopRecording,
    onCancelRecording,
    audioTimeDomainData,
    recordingDuration,
    onSilenceDetected,
    clearPreview,
    taggedDocuments,
    setTaggedDocuments,
    // --- NEW: Destructure Mini-Pane props ---
    isMiniPaneOpen,
    onToggleMiniPane,
    isMainChatCollapsed,
    miniPaneToggleRef, // Destructure the ref
    // --- END NEW ---
    currentTheme, // ADDED: Destructure currentTheme

    // --- NEW: Destructure Mobile Chat Drawer props ---
    isMobile,
    activeMobilePane,
    onToggleMobilePane,

    // --- NEW: Destructure orchestrator props ---
    orchestratorHandleFileUploadStart,
    orchestratorCancelFileUpload,
    orchestratorPendingFile,
    orchestratorIsFileUploadInProgress,
    orchestratorIsChatInputBusy,
    orchestratorCurrentOperationStatusText,
    // --- END NEW ---
}) => {
    // State to force remount of ChatInputArea after animation - Keep if still needed
    // const [inputAreaKey, setInputAreaKey] = useState(0);

    // const handleAnimationComplete = () => {
    //     // Check if the animation completed in the EXPANDED state
    //     if (!isChatCollapsed) {
    //         // Increment key to force remount
    //         // setInputAreaKey(prev => prev + 1);
    //         console.log('Chat pane animation complete (expanded), remounting input.');
    //     }
    // };

    // ADDED: Consume client chat operation store
    const operationState = useClientChatOperationStore();
    const isBusyFromStore = isAnyOperationInProgress(operationState);
    const statusTextFromStore = getOperationStatusText(operationState);

    // NEW: Handler for adding a tagged document
    const handleAddTaggedDocument = (docToAdd: TaggedDocument) => {
        // Check if the document is already tagged to prevent duplicates
        if (!taggedDocuments.find(doc => doc.id === docToAdd.id)) {
            setTaggedDocuments(prevTaggedDocuments => [...prevTaggedDocuments, docToAdd]);
        }
        // console.log(`Document tagged: ${docToAdd.name}`); // Optional feedback
    };

    // Note: The parent component (page.tsx) now handles the collapsed state rendering logic.
    // This component will only be rendered when !isChatCollapsed is true in the parent.
    // if (isChatCollapsed) {
    //     return null; // Render nothing if collapsed - No longer needed here
    // }

    // Calculate max width is also handled by the parent/hook - No longer needed here
    // const maxWidth = typeof window !== 'undefined' ? window.innerWidth * 0.7 : 1000;

    // Remove the <Resizable> wrapper and return the inner div directly
    // Adjust className as needed if Resizable applied styles directly
    return (
        // <Resizable ... > // REMOVED
            <div className="flex flex-col flex-1 overflow-hidden h-full px-3"> {/* Added px-3 */}
                <ChatMessagesList
                    chatMessages={displayedMessages || chatMessages} // Use displayedMessages if available, fallback to chatMessages
                    isLoadingMessages={isLoadingMessages}
                    isChatLoading={isChatLoading || isBusyFromStore}
                    handleSendToEditor={handleSendToEditor}
                    messagesEndRef={messagesEndRef}
                    {...(messageLoadBatchSize && { messageLoadBatchSize })}
                    onAddTaggedDocument={handleAddTaggedDocument}
                    // NEW: Pass pagination props
                    canLoadMore={canLoadMore}
                    isLoadingMore={isLoadingMore}
                    loadMoreMessages={loadMoreMessages}
                />
                {/* ADDED: Display operation status text */}
                {statusTextFromStore && (
                    <div className="p-2 text-sm text-center text-[--muted-text-color] bg-[--bg-secondary] border-t border-[--border-color]">
                        {statusTextFromStore}
                    </div>
                )}
                <ChatInputArea
                    // key={inputAreaKey} // Keep or remove based on testing if remount is still needed
                    formRef={formRef}
                    inputRef={inputRef}
                    fileInputRef={fileInputRef}
                    input={input}
                    setInput={setInput}
                    handleInputChange={handleInputChange}
                                            sendMessage={sendMessage}
                    handleKeyDown={handleKeyDown}
                    handlePaste={handlePaste}
                    model={model}
                    setModel={setModel}
                    handleUploadClick={handleUploadClick}
                    isLoading={isChatLoading || isBusyFromStore}
                    isUploading={isUploading}
                    uploadError={uploadError}
                    uploadedImagePath={uploadedImagePath}
                    files={files}
                    handleFileChange={handleFileChange}
                    stop={stop}
                    followUpContext={followUpContext}
                    setFollowUpContext={setFollowUpContext}
                    isRecording={isRecording}
                    isTranscribing={isTranscribing}
                    micPermissionError={micPermissionError}
                    startRecording={startRecording}
                    stopRecording={stopRecording}
                    onCancelRecording={onCancelRecording}
                    audioTimeDomainData={audioTimeDomainData}
                    recordingDuration={recordingDuration}
                    onSilenceDetected={onSilenceDetected}
                    clearPreview={clearPreview}
                    taggedDocuments={taggedDocuments}
                    setTaggedDocuments={setTaggedDocuments}
                    // --- NEW: Pass Mini-Pane props to ChatInputArea ---
                    isMiniPaneOpen={isMiniPaneOpen}
                    onToggleMiniPane={onToggleMiniPane}
                    isMainChatCollapsed={isMainChatCollapsed}
                    miniPaneToggleRef={miniPaneToggleRef} // Pass the ref down
                    // --- END NEW ---

                    // --- NEW: Pass orchestrator props to ChatInputArea ---
                    orchestratorHandleFileUploadStart={orchestratorHandleFileUploadStart}
                    orchestratorCancelFileUpload={orchestratorCancelFileUpload}
                    orchestratorPendingFile={orchestratorPendingFile}
                    orchestratorIsFileUploadInProgress={orchestratorIsFileUploadInProgress}
                    orchestratorIsChatInputBusy={orchestratorIsChatInputBusy}
                    orchestratorCurrentOperationStatusText={orchestratorCurrentOperationStatusText}
                    // --- END NEW ---
                />
            </div>
        // </Resizable> // REMOVED
    );
}; 