import { useState, useEffect, useCallback } from 'react';
import type { Message } from 'ai/react';
// Import Supabase types
import type { Message as SupabaseMessage, ToolCall as SupabaseToolCall } from '@/types/supabase';

// Type matching the API response structure
interface MessageWithDetails extends SupabaseMessage {
    signedDownloadUrl: string | null;
    tool_calls: SupabaseToolCall[] | null; // Array of tool calls made BY this message (if assistant)
}

// Define constants or import them
const INITIAL_MESSAGE_COUNT = 20;

interface UseInitialChatMessagesProps {
    documentId: string | undefined | null;
    setChatMessages: (messages: Message[]) => void;
    setDisplayedMessagesCount: React.Dispatch<React.SetStateAction<number>>;
    setPageError: (error: string | null) => void; // Add error setter from parent
}

export interface UseInitialChatMessagesReturn {
    isLoadingMessages: boolean;
    // Error is now handled via setPageError prop
    // fetchError: string | null;
}

export function useInitialChatMessages({
    documentId,
    setChatMessages,
    setDisplayedMessagesCount,
    setPageError,
}: UseInitialChatMessagesProps): UseInitialChatMessagesReturn {
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    // const [fetchError, setFetchError] = useState<string | null>(null); // Replaced by setPageError

    const fetchInitialMessages = useCallback(async () => {
        // Reset state for fetch
        setIsLoadingMessages(true);
        // setFetchError(null); // Replaced by setPageError
        // Don't clear page error here, let the caller manage overall page error state

        if (!documentId) {
            setIsLoadingMessages(false);
            // Don't set an error here, the document hook handles missing ID
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
            // Expect the API to return MessageWithDetails[]
            const { data }: { data: MessageWithDetails[] } = await response.json();

            // --- REVISED MESSAGE FORMATTING ---
            const formattedMessages: Message[] = [];
            const allowedRoles: Message['role'][] = ['user', 'assistant', 'system']; // 'tool' role is constructed manually

            for (const msg of data) {
                 if (!allowedRoles.includes(msg.role as any)) {
                    console.warn(`[useInitialChatMessages] Skipping message ${msg.id} with unknown role: ${msg.role}`);
                    continue;
                 }

                // 1. Handle User and System messages directly
                if ((msg.role as string) === 'user' || (msg.role as string) === 'system') {
                    formattedMessages.push({
                        id: msg.id,
                        role: msg.role,
                        content: msg.content || '',
                        createdAt: new Date(msg.created_at),
                        experimental_attachments: msg.signedDownloadUrl ? [{
                            name: msg.image_url?.split('/').pop() || `image_${msg.id}`,
                            contentType: 'image/*', // Assuming image for now
                            url: msg.signedDownloadUrl,
                        }] : undefined,
                    });
                    continue; // Move to next message
                }

                // 2. Handle Assistant messages - REVISED to use parts array
                if (msg.role === 'assistant') {
                    const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
                    const messageParts: any[] = []; // Initialize parts array

                    // Add text part if content exists
                    if (msg.content && msg.content.trim() !== '') {
                         messageParts.push({ type: 'text', text: msg.content });
                    }

                    // Add tool invocation parts if tool calls exist
                    if (hasToolCalls) {
                        msg.tool_calls!.forEach(tc => {
                            // Create ToolInvocation object in 'result' state
                            const toolInvocation = {
                                state: 'result' as const, // Mark as complete
                                toolCallId: tc.tool_call_id, 
                                toolName: tc.tool_name,
                                args: tc.tool_input,     // From DB
                                result: tc.tool_output   // From DB (can be null if not saved/no output)
                            };
                            messageParts.push({ type: 'tool-invocation', toolInvocation });
                        });
                    }
                    
                    // Add the assistant message with reconstructed parts
                    formattedMessages.push({
                        id: msg.id,
                        role: 'assistant',
                        // Ensure content is consistent (e.g., use text part's content or empty string)
                        content: msg.content || '', 
                        createdAt: new Date(msg.created_at),
                        // Assign the reconstructed parts array
                        parts: messageParts.length > 0 ? messageParts : undefined 
                    } as Message); // Add type assertion if necessary

                    // --- REMOVED: Logic for creating separate role: 'tool' messages ---
                    // The results are now embedded in the assistant message's 'parts' array.
                }
            }
            // --- END REVISED MESSAGE FORMATTING ---


            console.log(`[useInitialChatMessages] Fetched and formatted ${formattedMessages.length} messages.`);
            setChatMessages(formattedMessages);
            setDisplayedMessagesCount(Math.min(formattedMessages.length, INITIAL_MESSAGE_COUNT));
            // Log state immediately after setting
            console.log('[useInitialChatMessages] State setters called:', {
                totalMessages: formattedMessages.length,
                initialDisplayCount: Math.min(formattedMessages.length, INITIAL_MESSAGE_COUNT)
            });

        } catch (err: any) {
            console.error('[useInitialChatMessages] Error fetching/formatting messages:', err);
            // setFetchError(`Failed to load messages: ${err.message}`);
            setPageError(`Failed to load messages: ${err.message}`); // Use the passed setter
            setChatMessages([]); // Clear messages on error
        } finally {
            setIsLoadingMessages(false);
        }
    // }, [documentId, setChatMessages, setDisplayedMessagesCount, setPageError]);
    // Ensure all dependencies passed as props are included
    }, [documentId, setChatMessages, setDisplayedMessagesCount, setPageError]);

    // Effect to trigger the fetch when documentId changes
    useEffect(() => {
        fetchInitialMessages();
    }, [fetchInitialMessages]);

    return {
        isLoadingMessages,
        // fetchError, // Error is handled via prop
    };
} 