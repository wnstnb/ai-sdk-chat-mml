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

                // 2. Handle User messages (TEXT ONLY for simple test)
                if (role === 'user') {
                    formattedMessages.push({
                        id: msg.id,
                        role: 'user',
                        content: msg.content || '',
                        createdAt: new Date(msg.created_at),
                    });
                    continue; 
                }

                // 3. Handle Assistant messages (REVISED LOGIC)
                if (role === 'assistant') {
                    const hasContent = msg.content && msg.content.trim() !== '';
                    const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;

                    // Only create an assistant message if it has text OR tool calls
                    if (hasContent || hasToolCalls) {
                        const assistantMessage: UIMessage = {
                            id: msg.id,
                            role: 'assistant',
                            content: '', // Content is derived from parts below
                            createdAt: new Date(msg.created_at),
                            parts: [], // Initialize parts array
                        };

                        // Add text part if content exists
                        if (hasContent) {
                            assistantMessage.parts!.push({
                                type: 'text',
                                text: msg.content!,
                            });
                        }

                        // Add tool invocation parts if tool calls exist
                        if (hasToolCalls) {
                            msg.tool_calls!.forEach((tc: SupabaseToolCall) => {
                                // Check if tool_input and tool_output are valid JSON before parsing
                                let args: any = {};
                                let result: any = null; // Default result to null
                                try {
                                    // tool_input from DB should be the args object
                                    args = typeof tc.tool_input === 'string'
                                        ? JSON.parse(tc.tool_input)
                                        : tc.tool_input; // Assume it's already an object if not string
                                } catch (e) {
                                    console.error(`[useInitialChatMessages] Failed to parse tool_input for tool call ${tc.tool_call_id}:`, e);
                                    args = { error: "Failed to parse arguments" }; // Provide fallback args
                                }
                                try {
                                     // tool_output from DB should be the result object/value
                                     result = typeof tc.tool_output === 'string'
                                        ? JSON.parse(tc.tool_output)
                                        : tc.tool_output; // Assume it's already an object/value if not string
                                } catch (e) {
                                     console.error(`[useInitialChatMessages] Failed to parse tool_output for tool call ${tc.tool_call_id}:`, e);
                                     result = { error: "Failed to parse result" }; // Provide fallback result
                                }

                                assistantMessage.parts!.push({
                                    type: 'tool-invocation',
                                    toolInvocation: {
                                        toolCallId: tc.tool_call_id,
                                        toolName: tc.tool_name,
                                        args: args, // Parsed arguments
                                        result: result, // Parsed result
                                        state: 'result', // Assume 'result' state for historical calls
                                    },
                                });
                            });
                        }
                         // Assign concatenated text content to the top-level 'content' property
                         // for potential compatibility or display purposes, though 'parts' is primary.
                         assistantMessage.content = assistantMessage.parts!
                           .filter(part => part.type === 'text')
                           .map(part => (part as { type: 'text'; text: string }).text) // More specific type assertion
                           .join('\n');


                        formattedMessages.push(assistantMessage);
                    }
                    // If assistant message has no text content AND no tool calls, it's skipped
                }
            }

            console.log(`[useInitialChatMessages] Fetched and formatted ${formattedMessages.length} UIMessages.`);
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