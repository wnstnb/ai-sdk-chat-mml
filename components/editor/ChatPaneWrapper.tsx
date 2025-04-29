import React, { useState, RefObject, MouseEvent as ReactMouseEvent } from 'react';
// import { motion } from 'framer-motion'; // No longer needed here
import type { Message } from 'ai/react';
import { ChatMessagesList } from './ChatMessagesList';
import { ChatInputArea } from './ChatInputArea';
// import { Resizable } from 're-resizable'; // No longer needed
import { type ToolInvocation } from '@ai-sdk/ui-utils';

// Define props required by ChatPaneWrapper and its children
interface ChatPaneWrapperProps {
    // From useChatPane (Some might be unused now, but keep for potential future needs or cleanup)
    isChatCollapsed: boolean;
    // chatPaneWidth: number | null; // No longer needed by Resizable
    // dragHandleRef: RefObject<HTMLDivElement>; // No longer needed by Resizable
    // handleMouseDownResize: (e: ReactMouseEvent<HTMLDivElement>) => void; // No longer needed by Resizable
    
    // Props for ChatMessagesList
    chatMessages: Message[];
    displayedMessagesCount: number;
    isLoadingMessages: boolean;
    isChatLoading: boolean; // Passed to ChatMessagesList and ChatInputArea
    setDisplayedMessagesCount: React.Dispatch<React.SetStateAction<number>>;
    handleSendToEditor: (content: string) => Promise<void>;
    messagesEndRef: RefObject<HTMLDivElement>;
    messageLoadBatchSize: number;
    
    // Props for ChatInputArea
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (event?: React.FormEvent<HTMLFormElement>, options?: { data?: any }) => Promise<void>;
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
    formRef: RefObject<HTMLFormElement>;
    inputRef: RefObject<HTMLTextAreaElement>;
    fileInputRef: RefObject<HTMLInputElement>;
    handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;

    // Constants from page (Keep if needed by children, otherwise can remove)
    initialChatPaneWidthPercent: number;
    minChatPaneWidthPx: number;

    // --- NEW AUDIO PROPS ADDED TO INTERFACE --- 
    isRecording: boolean;
    isTranscribing: boolean;
    micPermissionError: boolean;
    startRecording: () => void;
    stopRecording: (timedOut?: boolean) => void;
    // --- END NEW AUDIO PROPS --- 
}

export const ChatPaneWrapper: React.FC<ChatPaneWrapperProps> = ({
    // Destructure all props
    isChatCollapsed,
    // chatPaneWidth, // No longer needed for Resizable
    // dragHandleRef, // No longer needed for Resizable
    // handleMouseDownResize, // No longer needed for Resizable
    chatMessages,
    displayedMessagesCount,
    isLoadingMessages,
    isChatLoading,
    setDisplayedMessagesCount,
    handleSendToEditor,
    messagesEndRef,
    messageLoadBatchSize,
    input,
    handleInputChange,
    handleSubmit,
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
    initialChatPaneWidthPercent,
    minChatPaneWidthPx,
    // --- NEW AUDIO PROPS DESTRUCTURED --- 
    isRecording,
    isTranscribing,
    micPermissionError,
    startRecording,
    stopRecording,
    // --- END NEW AUDIO PROPS --- 
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
            <div className="flex flex-col flex-1 overflow-hidden h-full"> {/* Ensure height fills wrapper */}
                <ChatMessagesList
                    chatMessages={chatMessages}
                    displayedMessagesCount={displayedMessagesCount}
                    isLoadingMessages={isLoadingMessages}
                    isChatLoading={isChatLoading}
                    setDisplayedMessagesCount={setDisplayedMessagesCount}
                    handleSendToEditor={handleSendToEditor}
                    messagesEndRef={messagesEndRef}
                    {...(messageLoadBatchSize && { messageLoadBatchSize })}
                />
                <ChatInputArea
                    // key={inputAreaKey} // Keep or remove based on testing if remount is still needed
                    formRef={formRef}
                    inputRef={inputRef}
                    fileInputRef={fileInputRef}
                    input={input}
                    handleInputChange={handleInputChange}
                    handleSubmit={handleSubmit}
                    handleKeyDown={handleKeyDown}
                    handlePaste={handlePaste}
                    model={model}
                    setModel={setModel}
                    handleUploadClick={handleUploadClick}
                    isLoading={isChatLoading}
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
                />
            </div>
        // </Resizable> // REMOVED
    );
}; 