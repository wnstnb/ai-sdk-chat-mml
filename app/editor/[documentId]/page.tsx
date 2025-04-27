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
import { ChevronLeft, ChevronRight, Wrench, SendToBack, Edit, Save, X, Clock, CheckCircle2, AlertCircle, XCircle, Sparkles } from 'lucide-react';
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

// --- NEW: Import the hooks ---
import { useDocument } from '@/app/lib/hooks/editor/useDocument';
import { useInitialChatMessages } from '@/app/lib/hooks/editor/useInitialChatMessages';
// --- NEW: Import the useTitleManagement hook ---
import { useTitleManagement } from '@/lib/hooks/editor/useTitleManagement'; // Corrected path
// --- NEW: Import the useChatPane hook ---
import { useChatPane } from '@/lib/hooks/editor/useChatPane';
// --- NEW: Import the useFileUpload hook ---
import { useFileUpload } from '@/lib/hooks/editor/useFileUpload';

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
const defaultModelFallback = 'gemini-2.0-flash'; // Define fallback

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
    const formRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const latestEditorContentRef = useRef<string | null>(null);
    const latestEditorBlocksRef = useRef<BlockNoteEditorType['document'] | null>(null);
    const isContentLoadedRef = useRef<boolean>(false);
    const previousPathnameRef = useRef(pathname);
    const routerForReplace = useRouter(); 

    // --- State Variables --- (Declare state early)
    const { default_model: preferredModel, isInitialized: isPreferencesInitialized } = usePreferenceStore();
    const [model, setModel] = useState<string>(() => (isPreferencesInitialized && preferredModel) ? preferredModel : defaultModelFallback);
    const [pageError, setPageError] = useState<string | null>(null);
    const [processedToolCallIds, setProcessedToolCallIds] = useState<Set<string>>(new Set());
    const [displayedMessagesCount, setDisplayedMessagesCount] = useState(INITIAL_MESSAGE_COUNT);
    const [includeEditorContent, setIncludeEditorContent] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [pendingInitialSubmission, setPendingInitialSubmission] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [autosaveTimerId, setAutosaveTimerId] = useState<NodeJS.Timeout | null>(null);
    const [revertStatusTimerId, setRevertStatusTimerId] = useState<NodeJS.Timeout | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle');

    // --- Custom Hooks --- (Now safe to call, state/refs declared)
    const { documentData, initialEditorContent, isLoadingDocument, error: documentError } = useDocument(documentId);
    const { messages: chatMessages, input, handleInputChange, handleSubmit: originalHandleSubmit, isLoading: isChatLoading, reload, stop, setMessages: setChatMessages, setInput } = useChat({
        api: '/api/chat',
        id: documentId,
        initialMessages: [],
        onError: (err) => {
            const errorMsg = `Chat Error: ${err.message || 'Unknown error'}`;
            toast.error(errorMsg);
            setPageError(errorMsg); 
        },
    });
    const followUpContext = useFollowUpStore((state) => state.followUpContext);
    const setFollowUpContext = useFollowUpStore((state) => state.setFollowUpContext);
    const { isLoadingMessages } = useInitialChatMessages({
        documentId,
        setChatMessages,
        setDisplayedMessagesCount, // Pass the state setter
        setPageError             // Pass the state setter
    });
    const { currentTitle, isEditingTitle, newTitleValue, isInferringTitle, handleEditTitleClick, handleCancelEditTitle, handleSaveTitle, handleTitleInputKeyDown, handleInferTitle, setNewTitleValue } = useTitleManagement({
        documentId,
        initialName: documentData?.name || '', // Use documentData AFTER useDocument hook
        editorRef,
    });
    const { isChatCollapsed, setIsChatCollapsed, chatPaneWidth, isResizing, dragHandleRef, handleMouseDownResize } = useChatPane({
        initialWidthPercent: INITIAL_CHAT_PANE_WIDTH_PERCENT,
        minWidthPx: MIN_CHAT_PANE_WIDTH_PX,
        maxWidthPercent: MAX_CHAT_PANE_WIDTH_PERCENT,
    });
    const { files, isUploading, uploadError, uploadedImagePath, handleFileSelectEvent, handleFilePasteEvent, handleFileDropEvent, clearPreview } = useFileUpload({ documentId });

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

    const handleEditorChange = useCallback((editor: BlockNoteEditorType) => {
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
    }, [documentId, autosaveTimerId, revertStatusTimerId]);

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
        setAutosaveStatus('saving');
        setIsSaving(true);
        setPageError(null);
        try {
            const currentEditorContent = editor.document;
            const stringifiedContent = JSON.stringify(currentEditorContent);
            latestEditorBlocksRef.current = currentEditorContent;
            latestEditorContentRef.current = stringifiedContent;
            // TODO: Add markdown generation here too?
            await triggerSaveDocument(stringifiedContent, documentId);
            toast.success('Document saved!');
            setAutosaveStatus('saved');
             const newRevertTimerId = setTimeout(() => {
                 setAutosaveStatus('idle');
                 setRevertStatusTimerId(null);
             }, 2000);
             setRevertStatusTimerId(newRevertTimerId);
        } catch (err: any) {
            console.error("[Manual Save] Save error:", err);
            setPageError(`Save failed: ${err.message}`);
            toast.error(`Save failed: ${err.message}`);
            setAutosaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    }, [documentId, isSaving, autosaveTimerId, revertStatusTimerId, triggerSaveDocument]);

    const handleNewDocument = useCallback(() => {
        router.push('/launch');
    }, [router]);
    
    const scrollToBottom = useCallback(() => {
         messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey && !isChatLoading && !isUploading) {
            event.preventDefault();
            if (input.trim() || uploadedImagePath) {
                formRef.current?.requestSubmit();
            } else {
                toast.info("Please type a message or attach an image.");
            }
        }
    }, [isChatLoading, isUploading, input, uploadedImagePath]);

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

    const handleSubmitWithContext = useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) event.preventDefault();
        if (!documentId) { toast.error("Cannot send message: Document context missing."); return; }
        
        const contextPrefix = followUpContext ? `${followUpContext}\n\n---\n\n` : '';
        const currentInput = contextPrefix + input;
        const currentModel = model;
        const imagePathToSend = uploadedImagePath;

        if (isChatLoading || isUploading || (!currentInput.trim() && !imagePathToSend && !followUpContext)) {
            return;
        }

        let editorContextData = {}; 
        const editor = editorRef.current;
        if (includeEditorContent && editor) {
            const markdownContent = await getEditorMarkdownContent(); // Call the function
            if (markdownContent !== null) { editorContextData = { editorMarkdownContent: markdownContent }; }
            setIncludeEditorContent(false);
        } else if (editor) {
            try {
                const currentBlocks = editor.document;
                if (currentBlocks?.length > 0) {
                    editorContextData = { editorBlocksContext: currentBlocks.map(b => ({ id: b.id, contentSnippet: (Array.isArray(b.content) ? getInlineContentText(b.content).slice(0, 100) : '') || `[${b.type}]` })) };
                }
            } catch (e) { console.error('Failed to get editor snippets:', e); toast.error('⚠️ Error getting editor context.'); }
        }

        const isSummarizationTask = /\b(summar(y|ize|ies)|bullet|points?|outline|sources?|citations?)\b/i.test(currentInput) && currentInput.length > 25;
        
        try {
            // Save user message (assuming API exists and works)
            const saveMessageResponse = await fetch(`/api/documents/${documentId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'user', content: currentInput.trim() || null, imageUrlPath: imagePathToSend }),
            });
            if (!saveMessageResponse.ok) {
                 const errorData = await saveMessageResponse.json().catch(() => ({}));
                 throw new Error(errorData.error?.message || `Failed to save message (${saveMessageResponse.status})`);
             }
            await saveMessageResponse.json(); // Consume response body

            // Trigger AI chat submission
            const submitOptions = {
                data: { model: currentModel, documentId, ...editorContextData, firstImagePath: imagePathToSend, taskHint: isSummarizationTask ? 'summarize_and_cite_outline' : undefined },
                options: { experimental_attachments: files ? Array.from(files) : undefined }
            };
            originalHandleSubmit(event, { ...submitOptions, data: submitOptions.data as any });

            clearPreview();
            setFollowUpContext(null);
            requestAnimationFrame(() => { if (inputRef.current) inputRef.current.style.height = 'auto'; });

        } catch (saveError: any) {
             console.error("Error saving user message or submitting:", saveError);
             toast.error(`Failed to send message: ${saveError.message}`);
        }
    }, [documentId, followUpContext, input, model, uploadedImagePath, isChatLoading, isUploading, includeEditorContent, originalHandleSubmit, files, clearPreview, setFollowUpContext /* removed getEditorMarkdownContent from deps */ ]);
    
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
                    toast.success("Content added from AI."); return;
                }
            }
            if (referenceBlock && referenceBlock.id) {
                editor.insertBlocks(blocksToInsert, referenceBlock.id, placement);
                toast.success('Content added from AI.');
            } else {
                 toast.error("Failed to insert content: could not find reference block.");
            }
        } catch (error: any) { console.error('Failed to execute addContent:', error); toast.error(`Error adding content: ${error.message}`); }
    };
    const executeModifyContent = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to modify content.'); return; }
        try {
            const { targetBlockId, targetText, newMarkdownContent } = args;
            if (!targetBlockId) { toast.error('Modification failed: Missing target block ID.'); return; }
            const targetBlock = editor.getBlock(targetBlockId);
            if (!targetBlock) { toast.error(`Modification failed: Block ID ${targetBlockId} not found.`); return; }
            if (targetText && typeof newMarkdownContent === 'string') {
                if (!targetBlock.content || !Array.isArray(targetBlock.content)) { toast.error(`Modification failed: Block ${targetBlock.id} has no modifiable content.`); return; }
                const updatedContent = replaceTextInInlineContent(targetBlock.content, targetText, newMarkdownContent);
                if (updatedContent) {
                    if (editor.getBlock(targetBlock.id)) { editor.updateBlock(targetBlock.id, { content: updatedContent }); toast.success(`Text "${targetText}" modified in block.`); }
                    else { toast.error(`Modification failed: Target block ${targetBlock.id} disappeared before update.`); }
                } else { toast.warning(`Could not find text "${targetText}" to modify in block ${targetBlock.id}.`); }
            } else if (typeof newMarkdownContent === 'string') {
                let blocksToReplaceWith: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(newMarkdownContent);
                if (blocksToReplaceWith.length === 0 && newMarkdownContent.trim() !== '') {
                    blocksToReplaceWith.push({ type: 'paragraph', content: [{ type: 'text', text: newMarkdownContent, styles: {} }] } as PartialBlock<typeof schema.blockSchema>);
                 }
                const listBlockTypes = ['bulletListItem', 'numberedListItem', 'checkListItem'];
                let blockIdsToReplace = [targetBlock.id];
                if (listBlockTypes.includes(targetBlock.type)) {
                    const allBlocks = editor.document; const targetIndex = allBlocks.findIndex(b => b.id === targetBlock.id); const targetLevel = (targetBlock.props as any).level ?? 0;
                    if (targetIndex !== -1) {
                        blockIdsToReplace = []; let startIndex = targetIndex;
                        while (startIndex > 0 && allBlocks[startIndex - 1].type === targetBlock.type && ((allBlocks[startIndex - 1].props as any).level ?? 0) === targetLevel) startIndex--;
                        let currentIndex = startIndex;
                        while (currentIndex < allBlocks.length && allBlocks[currentIndex].type === targetBlock.type && ((allBlocks[currentIndex].props as any).level ?? 0) === targetLevel) { blockIdsToReplace.push(allBlocks[currentIndex].id); currentIndex++; }
                    } else { blockIdsToReplace = [targetBlock.id]; }
                }
                const existingBlockIds = blockIdsToReplace.filter(id => editor.getBlock(id));
                if (existingBlockIds.length === 0) { toast.error("Modification failed: Target blocks disappeared before replacement."); return; }
                if (existingBlockIds.length !== blockIdsToReplace.length) { toast.warning("Some target blocks were missing, replacing the ones found."); }
                if (blocksToReplaceWith.length > 0) { editor.replaceBlocks(existingBlockIds, blocksToReplaceWith); toast.success('Block content modified by AI.'); }
                else { editor.removeBlocks(existingBlockIds); toast.success('Original block(s) removed as replacement was empty.'); }
            } else { toast.error("Invalid arguments for modifyContent: newMarkdownContent must be a string."); }
        } catch (error: any) { console.error('Failed to execute modifyContent:', error); toast.error(`Error modifying content: ${error.message}`); }
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
                        if (!newText.trim()) { editor.removeBlocks([targetBlock.id]); toast.success(`Removed block ${targetBlock.id}.`); }
                        else { editor.updateBlock(targetBlock.id, { content: updatedContent }); toast.success(`Text "${targetText}" deleted.`); }
                    } else { toast.error(`Deletion failed: Target block ${targetBlock.id} disappeared.`); }
                } else { toast.warning(`Could not find text "${targetText}" to delete in block ${targetBlock.id}.`); }
            } else {
                if (targetText) { toast.warning("Cannot delete specific text across multiple blocks. Deleting blocks instead."); }
                const existingBlockIds = blockIdsToDelete.filter(id => editor.getBlock(id));
                if (existingBlockIds.length === 0) { toast.error("Deletion failed: Target blocks disappeared."); return; }
                if (existingBlockIds.length !== blockIdsToDelete.length) { toast.warning("Some target blocks were missing, removing the ones found."); }
                editor.removeBlocks(existingBlockIds);
                toast.success(`Removed ${existingBlockIds.length} block(s).`);
            }
        } catch (error: any) { console.error('Failed to execute deleteContent:', error); toast.error(`Error deleting content: ${error.message}`); }
    };

    // --- Effect Hooks (Defined BEFORE Early Returns) ---
    useEffect(() => { /* Effect for model sync */
        if (isPreferencesInitialized && preferredModel && model !== preferredModel) {
            setModel(preferredModel);
        }
    }, [isPreferencesInitialized, preferredModel]);

    useEffect(() => { /* Effect for page error */
        if (documentError) {
            setPageError(documentError);
        }
    }, [documentError]);

    useEffect(() => { /* Effect for follow-up context logging */
        console.log("[EditorPage] followUpContext state updated:", followUpContext);
    }, [followUpContext]);

    useEffect(() => { /* Effect for initial message query param */
        const initialMsg = searchParams?.get('initialMsg');
        if (initialMsg) {
            const decodedMsg = decodeURIComponent(initialMsg);
            setInput(decodedMsg);
            setPendingInitialSubmission(decodedMsg);
            const currentPath = window.location.pathname;
            routerForReplace.replace(currentPath, { scroll: false });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps 
    }, [documentId]); // Only run on mount/docId change

    useEffect(() => { /* Effect for pending initial submission */
        if (pendingInitialSubmission && input === pendingInitialSubmission) {
            originalHandleSubmit(undefined, {
                data: { model: model, documentId: documentId } as any
            });
            setPendingInitialSubmission(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps 
    }, [input, pendingInitialSubmission, originalHandleSubmit, model, documentId]);

    useEffect(() => { /* Effect for displayed message count */
        const newPotentialCount = Math.min(chatMessages.length, INITIAL_MESSAGE_COUNT);
        if (newPotentialCount > displayedMessagesCount) {
            setDisplayedMessagesCount(newPotentialCount);
        }
    }, [chatMessages.length, displayedMessagesCount]);
    
    useEffect(() => { /* Effect for tool processing */
        const lastMessage = chatMessages[chatMessages.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.toolInvocations) {
            const callsToProcess = lastMessage.toolInvocations.filter(tc => !processedToolCallIds.has(tc.toolCallId));
            if (callsToProcess.length > 0) {
                const newProcessedIds = new Set(processedToolCallIds);
                callsToProcess.forEach(toolCall => {
                    newProcessedIds.add(toolCall.toolCallId);
                    const { toolName, args } = toolCall;
                    try {
                        switch (toolName) {
                            case 'addContent': executeAddContent(args); break;
                            case 'modifyContent': executeModifyContent(args); break;
                            case 'deleteContent': executeDeleteContent(args); break;
                            case 'request_editor_content': setIncludeEditorContent(true); toast.info('AI context requested.'); break;
                            case 'webSearch': break; // Handled server-side
                            default: console.error(`Unknown tool: ${toolName}`); toast.error(`Unknown tool: ${toolName}`);
                        }
                    } catch (toolError: any) { console.error(`Tool ${toolName} error:`, toolError); toast.error(`Tool error: ${toolError.message}`); }
                });
                setProcessedToolCallIds(newProcessedIds);
            }
        }
    // Dependencies need to include execute* functions if they aren't stable (useCallback)
    // For now, assuming they are stable or defined outside component scope for simplicity
    }, [chatMessages, processedToolCallIds /*, executeAddContent, executeModifyContent, executeDeleteContent */]); 

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
    // --- END Effect Hooks ---

    // --- Early Return Checks ---
    if (isLoadingDocument) {
        return <div className="flex justify-center items-center h-screen bg-[--bg-color] text-[--text-color]">Loading document...</div>;
    }

    // Error state if document fetch failed
    // Check documentData directly now, error is handled via pageError state
    if (!documentData && !isLoadingDocument) { // Check loading flag too to avoid flicker
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center p-4 bg-[--bg-color]">
                <p className="text-red-500 text-xl mb-2">Error Loading Document</p>
                <p className="text-[--muted-text-color] mb-4">{pageError || 'Document not found or access denied.'}</p>
             <button onClick={() => router.push('/launch')} className="mt-4 px-4 py-2 bg-[--editor-bg]-white rounded hover:bg-[--hover-bg]">Go to Launch Pad</button>
            </div>
        );
    }
    // If documentData is null but we are still loading, the loading screen above handles it.
    // If we are not loading and documentData is null, the error screen above handles it.
    // If documentData exists, proceed to render.
    // So, add an explicit check for documentData before rendering the main content.
    if (!documentData) {
        // This case should theoretically be covered by loading/error states above,
        // but acts as a safeguard.
        return <div className="flex justify-center items-center h-screen bg-[--bg-color] text-[--text-color]">Preparing document...</div>;
    }

    // --- Handler Definitions (Can be defined here, AFTER hooks but BEFORE return) ---
    const handlePaste = (event: React.ClipboardEvent) => {
        handleFilePasteEvent(event);
    };
    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
         event.preventDefault(); 
         setIsDragging(true);
    };
    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
         event.preventDefault(); 
         setIsDragging(false);
    };
    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); 
        setIsDragging(false);
        handleFileDropEvent(event);
    };
    const handleUploadClick = () => { 
        if (isUploading) {
            toast.info("Please wait for the current upload to finish."); 
            return; 
        } 
        fileInputRef.current?.click();
    };
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFileSelectEvent(event);
    };
    // RESTORED: handleSendToEditor definition
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
            toast.success('Content sent to editor.');
        } catch (error: any) { console.error('Send to editor error:', error); toast.error(`Send to editor error: ${error.message}`); }
    };
    // --- END Handler Definitions ---

    // --- Render Logic ---
    console.log('[Render Check] State before render:', {
        totalMessages: chatMessages.length,
        displayedCount: displayedMessagesCount,
        shouldShowLoadMore: chatMessages.length > displayedMessagesCount,
    });

    // Main Render
    return (
        <div className="flex flex-row w-full h-full bg-[--bg-color] overflow-hidden" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {isDragging && <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center z-50 pointer-events-none"><p className="text-blue-800 dark:text-blue-200 font-semibold text-lg p-4 bg-white/80 dark:bg-black/80 rounded-lg shadow-lg">Drop files to attach</p></div>}

            {/* Editor Pane */}
            <div className="flex-1 flex flex-col p-4 border-r border-[--border-color] relative overflow-hidden">
                {/* --- NEW: Use EditorTitleBar Component --- */}
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
                    editorRef={editorRef} // Pass editorRef
                    autosaveStatus={autosaveStatus} // Pass autosave status from page state
                    handleNewDocument={handleNewDocument} // Pass handler from page
                    handleSaveContent={handleSaveContent} // Pass handler from page
                    isSaving={isSaving} // Pass saving state from page
                />
                {/* --- REMOVED: Original Title Bar JSX --- */}
                {/* <div className="flex justify-between items-center mb-2 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                        {isEditingTitle ? (
                            <>
                                <input
                                    type="text"
                                    value={newTitleValue} // Use hook state
                                    onChange={(e) => setNewTitleValue(e.target.value)} // Use hook setter
                                    onKeyDown={handleTitleInputKeyDown} // Use hook handler
                                    className="flex-grow px-2 py-1 border border-[--border-color] rounded bg-[--input-bg] text-[--text-color] focus:outline-none focus:ring-1 focus:ring-[--primary-color] text-lg font-semibold"
                                    autoFocus
                                />
                                <button onClick={() => handleSaveTitle()} className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900 rounded" title="Save Title"><Save size={18} /></button>
                                <button onClick={handleCancelEditTitle} className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded" title="Cancel"><X size={18} /></button>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-[--text-color] truncate" title={currentTitle}>{currentTitle}</h2>
                                <button
                                    onClick={handleInferTitle} // Use hook handler
                                    className="p-1 rounded hover:bg-[--hover-bg] text-[--muted-text-color] hover:text-[--text-color] disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                    aria-label="Suggest title from content"
                                    title="Suggest title from content"
                                    disabled={isInferringTitle || !editorRef.current} // Use hook state
                                >
                                    {isInferringTitle ? ( // Use hook state
                                         <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                            style={{ display: 'flex' }}
                                         >
                                             <Sparkles size={16} className="text-yellow-500" />
                                         </motion.div>
                                    ) : (
                                         <Sparkles size={16} />
                                    )}
                                </button>
                                <button onClick={handleEditTitleClick} className="p-1 text-[--muted-text-color] hover:text-[--text-color] hover:bg-[--hover-bg] rounded flex-shrink-0" title="Rename Document"><Edit size={16} /></button>
                            </>
                        )}
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                        <AutosaveStatusIndicator status={autosaveStatus} />
                        <button onClick={handleNewDocument} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded" title="New/Open (Launch Pad)"><DocumentPlusIcon className="h-5 w-5" /></button>
                        <button onClick={handleSaveContent} disabled={isSaving || autosaveStatus === 'saving'} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Save Document Manually">
                           {isSaving ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ArrowDownTrayIcon className="h-5 w-5" />}
                        </button>
                    </div>
                </div> */}
                {/* --- END REMOVED --- */}
                {/* Page Errors */}
                {pageError && !pageError.startsWith("Chat Error:") && <div className="mb-2 p-2 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-700 dark:text-red-200 text-sm">Error: {pageError}</div>}
                {/* Editor */}
                <div className="flex-1 flex flex-col relative border rounded-lg bg-[--editor-bg] border-[--border-color] shadow-sm overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 styled-scrollbar">
                        {initialEditorContent !== undefined ? (
                            // Render the editor component directly
                            <BlockNoteEditorComponent
                                key={documentId} // Keep key for re-initialization if ID changes
                                editorRef={editorRef}
                                initialContent={initialEditorContent}
                                onEditorContentChange={handleEditorChange} // Pass the handler
                                // Remove editable prop
                                // editable={true}
                            />
                        ) : (
                            <p className="p-4 text-center text-[--muted-text-color]">Initializing editor...</p>
                         )}
                    </div>
                    {/* Collapsed Chat Input */}
                    {isChatCollapsed && <div className="p-4 pt-2 border-t border-[--border-color] z-10 bg-[--editor-bg] flex-shrink-0">
                        <form ref={formRef} onSubmit={handleSubmitWithContext} className="w-full flex flex-col items-center">
                           {/* --- ADDED: Follow Up Context Display --- */}
                           {followUpContext && (
                               <div className="w-full mb-2 p-2 border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 rounded-md relative text-sm text-blue-800 dark:text-blue-200">
                                   <button 
                                       type="button"
                                       onClick={() => setFollowUpContext(null)}
                                       className="absolute top-1 right-1 p-0.5 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800"
                                       title="Clear follow-up context"
                                   >
                                       <X size={14} />
                                   </button>
                                   <p className="font-medium mb-1 text-blue-600 dark:text-blue-300">Follow-up Context:</p>
                                   <p className="line-clamp-2">{followUpContext}</p>
                               </div>
                           )}
                           {/* --- END ADDED --- */}
                           <ChatInputUI files={files} fileInputRef={fileInputRef} handleFileChange={handleFileChange} inputRef={inputRef} input={input} handleInputChange={handleInputChange} handleKeyDown={handleKeyDown} handlePaste={handlePaste} model={model} setModel={setModel} handleUploadClick={handleUploadClick} isLoading={isChatLoading} isUploading={isUploading} uploadError={uploadError} uploadedImagePath={uploadedImagePath} onStop={stop} />
                        </form>
                    </div>}
                </div>
                {/* Collapse Button */}
                <button onClick={() => setIsChatCollapsed(!isChatCollapsed)} className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 z-20 p-1 bg-[--toggle-button-bg] border border-[--border-color] rounded-full text-[--text-color] hover:bg-[--hover-bg] focus:outline-none" title={isChatCollapsed ? 'Expand chat' : 'Collapse chat'}>
                    {isChatCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
            </div>

            {/* Chat Pane */}
            <motion.div className="flex flex-col bg-[--bg-secondary] h-full relative border-l border-[--border-color]" initial={false} animate={{ width: isChatCollapsed ? 0 : chatPaneWidth ?? `${INITIAL_CHAT_PANE_WIDTH_PERCENT}%`, minWidth: isChatCollapsed ? 0 : MIN_CHAT_PANE_WIDTH_PX, opacity: isChatCollapsed ? 0 : 1, paddingLeft: isChatCollapsed ? 0 : '1rem', paddingRight: isChatCollapsed ? 0 : '1rem', borderLeftWidth: isChatCollapsed ? 0 : '1px' }} transition={{ type: 'tween', duration: 0.3 }} style={{ visibility: isChatCollapsed ? 'hidden' : 'visible' }}>
                {/* Resize Handle */}
                {!isChatCollapsed && <div ref={dragHandleRef} onMouseDown={handleMouseDownResize} className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize bg-gray-300/50 dark:bg-gray-600/50 hover:bg-blue-400 dark:hover:bg-blue-600 transition-colors duration-150 z-30" style={{ transform: 'translateX(-50%)' }} />}
                {/* Chat Content Area */}
                {!isChatCollapsed &&
                    // Messages Area (scrolls internally)
                    <div className="flex-1 overflow-y-auto styled-scrollbar pr-2 pt-4">
                        {/* Load More */}
                        {chatMessages.length > displayedMessagesCount && <button onClick={() => setDisplayedMessagesCount(prev => Math.min(prev + MESSAGE_LOAD_BATCH_SIZE, chatMessages.length))} className="text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 py-2 focus:outline-none mb-2 mx-auto block">Load More ({chatMessages.length - displayedMessagesCount} older)</button>}
                        {/* Initial Loading - Use state from hook */}
                        {isLoadingMessages && chatMessages.length === 0 && <div className="flex justify-center items-center h-full"><p className="text-zinc-500">Loading messages...</p></div>}
                        {/* No Messages */}
                        {!isLoadingMessages && chatMessages.length === 0 && <motion.div className="h-auto w-full pt-16 px-4 text-center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><div className="border rounded-lg p-4 flex flex-col gap-3 text-zinc-500 text-sm dark:text-zinc-400 dark:border-zinc-700"><p className="font-medium text-zinc-700 dark:text-zinc-300">No messages yet.</p><p>Start the conversation below!</p></div></motion.div>}
                        {/* Messages */}
                        {chatMessages.length > 0 && chatMessages.slice(-displayedMessagesCount).map((message, index) => {
                            console.log('Rendering message content:', JSON.stringify(message.content)); // Log before returning JSX
                            return (
                            <motion.div
                                key={message.id || `msg-${index}`}
                                className={`flex flex-row gap-2 w-full mb-4 md:px-0 ${index === 0 && chatMessages.length <= displayedMessagesCount ? 'pt-4' : ''}`}
                                initial={{ y: 5, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="size-[24px] flex flex-col justify-start items-center flex-shrink-0 text-zinc-400 pt-1">{message.role === 'assistant' ? <BotIcon /> : <UserIcon />}</div>
                                <div className="flex flex-col gap-1 flex-grow break-words overflow-hidden p-2 rounded-md bg-[--message-bg] shadow-sm">
                                    <div className="text-zinc-800 dark:text-zinc-300 flex flex-col gap-4"><Markdown>{message.content}</Markdown></div>
                                    {message.role === 'assistant' && message.content && message.content.trim() !== '' && <div className="mt-1 flex justify-end"><button onClick={() => handleSendToEditor(message.content)} className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500" title="Send to Editor"><SendToBack size={14} /></button></div>}
                                    {message.role === 'assistant' && message.toolInvocations && message.toolInvocations.length > 0 && <div className="mt-2 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-700 pt-2">{message.toolInvocations.map((toolCall) => (<div key={toolCall.toolCallId} className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><Wrench size={12} className="flex-shrink-0" /><span>Using tool: <strong>{toolCall.toolName}</strong></span></div>))}</div>}
                                    <div className="flex flex-row gap-2 flex-wrap mt-2">{message.experimental_attachments?.map((attachment, idx) => attachment.contentType?.startsWith("image") ? <img className="rounded-md w-32 mb-2 object-cover" key={attachment.name || `attach-${idx}`} src={attachment.url} alt={attachment.name || 'Attachment'} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : attachment.contentType?.startsWith("text") ? <div key={attachment.name || `attach-${idx}`} className="text-xs w-32 h-20 overflow-hidden text-zinc-400 border p-1 rounded-md dark:bg-zinc-800 dark:border-zinc-700 mb-2">{attachment.url.startsWith('data:') ? getTextFromDataUrl(attachment.url).slice(0, 100) + '...' : `[${attachment.name || 'Text File'}]`}</div> : null)}</div>
                                </div>
                            </motion.div>
                        );
                      })}
                        {/* Assistant Loading */}
                        {isChatLoading && <div className="flex flex-row gap-2 w-full md:px-0 mt-2"><div className="size-[24px] flex flex-col justify-start items-center flex-shrink-0 text-zinc-400 pt-1"> <BotIcon /> </div><div className="flex items-center gap-1 text-zinc-400 p-2"><span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span><span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse [animation-delay:-0.15s]"></span><span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse"></span></div></div>}
                        <div ref={messagesEndRef} /> {/* Scroll Anchor */}
                    </div>
                }
                {/* Chat Input Area (fixed at bottom) */}
                {!isChatCollapsed &&
                    <div className="w-full px-0 pb-4 border-t border-[--border-color] pt-4 flex-shrink-0 bg-[--bg-secondary]">
                        <form ref={formRef} onSubmit={handleSubmitWithContext} className="w-full flex flex-col items-center">
                           {/* --- ADDED: Follow Up Context Display --- */}
                           {followUpContext && (
                               <div className="w-full mb-2 p-2 border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 rounded-md relative text-sm text-blue-800 dark:text-blue-200">
                                   <button 
                                       type="button"
                                       onClick={() => setFollowUpContext(null)}
                                       className="absolute top-1 right-1 p-0.5 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800"
                                       title="Clear follow-up context"
                                   >
                                       <X size={14} />
                                   </button>
                                   <p className="font-medium mb-1 text-blue-600 dark:text-blue-300">Follow-up Context:</p>
                                   <p className="line-clamp-2">{followUpContext}</p>
                               </div>
                           )}
                           {/* --- END ADDED --- */}
                            <ChatInputUI files={files} fileInputRef={fileInputRef} handleFileChange={handleFileChange} inputRef={inputRef} input={input} handleInputChange={handleInputChange} handleKeyDown={handleKeyDown} handlePaste={handlePaste} model={model} setModel={setModel} handleUploadClick={handleUploadClick} isLoading={isChatLoading} isUploading={isUploading} uploadError={uploadError} uploadedImagePath={uploadedImagePath} onStop={stop} />
                        </form>
                    </div>
                }
            </motion.div>
        </div>
    );
} 
