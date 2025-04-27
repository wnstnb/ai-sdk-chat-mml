import { useState, useEffect, useCallback } from 'react';
import type { Message } from 'ai/react';
import type { MessageWithSignedUrl } from '@/types/supabase';

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
            const { data }: { data: MessageWithSignedUrl[] } = await response.json();

            // Map fetched messages (Similar logic as before)
            const allowedRoles: Message['role'][] = ['user', 'assistant', 'system', 'data'];
            const formattedMessages: Message[] = data
                .filter(msg => allowedRoles.includes(msg.role as any))
                .map(msg => {
                    let displayContent = msg.content || '';
                    let isToolCallContent = false;
                    if (displayContent.startsWith('[') && displayContent.endsWith(']')) {
                        try {
                            const parsedContent = JSON.parse(displayContent);
                            if (Array.isArray(parsedContent) && parsedContent.length > 0 && parsedContent[0]?.type === 'tool-call') {
                                isToolCallContent = true;
                            } else if (Array.isArray(parsedContent) && parsedContent.length > 0 && parsedContent[0] && typeof parsedContent[0].text === 'string') {
                                displayContent = parsedContent[0].text;
                            }
                        } catch (parseError) {
                            // ignore parse error, keep original content
                        }
                    }

                    return {
                        id: msg.id,
                        role: msg.role as Message['role'],
                        content: isToolCallContent ? '' : displayContent,
                        createdAt: new Date(msg.created_at),
                        experimental_attachments: msg.signedDownloadUrl ? [{
                            name: msg.image_url?.split('/').pop() || `image_${msg.id}`,
                            contentType: 'image/*',
                            url: msg.signedDownloadUrl,
                        }] : undefined,
                    };
                });

            console.log(`[useInitialChatMessages] Fetched ${formattedMessages.length} messages.`);
            setChatMessages(formattedMessages);
            setDisplayedMessagesCount(Math.min(formattedMessages.length, INITIAL_MESSAGE_COUNT));
            // Log state immediately after setting
            console.log('[useInitialChatMessages] State setters called:', {
                totalMessages: formattedMessages.length,
                initialDisplayCount: Math.min(formattedMessages.length, INITIAL_MESSAGE_COUNT)
            });

        } catch (err: any) {
            console.error('[useInitialChatMessages] Error fetching messages:', err);
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