import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat, type Message } from 'ai/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useFollowUpStore } from '@/lib/stores/followUpStore';
import type { BlockNoteEditor } from '@blocknote/core';
import { getInlineContentText } from '@/lib/editorUtils';

// Define the shape of the editor context data expected by the submit handler
interface EditorContextData {
    editorMarkdownContent?: string;
    editorBlocksContext?: { id: string; contentSnippet: string }[];
}

interface UseChatInteractionsProps {
    documentId: string;
    initialModel: string; // Preferred model from preferences
    editorRef: React.RefObject<BlockNoteEditor<any>>;
    uploadedImagePath: string | null; // From useFileUpload
    isUploading: boolean; // From useFileUpload
    clearFileUploadPreview: () => void; // From useFileUpload
    apiEndpoint?: string; // Optional override for API endpoint
}

// Define inline options type based on docs for append/handleSubmit
interface ReloadOptions {
    headers?: Record<string, string> | Headers;
    body?: object; // Assuming a generic object is suitable
    data?: any; // Assuming JSONValue or any
    // attachments are likely not needed for reload, omitting for now
}

// Define the return type for the hook
interface UseChatInteractionsReturn {
    messages: Message[];
    setMessages: (messages: Message[]) => void;
    input: string;
    setInput: (input: string) => void;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>; // Wrapped submit
    isLoading: boolean;
    reload: (options?: ReloadOptions | undefined) => Promise<string | null | undefined>;
    stop: () => void;
    model: string;
    setModel: React.Dispatch<React.SetStateAction<string>>;
}

export function useChatInteractions({
    documentId,
    initialModel,
    editorRef,
    uploadedImagePath,
    isUploading,
    clearFileUploadPreview,
    apiEndpoint = '/api/chat',
}: UseChatInteractionsProps): UseChatInteractionsReturn {
    
    // --- Internal State ---
    const [model, setModel] = useState<string>(initialModel);
    const [pendingInitialSubmission, setPendingInitialSubmission] = useState<string | null>(null);
    const initialMsgProcessedRef = useRef(false); 

    // --- External Hooks ---
    const router = useRouter();
    const searchParams = useSearchParams();
    const followUpContext = useFollowUpStore((state) => state.followUpContext);
    const setFollowUpContext = useFollowUpStore((state) => state.setFollowUpContext);

    // --- Vercel AI useChat Hook ---
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit: originalHandleSubmit,
        isLoading,
        reload,
        stop,
        setMessages,
        setInput,
    } = useChat({
        api: apiEndpoint,
        id: documentId,
        initialMessages: [],
        onError: (err) => {
            const errorMsg = `Chat Error: ${err.message || 'Unknown error'}`;
            toast.error(errorMsg);
        },
    });

    // --- Editor Context Retrieval ---
    const getEditorContext = useCallback(async (): Promise<EditorContextData> => {
        const editor = editorRef.current;
        if (!editor) return {};
        let contextData: EditorContextData = {};
        try {
            const currentBlocks = editor.document;
            if (currentBlocks?.length > 0) {
                contextData = {
                    editorBlocksContext: currentBlocks.map(b => ({
                        id: b.id,
                        contentSnippet: (Array.isArray(b.content) ? getInlineContentText(b.content).slice(0, 100) : '') || `[${b.type}]`
                    }))
                };
            }
        } catch (e) {
            console.error('Failed to get editor snippets:', e);
            toast.error('⚠️ Error getting editor context.');
        }
        return contextData;
    }, [editorRef]);

    // --- Wrapped Submit Handler ---
    const handleSubmit = useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) event.preventDefault();
        if (!documentId) { toast.error("Cannot send message: Document context missing."); return; }
        
        const contextPrefix = followUpContext ? `${followUpContext}\n\n---\n\n` : '';
        const finalInput = contextPrefix + input;
        const imagePathToSend = uploadedImagePath;
        const currentModel = model;

        if (isLoading || isUploading || (!finalInput.trim() && !imagePathToSend)) {
            console.log('[useChatInteractions handleSubmit] Submission prevented:', { isLoading, isUploading, finalInput, imagePathToSend });
            return; 
        }

        const editorContextData = await getEditorContext(); 
        const isSummarizationTask = /\b(summar(y|ize|ies)|bullet|points?|outline|sources?|citations?)\b/i.test(finalInput) && finalInput.length > 25;

        try {
            console.log(`[useChatInteractions handleSubmit] Saving user message to DB: imagePath='${imagePathToSend}'`);
            const saveMessageResponse = await fetch(`/api/documents/${documentId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'user', content: finalInput.trim() || null, imageUrlPath: imagePathToSend }),
            });
            if (!saveMessageResponse.ok) {
                const errorData = await saveMessageResponse.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `Failed to save message (${saveMessageResponse.status})`);
            }
            await saveMessageResponse.json(); 
            console.log('[useChatInteractions handleSubmit] User message saved.');

            const submitOptions = {
                data: { model: currentModel, documentId, ...editorContextData, firstImagePath: imagePathToSend, taskHint: isSummarizationTask ? 'summarize_and_cite_outline' : undefined },
                options: { /* experimental_attachments: undefined */ } 
            };

            console.log('[useChatInteractions handleSubmit] Calling original useChat submit.');
            originalHandleSubmit(event, { ...submitOptions, data: submitOptions.data as any });

            clearFileUploadPreview();
            setFollowUpContext(null);

        } catch (saveError: any) {
             console.error("[useChatInteractions handleSubmit] Error saving user message or submitting:", saveError);
             toast.error(`Failed to send message: ${saveError.message}`);
        }
    }, [documentId, followUpContext, input, model, uploadedImagePath, isLoading, isUploading, getEditorContext, originalHandleSubmit, clearFileUploadPreview, setFollowUpContext]);

    // --- Initial Message Processing ---
    useEffect(() => {
        if (!documentId || initialMsgProcessedRef.current) return;
        const initialMsg = searchParams?.get('initialMsg');
        if (initialMsg) {
            const decodedMsg = decodeURIComponent(initialMsg);
            setInput(decodedMsg);
            setPendingInitialSubmission(decodedMsg);
            const currentPath = window.location.pathname; 
            router.replace(currentPath, { scroll: false }); 
            initialMsgProcessedRef.current = true;
        }
    }, [documentId, searchParams, setInput, router]);

    // --- Auto-Submit Initial Message ---
    useEffect(() => {
        if (pendingInitialSubmission && input === pendingInitialSubmission && !isLoading) {
            handleSubmit(undefined);
            setPendingInitialSubmission(null);
        }
    }, [input, pendingInitialSubmission, isLoading, handleSubmit]); 

    return {
        messages,
        setMessages,
        input,
        setInput,
        handleInputChange,
        handleSubmit, 
        isLoading,
        reload, 
        stop,
        model,
        setModel,
    };
} 