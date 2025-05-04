import { useState, useEffect, useCallback } from 'react';
// Import core types 
import type { CoreMessage } from 'ai'; 
// Keep Message from ai/react for type checking elsewhere if needed
import type { Message as UIMessage } from 'ai/react'; 
import type { Message as SupabaseMessage, ToolCall as SupabaseToolCall } from '@/types/supabase';

interface MessageWithDetails extends SupabaseMessage {
    signedDownloadUrl: string | null;
    tool_calls: SupabaseToolCall[] | null; 
}

interface UseInitialChatMessagesProps {
    documentId: string | undefined | null;
    setPageError: (error: string | null) => void; 
}

export interface UseInitialChatMessagesReturn {
    isLoadingMessages: boolean;
    initialMessages: UIMessage[] | null; 
}

export function useInitialChatMessages({
    documentId,
    setPageError,
}: UseInitialChatMessagesProps): UseInitialChatMessagesReturn {
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

    const fetchInitialMessages = useCallback(async () => {
        setIsLoadingMessages(true);
        setInitialMessages(null); 

        if (!documentId) {
            setIsLoadingMessages(false);
            return;
        }

        console.log(`[useInitialChatMessages] Fetching messages for document: ${documentId}`);

        try {
            const response = await fetch(`/api/documents/${documentId}/messages`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                throw new Error(
                    errData.error?.message || `Failed to fetch messages (${response.status})`
                );
            }
            const { data }: { data: MessageWithDetails[] } = await response.json();

            // --- ADDED LOGGING: Raw API data ---
            console.log('[useInitialChatMessages] Raw data received from API:', JSON.stringify(data, null, 2));
            // --- END LOGGING --- 

            const formattedMessages: UIMessage[] = [];
            const allowedInitialRoles = ['user', 'assistant', 'system'];

            for (const msg of data) {
                 const role = msg.role as UIMessage['role'];
                 
                 if (!allowedInitialRoles.includes(role)) { 
                    console.warn(`[useInitialChatMessages] Skipping message ${msg.id} with initial role: ${role}`);
                    continue;
                 }

                // 1. Handle System messages
                if (role === 'system') {
                    formattedMessages.push({
                        id: msg.id,
                        role: 'system',
                        content: msg.content || '',
                        createdAt: new Date(msg.created_at),
                    });
                    continue;
                }

                // 2. Handle User messages (REVISED LOGIC - v2)
                if (role === 'user') {
                    let combinedTextContent = '';
                    const uiParts: UIMessage['parts'] = [];
                    let parsedContentArray: any[] = [];

                    // --- Try parsing msg.content if it's a stringified JSON --- 
                    if (typeof msg.content === 'string') {
                         try {
                            parsedContentArray = JSON.parse(msg.content);
                            if (!Array.isArray(parsedContentArray)) parsedContentArray = []; // Ensure it's an array
                         } catch (e) {
                            console.warn(`[useInitialChatMessages] User msg content was string but not JSON, treating as plain text. MsgId: ${msg.id}`);
                            // Treat as plain text
                            combinedTextContent = msg.content;
                            if (msg.content.trim()) {
                                uiParts.push({ type: 'text', text: msg.content });
                            }
                            parsedContentArray = []; // Ensure loop below is skipped
                         }
                    } else if (Array.isArray(msg.content)) {
                        // Already an array (received from API)
                        parsedContentArray = msg.content;
                    } else {
                         console.warn(`[useInitialChatMessages] User msg content has unexpected type: ${typeof msg.content}. MsgId: ${msg.id}`);
                         parsedContentArray = [];
                    }
                    // --- End Parsing --- 

                    // --- Iterate parsed content to build final parts and text --- 
                    if (parsedContentArray.length > 0) {
                        parsedContentArray.forEach(part => {
                            if (part.type === 'text' && typeof part.text === 'string') {
                                const trimmedText = part.text.trim();
                                if (trimmedText) {
                                    combinedTextContent += (combinedTextContent ? '\n' : '') + part.text;
                                    uiParts.push({ type: 'text', text: part.text });
                                }
                            } else if (part.type === 'image' && part.image) { 
                                // Image part should contain the signed URL from the GET API route
                                uiParts.push({ 
                                    type: 'image', 
                                    image: part.image, // Pass the signed URL through
                                    // Include error if present from API (though unlikely here)
                                    ...(part.error && { error: part.error })
                                });
                            } 
                            // Add other part types if needed
                        });
                    }
                    // --- End Iteration --- 

                    // Push the formatted message WITH parts
                    formattedMessages.push({
                        id: msg.id,
                        role: 'user',
                        content: combinedTextContent, // Use combined text for top-level content
                        parts: uiParts, // Include the processed parts array
                        createdAt: new Date(msg.created_at),
                    });
                    continue; 
                }

                // 3. Handle Assistant messages (REVISED LOGIC - v3)
                if (role === 'assistant') {
                    const uiParts: UIMessage['parts'] = [];
                    let combinedTextContent = '';

                    // --- ADDED LOGGING: Inspect raw msg.content for assistants --- 
                    console.log(`[useInitialChatMessages] Inspecting raw msg.content for assistant msg ${msg.id}:`, JSON.stringify(msg.content, null, 2));
                    // --- END LOGGING --- 

                    if (Array.isArray(msg.content)) {
                        // Iterate through parts in the content array
                        msg.content.forEach(part => {
                            if (part.type === 'text' && typeof part.text === 'string') {
                                const trimmedText = part.text.trim();
                                if (trimmedText) {
                                    combinedTextContent += (combinedTextContent ? '\n' : '') + part.text; // Concatenate multiple text parts
                                    // Add text part to UI parts array
                                    uiParts.push({ type: 'text', text: part.text });
                                }
                            } else if (part.type === 'tool-call') {
                                // --- ADDED LOGGING for tool-call parts --- 
                                console.log(`[useInitialChatMessages] Inspecting tool-call part for msg ${msg.id}:`, JSON.stringify(part, null, 2));
                                // --- END LOGGING --- 
                                
                                // Check required fields before creating UI part
                                if (part.toolCallId && part.toolName && part.args) {
                                    // Add tool-invocation part based on tool-call part in content
                                    uiParts.push({
                                        type: 'tool-invocation',
                                        toolInvocation: {
                                            toolCallId: part.toolCallId,
                                            toolName: part.toolName,
                                            args: part.args, 
                                            result: part.result !== undefined ? part.result : null,
                                            state: 'result' // Assuming completed for loaded messages?
                                        },
                                    });
                                }
                            } 
                            // Add handling for other part types found in content if necessary
                        });
                    } else if (typeof msg.content === 'string' && msg.content.trim() !== '') {
                        // Handle legacy/fallback string content
                        combinedTextContent = msg.content;
                        uiParts.push({ type: 'text', text: msg.content });
                    }

                    // Only create an assistant message if we found meaningful parts
                    if (uiParts.length > 0) {
                        const assistantMessage: UIMessage = {
                            id: msg.id,
                            role: 'assistant',
                            content: combinedTextContent, // Top-level content is combined text
                            createdAt: new Date(msg.created_at),
                            parts: uiParts, // Assign the processed parts array
                        };
                        formattedMessages.push(assistantMessage);
                    }
                    // If assistant message has no meaningful parts derived from content, it's skipped
                }
            }

            // --- ADDED LOGGING: Final formatted messages before setting state ---
            console.log(`[useInitialChatMessages] Fetched and formatted ${formattedMessages.length} UIMessages.`);
            console.log('[useInitialChatMessages] Final formattedMessages state update:', JSON.stringify(formattedMessages, null, 2));
            // --- END LOGGING ---
            setInitialMessages(formattedMessages); 

        } catch (err: any) {
            console.error('[useInitialChatMessages] Error fetching/formatting messages:', err);
            setPageError(`Failed to load messages: ${err.message}`);
            setInitialMessages([]); 
        } finally {
            setIsLoadingMessages(false);
        }
    }, [documentId, setPageError]);

    useEffect(() => {
        fetchInitialMessages();
    }, [fetchInitialMessages]);

    return {
        isLoadingMessages,
        initialMessages,
    };
} 