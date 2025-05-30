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
            // Initialize a Map to store tool call results
            const resultsMap = new Map<string, any>();
            
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
                    const role = msg.role as AiReactMessageRoot['role']; // Role from ai/react Message
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

                        const messageToPush: CustomUIMessage = {
                            id: msg.id,
                            role: 'user',
                            content: userTextContent, // User content is string
                            createdAt: new Date(createdAtTimestamp),
                            signedDownloadUrl: msg.signedDownloadUrl
                        };

                        console.log(`[useInitialChatMessages]   User Message OBJECT being pushed:`, JSON.stringify(messageToPush, null, 2));
                        formattedMessages.push(messageToPush);
                        continue;
                    }
                    if (role === 'assistant') {
                        console.log(`[useInitialChatMessages] Processing ASSISTANT message ID: ${msg.id}, Raw msg:`, JSON.stringify(msg, null, 2));
                        // --- MODIFIED LOGS FOR ASSISTANT createdAt ---
                        console.log(`[useInitialChatMessages] Assistant msg ID ${msg.id} - Original createdAtTimestamp:`, createdAtTimestamp, "Type:", typeof createdAtTimestamp);
                        const createdAt = new Date(createdAtTimestamp); // Use the determined timestamp
                        console.log(`[useInitialChatMessages] Assistant msg ID ${msg.id} - Parsed createdAt object:`, createdAt, "Is Valid Date:", !isNaN(createdAt.getTime()));
                        // --- END MODIFIED LOGS ---
                        
                        const assistantMessageContentParts: CustomMessageContentPart[] = [];
                        const assistantSdkToolCalls: AssistantToolCall[] = [];
                        let textualContentForAssistantMessage = '';

                        if (Array.isArray(msg.content)) {
                            // msg.content is an array of parts from the database (JSONB)
                            console.log(`[useInitialChatMessages] Assistant msg ${msg.id} content is ARRAY:`, JSON.stringify(msg.content, null, 2));
                            for (const part of msg.content as StoredMessageContentPart[]) { // Cast to our StoredMessageContentPart union
                                if (part.type === 'text') { // No need to check typeof part.text due to StoredTextPart definition
                                    assistantMessageContentParts.push({ type: 'text', text: part.text });
                                    textualContentForAssistantMessage += (textualContentForAssistantMessage ? '\n' : '') + part.text;
                                } else if (part.type === 'tool-call') { // Redundant checks for toolCallId etc. removed due to StoredToolCallPartWithResult definition
                                    // This 'part' is from the stored messages.content array
                                    // It has 'toolCallId', 'toolName', 'args', and 'result' due to StoredToolCallPartWithResult type
                                    console.log(`[useInitialChatMessages] DB Content tool-call part for msg ${msg.id}:`, JSON.stringify(part, null, 2));

                                    const toolCallPartWithPotentialResult = part as StoredToolCallPartWithResult & { result?: any };

                                    if (toolCallPartWithPotentialResult.toolCallId && 
                                        toolCallPartWithPotentialResult.toolName && 
                                        toolCallPartWithPotentialResult.args !== undefined) {

                                        // Ensure args is stringified
                                        const argsString = typeof toolCallPartWithPotentialResult.args === 'string' 
                                            ? toolCallPartWithPotentialResult.args 
                                            : JSON.stringify(toolCallPartWithPotentialResult.args);

                                        // Check if the result is directly embedded in this "tool-call" part
                                        const embeddedResult = toolCallPartWithPotentialResult.result;
                                        
                                        // Still try to get from resultsMap in case the structure is mixed or changes in the future,
                                        // but prioritize embeddedResult if present.
                                        const resultFromMap = resultsMap.get(toolCallPartWithPotentialResult.toolCallId);
                                        
                                        const finalResult = embeddedResult !== undefined ? embeddedResult : resultFromMap;
                                        const state: 'result' | 'call' = finalResult !== undefined ? 'result' : 'call';

                                        // Log the determined state and result for this tool call
                                        console.log(`[useInitialChatMessages] Tool Call ID: ${toolCallPartWithPotentialResult.toolCallId}, Name: ${toolCallPartWithPotentialResult.toolName}, Args: ${argsString}, Embedded Result Found: ${embeddedResult !== undefined}, Result from Map: ${resultFromMap !== undefined}, Final State: ${state}`);

                                        assistantMessageContentParts.push({
                                            type: 'tool-invocation',
                                            toolInvocation: {
                                                toolCallId: toolCallPartWithPotentialResult.toolCallId,
                                                toolName: toolCallPartWithPotentialResult.toolName,
                                                args: argsString, // Use the stringified args
                                                result: finalResult,
                                                state: state
                                            },
                                        });
                                    }
                                }
                            }
                        } else if (typeof msg.content === 'string') {
                            // Content is just a string, likely no tool calls involved in this message's direct content
                            textualContentForAssistantMessage = msg.content;
                            if (textualContentForAssistantMessage.trim()) {
                                assistantMessageContentParts.push({ type: 'text', text: textualContentForAssistantMessage });
                            }
                            // If content is string, but there are joined msg.tool_calls, we might need to process them.
                            // This case implies tool calls were made, but their details weren't stored in msg.content as parts.
                            // This is less ideal but we should handle it.
                            if (msg.tool_calls && msg.tool_calls.length > 0) {
                                console.log(`[useInitialChatMessages] Assistant msg ${msg.id} content is STRING, but has ${msg.tool_calls.length} joined tool_calls from DB.`);
                                for (const tc of msg.tool_calls) { // tc is SupabaseToolCall
                                    const argsString = typeof tc.tool_input === 'string' ? tc.tool_input : JSON.stringify(tc.tool_input);
                                    assistantSdkToolCalls.push({
                                        id: tc.tool_call_id, type: 'function', function: { name: tc.tool_name, arguments: argsString }
                                    });
                                    assistantMessageContentParts.push({
                                        type: 'tool-invocation',
                                        toolInvocation: {
                                            toolCallId: tc.tool_call_id, toolName: tc.tool_name, args: tc.tool_input,
                                            result: tc.tool_output, // Result from SupabaseToolCall.tool_output
                                            state: 'result',
                                        } as AiSdkUIToolInvocation,
                                    });
                                    if (tc.tool_output !== undefined && tc.tool_output !== null) {
                                        const toolResultContentStr = typeof tc.tool_output === 'string' ? tc.tool_output : JSON.stringify(tc.tool_output);
                                        formattedMessages.push({
                                            id: `${msg.id}-toolres-${tc.tool_call_id}`, role: 'tool', content: toolResultContentStr,
                                            tool_call_id: tc.tool_call_id, createdAt: new Date(tc.created_at || createdAtTimestamp), // Use determined timestamp as fallback
                                        });
                                        console.log(`[useInitialChatMessages] Pushed tool result message for ${tc.tool_call_id} from JOINED SupabaseToolCall (string content path).`);
                                    }
                                }
                            }
                        }
                        
                        const finalContentForSdkMessage = assistantMessageContentParts.length > 0 
                            ? assistantMessageContentParts
                            : textualContentForAssistantMessage; // Fallback to simple string if no parts were generated

                        const assistantMsgForSdk: CustomUIMessage = {
                            id: msg.id,
                            role: 'assistant',
                            content: finalContentForSdkMessage,
                            createdAt: new Date(createdAtTimestamp), // Use the determined timestamp
                            signedDownloadUrl: msg.signedDownloadUrl,
                            ...(assistantSdkToolCalls.length > 0 && { tool_calls: assistantSdkToolCalls }),
                        };
                        
                        formattedMessages.push(assistantMsgForSdk);
                        console.log(`[useInitialChatMessages] Pushed assistant message ${assistantMsgForSdk.id}. Content parts: ${assistantMessageContentParts.length}, Tool calls: ${assistantSdkToolCalls.length}`);
                        if (assistantMessageContentParts.length > 0) {
                             console.log(`[useInitialChatMessages] Assistant message ${assistantMsgForSdk.id} content (parts):`, JSON.stringify(assistantMessageContentParts, null, 2));
                        }
                        if (assistantSdkToolCalls.length > 0) {
                            console.log(`[useInitialChatMessages] Assistant message ${assistantMsgForSdk.id} tool_calls (SDK):`, JSON.stringify(assistantSdkToolCalls, null, 2));
                        }
                        continue;
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