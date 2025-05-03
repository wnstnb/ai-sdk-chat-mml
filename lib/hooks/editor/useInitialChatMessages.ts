import { useState, useEffect, useCallback } from 'react';
// Revert to using Message from ai/react for compatibility with useChat hook and UI components
import type { Message } from 'ai/react'; 
// Keep core types for constructing parts if needed, though Message often uses content directly or experimental_attachments
import type { CoreMessage, TextPart, ImagePart, ToolCallPart, ToolResultPart } from 'ai'; 
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
    initialMessages: Message[] | null; // <-- Reverted to Message[] from ai/react
}

export function useInitialChatMessages({
    documentId,
    setPageError,
}: UseInitialChatMessagesProps): UseInitialChatMessagesReturn {
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [initialMessages, setInitialMessages] = useState<Message[] | null>(null); // <-- Use Message type

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

            const formattedMessages: Message[] = []; // <-- Use Message type
            const allowedInitialRoles = ['user', 'assistant', 'system'];

            for (const msg of data) {
                 // Cast to broader string first for includes check
                 if (!allowedInitialRoles.includes(msg.role as string)) { 
                    console.warn(`[useInitialChatMessages] Skipping message ${msg.id} with initial role: ${msg.role}`);
                    continue;
                 }

                 // Cast to Message['role'] for type safety in object creation
                 const role = msg.role as Message['role'];

                // 1. Handle System messages
                if (role === 'system') {
                    formattedMessages.push({
                        id: msg.id, // Add ID back
                        role: 'system',
                        content: msg.content || '',
                        createdAt: new Date(msg.created_at), // Add timestamp back
                    });
                    continue;
                }

                // 2. Handle User messages
                if (role === 'user') {
                    // Use experimental_attachments for images with Message type
                    const attachments = msg.signedDownloadUrl ? [{
                        name: msg.image_url?.split('/').pop() || `image_${msg.id}`,
                        contentType: 'image/*', // Assuming image
                        url: msg.signedDownloadUrl,
                    }] : undefined;
                    
                    formattedMessages.push({
                        id: msg.id, // Add ID back
                        role: 'user',
                        content: msg.content || '', 
                        createdAt: new Date(msg.created_at), // Add timestamp back
                        experimental_attachments: attachments,
                    });
                    continue; 
                }

                // 3. Handle Assistant messages (Option A Format - ai/react - Attempt 3)
                if (role === 'assistant') {
                    const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
                    const createdAt = new Date(msg.created_at);

                    // 3a. Base assistant message (contains text content if any)
                    // This message conceptually triggers the tool calls
                    formattedMessages.push({
                        id: msg.id, 
                        role: 'assistant',
                        content: msg.content || '', // May be empty if only tool calls
                        createdAt: createdAt,
                    });

                    // 3b. If tool calls exist, create a separate `tool` message for each result
                    if (hasToolCalls) {
                        msg.tool_calls!.forEach(tc => {
                            // Create the tool message containing the result
                            const toolResultMessage: Message = {
                                id: `${msg.id}-toolresult-${tc.tool_call_id}`, // Unique ID for the result message
                                role: 'tool' as any, // Cast if needed, useChat should handle this role
                                tool_call_id: tc.tool_call_id, // Link to the conceptual call via ID
                                // Tool result goes into the content field
                                content: typeof tc.tool_output === 'string' 
                                           ? tc.tool_output 
                                           : JSON.stringify(tc.tool_output ?? null),
                                createdAt: createdAt, // Use same timestamp as assistant msg
                            } as Message; 
                            formattedMessages.push(toolResultMessage);
                        });
                    }
                }
            }

            console.log(`[useInitialChatMessages] Fetched and formatted ${formattedMessages.length} Messages (ai/react format - Text + Tool Results).`);
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