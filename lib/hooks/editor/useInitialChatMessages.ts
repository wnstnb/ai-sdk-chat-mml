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
    // Return ai/react Message array
    // initialMessages: CoreMessage[] | null;
    // --- MODIFICATION: Revert to Message[] | null --- 
    initialMessages: Message[] | null; 
    // --- END MODIFICATION --- 
}

export function useInitialChatMessages({
    documentId,
    setPageError,
}: UseInitialChatMessagesProps): UseInitialChatMessagesReturn {
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    // Use ai/react Message type for state
    // const [initialMessages, setInitialMessages] = useState<CoreMessage[] | null>(null);
    // --- MODIFICATION: Revert to Message[] | null for state --- 
    const [initialMessages, setInitialMessages] = useState<Message[] | null>(null); 
    // --- END MODIFICATION --- 

    const fetchInitialMessages = useCallback(async () => {
        setIsLoadingMessages(true);
        setInitialMessages(null); 

        if (!documentId) {
            setIsLoadingMessages(false);
            return;
        }

        try {
            // --- Inner try-catch for early errors ---
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

                // const formattedMessages: CoreMessage[] = [];
                // --- MODIFICATION: Revert to Message[] for formatting --- 
                const formattedMessages: Message[] = []; 
                // --- END MODIFICATION --- 
                const allowedInitialRoles = ['user', 'assistant', 'system'];

                console.log(`[useInitialChatMessages] About to start formatting loop...`);

                for (const msg of data) {
                    console.log(`[useInitialChatMessages] INSIDE LOOP. Processing msg:`, JSON.stringify(msg, null, 2));
                    if (!allowedInitialRoles.includes(msg.role as string)) { 
                        continue;
                    }
                    const role = msg.role as Message['role'];
                    const createdAt = new Date(msg.created_at);

                    if (role === 'system') {
                        console.log(`[useInitialChatMessages] Skipping system message ${msg.id}`);
                        continue; 
                    }
                    if (role === 'user') {
                        const textContent = msg.content || '';
                        console.log(`[useInitialChatMessages] Processing USER message ID: ${msg.id}`);
                        console.log(`[useInitialChatMessages]   Raw msg object:`, JSON.stringify(msg, null, 2));
                        console.log(`[useInitialChatMessages]   Value of msg.signedDownloadUrl:`, msg.signedDownloadUrl);

                        // --- Use parts array (Keep this logic) --- 
                        // Define Part types inline for clarity if not importing Core types
                        type TextPart = { type: 'text'; text: string };
                        type ImagePart = { type: 'image'; image: URL };
                        const parts: Array<TextPart | ImagePart> = [];
                        if (textContent) {
                            parts.push({ type: 'text', text: textContent });
                        }
                        if (msg.signedDownloadUrl) {
                            try {
                                const imageUrl = new URL(msg.signedDownloadUrl);
                                parts.push({ type: 'image', image: imageUrl });
                            } catch (e) {
                                console.error(`[useInitialChatMessages] Invalid URL for image in message ${msg.id}: ${msg.signedDownloadUrl}`);
                            }
                        }
                        // --- END parts array logic --- 

                        // --- MODIFICATION: Create Message type with parts array in content (using assertion) --- 
                        // const messageToPush: CoreMessage = {
                        const messageToPush: Message = {
                            id: msg.id, 
                            role: 'user',
                            // content: parts, 
                            // --- Use type assertion for content --- 
                            content: parts as any, 
                            // --- End assertion --- 
                            createdAt: createdAt, 
                        }; 
                        // --- END MODIFICATION --- 

                        console.log(`[useInitialChatMessages]   Message OBJECT being pushed:`, JSON.stringify(messageToPush, null, 2));
                        formattedMessages.push(messageToPush);
                        continue; 
                    }
                    if (role === 'assistant') {
                        const textContent = msg.content || '';
                        // Assistant messages remain simple for now
                        formattedMessages.push({
                            id: msg.id, 
                            role: 'assistant',
                            content: textContent,
                            createdAt: createdAt,
                        // } as CoreMessage); 
                        // --- MODIFICATION: Revert type assertion --- 
                        });
                        // --- END MODIFICATION --- 

                        // Commenting out explicit tool result message pushing for now
                        /*
                        if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
                            msg.tool_calls.forEach(tc => {
                                const toolResultMessage: Message = {
                                    id: `${msg.id}-toolresult-${tc.tool_call_id}`,
                                    role: 'tool', // UseChat might expect this
                                    tool_call_id: tc.tool_call_id,
                                    content: typeof tc.tool_output === 'string' 
                                               ? tc.tool_output 
                                               : JSON.stringify(tc.tool_output ?? null),
                                    createdAt: createdAt,
                                } as any; // Use 'as any' carefully if Message type doesn't fit Tool role
                                formattedMessages.push(toolResultMessage);
                            });
                        }
                        */
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
        initialMessages, // Return type is now Message[] | null
    };
} 