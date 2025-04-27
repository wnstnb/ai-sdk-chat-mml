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

                // 2. Handle Assistant messages
                if (msg.role === 'assistant') {
                    const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;

                    // Add the assistant message itself
                    formattedMessages.push({
                        id: msg.id,
                        role: 'assistant',
                        content: msg.content || '', // Text content from assistant
                        createdAt: new Date(msg.created_at),
                        // Use toolCalls property to align with CoreMessage/streamText expectations
                        ...(hasToolCalls && {
                             toolCalls: msg.tool_calls!.map(tc => ({ // Use toolCalls
                                toolCallId: tc.tool_call_id,
                                toolName: tc.tool_name,
                                args: tc.tool_input // Assuming tool_input is the args object
                            }))
                        }),
                    } as Message); // Add type assertion

                    // 3. Add corresponding Tool messages for each tool call result
                    if (hasToolCalls) {
                        msg.tool_calls!.forEach(tc => {
                            // Check if the tool call has output (meaning it was executed and has a result)
                            if (tc.tool_output !== null && tc.tool_output !== undefined) {
                                formattedMessages.push({
                                    // Generate a unique-ish ID for the tool message
                                    id: `${msg.id}-tool-${tc.tool_call_id}`,
                                    role: 'tool',
                                    // Vercel SDK expects tool content as stringified array of ToolContentPart
                                    // Let's ensure the structure is correct
                                    content: JSON.stringify([{
                                        type: 'tool-result',
                                        toolCallId: tc.tool_call_id,
                                        toolName: tc.tool_name,
                                        result: tc.tool_output // Use tool_output as the result
                                    }]),
                                    createdAt: new Date(tc.created_at), // Use tool call creation time
                                } as unknown as Message); // Add type assertion via unknown
                            } else {
                                // It's normal for tool_output to be null if the result hasn't been saved yet
                                // or if the call didn't produce output. Only log if unexpected.
                                // console.warn(`[useInitialChatMessages] Tool call ${tc.tool_call_id} for message ${msg.id} has no output. Skipping tool result message.`);
                            }
                        });
                    }
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