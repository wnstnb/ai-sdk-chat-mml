import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Message } from 'ai/react';
import { BotIcon, UserIcon } from 'lucide-react';
import { ChatMessageItem } from './ChatMessageItem';
import { getTextFromDataUrl } from '@/lib/editorUtils';

// Define props required by the component
interface TaggedDocument { // Added for the new prop type
    id: string;
    name: string;
}

interface ChatMessagesListProps {
    chatMessages: Message[];
    isLoadingMessages: boolean; // For initial load
    isChatLoading: boolean; // For assistant response loading
    handleSendToEditor: (content: string) => void;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    messageLoadBatchSize?: number; // Optional prop for batch size
    onAddTaggedDocument: (doc: TaggedDocument) => void; // New prop
    /**
     * Determines the visual density of the list. Defaults to `'full'` (existing behaviour).
     * `'mini'` is used for the compact overlay history pane.
     */
    displayMode?: 'full' | 'mini';
}

const DEFAULT_MESSAGE_LOAD_BATCH_SIZE = 20;

export const ChatMessagesList: React.FC<ChatMessagesListProps> = ({
    chatMessages,
    isLoadingMessages,
    isChatLoading,
    handleSendToEditor,
    messagesEndRef,
    messageLoadBatchSize = DEFAULT_MESSAGE_LOAD_BATCH_SIZE,
    onAddTaggedDocument, // Destructure the new prop
    displayMode = 'full',
}) => {
    const totalMessages = chatMessages.length;

    // Scroll to the bottom whenever messages change or the component mounts
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, messagesEndRef]); // Add chatMessages and messagesEndRef as dependencies

    // Conditionally adjust outer container classes for mini mode
    const containerClasses = displayMode === 'mini'
        ? 'overflow-y-auto styled-scrollbar px-2 py-2 max-h-[250px]'
        : 'flex-1 overflow-y-auto styled-scrollbar pr-2 pt-4';

    return (
        <div className={containerClasses}>
            {/* Initial Loading Indicator */}
            {isLoadingMessages && totalMessages === 0 && (
                <div className="flex justify-center items-center h-full">
                    {displayMode === 'mini' ? (
                        <p className="text-xs text-zinc-500">Loading…</p>
                    ) : (
                        <p className="text-zinc-500">Loading messages...</p>
                    )}
                </div>
            )}

            {/* No Messages Placeholder */}
            {!isLoadingMessages && totalMessages === 0 && (
                displayMode === 'mini' ? (
                    <div className="text-center p-2 text-xs text-zinc-500">No messages.</div>
                ) : (
                    <motion.div 
                        className="h-auto w-full pt-16 px-4 text-center" 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="border rounded-lg p-4 flex flex-col gap-3 text-zinc-500 text-sm dark:text-zinc-400 dark:border-zinc-700">
                            <p className="font-medium text-zinc-700 dark:text-zinc-300">No messages yet.</p>
                            <p>Start the conversation below!</p>
                        </div>
                    </motion.div>
                )
            )}

            {/* Render Messages using ChatMessageItem */}
            {totalMessages > 0 && chatMessages.map((message) => {
                 // DIAGNOSTIC: Log the message object being passed down
                 // console.log("[ChatMessagesList] Rendering message:", JSON.stringify(message, null, 2));
                 return (
                     <ChatMessageItem 
                        key={message.id}
                        message={message} 
                        handleSendToEditor={handleSendToEditor}
                        onAddTaggedDocument={onAddTaggedDocument} // Pass down the new prop
                        displayMode={displayMode}
                     />
                 );
            })}

            {/* Assistant Loading Indicator */}
            {isChatLoading && (
                <div className={`flex flex-row gap-2 w-full md:px-0 mt-2 ${displayMode === 'mini' ? 'text-xs' : ''}`}>
                    <div className="size-[24px] flex flex-col justify-start items-center flex-shrink-0 text-zinc-400 pt-1">
                        {displayMode === 'mini' ? null : <BotIcon />}
                    </div>
                    <div className="flex items-center gap-1 text-zinc-400 p-2">
                        <span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                        <span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
                        <span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse"></span>
                    </div>
                </div>
            )}

            {/* Scroll Anchor */}
            <div ref={messagesEndRef} />
        </div>
    );
}; 