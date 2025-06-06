/* eslint-disable @next/next/no-img-element */
'use client';

// Core React/Next.js imports
import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    KeyboardEvent,
    DragEvent,
} from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'; // Added usePathname for Step 8
import dynamic from 'next/dynamic';
import Link from 'next/link';

// UI/State Libraries
import { useChat, type Message } from 'ai/react'; // Vercel AI SDK
import { type ToolInvocation } from '@ai-sdk/ui-utils'; // <-- ADD Import ToolInvocation from here
import { toast } from 'sonner'; // Notifications
import { AnimatePresence, motion } from 'framer-motion'; // Animations

// BlockNote Editor
import {
    Block,
    BlockNoteEditor,
    PartialBlock,
    InlineContent,
    BlockNoteSchema,
    // defaultBlockSpecs, // Not explicitly used, schema defines specs
    // defaultInlineContentSpecs,
    // defaultStyleSpecs,
} from '@blocknote/core';
// Import BlockNoteEditor type for handleEditorChange
import type { BlockNoteEditor as BlockNoteEditorType } from '@blocknote/core';
// ADDED: Import FormattingToolbarController
import { FormattingToolbarController } from '@blocknote/react';

// Icons
import {
    AttachmentIcon,
    BotIcon,
    UserIcon,
    VercelIcon,
    SendIcon,
} from '@/components/icons';
// Added Clock, CheckCircle2, AlertCircle, XCircle for autosave status
// Added Sparkles for Infer Title
import { ChevronLeft, ChevronRight, Wrench, SendToBack, NotebookPen, Save, X, Clock, CheckCircle2, AlertCircle, XCircle, Sparkles, MessageCircleMore } from 'lucide-react';
import {
    DocumentPlusIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

// Custom Components & Types
import { Markdown } from '@/components/markdown';
import { ModelSelector } from '@/components/ModelSelector';
import { TextFilePreview } from '@/components/editor/TextFilePreview'; // Import the extracted component
import { ChatInputUI } from '@/components/editor/ChatInputUI'; // Import the extracted component
// NEW: Import AutosaveStatusIndicator
import { AutosaveStatusIndicator } from '@/app/components/editor/AutosaveStatusIndicator';
// NEW: Import EditorTitleBar
import { EditorTitleBar } from '@/components/editor/EditorTitleBar';
// import { AIButton } from '../components/AIButton';
import type {
    Document as SupabaseDocument,
    MessageWithSignedUrl,
} from '@/types/supabase'; // Supabase data types

// Utils
import {
    getInlineContentText,
    replaceTextInInlineContent,
    deleteTextInInlineContent,
    getTextFromDataUrl,
} from '@/lib/editorUtils'; // Import the extracted helpers

// Zustand Store
import { useFollowUpStore } from '@/lib/stores/followUpStore';
import { usePreferenceStore } from '@/lib/stores/preferenceStore'; // Import preference store
import { useModalStore } from '@/stores/useModalStore'; // Added for Live Summaries

// --- NEW: Import the hooks ---
import { useDocument } from '@/app/lib/hooks/editor/useDocument';
import { useInitialChatMessages } from '@/app/lib/hooks/editor/useInitialChatMessages';
// --- NEW: Import the useTitleManagement hook ---
import { useTitleManagement } from '@/lib/hooks/editor/useTitleManagement'; // Corrected path
// --- NEW: Import the useChatPane hook ---
import { useChatPane } from '@/lib/hooks/editor/useChatPane';
// --- NEW: Import the useFileUpload hook ---
import { useFileUpload } from '@/lib/hooks/editor/useFileUpload';
// --- NEW: Import the useChatInteractions hook ---
import { useChatInteractions } from '@/lib/hooks/editor/useChatInteractions';
import { ChatInputArea } from '@/components/editor/ChatInputArea'; // Import the new component
import { ChatMessagesList } from '@/components/editor/ChatMessagesList'; // Import the new component
import { ChatPaneWrapper } from '@/components/editor/ChatPaneWrapper'; // Import the new wrapper
import { EditorPaneWrapper } from '@/components/editor/EditorPaneWrapper'; // Import the new wrapper
// NEW: Import useMediaQuery hook
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
// --- NEW: Import VersionHistoryModal ---
import { VersionHistoryModal } from '@/components/editor/VersionHistoryModal';
// REMOVED: SearchModal import for now, will be re-added at a higher level
// import { SearchModal } from '@/components/search/SearchModal'; 
import { useSWRConfig } from 'swr'; // ADDED for cache mutation

// Dynamically import BlockNoteEditorComponent with SSR disabled
const BlockNoteEditorComponent = dynamic(
    () => import('@/components/BlockNoteEditorComponent'),
    {
        ssr: false,
        loading: () => <p className="p-4 text-center text-[--muted-text-color]">Loading Editor...</p>, // Added styling
    }
);

// --- CONSTANTS ---
const INITIAL_MESSAGE_COUNT = 20;
const MESSAGE_LOAD_BATCH_SIZE = 20;
const INITIAL_CHAT_PANE_WIDTH_PERCENT = 35;
const MIN_CHAT_PANE_WIDTH_PX = 250;
const MAX_CHAT_PANE_WIDTH_PERCENT = 70;
const defaultModelFallback = 'gpt-4.1'; // Define fallback
// NEW: Define mobile breakpoint query
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)'; // Corresponds to Tailwind's 'md'

// Define the BlockNote schema
const schema = BlockNoteSchema.create();

