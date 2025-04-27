import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { Message } from 'ai/react';
import { ChatMessagesList } from './ChatMessagesList';
import { ChatInputArea } from './ChatInputArea';

// Define props required by ChatPaneWrapper and its children
interface ChatPaneWrapperProps {
    // From useChatPane
    isChatCollapsed: boolean;
    chatPaneWidth: number | null;
    dragHandleRef: React.RefObject<HTMLDivElement>;
    handleMouseDownResize: (e: React.MouseEvent<HTMLDivElement>) => void;
    
    // Props for ChatMessagesList
    chatMessages: Message[];
    displayedMessagesCount: number;
    isLoadingMessages: boolean;
    isChatLoading: boolean; // Passed to ChatMessagesList and ChatInputArea
    setDisplayedMessagesCount: React.Dispatch<React.SetStateAction<number>>;
    handleSendToEditor: (content: string) => void;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    messageLoadBatchSize?: number;
    
    // Props for ChatInputArea
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
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
    formRef: React.RefObject<HTMLFormElement>;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;

    // Constants from page
    initialChatPaneWidthPercent: number;
    minChatPaneWidthPx: number;
}

export const ChatPaneWrapper: React.FC<ChatPaneWrapperProps> = ({
    // Destructure all props
    isChatCollapsed,
    chatPaneWidth,
    dragHandleRef,
    handleMouseDownResize,
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
}) => {
    // State to force remount of ChatInputArea after animation
    const [inputAreaKey, setInputAreaKey] = useState(0);

    const handleAnimationComplete = () => {
        // Check if the animation completed in the EXPANDED state
        if (!isChatCollapsed) {
            // Increment key to force remount
            setInputAreaKey(prev => prev + 1);
            console.log('Chat pane animation complete (expanded), remounting input.');
        }
    };

    return (
        <motion.div 
            className="flex flex-col bg-[--bg-secondary] h-full relative border-l border-[--border-color]"
            initial={false} 
            animate={{
                width: isChatCollapsed ? 0 : chatPaneWidth ?? `${initialChatPaneWidthPercent}%`,
                minWidth: isChatCollapsed ? 0 : minChatPaneWidthPx,
                opacity: isChatCollapsed ? 0 : 1,
                paddingLeft: isChatCollapsed ? 0 : '1rem',
                paddingRight: isChatCollapsed ? 0 : '1rem',
                borderLeftWidth: isChatCollapsed ? 0 : '1px'
            }} 
            transition={{ type: 'tween', duration: 0.3 }} 
            style={{ visibility: isChatCollapsed ? 'hidden' : 'visible' }}
            onAnimationComplete={handleAnimationComplete}
        >
            {/* Resize Handle */}
            {!isChatCollapsed && (
                <div 
                    ref={dragHandleRef} 
                    onMouseDown={handleMouseDownResize} 
                    className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize bg-gray-300/50 dark:bg-gray-600/50 hover:bg-blue-400 dark:hover:bg-blue-600 transition-colors duration-150 z-30" 
                    style={{ transform: 'translateX(-50%)' }} 
                />
            )}
            
            {/* Render internal components only if not collapsed */} 
            {!isChatCollapsed && (
                <>
                    <ChatMessagesList
                        chatMessages={chatMessages}
                        displayedMessagesCount={displayedMessagesCount}
                        isLoadingMessages={isLoadingMessages}
                        isChatLoading={isChatLoading}
                        setDisplayedMessagesCount={setDisplayedMessagesCount}
                        handleSendToEditor={handleSendToEditor}
                        messagesEndRef={messagesEndRef}
                        messageLoadBatchSize={messageLoadBatchSize}
                    />
                    <ChatInputArea 
                        key={inputAreaKey}
                        isChatCollapsed={isChatCollapsed}
                        input={input}
                        handleInputChange={handleInputChange}
                        handleSubmit={handleSubmit}
                        isLoading={isChatLoading}
                        model={model}
                        setModel={setModel}
                        stop={stop}
                        files={files}
                        handleFileChange={handleFileChange}
                        handlePaste={handlePaste}
                        handleUploadClick={handleUploadClick}
                        isUploading={isUploading}
                        uploadError={uploadError}
                        uploadedImagePath={uploadedImagePath}
                        followUpContext={followUpContext}
                        setFollowUpContext={setFollowUpContext}
                        formRef={formRef}
                        inputRef={inputRef}
                        fileInputRef={fileInputRef}
                        handleKeyDown={handleKeyDown}
                    />
                </>
            )}
        </motion.div>
    );
}; 