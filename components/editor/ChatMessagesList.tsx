import React from 'react';
import { motion } from 'framer-motion';
import type { Message } from 'ai/react';
import { BotIcon, UserIcon, Wrench, SendToBack } from 'lucide-react';
import { Markdown } from '@/components/markdown';
import { getTextFromDataUrl } from '@/lib/editorUtils';

// Define props required by the component
interface ChatMessagesListProps {
    chatMessages: Message[];
    displayedMessagesCount: number;
    isLoadingMessages: boolean; // For initial load
    isChatLoading: boolean; // For assistant response loading
    setDisplayedMessagesCount: React.Dispatch<React.SetStateAction<number>>;
    handleSendToEditor: (content: string) => void;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    messageLoadBatchSize?: number; // Optional prop for batch size
}

const DEFAULT_MESSAGE_LOAD_BATCH_SIZE = 14;

export const ChatMessagesList: React.FC<ChatMessagesListProps> = ({
    chatMessages,
    displayedMessagesCount,
    isLoadingMessages,
    isChatLoading,
    setDisplayedMessagesCount,
    handleSendToEditor,
    messagesEndRef,
    messageLoadBatchSize = DEFAULT_MESSAGE_LOAD_BATCH_SIZE, // Use default or prop
}) => {
    const totalMessages = chatMessages.length;
    const shouldShowLoadMore = totalMessages > displayedMessagesCount;

    return (
        <div className="flex-1 overflow-y-auto styled-scrollbar pr-2 pt-4">
            {/* Load More Button */}
            {shouldShowLoadMore && (
                <button 
                    onClick={() => setDisplayedMessagesCount(prev => Math.min(prev + messageLoadBatchSize, totalMessages))}
                    className="text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 py-2 focus:outline-none mb-2 mx-auto block"
                >
                    Load More ({totalMessages - displayedMessagesCount} older)
                </button>
            )}

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

            {/* Render Messages */}
            {totalMessages > 0 && chatMessages.slice(-displayedMessagesCount).map((message, index) => (
                <motion.div
                    key={message.id || `msg-${index}`}
                    className={`flex flex-row gap-2 w-full mb-4 md:px-0 ${index === 0 && !shouldShowLoadMore ? 'pt-4' : ''}`} // Adjust padding based on load more button
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.2 }}
                >
                    <div className="size-[24px] flex flex-col justify-start items-center flex-shrink-0 text-zinc-400 pt-1">
                        {message.role === 'assistant' ? <BotIcon /> : <UserIcon />}
                    </div>
                    <div className="flex flex-col gap-1 flex-grow break-words overflow-hidden p-2 rounded-md bg-[--message-bg] shadow-sm">
                        {/* Message Content */}
                        <div className="text-zinc-800 dark:text-zinc-300 flex flex-col gap-4">
                            <Markdown>{message.content}</Markdown>
                        </div>
                        
                        {/* Send to Editor Button */}
                        {message.role === 'assistant' && message.content && message.content.trim() !== '' && (
                            <div className="mt-1 flex justify-end">
                                <button 
                                    onClick={() => handleSendToEditor(message.content)} 
                                    className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500" 
                                    title="Send to Editor">
                                    <SendToBack size={14} />
                                </button>
                            </div>
                        )}
                        
                        {/* Tool Invocations */}
                        {message.role === 'assistant' && message.toolInvocations && message.toolInvocations.length > 0 && (
                            <div className="mt-2 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-700 pt-2">
                                {message.toolInvocations.map((toolCall) => (
                                    <div key={toolCall.toolCallId} className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                        <Wrench size={12} className="flex-shrink-0" />
                                        <span>Using tool: <strong>{toolCall.toolName}</strong></span>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* Attachments */}
                        <div className="flex flex-row gap-2 flex-wrap mt-2">
                            {message.experimental_attachments?.map((attachment, idx) => (
                                attachment.contentType?.startsWith("image") ? (
                                    <img 
                                        className="rounded-md w-32 mb-2 object-cover" 
                                        key={attachment.name || `attach-${idx}`} 
                                        src={attachment.url} 
                                        alt={attachment.name || 'Attachment'} 
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                                    />
                                ) : attachment.contentType?.startsWith("text") ? (
                                    <div key={attachment.name || `attach-${idx}`} className="text-xs w-32 h-20 overflow-hidden text-zinc-400 border p-1 rounded-md dark:bg-zinc-800 dark:border-zinc-700 mb-2">
                                        {attachment.url.startsWith('data:') ? getTextFromDataUrl(attachment.url).slice(0, 100) + '...' : `[${attachment.name || 'Text File'}]`}
                                    </div>
                                ) : null
                            ))}
                        </div>
                    </div>
                </motion.div>
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