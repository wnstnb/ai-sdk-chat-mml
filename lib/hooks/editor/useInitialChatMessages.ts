import { useState, useEffect, useCallback } from 'react';
// Revert to using Message from ai/react for compatibility
// import type { Message } from 'ai/react'; 

// --- MODIFICATION: Revert to using Message from ai/react --- 
import type { Message } from 'ai/react'; 
// --- END MODIFICATION --- 

// Remove core type imports as we align with ai/react
// import type { CoreMessage, TextPart, ImagePart, ToolCallPart, ToolResultPart } from 'ai'; 

// --- MODIFICATION: Import CoreMessage and relevant parts --- 
import type { CoreMessage, TextPart, ImagePart } from 'ai';
// --- END MODIFICATION --- 

import type { Message as SupabaseMessage, ToolCall as SupabaseToolCall } from '@/types/supabase';

// Import Message from ai/react and rename it to avoid conflict if necessary
import { type Message as AiReactMessageRoot } from 'ai/react'; 

// Import ToolInvocation from @ai-sdk/ui-utils as it's used in page.tsx for state
import { type ToolInvocation as AiSdkUIToolInvocation } from '@ai-sdk/ui-utils';

// Type for parts that might be stored in the messages.content JSONB field
type StoredTextPart = { type: 'text'; text: string };
type StoredToolCallPartWithResult = {
    type: 'tool-call';
    toolCallId: string;
    toolName: string;
    args: any;
    result: any; 
};
type StoredMessageContentPart = StoredTextPart | StoredToolCallPartWithResult;

