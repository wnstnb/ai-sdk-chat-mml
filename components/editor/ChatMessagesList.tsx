import React from 'react';
import { motion } from 'framer-motion';
import type { Message } from 'ai/react';
import { BotIcon, UserIcon } from 'lucide-react';
import { ChatMessageItem } from './ChatMessageItem';
import { getTextFromDataUrl } from '@/lib/editorUtils';

// Define props required by the component
interface ChatMessagesListProps {
    chatMessages: Message[];
    isLoadingMessages: boolean; // For initial load
    isChatLoading: boolean; // For assistant response loading
    handleSendToEditor: (content: string) => void;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    messageLoadBatchSize?: number; // Optional prop for batch size
}

const DEFAULT_MESSAGE_LOAD_BATCH_SIZE = 20;

export const ChatMessagesList: React.FC<ChatMessagesListProps> = ({
    chatMessages,
    isLoadingMessages,
    isChatLoading,
    handleSendToEditor,
    messagesEndRef,
    messageLoadBatchSize = DEFAULT_MESSAGE_LOAD_BATCH_SIZE,
}) => {
    const totalMessages = chatMessages.length;

    return (
        <div className="flex-1 overflow-y-auto styled-scrollbar pr-2 pt-4">
            {/* Initial Loading Indicator */}
            {isLoadingMessages && totalMessages === 0 && (
                <div className="flex justify-center items-center h-full">
                    <p className="text-zinc-500">Loading messages...</p>
                </div>
            )}

            {/* No Messages Placeholder */}
            {!isLoadingMessages && totalMessages === 0 && (
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
            )}

            {/* Render Messages using ChatMessageItem */}
            {totalMessages > 0 && chatMessages.map((message) => (
                 <ChatMessageItem 
                    key={message.id}
                    message={message} 
                    handleSendToEditor={handleSendToEditor}
                 />
            ))}

            {/* Assistant Loading Indicator */}
            {isChatLoading && (
                <div className="flex flex-row gap-2 w-full md:px-0 mt-2">
                    <div className="size-[24px] flex flex-col justify-start items-center flex-shrink-0 text-zinc-400 pt-1">
                        <BotIcon />
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