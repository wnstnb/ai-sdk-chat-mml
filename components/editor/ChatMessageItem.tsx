import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { Message } from 'ai/react';
import { type ToolInvocation } from '@ai-sdk/ui-utils';
import { BotIcon, UserIcon, Wrench, SendToBack, Image as ImageIcon } from 'lucide-react';
import { NonMemoizedMarkdown } from '@/components/markdown';
import { getTextFromDataUrl } from '@/lib/editorUtils';
import Image from 'next/image';

// --- Define types related to the search tool ---
interface TaggedDocument {
    id: string;
    name: string;
}

interface SearchToolDocument {
    id: string;
    name: string;
    confidence?: number;
    summary?: string;
}

interface SearchAndTagDocumentsToolResult {
    documents: SearchToolDocument[];
    searchPerformed?: boolean;
    queryUsed?: string;
    presentationStyle: 'listWithTagButtons';
}
// --- End search tool types ---

interface ChatMessageItemProps {
    message: Message;
    handleSendToEditor: (content: string) => void;
    onAddTaggedDocument: (doc: TaggedDocument) => void;
    displayMode?: 'full' | 'mini';
}

// --- Helper Function to Extract User Display Content ---
const FOLLOW_UP_PREFIX = "Follow-up Context:";
const FOLLOW_UP_SEPARATOR = "\n\n---\n\n";

function extractUserDisplayContent(content: string, role: Message['role']): string {
    if (role === 'user') {
        const separatorIndex = content.indexOf(FOLLOW_UP_SEPARATOR);
        // Check if it starts with the prefix AND the separator exists
        if (content.startsWith(FOLLOW_UP_PREFIX) && separatorIndex !== -1) {
            // Return the part after the separator
            return content.substring(separatorIndex + FOLLOW_UP_SEPARATOR.length);
        }
    }
    // Return original content if not user or pattern doesn't match
    return content;
}
// --- End Helper Function ---

