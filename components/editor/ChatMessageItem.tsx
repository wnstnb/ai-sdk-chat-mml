import React from 'react';
import { motion } from 'framer-motion';
import type { Message } from 'ai/react';
import { type ToolInvocation } from '@ai-sdk/ui-utils';
import { BotIcon, UserIcon, Wrench, SendToBack } from 'lucide-react';
import { Markdown } from '@/components/markdown';
import { getTextFromDataUrl } from '@/lib/editorUtils';

interface ChatMessageItemProps {
    message: Message;
    handleSendToEditor: (content: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({ 
    message, 
    handleSendToEditor 
}) => {
    // Memoize the component to prevent unnecessary re-renders if props haven't changed
    
    // Phase 2 Refactor: Extract tool invocation parts
    const toolInvocationParts = message.parts?.filter(
      (part): part is { type: 'tool-invocation'; toolInvocation: ToolInvocation } => part.type === 'tool-invocation'
    ) || [];
    const hasToolInvocations = toolInvocationParts.length > 0;

    return (
        <motion.div
            key={message.id} // Key is now handled by the parent map
            className={`flex flex-row gap-2 w-full mb-4 md:px-0`} 
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
                {message.role === 'assistant' && hasToolInvocations && (
                    <div className="mt-2 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-700 pt-2">
                        {toolInvocationParts.map((part) => (
                            <div key={part.toolInvocation.toolCallId} className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                <Wrench size={12} className="flex-shrink-0" />
                                <span>Using tool: <strong>{part.toolInvocation.toolName}</strong></span>
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
    );
});

// Set display name for better debugging
ChatMessageItem.displayName = 'ChatMessageItem'; 