// --- Main Editor Page Component ---
export default function EditorPage() {
    // --- Top-Level Hooks (React, Next.js) ---
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const documentId = params?.documentId as string; 
    
    // --- Refs --- (Declare refs early if needed by custom hooks)
    const editorRef = useRef<BlockNoteEditor<typeof schema.blockSchema>>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const latestEditorContentRef = useRef<string | null>(null);
    const latestEditorBlocksRef = useRef<BlockNoteEditorType['document'] | null>(null);
    const isContentLoadedRef = useRef<boolean>(false);
    const previousPathnameRef = useRef(pathname);
    const routerForReplace = useRouter(); 
    // --- NEW: Refs for Mini-Pane click-off logic ---
    const miniPaneRef = useRef<HTMLDivElement>(null);
    const miniPaneToggleRef = useRef<HTMLButtonElement>(null); // Assuming ChatInputUI renders a button we can get a ref to, or adjust as needed

    // --- State Variables --- (Declare state early)
    const { default_model: preferredModel, isInitialized: isPreferencesInitialized } = usePreferenceStore();
    const initialModel = (isPreferencesInitialized && preferredModel) ? preferredModel : defaultModelFallback;
    const [pageError, setPageError] = useState<string | null>(null);
    const [processedToolCallIds, setProcessedToolCallIds] = useState<Set<string>>(new Set());
    const [includeEditorContent, setIncludeEditorContent] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [autosaveTimerId, setAutosaveTimerId] = useState<NodeJS.Timeout | null>(null);
    const [revertStatusTimerId, setRevertStatusTimerId] = useState<NodeJS.Timeout | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle');
    // --- ADDED STATE for pending mobile editor tool call ---
    const [pendingMobileEditorToolCall, setPendingMobileEditorToolCall] = useState<{ toolName: string; args: any; toolCallId: string } | null>(null);
    // --- NEW: State for Version History Modal ---
    const [isVersionHistoryModalOpen, setIsVersionHistoryModalOpen] = useState(false);
    // --- NEW: State for the form element (for callback ref) ---
    const [formElement, setFormElement] = useState<HTMLFormElement | null>(null);
    // --- NEW: State for Mini-Pane ---
    const [isMiniPaneOpen, setIsMiniPaneOpen] = useState(false);
    // --- ADDED: State for document star status ---
    const [currentDocIsStarred, setCurrentDocIsStarred] = useState(false);
    // --- NEW: State for current theme ---
    const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');

    // --- Custom Hooks --- (Order is important!)
    const { documentData, initialEditorContent, isLoadingDocument, error: documentError } = useDocument(documentId);
    // --- ADDED: SWR config for cache mutation ---
    const { mutate } = useSWRConfig();
    // NEW: Add useMediaQuery hook
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT_QUERY);
    // NEW: Add state for mobile pane visibility
    const [mobileVisiblePane, setMobileVisiblePane] = useState<'editor' | 'chat'>('chat'); // Default to chat
    // Added for Live Summaries
    const { openVoiceSummaryModal, setEditorRef } = useModalStore(); // Get setEditorRef
    const { currentTitle, isEditingTitle, newTitleValue, isInferringTitle, handleEditTitleClick, handleCancelEditTitle, handleSaveTitle, handleTitleInputKeyDown, handleInferTitle, setNewTitleValue } = useTitleManagement({
        documentId,
        initialName: documentData?.name || '',
        editorRef,
    });
    const { isChatCollapsed, setIsChatCollapsed, chatPaneWidth, isResizing, dragHandleRef, handleMouseDownResize } = useChatPane({
        initialWidthPercent: INITIAL_CHAT_PANE_WIDTH_PERCENT,
        minWidthPx: MIN_CHAT_PANE_WIDTH_PX,
        maxWidthPercent: MAX_CHAT_PANE_WIDTH_PERCENT,
    });
    const { files, isUploading, uploadError, uploadedImagePath, uploadedImageSignedUrl, handleFileSelectEvent, handleFilePasteEvent, handleFileDropEvent, clearPreview } = useFileUpload({ documentId });
    
    // === DEBUG LOGGING FOR IMAGE UPLOAD STATE ===
    console.log("=== [EditorPage] IMAGE UPLOAD DEBUG START ===");
    console.log("[EditorPage] Current image upload state:");
    console.log("  - files:", files);
    console.log("  - isUploading:", isUploading);
    console.log("  - uploadError:", uploadError);
    console.log("  - uploadedImagePath:", uploadedImagePath);
    console.log("  - uploadedImageSignedUrl:", uploadedImageSignedUrl);
    console.log("  - documentId:", documentId);
    console.log("=== [EditorPage] IMAGE UPLOAD DEBUG END ===");
    
    const { isLoadingMessages, initialMessages } = useInitialChatMessages({
        documentId,
        setPageError
    });
    // --- NEW: Get initialTaggedDocIdsString from searchParams ---
    const initialTaggedDocIdsString = searchParams.get('taggedDocIds');
    // --- END NEW ---
    
    // === DEBUG LOGGING FOR CHAT INTERACTIONS INPUT ===
    console.log("=== [EditorPage] CHAT INTERACTIONS INPUT DEBUG START ===");
    console.log("[EditorPage] Values being passed to useChatInteractions:");
    console.log("  - documentId:", documentId);
    console.log("  - initialModel:", initialModel);
    console.log("  - uploadedImagePath:", uploadedImagePath);
    console.log("  - uploadedImageSignedUrl:", uploadedImageSignedUrl);
    console.log("  - isUploading:", isUploading);
    console.log("  - initialTaggedDocIdsString:", initialTaggedDocIdsString);
    console.log("=== [EditorPage] CHAT INTERACTIONS INPUT DEBUG END ===");
    
    const {
        messages: chatMessages, 
        setMessages: setChatMessages, 
        input,
        setInput,
        handleInputChange,
        handleSubmit, 
        isLoading: isChatLoading, 
        reload,
        stop,
        model,
        setModel,
        isRecording,
        isTranscribing,
        micPermissionError,
        startRecording,
        stopRecording,
        audioTimeDomainData,
        taggedDocuments,
        setTaggedDocuments,
    } = useChatInteractions({
        documentId,
        initialModel,
        initialMessages: initialMessages as any, // Explicit type assertion
        editorRef,
        uploadedImagePath,
        uploadedImageSignedUrl,
        isUploading,
        clearFileUploadPreview: clearPreview,
        initialTaggedDocIdsString, // <-- Pass to the hook
    });
    const { followUpContext, setFollowUpContext } = useFollowUpStore();

    // ---> ADD LOG HERE <---
    console.log('[EditorPage] Received initialMessages from useInitialChatMessages:', JSON.stringify(initialMessages, null, 2));
    // NEW: Log mobile state
    console.log('[EditorPage] Mobile detection:', { isMobile });

    // --- ADDED: Effect to set initial star status ---
    useEffect(() => {
        if (documentData) {
            setCurrentDocIsStarred(documentData.is_starred || false);
        }
    }, [documentData]);

    // --- ADDED: Handler to toggle star status for the current document ---
    const handleToggleCurrentDocumentStar = async () => {
        if (!documentId || !documentData) return;

        const newStarredStatus = !currentDocIsStarred;
        // Optimistic UI update
        setCurrentDocIsStarred(newStarredStatus);

        // Optimistically update the SWR cache for useDocument
        mutate(
            `/api/documents/${documentId}`,
            (currentData: SupabaseDocument | undefined) => {
                if (!currentData) return undefined;
                return { ...currentData, is_starred: newStarredStatus };
            },
            false // Important: Do not revalidate immediately, wait for API response
        );

        try {
            const response = await fetch(`/api/documents/${documentId}/star`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Failed to toggle star status.' }));
                throw new Error(errorData.message);
            }

            const result = await response.json();
            if (result.success) {
                // Update local state and SWR cache with confirmed status from server
                setCurrentDocIsStarred(result.is_starred);
                mutate(
                    `/api/documents/${documentId}`,
                    (currentData: SupabaseDocument | undefined) => {
                        if (!currentData) return undefined;
                        return { ...currentData, is_starred: result.is_starred };
                    },
                    false // No need to revalidate, we have the latest from server
                );
                toast.success(`Document ${result.is_starred ? 'starred' : 'unstarred'}.`);
            } else {
                throw new Error(result.message || 'Failed to toggle star status on server.');
            }
        } catch (error: any) {
            toast.error(error.message || "An error occurred while toggling star status.");
            // Revert optimistic updates on error
            setCurrentDocIsStarred(!newStarredStatus); // Revert local state
            mutate(
                `/api/documents/${documentId}`,
                (currentData: SupabaseDocument | undefined) => {
                    if (!currentData) return undefined;
                    return { ...currentData, is_starred: !newStarredStatus };
                },
                false // Revert cache without revalidation
            );
        }
    };

    // --- Callback Hooks (Defined BEFORE Early Returns) ---
    const triggerSaveDocument = useCallback(async (content: string, docId: string) => {
        console.log(`[Autosave] Triggering save for document ${docId}`);
        try {
            const response = await fetch(`/api/documents/${docId}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.parse(content) }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `Autosave failed (${response.status})`);
            }
            console.log(`[Autosave] Document ${docId} saved successfully.`);
            return true;
        } catch (err: any) {
            console.error(`[Autosave] Failed to save document ${docId}:`, err);
            throw err;
        }
    }, []); 

    // --- NEW: Callback ref for the form ---
    const formCallbackRef = useCallback((node: HTMLFormElement | null) => {
        console.log('[EditorPage formCallbackRef] Node received:', node);
        setFormElement(node);
    }, []);

    // --- NEW: Handlers for Version History Modal (Moved here) ---
    const handleOpenHistoryModal = useCallback(() => {
        setIsVersionHistoryModalOpen(true);
    }, []);

    const handleCloseHistoryModal = useCallback(() => {
        setIsVersionHistoryModalOpen(false);
    }, []);

    const handleEditorChange = useCallback((editor: BlockNoteEditorType) => {
        setEditorRef(editorRef as React.RefObject<BlockNoteEditor<any> | null>);

        const editorContent = editor.document;
        if (!isContentLoadedRef.current) {
            isContentLoadedRef.current = true;
            latestEditorBlocksRef.current = editorContent;
            latestEditorContentRef.current = JSON.stringify(editorContent);
            return;
        }
        latestEditorBlocksRef.current = editorContent;
        try {
            latestEditorContentRef.current = JSON.stringify(editorContent);
        } catch (stringifyError) {
             console.error("[handleEditorChange] Failed to stringify editor content:", stringifyError);
             setAutosaveStatus('error');
             return;
        }
        setAutosaveStatus('unsaved');
        if (revertStatusTimerId) {
            clearTimeout(revertStatusTimerId);
            setRevertStatusTimerId(null);
        }
        if (autosaveTimerId) {
            clearTimeout(autosaveTimerId);
        }
        const newTimerId = setTimeout(async () => {
            const editorInstance = editorRef.current;
            const currentBlocks = latestEditorBlocksRef.current;
            const currentContentString = latestEditorContentRef.current;
            if (!editorInstance || !documentId || !currentContentString || !currentBlocks) {
                console.warn("[Autosave Timer] Aborting save: Missing editor, documentId, content string, or blocks.");
                setAutosaveStatus('error');
                return;
            }
            setAutosaveStatus('saving');
            let markdownContent: string | null = null;
            if (currentBlocks.length > 0) {
                try {
                    markdownContent = await editorInstance.blocksToMarkdownLossy(currentBlocks);
                    markdownContent = markdownContent.trim() || null;
                } catch (markdownError) {
                    console.error("[Autosave Timer] Error generating markdown:", markdownError);
                    toast.error("Failed to generate markdown for search.");
                }
            }
            let jsonContent: Block[] | null = null;
            try {
                jsonContent = JSON.parse(currentContentString);
            } catch (parseError) {
                console.error("[Autosave Timer] Failed to parse content string for saving:", parseError);
                setAutosaveStatus('error');
                return;
            }
            try {
                const response = await fetch(`/api/documents/${documentId}/content`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: jsonContent, searchable_content: markdownContent }), 
                });
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || `Autosave failed (${response.status})`);
                }
                setAutosaveStatus('saved');
                const revertTimer = setTimeout(() => {
                    setAutosaveStatus(status => status === 'saved' ? 'idle' : status);
                    setRevertStatusTimerId(null);
                }, 2000);
                setRevertStatusTimerId(revertTimer);
            } catch (saveError: any) {
                console.error("[Autosave Timer] Save failed:", saveError);
                toast.error(`Autosave failed: ${saveError.message}`);
                setAutosaveStatus('error');
            }
        }, 3000);
        setAutosaveTimerId(newTimerId);
    }, [documentId, autosaveTimerId, revertStatusTimerId, setEditorRef]); // Corrected dependencies

    // Effect to set editorRef object in the global store - Reinstated and Corrected
    useEffect(() => {
        // editorRef is the object from useRef(), which is stable across renders.
        // We set this object into the store so other components can access it.
        console.log('[EditorPage useEffect] Setting editorRef in store. editorRef object:', editorRef);
        setEditorRef(editorRef as React.RefObject<BlockNoteEditor<any> | null>);
        
        // Cleanup to nullify the ref in store when EditorPage unmounts
        return () => {
            console.log('[EditorPage useEffect Cleanup] Setting editorRef in store to null.');
            setEditorRef(null);
        };
    }, [setEditorRef]); // Dependency on setEditorRef ensures it runs if the store setter changes, editorRef object itself is stable.

    const handleRestoreEditorContent = useCallback((restoredBlocks: PartialBlock[]) => {
        const editor = editorRef.current;
        if (editor && restoredBlocks) {
            editor.replaceBlocks(editor.document, restoredBlocks);
            handleEditorChange(editor); 
            toast.success("Content restored in editor.");
        } else {
            toast.error("Failed to restore content in editor: Editor or content not available.");
            console.error("[EditorPage] handleRestoreEditorContent: Editor or restoredBlocks missing.", { editor, restoredBlocks });
        }
        setIsVersionHistoryModalOpen(false); 
    }, [editorRef, handleEditorChange]);

    const handleSaveContent = useCallback(async () => {
        const editor = editorRef.current;
        if (!documentId || !editor?.document || isSaving) return;

        console.log("[Manual Save] Triggered.");
        if (autosaveTimerId) {
            clearTimeout(autosaveTimerId);
            setAutosaveTimerId(null);
        }
        if (revertStatusTimerId) {
            clearTimeout(revertStatusTimerId);
            setRevertStatusTimerId(null);
        }
        
        setAutosaveStatus('saving'); // Indicates a save operation is in progress
        setIsSaving(true); // Specific to manual save button UI
        setPageError(null);

        try {
            const currentEditorContentJSON: Block[] = editor.document;
            let searchableMarkdownContent: string | null = null;

            if (currentEditorContentJSON.length > 0) {
                try {
                    searchableMarkdownContent = await editor.blocksToMarkdownLossy(currentEditorContentJSON);
                    searchableMarkdownContent = searchableMarkdownContent.trim() || null;
                } catch (markdownError) {
                    console.error("[Manual Save] Error generating markdown:", markdownError);
                    toast.error("Failed to generate markdown for manual save.");
                    // Decide if we should proceed without markdown or halt. For now, let's proceed with null.
                }
            }

            const response = await fetch(`/api/documents/${documentId}/manual-save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    content: currentEditorContentJSON, 
                    searchable_content: searchableMarkdownContent 
                }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `Manual save failed (${response.status})`);
            }

            const responseData = await response.json(); // Expect { data: { manual_save_id, manual_save_timestamp, updated_at } }

            // Update refs for unsaved changes detection / beforeunload
            latestEditorBlocksRef.current = currentEditorContentJSON;
            latestEditorContentRef.current = JSON.stringify(currentEditorContentJSON);
            
            toast.success('Document saved manually!');
            setAutosaveStatus('saved'); // Reflects that the document is now in a saved state
            
            // Update document's last updated time in UI if available from response (e.g. for optimistic update)
            // This part depends on what `useDocument` hook or title management might need.
            // For now, the main purpose is saving to the new table.
            // If responseData.data.updated_at is available, you could potentially update related state.
            console.log('[Manual Save] Success:', responseData);


            const newRevertTimerId = setTimeout(() => {
                setAutosaveStatus('idle'); // Revert to idle after a short period
                setRevertStatusTimerId(null);
            }, 2000);
            setRevertStatusTimerId(newRevertTimerId);

        } catch (err: any) {
            console.error("[Manual Save] Save error:", err);
            setPageError(`Manual save failed: ${err.message}`);
            toast.error(`Manual save failed: ${err.message}`);
            setAutosaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    }, [documentId, editorRef, isSaving, autosaveTimerId, revertStatusTimerId, setAutosaveStatus, setIsSaving, setPageError]);

    const handleNewDocument = useCallback(() => {
        router.push('/launch');
    }, [router]);
    
    const scrollToBottom = useCallback(() => {
         messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
        console.log('[EditorPage handleKeyDown] Event triggered:', event.key, 'Shift:', event.shiftKey);
        console.log('[EditorPage handleKeyDown] Conditions: isChatLoading:', isChatLoading, 'isUploading:', isUploading);
        console.log('[EditorPage handleKeyDown] Input content:', input.trim(), 'Uploaded image:', uploadedImagePath);

        if (event.key === 'Enter' && !event.shiftKey && !isChatLoading && !isUploading) {
            console.log('[EditorPage handleKeyDown] Enter pressed without Shift, not loading/uploading.');
            event.preventDefault();
            if (input.trim() || uploadedImagePath) {
                console.log('[EditorPage handleKeyDown] Valid input found. Calling handleSubmit from useChatInteractions.');
                handleSubmit(); // Call the hook's handleSubmit directly
            } else {
                toast.info("Please type a message or attach an image.");
                console.log('[EditorPage handleKeyDown] No input or image to submit.');
            }
        }
    }, [isChatLoading, isUploading, input, uploadedImagePath, handleSubmit]); // Added handleSubmit dependency

    // Define getEditorMarkdownContent before handleSubmitWithContext
    // Note: This is async but not wrapped in useCallback as it's called within another useCallback
    const getEditorMarkdownContent = async (): Promise<string | null> => {
        const editor = editorRef.current;
        if (!editor) {
            toast.error('Editor instance not available.');
            return null;
        }
        try {
            if (editor.document.length === 0 || !editor.document[0]) return "";
            const firstBlockContent = editor.document[0].content;
            if (editor.document.length === 1 && (!Array.isArray(firstBlockContent) || getInlineContentText(firstBlockContent).trim() === '')) return "";
            const markdown = await editor.blocksToMarkdownLossy(editor.document);
            return markdown;
        } catch (error) {
            console.error('Failed to get editor content as Markdown:', error);
            toast.error('Error retrieving editor content.');
            return null;
        }
    };

    // Define execute* functions (not wrapped in useCallback as they are called within useEffect)
    const executeAddContent = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to add content.'); return; }
        try {
            const { markdownContent, targetBlockId } = args;
            if (typeof markdownContent !== 'string') { toast.error("Invalid content provided for addContent."); return; }
            let blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(markdownContent);
            if (blocksToInsert.length === 0 && markdownContent.trim() !== '') {
                blocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: markdownContent, styles: {} }] } as PartialBlock<typeof schema.blockSchema>);
            } else if (blocksToInsert.length === 0) return;
            let referenceBlock: Block | PartialBlock | undefined | null = targetBlockId ? editor.getBlock(targetBlockId) : editor.getTextCursorPosition().block;
            let placement: 'before' | 'after' = 'after';
            if (!referenceBlock) {
                referenceBlock = editor.document[editor.document.length - 1];
                placement = 'after';
                if (!referenceBlock) {
                    editor.replaceBlocks(editor.document, blocksToInsert);
                    toast.success("Content added from AI.");
                    handleEditorChange(editor);
                    return;
                }
            }
            if (referenceBlock && referenceBlock.id) {
                editor.insertBlocks(blocksToInsert, referenceBlock.id, placement);
                toast.success('Content added from AI.');
                handleEditorChange(editor);
            } else {
                 toast.error("Failed to insert content: could not find reference block.");
            }
        } catch (error: any) { console.error('Failed to execute addContent:', error); toast.error(`Error adding content: ${error.message}`); }
    };
    const executeModifyContent = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to modify content.'); return; }
        console.log('[Client Tool] executeModifyContent called with args:', args);

        const { targetBlockId, newMarkdownContent, targetText } = args; // Assuming targetText might be used, though often null for multi-block

        if (!targetBlockId || newMarkdownContent === undefined) {
          toast.error('Invalid arguments for modifyContent: targetBlockId and newMarkdownContent are required.');
          console.error('Invalid args for modifyContent:', args);
          return;
        }

        const blockIds = Array.isArray(targetBlockId) ? targetBlockId : [targetBlockId];
        const contents = Array.isArray(newMarkdownContent) ? newMarkdownContent : [newMarkdownContent];

        if (blockIds.length !== contents.length && Array.isArray(targetBlockId) && Array.isArray(newMarkdownContent)) {
            toast.error('Mismatch between targetBlockId array length and newMarkdownContent array length.');
            console.error('executeModifyContent length mismatch:', args);
            return;
        }
        
        // Define listTypes using string literals as per standard BlockNote usage if schema access is problematic
        const listTypes = ["bulletListItem", "numberedListItem", "checkListItem"];

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < blockIds.length; i++) {
          const id = blockIds[i];
          const originalBlock = editor.getBlock(id);

          if (!originalBlock) {
            toast.error(`Modification failed: Block ID ${id} not found.`);
            console.warn(`Block ID ${id} not found during modifyContent.`);
            errorCount++;
            continue;
          }

          const currentMarkdown = contents[i];
          const checklistRegex = /^\*\s+\[\s*([xX]?)\s*\]\s*(.*)$/;
          const checklistMatch = currentMarkdown.match(checklistRegex);

          let blockDefinitionToUpdate: PartialBlock | undefined = undefined;

          if (checklistMatch) {
            const isChecked = checklistMatch[1].toLowerCase() === 'x';
            const textContent = checklistMatch[2] || "";
            
            blockDefinitionToUpdate = {
              type: "checkListItem", // Use string literal for type
              props: { ...originalBlock.props, checked: isChecked }, // Ensure 'isChecked' is boolean if schema expects boolean
              content: textContent ? [{ type: "text", text: textContent, styles: {} }] : [], // Use string literal for type "text"
              children: [] 
            };
          } else {
            const parsedBlocks = await editor.tryParseMarkdownToBlocks(currentMarkdown);
            if (parsedBlocks && parsedBlocks.length > 0) {
              const { id: parsedId, ...restOfParsedBlock } = parsedBlocks[0];
              blockDefinitionToUpdate = { ...restOfParsedBlock };

              if (listTypes.includes(blockDefinitionToUpdate.type as string)) {
                if (!blockDefinitionToUpdate.props) {
                  blockDefinitionToUpdate.props = {};
                }
                const listItemProps = blockDefinitionToUpdate.props as { level?: string; [key: string]: any };
                
                if (listItemProps.level === undefined) {
                  const originalBlockIsList = listTypes.includes(originalBlock.type as string);
                  if (originalBlockIsList && originalBlock.props && (originalBlock.props as any).level !== undefined) {
                    listItemProps.level = (originalBlock.props as any).level;
                  } else {
                    listItemProps.level = "0"; 
                  }
                }
              }
            } else {
              toast.error(`Failed to parse Markdown for block ID ${id}: "${currentMarkdown}"`);
              console.warn(`Markdown parsing failed for block ${id}:`, currentMarkdown);
              errorCount++;
              continue;
            }
          }

          if (blockDefinitionToUpdate) {
            const { id: payloadId, ...finalPayload } = blockDefinitionToUpdate as PartialBlock & {id?: string};
            editor.updateBlock(id, finalPayload as PartialBlock);
            successCount++;
          }
        }

        if (successCount > 0) {
          toast.success(`${successCount} block(s) modified.`);
          handleEditorChange(editor); 
        }
        if (errorCount > 0) {
          toast.error(`${errorCount} block(s) could not be modified.`);
        }
        if (successCount === 0 && errorCount === 0 && blockIds.length > 0) {
            toast.info("No changes applied to blocks.");
        }
    };
    const executeDeleteContent = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to delete content.'); return; }
        try {
            const { targetBlockId, targetText } = args;
            if (!targetBlockId) { toast.error('Deletion failed: Missing target block ID(s).'); return; }
            const blockIdsToDelete = Array.isArray(targetBlockId) ? targetBlockId : [targetBlockId];
            if (targetText && blockIdsToDelete.length === 1) {
                const targetBlock = editor.getBlock(blockIdsToDelete[0]);
                if (!targetBlock) { toast.error(`Deletion failed: Block ID ${blockIdsToDelete[0]} not found.`); return; }
                if (!targetBlock.content || !Array.isArray(targetBlock.content)) { toast.error(`Deletion failed: Block ${targetBlock.id} has no deletable content.`); return; }
                const updatedContent = deleteTextInInlineContent(targetBlock.content, targetText);
                if (updatedContent !== null) {
                    if (editor.getBlock(targetBlock.id)) {
                        const newText = getInlineContentText(updatedContent);
                        if (!newText.trim()) { editor.removeBlocks([targetBlock.id]); toast.success(`Removed block ${targetBlock.id}.`); handleEditorChange(editor); }
                        else { editor.updateBlock(targetBlock.id, { content: updatedContent }); toast.success(`Text "${targetText}" deleted.`); handleEditorChange(editor); }
                    } else { toast.error(`Deletion failed: Target block ${targetBlock.id} disappeared.`); }
                } else { toast.warning(`Could not find text "${targetText}" to delete in block ${targetBlock.id}.`); }
            } else {
                if (targetText) { toast.warning("Cannot delete specific text across multiple blocks. Deleting blocks instead."); }
                const existingBlockIds = blockIdsToDelete.filter(id => editor.getBlock(id));
                if (existingBlockIds.length === 0) { toast.error("Deletion failed: Target blocks disappeared."); return; }
                if (existingBlockIds.length !== blockIdsToDelete.length) { toast.warning("Some target blocks were missing, removing the ones found."); }
                editor.removeBlocks(existingBlockIds);
                toast.success(`Removed ${existingBlockIds.length} block(s).`);
                handleEditorChange(editor);
            }
        } catch (error: any) { console.error('Failed to execute deleteContent:', error); toast.error(`Error deleting content: ${error.message}`); }
    };

    // --- NEW: executeCreateChecklist function ---
    const executeCreateChecklist = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to create checklist.'); return; }
        console.log('[Client Tool] executeCreateChecklist called with args:', args);

        try {
            const { items, targetBlockId } = args;

            if (!Array.isArray(items) || !items.every(item => typeof item === 'string')) {
                toast.error('Invalid arguments for createChecklist: items must be an array of strings.');
                console.error('Invalid args for createChecklist:', args);
                return;
            }

            if (items.length === 0) {
                toast.info('No items provided to create a checklist.');
                return;
            }

            const blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = items.map(itemText => ({
                type: 'checkListItem',
                props: { checked: false }, // BlockNote uses boolean false for unchecked
                content: itemText ? [{ type: 'text', text: itemText, styles: {} }] : [],
            }));

            let referenceBlock: Block | PartialBlock | undefined | null = targetBlockId ? editor.getBlock(targetBlockId) : editor.getTextCursorPosition().block;
            let placement: 'before' | 'after' = 'after';

            if (!referenceBlock) {
                const lastBlock = editor.document[editor.document.length - 1];
                if (lastBlock) {
                    referenceBlock = lastBlock;
                    placement = 'after';
                } else {
                    // Document is empty, replace all blocks (which is none)
                    editor.replaceBlocks(editor.document, blocksToInsert);
                    toast.success(`${blocksToInsert.length} checklist item(s) added.`);
                    handleEditorChange(editor);
                    return;
                }
            }
            
            // Ensure the reference block still exists if it was fetched by ID
            if (targetBlockId && !editor.getBlock(targetBlockId)){
                toast.error("Failed to create checklist: reference block not found or disappeared.");
                // Fallback: try inserting at the end or current cursor
                const currentPosBlock = editor.getTextCursorPosition().block;
                if (currentPosBlock && currentPosBlock.id) {
                    referenceBlock = currentPosBlock;
                } else {
                    const lastDocBlock = editor.document[editor.document.length - 1];
                    if (lastDocBlock && lastDocBlock.id) referenceBlock = lastDocBlock;
                    else {
                         editor.replaceBlocks(editor.document, blocksToInsert); // if all else fails
                         toast.success(`${blocksToInsert.length} checklist item(s) added.`);
                         handleEditorChange(editor);
                         return;
                    }
                }
            }

            if (referenceBlock && referenceBlock.id) {
                editor.insertBlocks(blocksToInsert, referenceBlock.id, placement);
                toast.success(`${blocksToInsert.length} checklist item(s) added.`);
                handleEditorChange(editor);
            } else {
                // Fallback if referenceBlock.id is somehow still null (e.g. text cursor in non-block context)
                editor.replaceBlocks(editor.document, blocksToInsert); 
                toast.success(`${blocksToInsert.length} checklist item(s) added to the end.`);
                handleEditorChange(editor);
            }

        } catch (error: any) {
            console.error('Error processing createChecklist tool call:', error);
            toast.error(`Failed to create checklist: ${error.message}`);
        }
    };
    // --- END NEW: executeCreateChecklist function ---

    const executeModifyTable = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to modify table.'); return; }
        console.log('[Client Tool] executeModifyTable called with args:', args);

        try {
            const { tableBlockId, newTableMarkdown } = args;

            if (typeof tableBlockId !== 'string' || typeof newTableMarkdown !== 'string') {
                toast.error('Invalid arguments for modifyTable.');
                console.error('Invalid args for modifyTable:', args);
                return;
            }

            const targetBlock = editor.getBlock(tableBlockId);
            if (!targetBlock) {
                toast.error(`Modification failed: Table block ID ${tableBlockId} not found.`);
                return;
            }
            if (targetBlock.type !== 'table') {
                 toast.error(`Modification failed: Block ${tableBlockId} is not a table.`);
                 return;
            }

            // Parse the new markdown content into BlockNote blocks
            let newBlocks: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(newTableMarkdown);
            
            // Handle potential empty result from parsing (e.g., AI returns empty string)
            if (newBlocks.length === 0 && newTableMarkdown.trim() === '') {
                // If the AI intended to empty the table, remove the original block
                editor.removeBlocks([tableBlockId]);
                toast.success(`Table block ${tableBlockId} removed as replacement was empty.`);
                handleEditorChange(editor);
                return;
            } else if (newBlocks.length === 0) {
                 // If parsing failed but markdown wasn't empty, treat as error
                 console.warn(`Failed to parse new table markdown for ${tableBlockId}. Markdown: ${newTableMarkdown}`);
                 // Keep the original table or revert? For now, just show error.
                 toast.error(`Failed to parse the updated table structure. Original table retained.`);
                 return;
            }
            
            // Ensure the block still exists before replacing
             if (!editor.getBlock(tableBlockId)) {
                 toast.error(`Modification failed: Target table block ${tableBlockId} disappeared before update.`);
                 return;
             }

            // Replace the original table block with the newly parsed block(s)
            // Note: Parsing might yield multiple blocks if the markdown is complex, but typically a table markdown yields one table block.
            editor.replaceBlocks([tableBlockId], newBlocks);
            toast.success(`Table block ${tableBlockId} updated.`);
            handleEditorChange(editor); // Trigger state update and autosave

        } catch (error: any) {
            console.error('Error processing modifyTable tool call:', error);
            toast.error(`Failed to modify table: ${error.message}`);
        }
    };

    // --- Effect Hooks (Defined BEFORE Early Returns) ---
    useEffect(() => { /* Effect for page error */
        if (documentError) {
            setPageError(documentError);
        }
    }, [documentError]);

    useEffect(() => { /* Effect for follow-up context logging */
        console.log("[EditorPage] followUpContext state updated:", followUpContext);
    }, [followUpContext]);

    // --- MODIFIED useEffect for tool processing to handle mobile deferral ---
    useEffect(() => {
        const lastMessage = chatMessages[chatMessages.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.parts && lastMessage.parts.length > 0) {
            const toolInvocationParts = lastMessage.parts.filter(
              (part): part is { type: 'tool-invocation'; toolInvocation: ToolInvocation & { state?: string } } => // Add state to type
                part.type === 'tool-invocation' && part.toolInvocation != null
            );

            const callsToProcessThisRun: Array<ToolInvocation & { state?: string }> = [];
            const idsToMarkAsProcessed = new Set(processedToolCallIds);

            for (const part of toolInvocationParts) {
                const toolCall = part.toolInvocation;
                // If it's from initial messages and marked as 'result', ensure it's in processedToolCallIds
                // but don't add to callsToProcessThisRun.
                if (toolCall.state === 'result') {
                    idsToMarkAsProcessed.add(toolCall.toolCallId); // Ensure it's considered processed
                    continue; // Don't re-process
                }

                // If it's not marked as 'result' and not yet processed (globally), add it for processing.
                if (!processedToolCallIds.has(toolCall.toolCallId)) {
                    callsToProcessThisRun.push(toolCall);
                }
            }

            if (callsToProcessThisRun.length > 0) {
                callsToProcessThisRun.forEach(toolCall => {
                    // Add to idsToMarkAsProcessed immediately before attempting execution within this run.
                    // This set (idsToMarkAsProcessed) will be used to update the main processedToolCallIds state later.
                    idsToMarkAsProcessed.add(toolCall.toolCallId); 
                    const { toolName, args } = toolCall;
                    const editorTargetingTools = ['addContent', 'modifyContent', 'deleteContent', 'modifyTable', 'createChecklist']; // Added createChecklist

                    if (isMobile && mobileVisiblePane === 'chat' && editorTargetingTools.includes(toolName)) {
                        console.log(`[ToolProcessing] Mobile view, chat visible. Queuing ${toolName} (ID: ${toolCall.toolCallId}) and switching to editor.`);
                        setPendingMobileEditorToolCall({ toolName, args, toolCallId: toolCall.toolCallId });
                        setMobileVisiblePane('editor');
                    } else {
                        console.log(`[ToolProcessing] Executing ${toolName} (ID: ${toolCall.toolCallId}) immediately.`);
                        try {
                            switch (toolName) {
                                case 'addContent': executeAddContent(args); break;
                                case 'modifyContent': executeModifyContent(args); break;
                                case 'deleteContent': executeDeleteContent(args); break;
                                case 'modifyTable': executeModifyTable(args); break;
                                case 'createChecklist': executeCreateChecklist(args); break; // <-- ADDED CASE
                                case 'request_editor_content': setIncludeEditorContent(true); toast.info('AI context requested.'); break;
                                case 'webSearch': break; 
                                case 'searchAndTagDocumentsTool': // Corrected case to match actual tool name
                                    // This tool is handled by the backend; its results are rendered by ChatMessageItem.
                                    // No further client-side execution needed in this loop.
                                    console.log(`[ToolProcessing] Recognized backend-handled tool: ${toolName} (ID: ${toolCall.toolCallId})`);
                                    break;
                                default: console.error(`Unknown tool: ${toolName}`); toast.error(`Unknown tool: ${toolName}`);
                            }
                        } catch (toolError: any) {
                            console.error(`Tool ${toolName} error:`, toolError);
                            toast.error(`Tool error: ${toolError.message}`);
                        }
                    }
                });
            }
            
            // Update processedToolCallIds state if the set has changed.
            // This check prevents an unnecessary state update if no new IDs were added.
            let anIdWasAdded = false;
            if (idsToMarkAsProcessed.size !== processedToolCallIds.size) {
                anIdWasAdded = true;
            } else {
                for (const id of idsToMarkAsProcessed) {
                    if (!processedToolCallIds.has(id)) {
                        anIdWasAdded = true;
                        break;
                    }
                }
            }
            if (anIdWasAdded) {
                setProcessedToolCallIds(idsToMarkAsProcessed);
            }
        }
    }, [
        chatMessages, 
        processedToolCallIds, 
        executeAddContent, 
        executeModifyContent, 
        executeDeleteContent, 
        executeModifyTable, 
        executeCreateChecklist, // <-- ADDED to dependency array
        isMobile, 
        mobileVisiblePane,
        setPendingMobileEditorToolCall,
        setMobileVisiblePane,
        setIncludeEditorContent 
    ]); 
    // Note: setPendingMobileEditorToolCall and setMobileVisiblePane are not needed in deps array

    // --- ADDED useEffect for handling pending tool call after mobile pane switch --- (ensure executeCreateChecklist is added to switch)
    useEffect(() => {
        if (isMobile && mobileVisiblePane === 'editor' && pendingMobileEditorToolCall) {
            const { toolName, args, toolCallId } = pendingMobileEditorToolCall;
            
            console.log("[Mobile Editor] Executing pending tool call on editor pane switch:", { toolName, args, toolCallId });
            
            // Execute the tool
            switch (toolName) {
                case 'addContent': executeAddContent(args); break;
                case 'modifyContent': executeModifyContent(args); break;
                case 'deleteContent': executeDeleteContent(args); break;
                case 'modifyTable': executeModifyTable(args); break;
                case 'createChecklist': executeCreateChecklist(args); break; // <-- ADDED CASE
                default:
                    console.warn("[Mobile Editor] Unknown tool name:", toolName);
                    toast.error(`Unknown tool: ${toolName}`);
            }
            
            // Clear the pending tool call
            setPendingMobileEditorToolCall(null);
        }
    }, [mobileVisiblePane, pendingMobileEditorToolCall, executeAddContent, executeModifyContent, executeDeleteContent, executeModifyTable, executeCreateChecklist]); // <-- ADDED to dependency array

    // --- NEW: Event listener for Gemini tool execution ---
    useEffect(() => {
        const handleGeminiToolExecution = (event: CustomEvent) => {
            console.log('[EditorPage] Received geminiToolExecution event:', event.detail);
            
            const { action, params } = event.detail;
            
            // Execute the appropriate tool based on the action
            switch (action) {
                case 'addContent':
                    if (isMobile && mobileVisiblePane !== 'editor') {
                        // Store for later execution when switching to editor pane
                        setPendingMobileEditorToolCall({ 
                            toolName: action, 
                            args: params, 
                            toolCallId: `gemini-${Date.now()}` 
                        });
                        setMobileVisiblePane('editor');
                        toast.info("Switching to editor to apply changes...");
                    } else {
                        executeAddContent(params);
                    }
                    break;
                    
                case 'modifyContent':
                    if (isMobile && mobileVisiblePane !== 'editor') {
                        setPendingMobileEditorToolCall({ 
                            toolName: action, 
                            args: params, 
                            toolCallId: `gemini-${Date.now()}` 
                        });
                        setMobileVisiblePane('editor');
                        toast.info("Switching to editor to apply changes...");
                    } else {
                        executeModifyContent(params);
                    }
                    break;
                    
                case 'deleteContent':
                    if (isMobile && mobileVisiblePane !== 'editor') {
                        setPendingMobileEditorToolCall({ 
                            toolName: action, 
                            args: params, 
                            toolCallId: `gemini-${Date.now()}` 
                        });
                        setMobileVisiblePane('editor');
                        toast.info("Switching to editor to apply changes...");
                    } else {
                        executeDeleteContent(params);
                    }
                    break;
                    
                case 'modifyTable':
                    if (isMobile && mobileVisiblePane !== 'editor') {
                        setPendingMobileEditorToolCall({ 
                            toolName: action, 
                            args: params, 
                            toolCallId: `gemini-${Date.now()}` 
                        });
                        setMobileVisiblePane('editor');
                        toast.info("Switching to editor to apply changes...");
                    } else {
                        executeModifyTable(params);
                    }
                    break;
                    
                case 'createChecklist':
                    if (isMobile && mobileVisiblePane !== 'editor') {
                        setPendingMobileEditorToolCall({ 
                            toolName: action, 
                            args: params, 
                            toolCallId: `gemini-${Date.now()}` 
                        });
                        setMobileVisiblePane('editor');
                        toast.info("Switching to editor to apply changes...");
                    } else {
                        executeCreateChecklist(params);
                    }
                    break;
                    
                default:
                    console.warn('[EditorPage] Unknown Gemini tool action:', action);
                    toast.error(`Unknown tool action: ${action}`);
            }
        };
        
        // Add event listener
        window.addEventListener('geminiToolExecution', handleGeminiToolExecution as EventListener);
        
        // Cleanup
        return () => {
            window.removeEventListener('geminiToolExecution', handleGeminiToolExecution as EventListener);
        };
    }, [
        isMobile, 
        mobileVisiblePane, 
        executeAddContent, 
        executeModifyContent, 
        executeDeleteContent, 
        executeModifyTable, 
        executeCreateChecklist,
        setMobileVisiblePane,
        setPendingMobileEditorToolCall
    ]);

    useEffect(() => { /* Effect for beforeunload */
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (autosaveStatus === 'unsaved' || autosaveTimerId) {
                if (autosaveTimerId) clearTimeout(autosaveTimerId);
                if (revertStatusTimerId) clearTimeout(revertStatusTimerId);
                if (latestEditorContentRef.current && documentId) {
                    try {
                        const contentToSave = latestEditorContentRef.current;
                        const url = `/api/documents/${documentId}/content`;
                        const payload = JSON.stringify({ content: JSON.parse(contentToSave) });
                         if (navigator.sendBeacon) {
                            const blob = new Blob([payload], { type: 'application/json' });
                            navigator.sendBeacon(url, blob);
                         } else {
                            fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true })
                                .catch(err => console.warn('[beforeunload] fetch keepalive error:', err));
                        }
                    } catch (err) {
                        console.error('[beforeunload] Error preparing sync save data:', err);
                    }
                } 
            } 
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [autosaveStatus, autosaveTimerId, revertStatusTimerId, documentId]); 

    useEffect(() => { /* Effect for navigation handling */
        const isLeavingEditor = !!(previousPathnameRef.current?.startsWith('/editor/') && !pathname?.startsWith('/editor/'));
        if (isLeavingEditor && (autosaveStatus === 'unsaved' || autosaveTimerId)) {
             if (autosaveTimerId) {
                clearTimeout(autosaveTimerId);
                setAutosaveTimerId(null);
            }
            if (revertStatusTimerId) {
                 clearTimeout(revertStatusTimerId);
                 setRevertStatusTimerId(null);
            }
            if (latestEditorContentRef.current && documentId) {
                 setAutosaveStatus('saving');
                 triggerSaveDocument(latestEditorContentRef.current, documentId)
                    .catch(err => console.error("[Navigation] Save on navigate failed:", err));
            }
        }
        if (pathname) {
           previousPathnameRef.current = pathname;
        }
    }, [pathname, autosaveStatus, autosaveTimerId, revertStatusTimerId, documentId, triggerSaveDocument]);

    useEffect(() => { /* Effect for unmount cleanup */
        return () => {
            if (autosaveTimerId) clearTimeout(autosaveTimerId);
            if (revertStatusTimerId) clearTimeout(revertStatusTimerId);
        };
    }, [autosaveTimerId, revertStatusTimerId]);

    useEffect(() => { /* Effect for scrolling chat */
         scrollToBottom(); 
    }, [chatMessages, scrollToBottom]);
    
    useEffect(() => { /* Effect for Embedding generation */
        return () => {
            if (!documentId) return;
            fetch('/api/generate-embedding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId }),
                keepalive: true
            })
            .catch(error => console.error("[Unmount Embedding] Error sending embedding request:", error));
        };
    }, [documentId]);

    // --- NEW: Effect to detect and update theme ---
    useEffect(() => {
        const getTheme = () => {
            // Check for data-theme attribute on <html> first
            const dataTheme = document.documentElement.getAttribute('data-theme');
            if (dataTheme === 'dark' || dataTheme === 'light') {
                return dataTheme;
            }
            // Fallback to checking class if data-theme is not definitive
            if (document.documentElement.classList.contains('dark')) {
                return 'dark';
            }
            return 'light';
        };

        setCurrentTheme(getTheme());

        const observer = new MutationObserver(() => {
            setCurrentTheme(getTheme());
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'class'], // Observe changes to data-theme and class
        });

        return () => {
            observer.disconnect();
        };
    }, []);

    // --- Handler Definitions (Place standard handlers here) ---
    const handlePaste = (event: React.ClipboardEvent) => handleFilePasteEvent(event);
    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        // Only prevent default and show drop zone for file drags
        if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            setIsDragging(true);
        }
        // Don't prevent default for other drag types (like BlockNote's internal drags)
    };
    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        // No need to prevent default on drag leave
        setIsDragging(false);
    };
    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        // Only handle and prevent default for file drops
        if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            setIsDragging(false);
            handleFileDropEvent(event);
        }
        // Don't prevent default for other drop types (like BlockNote's internal drops)
    };
    const handleUploadClick = () => { if (isUploading || isRecording || isTranscribing) { toast.info("Busy, please wait..."); return; } fileInputRef.current?.click(); };
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => handleFileSelectEvent(event);
    const handleSendToEditor = async (content: string) => {
        const editor = editorRef.current;
        if (!editor || !content || content.trim() === '') return;
        try {
            let blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(content);
             if (blocksToInsert.length === 0 && content.trim() !== '') {
                 blocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: content, styles: {} }] } as PartialBlock<typeof schema.blockSchema>);
             }
            else if (blocksToInsert.length === 0) return;
            const { block: currentBlock } = editor.getTextCursorPosition();
            let referenceBlockId: string | undefined = currentBlock?.id;
            if (!referenceBlockId) { referenceBlockId = editor.document[editor.document.length - 1]?.id; }
            if (referenceBlockId) { editor.insertBlocks(blocksToInsert, referenceBlockId, 'after'); }
            else { editor.replaceBlocks(editor.document, blocksToInsert); } 
            toast.success('Content successfully added to editor.');
            handleEditorChange(editor);
        } catch (error: any) { 
            console.error('Failed to add content to editor:', error); 
            toast.error(`Could not add content to the editor. Please try again. (Error: ${error.message})`); 
        }
    };
    // UPDATED: Toggle handler to check for mobile
    const handleToggleChat = () => {
        if (isMobile) {
            setMobileVisiblePane(pane => pane === 'chat' ? 'editor' : 'chat');
            if (mobileVisiblePane === 'editor') { // If switching to chat, ensure mini-pane is closed
                setIsMiniPaneOpen(false);
            }
        } else {
            setIsChatCollapsed(!isChatCollapsed);
            if (!isChatCollapsed) { // If main chat is being opened, close mini-pane
                setIsMiniPaneOpen(false);
            }
        }
    };

    // --- NEW: Handler for Mini-Pane Toggle ---
    const handleToggleMiniPane = () => setIsMiniPaneOpen(prev => !prev);

    // --- Render Logic ---
    // Find the last assistant message to pass down
    const lastAssistantMessage = [...chatMessages].reverse().find(msg => msg.role === 'assistant');

    console.log('[Render Check] State before render:', {
        totalMessages: chatMessages.length,
        shouldShowLoadMore: false,
        isMobile, // Log mobile state
        mobileVisiblePane, // Log visible pane on mobile
    });

    // Main Render
    return (
        <div className="flex flex-row w-full h-full bg-[--bg-color] overflow-hidden relative" 
            onDragOver={handleDragOver} 
            onDragLeave={handleDragLeave} 
            onDrop={handleDrop}
        >
            {isDragging && <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center z-50 pointer-events-none"><p className="text-blue-800 dark:text-blue-200 font-semibold text-lg p-4 bg-white/80 dark:bg-black/80 rounded-lg shadow-lg">Drop files to attach</p></div>}

            {/* --- Mini-Pane Container (Rendered conditionally) --- */}
            {isMiniPaneOpen && (isChatCollapsed || mobileVisiblePane !== 'chat') && (
                <motion.div
                    ref={miniPaneRef}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="fixed bottom-[calc(var(--chat-input-area-height,174px)_+_8px)] left-0 right-0 mx-auto w-[calc(100%-2rem)] max-w-[700px] max-h-[350px] z-[1050] overflow-y-auto bg-[--input-bg] border border-[--border-color] rounded-md shadow-lg flex flex-col"
                >
                    <div className="flex-1 overflow-y-auto styled-scrollbar p-2">
                        <ChatMessagesList 
                            chatMessages={chatMessages}
                            isLoadingMessages={isLoadingMessages} // Or a mini-specific loading state if different
                            isChatLoading={isChatLoading} // Or a mini-specific loading state
                            handleSendToEditor={handleSendToEditor} // Actions should still work
                            messagesEndRef={messagesEndRef} // May need a separate ref for mini-pane scroll
                            onAddTaggedDocument={(doc) => { /* Define or pass handler */ }}
                            displayMode="mini"
                        />
                    </div>
                </motion.div>
            )}

            {/* Conditional Rendering based on isMobile */}
            {isMobile ? (
                // --- Mobile Layout: Show only one pane ---
                <>
                    {mobileVisiblePane === 'editor' && (
                        <div className="w-full flex-1 flex flex-col relative overflow-hidden p-4 bg-[var(--editor-bg)]"> {/* ADDED bg-[var(--editor-bg)] */}
                            {/* EditorTitleBar */}
                            <EditorTitleBar
                                currentTitle={currentTitle}
                                isEditingTitle={isEditingTitle}
                                newTitleValue={newTitleValue}
                                setNewTitleValue={setNewTitleValue}
                                handleTitleInputKeyDown={handleTitleInputKeyDown}
                                handleSaveTitle={handleSaveTitle}
                                handleCancelEditTitle={handleCancelEditTitle}
                                handleEditTitleClick={handleEditTitleClick}
                                isInferringTitle={isInferringTitle}
                                handleInferTitle={handleInferTitle}
                                editorRef={editorRef}
                                autosaveStatus={autosaveStatus}
                                handleSaveContent={handleSaveContent}
                                isSaving={isSaving}
                                onOpenHistory={() => setIsVersionHistoryModalOpen(true)}
                                isDocumentStarred={currentDocIsStarred}
                                onToggleDocumentStar={handleToggleCurrentDocumentStar}
                            />
                            {pageError && !pageError.startsWith("Chat Error:") && (
                                <div className="mt-4 p-2 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-700 dark:text-red-200 text-sm">Error: {pageError}</div>
                            )}
                            {/* EditorPaneWrapper */}
                            <div className="flex-1 flex flex-col overflow-hidden relative">
                                <EditorPaneWrapper
                                    documentId={documentId}
                                    initialContent={initialEditorContent}
                                    editorRef={editorRef}
                                    onEditorContentChange={handleEditorChange}
                                    isChatCollapsed={true} // Pass true as chat is conceptually 'collapsed'
                                    lastMessageContent={lastAssistantMessage?.content}
                                    lastAssistantMessageId={lastAssistantMessage?.id}
                                    handleSendToEditor={handleSendToEditor}
                                    input={input}
                                    handleInputChange={handleInputChange}
                                    handleSubmit={handleSubmit}
                                    isLoading={isChatLoading}
                                    model={model}
                                    setModel={setModel}
                                    stop={stop}
                                    files={files}
                                    handleFileChange={handleFileChange}
                                    handlePaste={handlePaste}
                                    handleUploadClick={handleUploadClick}
                                    isUploading={isUploading}
                                    uploadError={uploadError}
                                    uploadedImagePath={uploadedImagePath}
                                    followUpContext={followUpContext}
                                    setFollowUpContext={setFollowUpContext}
                                    formRef={formCallbackRef}
                                    inputRef={inputRef}
                                    fileInputRef={fileInputRef}
                                    handleKeyDown={handleKeyDown}
                                    isRecording={isRecording}
                                    isTranscribing={isTranscribing}
                                    micPermissionError={micPermissionError}
                                    startRecording={startRecording}
                                    stopRecording={stopRecording}
                                    audioTimeDomainData={audioTimeDomainData}
                                    clearPreview={clearPreview}
                                    taggedDocuments={taggedDocuments}
                                    setTaggedDocuments={setTaggedDocuments}
                                    isMiniPaneOpen={isMiniPaneOpen}
                                    onToggleMiniPane={handleToggleMiniPane}
                                    isMainChatCollapsed={true} // For mobile, editor implies main chat is hidden
                                    miniPaneToggleRef={miniPaneToggleRef}
                                    currentTheme={currentTheme} // Pass down the theme
                                />
                            </div>
                        </div>
                    )}
                    {mobileVisiblePane === 'chat' && (
                         <div className="w-full h-full flex flex-col bg-[--bg-secondary] relative">
                             {/* ChatPaneWrapper */}
                             <ChatPaneWrapper
                                isChatCollapsed={false} // Pass false as chat is visible
                                chatMessages={chatMessages}
                                isLoadingMessages={isLoadingMessages}
                                isChatLoading={isChatLoading}
                                handleSendToEditor={handleSendToEditor}
                                messagesEndRef={messagesEndRef}
                                messageLoadBatchSize={MESSAGE_LOAD_BATCH_SIZE}
                                input={input}
                                setInput={setInput}
                                taggedDocuments={taggedDocuments}
                                setTaggedDocuments={setTaggedDocuments}
                                handleInputChange={handleInputChange}
                                handleSubmit={handleSubmit}
                                model={model}
                                setModel={setModel}
                                stop={stop}
                                files={files}
                                handleFileChange={handleFileChange}
                                handlePaste={handlePaste}
                                handleUploadClick={handleUploadClick}
                                isUploading={isUploading}
                                uploadError={uploadError}
                                uploadedImagePath={uploadedImagePath}
                                followUpContext={followUpContext}
                                setFollowUpContext={setFollowUpContext}
                                formRef={formCallbackRef}
                                inputRef={inputRef}
                                fileInputRef={fileInputRef}
                                handleKeyDown={handleKeyDown}
                                initialChatPaneWidthPercent={100} // Full width
                                minChatPaneWidthPx={0} // No min width
                                isRecording={isRecording}
                                isTranscribing={isTranscribing}
                                micPermissionError={micPermissionError}
                                startRecording={startRecording}
                                stopRecording={stopRecording}
                                audioTimeDomainData={audioTimeDomainData}
                                clearPreview={clearPreview}
                                isMiniPaneOpen={isMiniPaneOpen}
                                onToggleMiniPane={handleToggleMiniPane}
                                isMainChatCollapsed={false} // Chat is visible here
                                miniPaneToggleRef={miniPaneToggleRef}
                                currentTheme={currentTheme} // ADDED currentTheme prop
                            />
                         </div>
                    )}
                </>
            ) : (
                // --- Desktop Layout: Show both panes with resize ---
                <>
                    {/* Editor Pane Container - Takes remaining space, add padding here */}
                    <div className="flex-1 flex flex-col relative overflow-hidden p-4 bg-[var(--editor-bg)]"> {/* ADDED bg-[var(--editor-bg)] */}
                        {/* EditorTitleBar */}
                         <EditorTitleBar
                            currentTitle={currentTitle}
                            isEditingTitle={isEditingTitle}
                            newTitleValue={newTitleValue}
                            setNewTitleValue={setNewTitleValue}
                            handleTitleInputKeyDown={handleTitleInputKeyDown}
                            handleSaveTitle={handleSaveTitle}
                            handleCancelEditTitle={handleCancelEditTitle}
                            handleEditTitleClick={handleEditTitleClick}
                            isInferringTitle={isInferringTitle}
                            handleInferTitle={handleInferTitle}
                            editorRef={editorRef}
                            autosaveStatus={autosaveStatus}
                            handleSaveContent={handleSaveContent}
                            isSaving={isSaving}
                            onOpenHistory={() => setIsVersionHistoryModalOpen(true)}
                            isDocumentStarred={currentDocIsStarred}
                            onToggleDocumentStar={handleToggleCurrentDocumentStar}
                         />
                        {pageError && !pageError.startsWith("Chat Error:") && (
                            <div className="mt-4 p-2 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-700 dark:text-red-200 text-sm">Error: {pageError}</div>
                        )}
                        {/* EditorPaneWrapper */}
                        <div className="flex-1 flex flex-col overflow-hidden relative"> {/* REMOVED mt-4 */}
                            <EditorPaneWrapper
                                documentId={documentId}
                                initialContent={initialEditorContent}
                                editorRef={editorRef}
                                onEditorContentChange={handleEditorChange}
                                isChatCollapsed={isChatCollapsed}
                                lastMessageContent={lastAssistantMessage?.content}
                                lastAssistantMessageId={lastAssistantMessage?.id}
                                handleSendToEditor={handleSendToEditor}
                                input={input}
                                handleInputChange={handleInputChange}
                                handleSubmit={handleSubmit}
                                isLoading={isChatLoading}
                                model={model}
                                setModel={setModel}
                                stop={stop}
                                files={files}
                                handleFileChange={handleFileChange}
                                handlePaste={handlePaste}
                                handleUploadClick={handleUploadClick}
                                isUploading={isUploading}
                                uploadError={uploadError}
                                uploadedImagePath={uploadedImagePath}
                                followUpContext={followUpContext}
                                setFollowUpContext={setFollowUpContext}
                                formRef={formCallbackRef}
                                inputRef={inputRef}
                                fileInputRef={fileInputRef}
                                handleKeyDown={handleKeyDown}
                                isRecording={isRecording}
                                isTranscribing={isTranscribing}
                                micPermissionError={micPermissionError}
                                startRecording={startRecording}
                                stopRecording={stopRecording}
                                audioTimeDomainData={audioTimeDomainData}
                                clearPreview={clearPreview}
                                taggedDocuments={taggedDocuments}
                                setTaggedDocuments={setTaggedDocuments}
                                isMiniPaneOpen={isMiniPaneOpen}
                                onToggleMiniPane={handleToggleMiniPane}
                                isMainChatCollapsed={isChatCollapsed}
                                miniPaneToggleRef={miniPaneToggleRef}
                                currentTheme={currentTheme} // Pass down the theme
                            />
                        </div>
                    </div>

                    {/* Resize Handle - Rendered conditionally based on chat pane state (Desktop only) */}
                    {!isChatCollapsed && (
                        <div // Outer handle container (for interaction)
                            ref={dragHandleRef}
                            onMouseDown={handleMouseDownResize}
                            className="h-full cursor-col-resize bg-transparent z-20 flex-shrink-0 flex items-center justify-center" // Centering the inner line
                            style={{ flexBasis: '1px' }} // Interactive width
                        >
                            <div // Inner visual line
                                className="h-full w-[1px] bg-[var(--border-color)] group-hover:opacity-80 transition-opacity duration-150"
                                // The hover effect can be on the outer div if preferred, e.g., by adding a class to it on hover like 'group'
                                // For simplicity, applying opacity change to the line itself. 
                                // Or, use hover:bg-[--accent-color]/20 on the outer div and make the inner line transparent on hover.
                            />
                        </div>
                    )}

                    {/* Chat Pane with Animation (Desktop only) */}
                    <AnimatePresence>
                        {!isChatCollapsed && (
                            <motion.div
                                key="chat-pane"
                                initial={{ width: 0, opacity: 0 }}
                                animate={{
                                    width: chatPaneWidth ? `${chatPaneWidth}px` : `${INITIAL_CHAT_PANE_WIDTH_PERCENT}%`,
                                    opacity: 1
                                }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                style={{
                                    flexShrink: 0,
                                    overflow: 'hidden',
                                }}
                                className="h-full flex flex-col bg-[--bg-secondary] relative"
                            >
                                <ChatPaneWrapper
                                    isChatCollapsed={isChatCollapsed}
                                    chatMessages={chatMessages}
                                    isLoadingMessages={isLoadingMessages}
                                    isChatLoading={isChatLoading}
                                    handleSendToEditor={handleSendToEditor}
                                    messagesEndRef={messagesEndRef}
                                    messageLoadBatchSize={MESSAGE_LOAD_BATCH_SIZE}
                                    input={input}
                                    setInput={setInput}
                                    taggedDocuments={taggedDocuments}
                                    setTaggedDocuments={setTaggedDocuments}
                                    handleInputChange={handleInputChange}
                                    handleSubmit={handleSubmit}
                                    model={model}
                                    setModel={setModel}
                                    stop={stop}
                                    files={files}
                                    handleFileChange={handleFileChange}
                                    handlePaste={handlePaste}
                                    handleUploadClick={handleUploadClick}
                                    isUploading={isUploading}
                                    uploadError={uploadError}
                                    uploadedImagePath={uploadedImagePath}
                                    followUpContext={followUpContext}
                                    setFollowUpContext={setFollowUpContext}
                                    formRef={formCallbackRef}
                                    inputRef={inputRef}
                                    fileInputRef={fileInputRef}
                                    handleKeyDown={handleKeyDown}
                                    initialChatPaneWidthPercent={INITIAL_CHAT_PANE_WIDTH_PERCENT}
                                    minChatPaneWidthPx={MIN_CHAT_PANE_WIDTH_PX}
                                    isRecording={isRecording}
                                    isTranscribing={isTranscribing}
                                    micPermissionError={micPermissionError}
                                    startRecording={startRecording}
                                    stopRecording={stopRecording}
                                    audioTimeDomainData={audioTimeDomainData}
                                    clearPreview={clearPreview}
                                    isMiniPaneOpen={isMiniPaneOpen}
                                    onToggleMiniPane={handleToggleMiniPane}
                                    isMainChatCollapsed={isChatCollapsed}
                                    miniPaneToggleRef={miniPaneToggleRef}
                                    currentTheme={currentTheme} // Ensured currentTheme is passed
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}

             {/* Toggle Button - Positioned absolutely, adapts based on mobile/desktop */}
             <button
                 onClick={handleToggleChat}
                 className={`absolute top-1/2 transform -translate-y-1/2 z-30 p-1.5 rounded-full bg-[--toggle-button-bg] border border-[--border-color] shadow-md text-[--text-color] hover:bg-[--hover-bg] transition-all duration-300 ease-in-out`}
                 style={{
                     // Mobile: Fixed near right edge
                     // Desktop: Position relative to chat pane edge or collapsed position
                     right: isMobile
                         ? '10px' // Fixed position for mobile
                         : isChatCollapsed
                           ? '-8px' // Desktop collapsed position
                           : chatPaneWidth
                             ? `${chatPaneWidth + 4}px` // Desktop open position
                             : `${(INITIAL_CHAT_PANE_WIDTH_PERCENT / 100) * (typeof window !== 'undefined' ? window.innerWidth : 1000) + 4}px`, // Desktop fallback
                     transform: isMobile ? 'translateY(-50%)' : 'translate(50%, -50%)' // Adjust horizontal positioning only for desktop
                 }}
                 aria-label={
                     isMobile
                       ? (mobileVisiblePane === 'chat' ? "Show editor" : "Show chat")
                       : (isChatCollapsed ? "Open chat pane" : "Close chat pane")
                 }
             >
                 {/* Conditional Icon Rendering */}
                 {isMobile
                    ? (mobileVisiblePane === 'chat' ? <NotebookPen size={16} /> : <MessageCircleMore size={16} />)
                    : (isChatCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />)
                 }
             </button>

            {/* --- NEW: Version History Modal --- */}
            {isVersionHistoryModalOpen && documentId && (
                <VersionHistoryModal
                    documentId={documentId}
                    isOpen={isVersionHistoryModalOpen}
                    onClose={handleCloseHistoryModal}
                    onRestoreContent={handleRestoreEditorContent}
                />
            )}
            {/* --- END NEW --- */}
        </div>
    );
} 