// --- NEW: Helper function to format timestamp ---
const formatTimestamp = (date: Date, isMiniMode: boolean): string => {
    // Always include date: YYYY-MM-DD, HH:MM AM/PM
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}, ${date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    })}`;
};
// --- END NEW ---

// --- NEW: Control for showing/hiding timestamps globally ---
const SHOW_TIMESTAMPS = false;
// --- END NEW ---

// Define Part types inline for clarity if not importing from 'ai' core
type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string | URL; error?: string }; // image received should be signed URL string
type ToolCallPart = { type: 'tool-call'; toolCallId: string; toolName: string; args: any };
type ToolInvocationPart = { type: 'tool-invocation'; toolInvocation: ToolInvocation };
// --- MODIFICATION: Ensure ContentPart includes all possibilities passed in message.parts --- 
type ContentPart = TextPart | ImagePart | ToolCallPart | ToolInvocationPart; // Include ImagePart here
// --- END MODIFICATION --- 

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({ 
    message, 
    handleSendToEditor,
    onAddTaggedDocument,
    displayMode = 'full',
}) => {
    // console.log('[ChatMessageItem] Rendering message:', JSON.stringify(message, null, 2));
    // console.log('[ChatMessageItem] Display Mode:', displayMode); // Log displayMode
    
    const isMiniMode = displayMode === 'mini';

    // --- State for Collapsible Tool Details ---
    const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});
    const [expandedToolGroups, setExpandedToolGroups] = useState<Record<string, boolean>>({});
    
    // --- Toggle Functions ---
    const toggleToolCallExpansion = (toolCallId: string) => {
        setExpandedToolCalls(prev => ({ ...prev, [toolCallId]: !prev[toolCallId] }));
    };

    const toggleToolGroupExpansion = (toolName: string) => {
        setExpandedToolGroups(prev => ({ ...prev, [toolName]: !prev[toolName] }));
    };

    // Determine if the "Send to Editor" button can be shown
    const displayableRawText = typeof message.content === 'string' 
        ? extractUserDisplayContent(message.content, message.role) 
        : Array.isArray(message.content) 
          ? (message.content as ContentPart[]).filter((part: ContentPart) => part.type === 'text').map((part: any) => part.text).join('\n')
          : '';
    const canSendToEditor = displayableRawText.trim().length > 0;

    /**
     * Unified image rendering function that handles both message.content and message.parts
     * @param imageSource - The image data (string URL or URL object)
     * @param error - Optional error message
     * @param keyPrefix - Unique key prefix for React rendering
     * @param sourceType - Description of image source for mini mode
     */
    const renderImagePart = (
        imageSource: string | URL | null | undefined,
        error: string | undefined,
        keyPrefix: string,
        sourceType: 'content' | 'attachment' = 'content'
    ) => {
        // Handle error state
        if (error) {
            return (
                <p key={`${keyPrefix}-error`} className={`text-red-500 ${isMiniMode ? 'text-xs' : 'text-sm'}`}>
                    [Error: {error}]
                </p>
            );
        }

        // Extract image URL
        const imageUrl = typeof imageSource === 'string' 
            ? imageSource 
            : imageSource instanceof URL 
                ? imageSource.href 
                : null;

        // Handle missing/invalid image URL
        if (!imageUrl) {
            return (
                <p key={`${keyPrefix}-fallback`} className={`text-gray-500 ${isMiniMode ? 'text-xs' : 'text-sm'}`}>
                    [Image not available]
                </p>
            );
        }

        // Render mini mode indicator
        if (isMiniMode) {
            return (
                <div key={`${keyPrefix}-mini`} className="flex items-center text-xs text-zinc-500 dark:text-zinc-400 my-1">
                    <ImageIcon size={14} className="mr-1 flex-shrink-0" />
                    <span>Image {sourceType}</span>
                </div>
            );
        }

        // Render full-size image
        return (
            <div key={keyPrefix} className={`relative w-full h-auto my-2 ${isMiniMode ? 'max-w-[150px]' : 'max-w-xs'}`}> 
                <Image 
                    src={imageUrl} 
                    alt="User uploaded image" 
                    width={isMiniMode ? 150 : 300} 
                    height={isMiniMode ? 100 : 200} 
                    className="rounded-md object-contain"
                    unoptimized={true}
                />
            </div>
        );
    };

    const renderContent = () => {
        if (typeof message.content === 'string') {
            return (
                <div className={`chat-message-text break-words ${isMiniMode ? 'text-xs' : 'text-sm'}`}>
                    <NonMemoizedMarkdown>
                        {extractUserDisplayContent(message.content, message.role)}
                    </NonMemoizedMarkdown>
                </div>
            );
        } else if (Array.isArray(message.content)) {
            return (
                <div className={`chat-message-text break-words ${isMiniMode ? 'text-xs' : 'text-sm'}`}>
                    {(message.content as ContentPart[]).map((part, index) => {
                        if (part.type === 'text') {
                            const textPart = part as TextPart;
                            return (
                                <div key={`${message.id}-content-${index}`}>
                                    <NonMemoizedMarkdown>
                                        {extractUserDisplayContent(textPart.text, message.role)}
                                    </NonMemoizedMarkdown>
                                </div>
                            );
                        } else if (part.type === 'image') {
                            const imagePart = part as ImagePart;
                            return renderImagePart(
                                imagePart.image,
                                imagePart.error,
                                `${message.id}-content-${index}-image`,
                                'content'
                            );
                        } else if (part.type === 'tool-call') {
                            const toolCallPart = part as ToolCallPart;
                            return (
                                <div key={`${message.id}-content-${index}-tool`} className={`my-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 ${isMiniMode ? 'p-1 text-xs' : 'mt-2 p-2 my-2'}`}>
                                    <div className={`flex items-center gap-1 text-zinc-600 dark:text-zinc-400 ${isMiniMode ? 'gap-0.5 mb-0.5 text-[10px]' : 'gap-1.5 mb-1 text-xs'}`}>
                                        <Wrench size={isMiniMode ? 10 : 12} className="flex-shrink-0" />
                                        <span>Tool Used: <strong>{toolCallPart.toolName}</strong></span>
                                    </div>
                                    {!isMiniMode && toolCallPart.args && (
                                        <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                                            Args: {JSON.stringify(toolCallPart.args, null, 2)}
                                        </pre>
                                    )}
                                    {!isMiniMode && (toolCallPart as any).result && (
                                        <pre className="mt-1 text-xs text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
                                            Result: {JSON.stringify((toolCallPart as any).result, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            );
                        }
                        return null; 
                    })}
                </div>
            );
        } else {
            console.warn('[ChatMessageItem] Unexpected message content type:', typeof message.content, message.content);
            return <p className={`text-red-500 ${isMiniMode ? 'text-xs' : 'text-sm'}`}>[Invalid message content]</p>;
        }
    };

    // Helper function to group tool invocations by tool name
    const groupToolInvocations = (parts: any[]) => {
        const toolGroups: Record<string, any[]> = {};
        const nonToolParts: any[] = [];

        parts.forEach((part, index) => {
            const contentPart = part as ContentPart;
            let effectiveToolInvocation: ToolInvocation | undefined = undefined;
            let toolCallIdForExpansion: string | undefined = undefined;

            if (contentPart.type === 'tool-invocation') {
                effectiveToolInvocation = (contentPart as ToolInvocationPart).toolInvocation;
                if (effectiveToolInvocation) toolCallIdForExpansion = effectiveToolInvocation.toolCallId;
            } else if (contentPart.type === 'tool-call' && (contentPart as any).result !== undefined) {
                const toolCallPart = contentPart as ToolCallPart & { result: any; toolCallId: string };
                toolCallIdForExpansion = toolCallPart.toolCallId;
                effectiveToolInvocation = {
                    toolCallId: toolCallPart.toolCallId,
                    toolName: toolCallPart.toolName,
                    args: toolCallPart.args,
                    result: toolCallPart.result,
                    state: 'result',
                } as ToolInvocation;
            }

            if (effectiveToolInvocation && toolCallIdForExpansion) {
                const toolName = effectiveToolInvocation.toolName;
                if (!toolGroups[toolName]) {
                    toolGroups[toolName] = [];
                }
                toolGroups[toolName].push({
                    ...effectiveToolInvocation,
                    originalIndex: index,
                    toolCallId: toolCallIdForExpansion
                });
            } else {
                nonToolParts.push({ part: contentPart, index });
            }
        });

        return { toolGroups, nonToolParts };
    };

    // Render consolidated tool groups
    const renderToolGroups = (toolGroups: Record<string, any[]>) => {
        return Object.entries(toolGroups).map(([toolName, toolCalls]) => {
            const isGroupExpanded = !!expandedToolGroups[toolName];
            const isSpecialTool = toolName === 'searchAndTagDocumentsTool';
            
            // Special handling for searchAndTagDocumentsTool - don't consolidate
            if (isSpecialTool) {
                return toolCalls.map((toolCall, callIndex) => {
                    if (toolCall.state === 'result' &&
                        toolCall.result &&
                        typeof toolCall.result === 'object' &&
                        (toolCall.result as SearchAndTagDocumentsToolResult).presentationStyle === 'listWithTagButtons') {
                        const searchResult = toolCall.result as SearchAndTagDocumentsToolResult;
                        if (isMiniMode) {
                            return (
                                <div key={`${message.id}-search-results-mini-${callIndex}`} className={`mt-0.5 p-1 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800/30 text-xs`}>
                                    <div className="flex items-center gap-1 text-blue-700 dark:text-blue-300 mb-0.5 font-medium text-[10px]">
                                        <Wrench size={10} className="flex-shrink-0" />
                                        <span>Found {searchResult.documents.length} doc(s) for: <strong>{searchResult.queryUsed || 'query'}</strong></span>
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div key={`${message.id}-search-results-${callIndex}`} className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800/30">
                                <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300 mb-2 font-medium">
                                    <Wrench size={12} className="flex-shrink-0" />
                                    <span>{searchResult.documents.length > 0 ? 'Found documents related to:' : 'No documents found for:'} <strong>{searchResult.queryUsed || 'your query'}</strong></span>
                                </div>
                                {searchResult.documents.length > 0 ? (
                                    <ul className="space-y-2">
                                        {searchResult.documents.map((doc) => (
                                            <li key={doc.id} className="p-2.5 bg-white dark:bg-gray-800/50 rounded shadow-sm border border-gray-200 dark:border-gray-700/60">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate" title={doc.name}>{doc.name}</h4>
                                                        {doc.summary && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={doc.summary}>{doc.summary}</p>}
                                                    </div>
                                                    <button
                                                        onClick={() => onAddTaggedDocument({ id: doc.id, name: doc.name })}
                                                        className="ml-3 shrink-0 px-2.5 py-1 text-xs bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 transition-colors"
                                                    >
                                                        Tag
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">You can try a different search query.</p>
                                )}
                            </div>
                        );
                    }
                    return null;
                });
            }

            // Consolidate multiple calls of the same tool
            if (toolCalls.length === 1) {
                // Single tool call - render normally
                const toolCall = toolCalls[0];
                const isExpanded = !!expandedToolCalls[toolCall.toolCallId];
                
                if (isMiniMode) {
                    return (
                        <div key={`${message.id}-tool-mini-${toolName}`} className={`mt-0.5 p-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 text-xs`}>
                            <div className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 text-[10px]">
                                <Wrench size={10} className="flex-shrink-0" />
                                <span>Tool: <strong>{toolName}</strong></span>
                            </div>
                        </div>
                    );
                }
                
                return (
                    <div key={`${message.id}-tool-${toolName}`} className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700">
                        <div 
                            className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer" 
                            onClick={() => toggleToolCallExpansion(toolCall.toolCallId)}
                        >
                            <Wrench size={12} className="flex-shrink-0" />
                            <span>Tool Used: <strong>{toolName}</strong></span>
                            <span className="ml-auto text-zinc-400 dark:text-zinc-500">{isExpanded ? '[-]' : '[+]'}</span>
                        </div>
                        
                        {isExpanded && (
                            <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
                                <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                                    Args: {JSON.stringify(toolCall.args, null, 2)}
                                </pre>
                                {toolCall.state === 'result' && toolCall.result && (
                                    <pre className="mt-1 text-xs text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
                                        Result: {JSON.stringify(toolCall.result, null, 2)}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                );
            } else {
                // Multiple tool calls - render consolidated view
                if (isMiniMode) {
                    return (
                        <div key={`${message.id}-tool-group-mini-${toolName}`} className={`mt-0.5 p-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 text-xs`}>
                            <div className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 text-[10px]">
                                <Wrench size={10} className="flex-shrink-0" />
                                <span>Tool: <strong>{toolName}</strong> ({toolCalls.length}×)</span>
                            </div>
                        </div>
                    );
                }

                return (
                    <div key={`${message.id}-tool-group-${toolName}`} className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700">
                        <div 
                            className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer" 
                            onClick={() => toggleToolGroupExpansion(toolName)}
                        >
                            <Wrench size={12} className="flex-shrink-0" />
                            <span>Tool Used: <strong>{toolName}</strong> ({toolCalls.length} operations)</span>
                            <span className="ml-auto text-zinc-400 dark:text-zinc-500">{isGroupExpanded ? '[-]' : '[+]'}</span>
                        </div>
                        
                        {isGroupExpanded && (
                            <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700 space-y-2">
                                {toolCalls.map((toolCall, callIndex) => {
                                    const isCallExpanded = !!expandedToolCalls[toolCall.toolCallId];
                                    return (
                                        <div key={`${toolCall.toolCallId}-${callIndex}`} className="p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600">
                                            <div 
                                                className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer" 
                                                onClick={() => toggleToolCallExpansion(toolCall.toolCallId)}
                                            >
                                                <span>Operation #{callIndex + 1}</span>
                                                <span className="ml-auto text-zinc-400 dark:text-zinc-500">{isCallExpanded ? '[-]' : '[+]'}</span>
                                            </div>
                                            
                                            {isCallExpanded && (
                                                <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-600">
                                                    <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                                                        Args: {JSON.stringify(toolCall.args, null, 2)}
                                                    </pre>
                                                    {toolCall.state === 'result' && toolCall.result && (
                                                        <pre className="mt-1 text-xs text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
                                                            Result: {JSON.stringify(toolCall.result, null, 2)}
                                                        </pre>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            }
        });
    };

    return (
        <motion.div
            key={message.id}
            className={`flex flex-row w-full md:px-0 ${isMiniMode ? 'gap-1 mb-1.5 border-b border-[--border-color]' : 'gap-2 mb-4'}`} 
            initial={{ y: 5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
        >
            <div className={`flex flex-col justify-start items-center flex-shrink-0 text-zinc-400 ${isMiniMode ? 'size-[18px] pt-0.5' : 'size-[24px] pt-1'}`}>
                {message.role === 'assistant' ? <BotIcon size={isMiniMode ? 16 : 24} /> : <UserIcon size={isMiniMode ? 16 : 24} />}
            </div>
            <div className={`flex flex-col flex-grow break-words overflow-hidden rounded-md bg-[--message-bg] shadow-sm ${isMiniMode ? 'p-1.5 gap-0.5' : 'p-2 gap-1'}`}>
                {/* Render User/Bot Name - Mini mode might omit or make smaller */}
                {!isMiniMode && (
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {message.role === 'user' ? 'User' : 'Assistant'}
                    </div>
                )}
                
                {/* 1. Render the main text content (if it exists) */}
                {(typeof message.content === 'string' && message.content.trim()) && (
                     <div className={`chat-message-text break-words ${isMiniMode ? 'text-xs mb-1' : 'text-sm mb-2'}`}>
                        <NonMemoizedMarkdown>
                            {extractUserDisplayContent(message.content, message.role)}
                        </NonMemoizedMarkdown>
                    </div>
                )}
                
                {/* 2. Render any Tool Invocations or Images found in parts */}
                {Array.isArray(message.parts) && (() => {
                    const { toolGroups, nonToolParts } = groupToolInvocations(message.parts);
                    
                    return (
                        <>
                            {/* Render non-tool parts (images, etc.) */}
                            {nonToolParts.map(({ part, index }) => {
                                const contentPart = part as ContentPart;
                                if (contentPart.type === 'image') {
                                    const imagePart = contentPart as ImagePart;
                                    return renderImagePart(
                                        imagePart.image,
                                        imagePart.error,
                                        `${message.id}-part-${index}-image`,
                                        'attachment'
                                    );
                                }
                                return null;
                            })}
                            
                            {/* Render consolidated tool groups */}
                            {renderToolGroups(toolGroups)}
                        </>
                    );
                })()}

                {/* Send to Editor Button - Uses specifically extracted text */}
                {canSendToEditor && (
                    <div className={`flex justify-end ${isMiniMode ? 'mt-0.5' : 'mt-1'}`}>
                        <button
                            onClick={() => handleSendToEditor(displayableRawText)}
                            className={`p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 ${isMiniMode ? '' : ''}`}
                            title="Send to Editor"
                        >
                            <SendToBack size={isMiniMode ? 12 : 14} />
                        </button>
                    </div>
                )}
                {SHOW_TIMESTAMPS && (
                    <div className={`text-[9.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 ${isMiniMode ? 'self-end' : 'self-start'}`}>
                        {message.createdAt ? formatTimestamp(new Date(message.createdAt), isMiniMode) : 'Sending...'}
                    </div>
                )}
            </div>
        </motion.div>
    );
});

// Set display name for better debugging
ChatMessageItem.displayName = 'ChatMessageItem'; 