// Define the shape of a tool call object for the assistant's tool_calls array
interface AssistantToolCall {
    id: string; // This is the tool_call_id AI SDK uses
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

// Define parts for message.content array
type CustomTextPart = { type: 'text'; text: string };
type CustomToolInvocationUIPart = {
    type: 'tool-invocation';
    toolInvocation: AiSdkUIToolInvocation; // Use the imported type
};
type CustomMessageContentPart = CustomTextPart | CustomToolInvocationUIPart;

// Define our custom UI message type
export interface CustomUIMessage extends Omit<AiReactMessageRoot, 'role' | 'content' | 'tool_calls' | 'tool_call_id'> {
    signedDownloadUrl?: string | null;
    role: AiReactMessageRoot['role'] | 'tool';
    content: string | CustomMessageContentPart[]; // This should use CustomMessageContentPart
    tool_calls?: AssistantToolCall[]; // For assistant messages requesting tool calls (AI SDK's primary way)
    tool_call_id?: string; // For tool messages responding to a call
}

interface MessageWithDetails extends SupabaseMessage {
    signedDownloadUrl: string | null;
    tool_calls: SupabaseToolCall[] | null; 
}

// NEW: Interface for pagination metadata from API
interface MessagesPaginationMeta {
    hasMore: boolean;
    total: number;
    offset: number;
    limit: number;
}

// NEW: Interface for paginated messages response
interface PaginatedMessagesResponse {
    data: MessageWithDetails[];
    meta: MessagesPaginationMeta;
}

interface UseInitialChatMessagesProps {
    documentId: string | undefined | null;
    setPageError: (error: string | null) => void; 
    // NEW: Optional initial display limit (defaults to 12)
    initialDisplayLimit?: number;
}

export interface UseInitialChatMessagesReturn {
    isLoadingMessages: boolean;
    initialMessages: CustomUIMessage[] | null; // Full message list for AI context
    // NEW: Display-only message list and load more functionality
    displayedMessages: CustomUIMessage[] | null; // Subset for UI display
    canLoadMore: boolean;
    isLoadingMore: boolean;
    loadMoreMessages: () => Promise<void>;
}

export function useInitialChatMessages({
    documentId,
    setPageError,
    initialDisplayLimit = 12, // NEW: Default to last 12 messages for display
}: UseInitialChatMessagesProps): UseInitialChatMessagesReturn {
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [initialMessages, setInitialMessages] = useState<CustomUIMessage[] | null>(null); // Full list for AI
    
    // NEW: Dual-layer state management
    const [displayedMessages, setDisplayedMessages] = useState<CustomUIMessage[] | null>(null); // Subset for UI
    const [canLoadMore, setCanLoadMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [totalMessages, setTotalMessages] = useState(0);

    // NEW: Function to format messages (extracted for reuse)
    const formatMessages = useCallback((rawMessages: MessageWithDetails[]): CustomUIMessage[] => {
        const formattedMessages: CustomUIMessage[] = [];
        const allowedInitialRoles = ['user', 'assistant', 'system'];

        for (const msg of rawMessages) {
            if (!allowedInitialRoles.includes(msg.role as string)) { 
                continue;
            }
            const role = msg.role as AiReactMessageRoot['role'];
            const createdAtTimestamp = (msg as any).createdAt || msg.created_at;

            if (role === 'system') {
                console.log(`[useInitialChatMessages] Skipping system message ${msg.id}`);
                continue; 
            }
            
            if (role === 'user') {
                // Process msg.content to a string (userTextContent)
                let userTextContent = '';
                if (typeof msg.content === 'string') {
                    userTextContent = msg.content;
                } else if (Array.isArray(msg.content)) {
                    userTextContent = msg.content
                        .filter((part): part is TextPart => part.type === 'text' && typeof part.text === 'string')
                        .map(part => part.text)
                        .join('\n');
                }

                const messageToPush: CustomUIMessage = {
                    id: msg.id,
                    role: 'user',
                    content: userTextContent,
                    createdAt: new Date(createdAtTimestamp),
                    signedDownloadUrl: msg.signedDownloadUrl
                };

                formattedMessages.push(messageToPush);
                continue;
            }
            
            if (role === 'assistant') {
                const assistantMessageContentParts: CustomMessageContentPart[] = [];
                const assistantSdkToolCalls: AssistantToolCall[] = [];
                let textualContentForAssistantMessage = '';

                if (Array.isArray(msg.content)) {
                    // Initialize a Map to store tool call results
                    const resultsMap = new Map<string, any>();
                    
                    for (const part of msg.content as StoredMessageContentPart[]) {
                        if (part.type === 'text') {
                            assistantMessageContentParts.push({ type: 'text', text: part.text });
                            textualContentForAssistantMessage += (textualContentForAssistantMessage ? '\n' : '') + part.text;
                        } else if (part.type === 'tool-call') {
                            const toolCallPartWithPotentialResult = part as StoredToolCallPartWithResult & { result?: any };

                            if (toolCallPartWithPotentialResult.toolCallId && 
                                toolCallPartWithPotentialResult.toolName && 
                                toolCallPartWithPotentialResult.args !== undefined) {

                                const argsString = typeof toolCallPartWithPotentialResult.args === 'string' 
                                    ? toolCallPartWithPotentialResult.args 
                                    : JSON.stringify(toolCallPartWithPotentialResult.args);

                                const embeddedResult = toolCallPartWithPotentialResult.result;
                                const resultFromMap = resultsMap.get(toolCallPartWithPotentialResult.toolCallId);
                                const finalResult = embeddedResult !== undefined ? embeddedResult : resultFromMap;
                                const state: 'result' | 'call' = finalResult !== undefined ? 'result' : 'call';

                                assistantMessageContentParts.push({
                                    type: 'tool-invocation',
                                    toolInvocation: {
                                        toolCallId: toolCallPartWithPotentialResult.toolCallId,
                                        toolName: toolCallPartWithPotentialResult.toolName,
                                        args: argsString,
                                        result: finalResult,
                                        state: state
                                    },
                                });
                            }
                        }
                    }
                } else if (typeof msg.content === 'string') {
                    textualContentForAssistantMessage = msg.content;
                    if (textualContentForAssistantMessage.trim()) {
                        assistantMessageContentParts.push({ type: 'text', text: textualContentForAssistantMessage });
                    }
                    
                    if (msg.tool_calls && msg.tool_calls.length > 0) {
                        for (const tc of msg.tool_calls) {
                            const argsString = typeof tc.tool_input === 'string' ? tc.tool_input : JSON.stringify(tc.tool_input);
                            assistantSdkToolCalls.push({
                                id: tc.tool_call_id, type: 'function', function: { name: tc.tool_name, arguments: argsString }
                            });
                            assistantMessageContentParts.push({
                                type: 'tool-invocation',
                                toolInvocation: {
                                    toolCallId: tc.tool_call_id, toolName: tc.tool_name, args: tc.tool_input,
                                    result: tc.tool_output,
                                    state: 'result',
                                } as AiSdkUIToolInvocation,
                            });
                            if (tc.tool_output !== undefined && tc.tool_output !== null) {
                                const toolResultContentStr = typeof tc.tool_output === 'string' ? tc.tool_output : JSON.stringify(tc.tool_output);
                                formattedMessages.push({
                                    id: `${msg.id}-toolres-${tc.tool_call_id}`, role: 'tool', content: toolResultContentStr,
                                    tool_call_id: tc.tool_call_id, createdAt: new Date(tc.created_at || createdAtTimestamp),
                                });
                            }
                        }
                    }
                }
                
                const finalContentForSdkMessage = assistantMessageContentParts.length > 0 
                    ? assistantMessageContentParts
                    : textualContentForAssistantMessage;

                const assistantMsgForSdk: CustomUIMessage = {
                    id: msg.id,
                    role: 'assistant',
                    content: finalContentForSdkMessage,
                    createdAt: new Date(createdAtTimestamp),
                    signedDownloadUrl: msg.signedDownloadUrl,
                };
                
                formattedMessages.push(assistantMsgForSdk);
                continue;
            }
        }

        return formattedMessages;
    }, []);

    // NEW: Load more messages function
    const loadMoreMessages = useCallback(async () => {
        if (!documentId || isLoadingMore || !canLoadMore) {
            return;
        }

        setIsLoadingMore(true);

        try {
            const currentDisplayCount = displayedMessages?.length || 0;
            const response = await fetch(
                `/api/documents/${documentId}/messages?limit=${initialDisplayLimit}&offset=${currentDisplayCount}`
            );

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                throw new Error(errData.error?.message || `Failed to fetch more messages (${response.status})`);
            }

            const { data, meta }: PaginatedMessagesResponse = await response.json();
            const newFormattedMessages = formatMessages(data);

            if (newFormattedMessages.length > 0 && displayedMessages) {
                // Prepend older messages to the displayed list
                setDisplayedMessages(prev => prev ? [...newFormattedMessages, ...prev] : newFormattedMessages);
            }

            // Update pagination state
            setCanLoadMore(meta.hasMore);

        } catch (err: any) {
            console.error('[useInitialChatMessages] Error loading more messages:', err);
            setPageError(`Failed to load more messages: ${err.message}`);
        } finally {
            setIsLoadingMore(false);
        }
    }, [documentId, isLoadingMore, canLoadMore, displayedMessages, initialDisplayLimit, formatMessages, setPageError]);

    const fetchInitialMessages = useCallback(async () => {
        setIsLoadingMessages(true);
        setInitialMessages(null);
        setDisplayedMessages(null);

        if (!documentId) {
            setIsLoadingMessages(false);
            return;
        }

        try {
            // DUAL APPROACH: Fetch all messages for AI context AND paginated for display
            
            // 1. Fetch ALL messages for AI context (using loadAll=true)
            const allMessagesResponse = await fetch(`/api/documents/${documentId}/messages?loadAll=true`);
            
            if (!allMessagesResponse.ok) {
                const errData = await allMessagesResponse.json().catch(() => ({ error: { message: `HTTP ${allMessagesResponse.status}` } }));
                throw new Error(errData.error?.message || `Failed to fetch all messages (${allMessagesResponse.status})`);
            }
            
            const { data: allMessagesData }: { data: MessageWithDetails[] } = await allMessagesResponse.json();
            
            // 2. Fetch paginated messages for display (last N messages)
            const displayMessagesResponse = await fetch(
                `/api/documents/${documentId}/messages?limit=${initialDisplayLimit}&offset=0`
            );
            
            if (!displayMessagesResponse.ok) {
                const errData = await displayMessagesResponse.json().catch(() => ({ error: { message: `HTTP ${displayMessagesResponse.status}` } }));
                throw new Error(errData.error?.message || `Failed to fetch display messages (${displayMessagesResponse.status})`);
            }
            
            const { data: displayMessagesData, meta }: PaginatedMessagesResponse = await displayMessagesResponse.json();

            console.log(`[useInitialChatMessages] Fetched ${allMessagesData.length} total messages, ${displayMessagesData.length} for display`);

            // Format both sets of messages
            const allFormattedMessages = formatMessages(allMessagesData);
            const displayFormattedMessages = formatMessages(displayMessagesData);

            // Update state with dual-layer approach
            setInitialMessages(allFormattedMessages); // Full context for AI
            setDisplayedMessages(displayFormattedMessages); // Subset for UI
            setTotalMessages(meta.total);
            setCanLoadMore(meta.hasMore);

            console.log(`[useInitialChatMessages] Set ${allFormattedMessages.length} AI messages, ${displayFormattedMessages.length} display messages`);
            console.log(`[useInitialChatMessages] Can load more: ${meta.hasMore}, Total: ${meta.total}`);

        } catch (err: any) {
            console.error("[useInitialChatMessages] Error fetching messages:", err);
            setPageError(`Failed to load messages: ${err.message}`);
            setInitialMessages([]);
            setDisplayedMessages([]);
        } finally {
            setIsLoadingMessages(false);
        }
    }, [documentId, initialDisplayLimit, formatMessages, setPageError]);

    useEffect(() => {
        fetchInitialMessages();
    }, [fetchInitialMessages]);

    return {
        isLoadingMessages,
        initialMessages, // Full message context for AI
        // NEW: Display layer for UI
        displayedMessages,
        canLoadMore,
        isLoadingMore,
        loadMoreMessages,
    };
} 