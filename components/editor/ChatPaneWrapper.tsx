import React, { useState, RefObject, MouseEvent as ReactMouseEvent } from 'react';
import { motion } from 'framer-motion';
import type { Message } from 'ai/react';
import { ChatMessagesList } from './ChatMessagesList';
import { ChatInputArea } from './ChatInputArea';
import { Resizable } from 're-resizable';
import { type ToolInvocation } from '@ai-sdk/ui-utils';

// Define props required by ChatPaneWrapper and its children
interface ChatPaneWrapperProps {
    // From useChatPane
    isChatCollapsed: boolean;
    chatPaneWidth: number | null;
    dragHandleRef: RefObject<HTMLDivElement>;
    handleMouseDownResize: (e: ReactMouseEvent<HTMLDivElement>) => void;
    
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

    // Constants from page
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
    // --- NEW AUDIO PROPS DESTRUCTURED --- 
    isRecording,
    isTranscribing,
    micPermissionError,
    startRecording,
    stopRecording,
    // --- END NEW AUDIO PROPS --- 
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

    if (isChatCollapsed) {
        return null; // Render nothing if collapsed
    }

    // Calculate max width (e.g., 70% of viewport width)
    const maxWidth = typeof window !== 'undefined' ? window.innerWidth * 0.7 : 1000;

    return (
        <Resizable
            size={{ width: chatPaneWidth ?? 400, height: 'auto' }} // Provide a default width
            minWidth={250} 
            maxWidth={maxWidth} 
            enable={{ right: true }}
            handleComponent={{ right: <div ref={dragHandleRef} onMouseDown={handleMouseDownResize} className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-30" /> }}
            className="relative flex flex-col border-l border-[--border-color] bg-[--bg-secondary] h-full"
            style={{ flexShrink: 0 }} // Prevent shrinking when window resizes
        >
            <div className="flex flex-col flex-1 overflow-hidden">
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
        </Resizable>
    );
}; 