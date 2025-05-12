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
import { type Message as AiReactMessage } from 'ai/react'; 

// Define our custom UI message type that includes signedDownloadUrl
export interface CustomUIMessage extends AiReactMessage {
    signedDownloadUrl?: string | null;
}

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
    initialMessages: CustomUIMessage[] | null; // Use our custom message type
}

export function useInitialChatMessages({
    documentId,
    setPageError,
}: UseInitialChatMessagesProps): UseInitialChatMessagesReturn {
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [initialMessages, setInitialMessages] = useState<CustomUIMessage[] | null>(null); // Use our custom message type

    const fetchInitialMessages = useCallback(async () => {
        setIsLoadingMessages(true);
        setInitialMessages(null); 

        if (!documentId) {
            setIsLoadingMessages(false);
            return;
        }

        try {
            try {
                const response = await fetch(`/api/documents/${documentId}/messages`);
                
                console.log(`[useInitialChatMessages] API Response Status: ${response.status}, OK: ${response.ok}`);

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                    // Throw error to be caught by outer catch
                    throw new Error(
                        errData.error?.message || `Failed to fetch messages (${response.status})`
                    );
                }
                const { data }: { data: MessageWithDetails[] } = await response.json();

                console.log(`[useInitialChatMessages] Raw data received from API:`, JSON.stringify(data, null, 2));
                console.log(`[useInitialChatMessages] Type of data: ${typeof data}, Is Array: ${Array.isArray(data)}`);
                console.log(`[useInitialChatMessages] Data length: ${data?.length ?? 'undefined'}`);

                const formattedMessages: CustomUIMessage[] = []; // Use our custom message type
                const allowedInitialRoles = ['user', 'assistant', 'system'];

                console.log(`[useInitialChatMessages] About to start formatting loop...`);

                for (const msg of data) {
                    console.log(`[useInitialChatMessages] INSIDE LOOP. Processing msg:`, JSON.stringify(msg, null, 2));
                    if (!allowedInitialRoles.includes(msg.role as string)) { 
                        continue;
                    }
                    const role = msg.role as AiReactMessage['role']; // Role from ai/react Message
                    const createdAt = new Date(msg.created_at);

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
                        // userTextContent is now a string (possibly empty)

                        console.log(`[useInitialChatMessages] Processing USER message ID: ${msg.id}`);
                        console.log(`[useInitialChatMessages]   Raw msg object:`, JSON.stringify(msg, null, 2));
                        console.log(`[useInitialChatMessages]   User Text Content Processed:`, userTextContent);
                        console.log(`[useInitialChatMessages]   Value of msg.signedDownloadUrl:`, msg.signedDownloadUrl);

                        const uiTextParts: Array<{type: 'text', text: string}> = [];
                        if (userTextContent.trim()) {
                            uiTextParts.push({ type: 'text', text: userTextContent });
                        }
                        // Image from msg.signedDownloadUrl will be handled by custom UI rendering, not added to standard parts.

                        const messageToPush: CustomUIMessage = { // Message from 'ai/react'
                            id: msg.id, 
                            role: 'user',
                            content: userTextContent, // Top-level content is the processed string
                            parts: uiTextParts.length > 0 ? uiTextParts : undefined, // Only text parts for now
                            createdAt: createdAt, 
                            signedDownloadUrl: msg.signedDownloadUrl // Pass the URL here
                        }; 

                        console.log(`[useInitialChatMessages]   Message OBJECT being pushed:`, JSON.stringify(messageToPush, null, 2));
                        formattedMessages.push(messageToPush);
                        continue; 
                    }
                    if (role === 'assistant') {
                        // Process msg.content to a string (assistantTextContent)
                        let assistantTextContent = '';
                        if (typeof msg.content === 'string') {
                            assistantTextContent = msg.content;
                        } else if (Array.isArray(msg.content)) {
                            // Assuming assistant content might also be an array of parts
                            assistantTextContent = msg.content
                                .filter((part): part is TextPart => part.type === 'text' && typeof part.text === 'string')
                                .map(part => part.text)
                                .join('\n');
                        }
                        // assistantTextContent is now a string

                        formattedMessages.push({
                            id: msg.id, 
                            role: 'assistant',
                            content: assistantTextContent, // Use processed string content
                            createdAt: createdAt,
                            signedDownloadUrl: msg.signedDownloadUrl // Also pass for assistant messages if relevant
                        });
                        continue; // Added continue
                    }
                }

                console.log(`[useInitialChatMessages] Finished formatting loop.`);
                
                // --- LOGGING: Final array before setting state ---
                console.log("[useInitialChatMessages] Final formattedMessages array:", JSON.stringify(formattedMessages, null, 2));
                setInitialMessages(formattedMessages);

            } catch (innerError: any) {
                // --- LOGGING: Catch errors during fetch/format ---
                console.error("[useInitialChatMessages] Error during fetch or format:", innerError);
                // Re-throw to be caught by the outer catch which handles setPageError
                throw innerError;
            }
            // --- End Inner try-catch ---

        } catch (err: any) {
            // Outer catch remains the same
            console.error("[useInitialChatMessages] Caught final error:", err); // Added log here too
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
        initialMessages, // Return type is now CustomUIMessage[] | null
    };
} 