import { useState, useEffect, useCallback } from 'react';
// Import core types 
import type { CoreMessage, Message, TextPart, ToolCallPart, ToolResultPart } from 'ai'; 
// Keep Message from ai/react for type checking elsewhere if needed
import type { Message as UIMessage } from 'ai/react'; 
import type { Message as SupabaseMessage, ToolCall as SupabaseToolCall } from '@/types/supabase';

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
    initialMessages: UIMessage[] | null; // Full message list for AI context
    // NEW: Display-only message list and load more functionality
    displayedMessages: UIMessage[] | null; // Subset for UI display
    setDisplayedMessages: React.Dispatch<React.SetStateAction<UIMessage[] | null>>; // For syncing with useChat messages
    canLoadMore: boolean;
    isLoadingMore: boolean;
    loadMoreMessages: () => Promise<void>;
}

// Define a union type for the parts we expect in msg.content array for assistant messages
type AssistantMessageContentPart = TextPart | ToolCallPart | ToolResultPart;

export function useInitialChatMessages({
    documentId,
    setPageError,
    initialDisplayLimit = 12, // NEW: Default to last 12 messages for display
}: UseInitialChatMessagesProps): UseInitialChatMessagesReturn {
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null); // Full list for AI
    
    // NEW: Dual-layer state management
    const [displayedMessages, setDisplayedMessages] = useState<UIMessage[] | null>(null); // Subset for UI
    const [canLoadMore, setCanLoadMore] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [totalMessages, setTotalMessages] = useState(0);

    // NEW: Helper function to format messages (reused for both full and display lists)
    const formatMessages = useCallback((rawData: MessageWithDetails[]): UIMessage[] => {
        const formattedMessages: UIMessage[] = [];
        const allowedInitialRoles = ['user', 'assistant', 'system'];

        for (const msg of rawData) {
            const role = msg.role as UIMessage['role'];
            
            if (!allowedInitialRoles.includes(role)) { 
                console.warn(`[useInitialChatMessages] Skipping message ${msg.id} with initial role: ${role}`);
                continue;
            }

            // 1. Handle System messages
            if (role === 'system') {
                console.log(`[useInitialChatMessages] Processing SYSTEM message:`, msg);

                let systemMessageContentString: string;
                if (typeof msg.content === 'string') {
                    systemMessageContentString = msg.content;
                } else if (msg.content === null || msg.content === undefined) {
                    systemMessageContentString = '';
                } else if (Array.isArray(msg.content)) {
                    systemMessageContentString = msg.content
                        .filter((part): part is TextPart => part.type === 'text')
                        .map(part => part.text)
                        .join('\n');
                } else {
                    console.warn('[useInitialChatMessages] System message content had unexpected type:', typeof msg.content);
                    systemMessageContentString = '';
                }

                const systemMessage: UIMessage = {
                    id: msg.id,
                    role: 'system',
                    content: systemMessageContentString,
                    createdAt: new Date(msg.created_at),
                };
                formattedMessages.push(systemMessage);
                continue;
            }

            // 2. Handle User messages
            if (role === 'user') {
                console.log(`[useInitialChatMessages] Processing USER message ${msg.id}:`, msg);

                const uiParts: UIMessage['parts'] = [];
                let combinedTextContent = '';
                let parsedContentArray: any[] = [];

                if (typeof msg.content === 'string') {
                    try {
                        parsedContentArray = JSON.parse(msg.content);
                        if (!Array.isArray(parsedContentArray)) parsedContentArray = [];
                    } catch (e) {
                        console.warn(`[useInitialChatMessages] User msg content was string but not JSON, treating as plain text. MsgId: ${msg.id}`);
                        combinedTextContent = msg.content;
                        if (msg.content.trim()) {
                            uiParts.push({ type: 'text', text: msg.content });
                        }
                        parsedContentArray = [];
                    }
                } else if (Array.isArray(msg.content)) {
                    parsedContentArray = msg.content;
                } else {
                    console.warn(`[useInitialChatMessages] User msg content has unexpected type: ${typeof msg.content}. MsgId: ${msg.id}`);
                    parsedContentArray = [];
                }

                for (const part of parsedContentArray) {
                    if (part.type === 'text' && typeof part.text === 'string') {
                        combinedTextContent += (combinedTextContent ? '\n' : '') + part.text;
                        uiParts.push({ type: 'text', text: part.text });
                    } else if (part.type === 'image') {
                        // Handle image parts - convert to file type for UI compatibility
                        uiParts.push({ 
                            type: 'file', 
                            file: {
                                name: 'image',  
                                size: 0,
                                type: 'image/*'
                            }
                        } as any);
                    }
                }

                const userMessage: UIMessage = {
                    id: msg.id,
                    role: 'user',
                    content: combinedTextContent,
                    createdAt: new Date(msg.created_at),
                    parts: uiParts.length > 0 ? uiParts : undefined,
                };

                // Add signedDownloadUrl if available
                if (msg.signedDownloadUrl) {
                    (userMessage as any).signedDownloadUrl = msg.signedDownloadUrl;
                }

                formattedMessages.push(userMessage);
                continue;
            }

            // 3. Handle Assistant messages
            if (role === 'assistant') {
                console.log(`[useInitialChatMessages] Processing ASSISTANT message ${msg.id}:`, msg);

                const uiParts: UIMessage['parts'] = [];
                let combinedTextContent = '';

                console.log(`[useInitialChatMessages] Inspecting raw msg.content for assistant msg ${msg.id}:`, JSON.stringify(msg.content, null, 2));

                if (Array.isArray(msg.content)) {
                    const resultsMap = new Map<string, any>();
                    msg.content.forEach(p => {
                        const corePart = p as any;
                        if (corePart.type === 'tool-result') {
                            resultsMap.set(corePart.toolCallId, corePart.result);
                        }
                    });

                    msg.content.forEach(part => {
                        const corePart = part as any;
                        if (corePart.type === 'text' && typeof corePart.text === 'string') {
                            const trimmedText = corePart.text.trim();
                            if (trimmedText) {
                                combinedTextContent += (combinedTextContent ? '\n' : '') + corePart.text;
                                uiParts.push({ type: 'text', text: corePart.text });
                            }
                        } else if (corePart.type === 'tool-call') {
                            console.log(`[useInitialChatMessages] Inspecting tool-call part for msg ${msg.id}:`, JSON.stringify(corePart, null, 2));
                        
                            const toolCallPartWithPotentialResult = corePart as ToolCallPart & { result?: any };
                        
                            if (toolCallPartWithPotentialResult.toolCallId && 
                                toolCallPartWithPotentialResult.toolName && 
                                toolCallPartWithPotentialResult.args !== undefined) {
                        
                                const embeddedResult = toolCallPartWithPotentialResult.result;
                                const resultFromMap = resultsMap.get(toolCallPartWithPotentialResult.toolCallId);
                                const finalResult = embeddedResult !== undefined ? embeddedResult : resultFromMap;
                                const state: 'result' | 'call' = finalResult !== undefined ? 'result' : 'call';
                        
                                console.log(`[useInitialChatMessages] Tool Call ID: ${toolCallPartWithPotentialResult.toolCallId}, Name: ${toolCallPartWithPotentialResult.toolName}, Embedded Result Found: ${embeddedResult !== undefined}, Result from Map: ${resultFromMap !== undefined}, Final State: ${state}`);
                        
                                uiParts.push({
                                    type: 'tool-invocation',
                                    toolInvocation: {
                                        toolCallId: toolCallPartWithPotentialResult.toolCallId,
                                        toolName: toolCallPartWithPotentialResult.toolName,
                                        args: toolCallPartWithPotentialResult.args, 
                                        result: finalResult,
                                        state: state
                                    },
                                });
                            }
                        }
                    });
                } else if (typeof msg.content === 'string' && msg.content.trim() !== '') {
                    combinedTextContent = msg.content;
                    uiParts.push({ type: 'text', text: msg.content });
                }

                if (uiParts.length > 0) {
                    const assistantMessage: UIMessage = {
                        id: msg.id,
                        role: 'assistant',
                        content: combinedTextContent,
                        createdAt: new Date(msg.created_at),
                        parts: uiParts,
                    };
                    formattedMessages.push(assistantMessage);
                }
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

        console.log(`[useInitialChatMessages] Fetching messages for document: ${documentId}`);

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

            console.log(`[useInitialChatMessages] Formatted ${allFormattedMessages.length} AI messages, ${displayFormattedMessages.length} display messages`);

            // Update state with dual-layer approach
            setInitialMessages(allFormattedMessages); // Full context for AI
            setDisplayedMessages(displayFormattedMessages); // Subset for UI
            setTotalMessages(meta.total);
            setCanLoadMore(meta.hasMore);

            console.log(`[useInitialChatMessages] Can load more: ${meta.hasMore}, Total: ${meta.total}`);

        } catch (err: any) {
            console.error('[useInitialChatMessages] Error fetching/formatting messages:', err);
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
        setDisplayedMessages, // For syncing with useChat messages
        canLoadMore,
        isLoadingMore,
        loadMoreMessages,
    };
} 