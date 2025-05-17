import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { Message } from 'ai/react';
import { type ToolInvocation } from '@ai-sdk/ui-utils';
import { BotIcon, UserIcon, Wrench, SendToBack } from 'lucide-react';
import { NonMemoizedMarkdown } from '@/components/markdown';
import { getTextFromDataUrl } from '@/lib/editorUtils';
import Image from 'next/image';
import remarkGfm from 'remark-gfm';

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
    onAddTaggedDocument
}) => {
    // console.log('[ChatMessageItem] Rendering message:', JSON.stringify(message, null, 2));
    
    // --- State for Collapsible Tool Details ---
    const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});
    
    // --- Toggle Function ---
    const toggleToolCallExpansion = (toolCallId: string) => {
        setExpandedToolCalls(prev => ({ ...prev, [toolCallId]: !prev[toolCallId] }));
    };

    // --- REVISED: Extract raw text ONLY from message.content for button logic --- 
    let rawTextContentForButton = '';
    if (Array.isArray(message.content)) {
        const textPart = message.content.find((part): part is TextPart => part.type === 'text');
        rawTextContentForButton = textPart?.text || '';
    } else if (typeof message.content === 'string') {
        rawTextContentForButton = message.content;
    }
    const displayableRawText = extractUserDisplayContent(rawTextContentForButton, message.role);
    const canSendToEditor = message.role === 'assistant' && displayableRawText.trim() !== '';
    // --- END REVISED --- 

    const renderContent = () => {
        if (typeof message.content === 'string') {
            // Handle plain string content (no change needed here)
            const textToRender = extractUserDisplayContent(message.content, message.role);
            // --- ADDED LOGGING ---
            console.log(`[ChatMessageItem renderContent - STRING] msgId: ${message.id}, original content:`, JSON.stringify(message.content));
            console.log(`[ChatMessageItem renderContent - STRING] msgId: ${message.id}, textToRender after extract:`, JSON.stringify(textToRender));
            const shouldRender = textToRender.trim();
            console.log(`[ChatMessageItem renderContent - STRING] msgId: ${message.id}, shouldRender (non-empty trim):`, !!shouldRender);
            // --- END LOGGING ---
            // Render only if there is actual text after removing potential prefix
            return shouldRender ? (
                <div className="prose chat-message-text break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0">
                    <NonMemoizedMarkdown>
                        {textToRender}
                    </NonMemoizedMarkdown>
                </div>
            ) : null; // Return null if only prefix existed
        } else if (Array.isArray(message.content)) {
            // Handle content as an array of parts (now handles text, image, AND tool-call)
            const parts = message.content as ContentPart[];
            // Filter out empty text parts that might exist alongside tool calls
            const visibleParts = parts.filter(part => part.type !== 'text' || part.text?.trim());
            
            if (visibleParts.length === 0) return null; // Nothing to render

            return (
                <div className="space-y-3">
                    {visibleParts.map((part, index) => {
                        if (part.type === 'text') {
                             const textToRender = extractUserDisplayContent(part.text, message.role);
                             // Render only if there is actual text after removing potential prefix
                             return textToRender.trim() ? (
                                <div key={`${message.id}-part-${index}-text`} className="prose chat-message-text break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0">
                                    <NonMemoizedMarkdown>
                                        {textToRender}
                                    </NonMemoizedMarkdown>
                                </div>
                            ) : null;
                        } else if (part.type === 'image') {
                            // (Image rendering logic remains the same)
                            const imageUrl = typeof part.image === 'string' ? part.image : part.image instanceof URL ? part.image.href : null;
                            if (part.error) {
                                return <p key={`${message.id}-part-${index}-image-error`} className="text-red-500 text-sm">[Error: {part.error}]</p>;
                            }
                            if (imageUrl) {
                                return (
                                    <div key={`${message.id}-part-${index}-image`} className="relative w-full max-w-xs h-auto my-2"> 
                                        <Image 
                                            src={imageUrl} 
                                            alt="User uploaded image" 
                                            width={300} 
                                            height={200} 
                                            className="rounded-md object-contain"
                                            unoptimized={true}
                                        />
                                    </div>
                                );
                            } else {
                                return <p key={`${message.id}-part-${index}-image-fallback`} className="text-gray-500 text-sm">[Image not available]</p>;
                            }
                        } else if (part.type === 'tool-call') {
                            // Parse the stringified args for display
                            const displayArgs = typeof part.args === 'string' ? JSON.parse(part.args) : part.args;
                            
                            return (
                                <div key={`${message.id}-part-${index}-tool`} className="p-2 my-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700">
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                                        <Wrench size={12} className="flex-shrink-0" />
                                        <span>Tool Call: <strong>{part.toolName}</strong></span>
                                    </div>
                                    <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                                        Args: {JSON.stringify(displayArgs, null, 2)}
                                    </pre>
                                </div>
                            );
                        } else if (part.type === 'tool-invocation') {
                            const toolInvocation = (part as ToolInvocationPart).toolInvocation;
                            return (
                                <div key={`${message.id}-part-${index}-tool`} className="mt-2 p-2 my-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700">
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                                        <Wrench size={12} className="flex-shrink-0" />
                                        <span>Tool Used: <strong>{toolInvocation.toolName}</strong></span>
                                    </div>
                                    <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                                        Args: {JSON.stringify(toolInvocation.args, null, 2)}
                                    </pre>
                                    {/* TODO: Add rendering for tool results if/when available */}
                                    {/* Check state before accessing result */}
                                    {toolInvocation.state === 'result' && (toolInvocation as any).result && (
                                        <pre className="mt-1 text-xs text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
                                            Result: {JSON.stringify((toolInvocation as any).result, null, 2)}
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
            // Handle unexpected content types (no change)
            console.warn('[ChatMessageItem] Unexpected message content type:', typeof message.content, message.content);
            return <p className="text-red-500">[Invalid message content]</p>;
        }
    };

    return (
        <motion.div
            key={message.id}
            className={`flex flex-row gap-2 w-full mb-4 md:px-0`} 
            initial={{ y: 5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
        >
            <div className="size-[24px] flex flex-col justify-start items-center flex-shrink-0 text-zinc-400 pt-1">
                {message.role === 'assistant' ? <BotIcon /> : <UserIcon />}
            </div>
            <div className="flex flex-col gap-1 flex-grow break-words overflow-hidden p-2 rounded-md bg-[--message-bg] shadow-sm">
                {/* 1. Render the main text content (if it exists) */}
                {(typeof message.content === 'string' && message.content.trim()) && (
                    <div className="prose chat-message-text break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 mb-2">
                        <NonMemoizedMarkdown>
                            {extractUserDisplayContent(message.content, message.role)}
                        </NonMemoizedMarkdown>
                    </div>
                )}
                
                {/* 2. Render any Tool Invocations or Images found in parts */}
                {Array.isArray(message.parts) && message.parts.map((part, index) => {
                     // Explicitly cast part to ContentPart to help linter
                     const contentPart = part as ContentPart;

                    let effectiveToolInvocation: ToolInvocation | undefined = undefined;
                    let toolCallIdForExpansion: string | undefined = undefined;

                    if (contentPart.type === 'tool-invocation') {
                        effectiveToolInvocation = (contentPart as ToolInvocationPart).toolInvocation;
                        if (effectiveToolInvocation) {
                            toolCallIdForExpansion = effectiveToolInvocation.toolCallId;
                        }
                    } else if (contentPart.type === 'tool-call' && (contentPart as any).result !== undefined) {
                        const toolCallPart = contentPart as ToolCallPart & { result: any; toolCallId: string };
                        toolCallIdForExpansion = toolCallPart.toolCallId;
                        effectiveToolInvocation = {
                            toolCallId: toolCallPart.toolCallId,
                            toolName: toolCallPart.toolName,
                            args: toolCallPart.args,
                            result: toolCallPart.result,
                            state: 'result', // Inferred state
                        } as ToolInvocation; // Cast to ToolInvocation, acknowledging 'type' field isn't set here but structure matches
                    }

                    if (effectiveToolInvocation && toolCallIdForExpansion) {
                        const toolCallId = toolCallIdForExpansion; // Use the extracted ID
                        const isExpanded = !!expandedToolCalls[toolCallId];
                        
                        // --- NEW: Specific rendering for searchAndTagDocumentsTool ---
                        if (
                            effectiveToolInvocation.toolName === 'searchAndTagDocumentsTool' &&
                            effectiveToolInvocation.state === 'result' &&
                            effectiveToolInvocation.result &&
                            typeof effectiveToolInvocation.result === 'object' &&
                            (effectiveToolInvocation.result as SearchAndTagDocumentsToolResult).presentationStyle === 'listWithTagButtons'
                        ) {
                            const searchResult = effectiveToolInvocation.result as SearchAndTagDocumentsToolResult;
                            return (
                                <div key={`${message.id}-part-${index}-search-results`} className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800/30">
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
                        } else {
                            // --- EXISTING: Fallback generic tool invocation rendering (collapsible) ---
                            return (
                                <div key={`${message.id}-part-${index}-tool`} className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700">
                                    <div 
                                        className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer" 
                                        onClick={() => toggleToolCallExpansion(toolCallId)}
                                    >
                                        <Wrench size={12} className="flex-shrink-0" />
                                        <span>Tool Used: <strong>{effectiveToolInvocation.toolName}</strong></span>
                                        <span className="ml-auto text-zinc-400 dark:text-zinc-500">{isExpanded ? '[-]' : '[+]'}</span>
                                    </div>
                                    
                                    {isExpanded && (
                                        <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
                                            <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                                                Args: {JSON.stringify(effectiveToolInvocation.args, null, 2)}
                                            </pre>
                                            {effectiveToolInvocation.state === 'result' && (effectiveToolInvocation as any).result && (
                                                <pre className="mt-1 text-xs text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
                                                    Result: {JSON.stringify((effectiveToolInvocation as any).result, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        }
                    } else if (contentPart.type === 'image') { // Check contentPart.type
                        // --- Image rendering logic (no change needed here) --- 
                        const imagePart = contentPart as ImagePart; // Assert type
                        const imageUrl = typeof imagePart.image === 'string' 
                            ? imagePart.image 
                            : imagePart.image instanceof URL 
                                ? imagePart.image.href 
                                : null;
                        
                        if (imagePart.error) {
                            return <p key={`${message.id}-part-${index}-image-error`} className="text-red-500 text-sm">[Error: {imagePart.error}]</p>;
                        }
                        if (imageUrl) {
                            return (
                                <div key={`${message.id}-part-${index}-image`} className="relative w-full max-w-xs h-auto my-2"> 
                                    <Image 
                                        src={imageUrl} 
                                        alt="User uploaded content" 
                                        width={300} 
                                        height={200} 
                                        className="rounded-md object-contain" 
                                        unoptimized={true} 
                                    />
                                </div>
                            );
                        } else {
                            return <p key={`${message.id}-part-${index}-image-fallback`} className="text-gray-500 text-sm">[Image not available]</p>;
                        }
                    } 
                    // TextParts should be handled by the main message.content string rendering if present.
                    // Rendering them here from message.parts can lead to duplication.
                    return null; 
                })}

                {/* Send to Editor Button - Uses specifically extracted text */}
                {canSendToEditor && (
                    <div className="mt-1 flex justify-end">
                        <button
                            onClick={() => handleSendToEditor(displayableRawText)}
                            className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                            title="Send to Editor">
                            <SendToBack size={14} />
                        </button>
                    </div>
                )}
                
            </div>
        </motion.div>
    );
});

// Set display name for better debugging
ChatMessageItem.displayName = 'ChatMessageItem'; 