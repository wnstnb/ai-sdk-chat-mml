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
// --- NEW: Import the useChatInteractions hook ---
import { useChatInteractions } from '@/lib/hooks/editor/useChatInteractions';
import { ChatInputArea } from '@/components/editor/ChatInputArea'; // Import the new component
import { ChatMessagesList } from '@/components/editor/ChatMessagesList'; // Import the new component
import { ChatPaneWrapper } from '@/components/editor/ChatPaneWrapper'; // Import the new wrapper
import { EditorPaneWrapper } from '@/components/editor/EditorPaneWrapper'; // Import the new wrapper

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
    const initialModel = (isPreferencesInitialized && preferredModel) ? preferredModel : defaultModelFallback;
    const [pageError, setPageError] = useState<string | null>(null);
    const [processedToolCallIds, setProcessedToolCallIds] = useState<Set<string>>(new Set());
    const [includeEditorContent, setIncludeEditorContent] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [autosaveTimerId, setAutosaveTimerId] = useState<NodeJS.Timeout | null>(null);
    const [revertStatusTimerId, setRevertStatusTimerId] = useState<NodeJS.Timeout | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle');

    // --- Custom Hooks --- (Order is important!)
    const { documentData, initialEditorContent, isLoadingDocument, error: documentError } = useDocument(documentId);
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
    const { isLoadingMessages, initialMessages } = useInitialChatMessages({
        documentId,
        setPageError
    });
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
    } = useChatInteractions({
        documentId,
        initialModel,
        initialMessages: initialMessages as any, // Explicit type assertion
        editorRef,
        uploadedImagePath,
        uploadedImageSignedUrl,
        isUploading,
        clearFileUploadPreview: clearPreview,
    });
    const followUpContext = useFollowUpStore((state) => state.followUpContext);
    const setFollowUpContext = useFollowUpStore((state) => state.setFollowUpContext);

    // ---> ADD LOG HERE <---
    console.log('[EditorPage] Received initialMessages from useInitialChatMessages:', JSON.stringify(initialMessages, null, 2));

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
        try {
            const { targetBlockId, targetText, newMarkdownContent } = args;
            if (!targetBlockId) { toast.error('Modification failed: Missing target block ID.'); return; }
            const targetBlock = editor.getBlock(targetBlockId);
            if (!targetBlock) { toast.error(`Modification failed: Block ID ${targetBlockId} not found.`); return; }
            if (targetText && typeof newMarkdownContent === 'string') {
                if (!targetBlock.content || !Array.isArray(targetBlock.content)) { toast.error(`Modification failed: Block ${targetBlock.id} has no modifiable content.`); return; }
                const updatedContent = replaceTextInInlineContent(targetBlock.content, targetText, newMarkdownContent);
                if (updatedContent) {
                    if (editor.getBlock(targetBlock.id)) { editor.updateBlock(targetBlock.id, { content: updatedContent }); toast.success(`Text "${targetText}" modified in block.`); handleEditorChange(editor); }
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
                if (blocksToReplaceWith.length > 0) { editor.replaceBlocks(existingBlockIds, blocksToReplaceWith); toast.success('Block content modified by AI.'); handleEditorChange(editor); }
                else { editor.removeBlocks(existingBlockIds); toast.success('Original block(s) removed as replacement was empty.'); handleEditorChange(editor); }
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

    // --- NEW: executeModifyTable function ---
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

    useEffect(() => { /* Effect for tool processing */
        const lastMessage = chatMessages[chatMessages.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.parts && lastMessage.parts.length > 0) {
            const toolInvocationParts = lastMessage.parts.filter(
              (part): part is { type: 'tool-invocation'; toolInvocation: ToolInvocation } => part.type === 'tool-invocation'
            );
            const currentToolInvocations = toolInvocationParts.map(part => part.toolInvocation);

            const callsToProcess = currentToolInvocations.filter(tc => !processedToolCallIds.has(tc.toolCallId));
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
                            case 'modifyTable': executeModifyTable(args); break;
                            case 'request_editor_content': setIncludeEditorContent(true); toast.info('AI context requested.'); break;
                            case 'webSearch': break; // Handled server-side
                            default: console.error(`Unknown tool: ${toolName}`); toast.error(`Unknown tool: ${toolName}`);
                        }
                    } catch (toolError: any) { console.error(`Tool ${toolName} error:`, toolError); toast.error(`Tool error: ${toolError.message}`); }
                });
                setProcessedToolCallIds(newProcessedIds);
            }
        }
    }, [chatMessages, processedToolCallIds, executeAddContent, executeModifyContent, executeDeleteContent, executeModifyTable]); 

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
    if (isLoadingDocument || isLoadingMessages) {
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

    // --- Handler Definitions (Place standard handlers here) ---
    const handlePaste = (event: React.ClipboardEvent) => handleFilePasteEvent(event);
    const handleDragOver = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); };
    const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); handleFileDropEvent(event); };
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
            toast.success('Content sent to editor.');
            handleEditorChange(editor);
        } catch (error: any) { console.error('Send to editor error:', error); toast.error(`Send to editor error: ${error.message}`); }
    };
    const handleToggleChat = () => setIsChatCollapsed(!isChatCollapsed);
    // --- END Handler Definitions ---

    // --- Render Logic ---
    console.log('[Render Check] State before render:', {
        totalMessages: chatMessages.length,
        shouldShowLoadMore: false,
    });

    // Main Render
    return (
        <div className="flex flex-row w-full h-full bg-[--bg-color] overflow-hidden" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {isDragging && <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center z-50 pointer-events-none"><p className="text-blue-800 dark:text-blue-200 font-semibold text-lg p-4 bg-white/80 dark:bg-black/80 rounded-lg shadow-lg">Drop files to attach</p></div>}

            {/* Editor Pane Container - Takes remaining space, add padding here */}
            <div className="flex-1 flex flex-col relative overflow-hidden p-4">
                 {/* EditorTitleBar is now the first item, will benefit from parent padding */}
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
                    handleNewDocument={handleNewDocument}
                    handleSaveContent={handleSaveContent}
                    isSaving={isSaving}
                />
                {pageError && !pageError.startsWith("Chat Error:") && (
                    <div className="mt-4 p-2 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-700 dark:text-red-200 text-sm">Error: {pageError}</div>
                )}
                {/* EditorPaneWrapper now directly inside, remove intermediate div */}
                <div className="flex-1 flex flex-col overflow-hidden relative"> {/* REMOVED mt-4 */}
                    <EditorPaneWrapper
                        documentId={documentId}
                        initialContent={initialEditorContent}
                        editorRef={editorRef}
                        onEditorContentChange={handleEditorChange}
                        isChatCollapsed={isChatCollapsed}
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
                        formRef={formRef}
                        inputRef={inputRef}
                        fileInputRef={fileInputRef}
                        handleKeyDown={handleKeyDown}
                        isRecording={isRecording}
                        isTranscribing={isTranscribing}
                        micPermissionError={micPermissionError}
                        startRecording={startRecording}
                        stopRecording={stopRecording}
                        audioTimeDomainData={audioTimeDomainData}
                    />
                </div>
            </div>

            {/* Resize Handle - Rendered conditionally based on chat pane state */}
            {!isChatCollapsed && (
                 <div
                     ref={dragHandleRef}
                     onMouseDown={handleMouseDownResize}
                     className="w-2 h-full cursor-col-resize bg-transparent hover:bg-[--accent-color]/20 transition-colors z-20 flex-shrink-0 border-l border-[--border-color]"
                     style={{ flexBasis: '8px' }} // Ensure handle has base width
                 />
             )}

            {/* Chat Pane with Animation */}
            <AnimatePresence>
                {!isChatCollapsed && (
                    <motion.div
                        key="chat-pane" // Added key for AnimatePresence
                        initial={{ width: 0, opacity: 0 }}
                        animate={{
                            width: chatPaneWidth ? `${chatPaneWidth}px` : `${INITIAL_CHAT_PANE_WIDTH_PERCENT}%`,
                            opacity: 1
                        }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        style={{
                            flexShrink: 0, // Prevent shrinking during layout changes
                            // width is handled by animate
                            overflow: 'hidden', // Hide content during animation
                        }}
                        // Added flex flex-col and bg color directly here
                        className="h-full flex flex-col bg-[--bg-secondary] relative" // Added relative for potential internal absolute positioning
                        // No border needed here if handle has it
                    >
                        {/* Render ChatPaneWrapper inside the motion.div */}
                        <ChatPaneWrapper
                            isChatCollapsed={isChatCollapsed}
                            chatMessages={chatMessages}
                            isLoadingMessages={isLoadingMessages}
                            isChatLoading={isChatLoading}
                            handleSendToEditor={handleSendToEditor}
                            messagesEndRef={messagesEndRef}
                            messageLoadBatchSize={MESSAGE_LOAD_BATCH_SIZE}
                            input={input}
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
                            formRef={formRef}
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
                        />
                    </motion.div>
                )}
            </AnimatePresence>

             {/* Toggle Button - Positioned absolutely relative to the main container */}
             {/* Position depends on whether the handle exists */}
             <button
                 onClick={handleToggleChat} // Use dedicated handler
                 className={`absolute top-1/2 transform -translate-y-1/2 z-30 p-1.5 rounded-full bg-[--toggle-button-bg] border border-[--border-color] shadow-md text-[--text-color] hover:bg-[--hover-bg] transition-all duration-300 ease-in-out`}
                 style={{
                     right: isChatCollapsed
                         ? '-8px' // Position near the edge when collapsed
                         : chatPaneWidth
                           ? `${chatPaneWidth + 4}px` // Position just right of the handle/pane edge
                           : `${(INITIAL_CHAT_PANE_WIDTH_PERCENT / 100) * window.innerWidth + 4}px`, // Fallback position calculation
                     transform: 'translate(50%, -50%)' // Adjust horizontal position correctly
                 }}
                 aria-label={isChatCollapsed ? "Open chat pane" : "Close chat pane"}
             >
                 {isChatCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
             </button>
        </div>
    );
} 
