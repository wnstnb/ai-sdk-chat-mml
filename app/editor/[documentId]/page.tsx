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
import { useParams, useRouter } from 'next/navigation'; // Dynamic routing hooks
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

// Icons
import {
    AttachmentIcon,
    BotIcon,
    UserIcon,
    VercelIcon,
    SendIcon,
} from '@/components/icons';
import { ChevronLeft, ChevronRight, Wrench, SendToBack, Edit, Save, X } from 'lucide-react';
import {
    DocumentPlusIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

// Custom Components & Types
import { Markdown } from '@/components/markdown';
import { ModelSelector } from '@/components/ModelSelector';
import { TextFilePreview } from '@/components/editor/TextFilePreview'; // Import the extracted component
import { ChatInputUI } from '@/components/editor/ChatInputUI'; // Import the extracted component
// import { webSearch } from '@/lib/tools/exa-search'; // Not directly used client-side anymore
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

// Define the BlockNote schema
const schema = BlockNoteSchema.create();

// --- HELPER FUNCTIONS --- MOVED to lib/editorUtils.ts

// --- Main Editor Page Component ---
export default function EditorPage() {
    const params = useParams();
    const router = useRouter();
    const documentId = params.documentId as string;

    // --- State Variables ---
    const [model, setModel] = useState('gemini-2.0-flash'); // Default model
    const editorRef = useRef<BlockNoteEditor<typeof schema.blockSchema>>(null); // Specify schema type
    const [initialEditorContent, setInitialEditorContent] = useState<
        PartialBlock<typeof schema.blockSchema>[] | undefined 
    >(undefined); // For initializing editor
    const [documentData, setDocumentData] = useState<SupabaseDocument | null>(
        null
    ); // Store fetched document metadata
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [newTitleValue, setNewTitleValue] = useState('');
    const [processedToolCallIds, setProcessedToolCallIds] = useState<Set<string>>(
        new Set()
    );
    const [displayedMessagesCount, setDisplayedMessagesCount] = useState(
        INITIAL_MESSAGE_COUNT
    );
    const [includeEditorContent, setIncludeEditorContent] = useState(false);
    const [isChatCollapsed, setIsChatCollapsed] = useState(false);
    const [chatPaneWidth, setChatPaneWidth] = useState<number | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [files, setFiles] = useState<FileList | null>(null); // Files staged for chat upload
    const [isDragging, setIsDragging] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null); // Chat input textarea
    const fileInputRef = useRef<HTMLInputElement>(null); // Hidden file input
    const messagesEndRef = useRef<HTMLDivElement>(null); // Chat scroll anchor

    // Loading/Error States
    const [isLoadingDocument, setIsLoadingDocument] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [isSaving, setIsSaving] = useState(false); // Editor save button state
    const [error, setError] = useState<string | null>(null); // General page error
    const [initialResponseTriggered, setInitialResponseTriggered] = useState(false); // <-- ADDED

    // --- useChat Hook Integration ---
    const {
        messages: chatMessages, // Renamed to avoid conflict
        input,
        handleInputChange,
        handleSubmit: originalHandleSubmit, // Renamed to wrap it
        isLoading: isChatLoading, // Renamed for clarity
        reload,
        stop,
        setMessages: setChatMessages, // Needed to set initial messages
    } = useChat({
        api: '/api/chat', // API endpoint for chat interactions
        id: documentId, // Pass documentId for context (also sent in body)
        initialMessages: [], // Start empty, fetch initial messages separately
        onError: (err) => {
            const errorMsg = `Chat Error: ${err.message || 'Unknown error'}`;
            toast.error(errorMsg);
            setError(errorMsg); // Also set page-level error state if needed
        },
        // Body is handled dynamically in the wrapped handleSubmit
    });

    // --- Data Fetching ---

    // Fetch Document Details (Name, Initial Content)
    const fetchDocument = useCallback(async () => {
        if (!documentId) {
            setError("Document ID is missing.");
            setIsLoadingDocument(false);
            return;
        }
        console.log(`Fetching document: ${documentId}`);
        setIsLoadingDocument(true);
        setError(null);
        try {
            const response = await fetch(`/api/documents/${documentId}`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                throw new Error(
                    errData.error?.message || `Failed to fetch document (${response.status})`
                );
            }
            const { data }: { data: SupabaseDocument } = await response.json();
            if (!data) {
                throw new Error("Document not found or access denied.");
            }
            setDocumentData(data);

            // Initialize Editor Content - provide default block if empty/invalid
            const defaultInitialContent: PartialBlock[] = [{ type: 'paragraph', content: [] }];
            if (typeof data.content === 'object' && data.content !== null && Array.isArray(data.content)) {
                // Validate if content somewhat matches BlockNote structure (basic check)
                if (data.content.length === 0) {
                    console.log("Document content is empty array, initializing editor with default block.");
                    setInitialEditorContent(defaultInitialContent);
                } else if (data.content[0] && typeof data.content[0].type === 'string') {
                    setInitialEditorContent(data.content as PartialBlock[]); // Trust the fetched content
                    console.log("Initialized editor with fetched BlockNote content.");
                } else {
                     console.warn('Fetched content does not look like BlockNote structure. Initializing with default block.', data.content);
                     setInitialEditorContent(defaultInitialContent);
                }
            } else if (!data.content) {
                console.log("Document content is null/undefined, initializing editor with default block.");
                setInitialEditorContent(defaultInitialContent);
            } else {
                console.warn(
                    'Document content is not in expected BlockNote format. Initializing with default block.', data.content
                );
                setInitialEditorContent(defaultInitialContent);
            }

        } catch (err: any) {
            console.error('Error fetching document:', err);
            setError(`Failed to load document: ${err.message}`);
            setDocumentData(null); // Clear data on error
            // Set default content even on error to prevent editor crash
            setInitialEditorContent([{ type: 'paragraph', content: [] }]);
        } finally {
            setIsLoadingDocument(false);
        }
    }, [documentId]);

    // Fetch Initial Chat Messages for this Document
    const fetchChatMessages = useCallback(async () => {
        if (!documentId) {
            setIsLoadingMessages(false);
            return;
        }
        console.log(`Fetching messages for document: ${documentId}`);
        setIsLoadingMessages(true);
        // Don't clear page-level error here, let doc loading handle that
        try {
            const response = await fetch(`/api/documents/${documentId}/messages`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                throw new Error(
                    errData.error?.message || `Failed to fetch messages (${response.status})`
                );
            }
            const { data }: { data: MessageWithSignedUrl[] } = await response.json();

            // Map fetched messages to the format expected by useChat
            // Filter out 'tool' roles if they cause type errors with the current ai/react version/types
            const allowedRoles: Message['role'][] = ['user', 'assistant', 'system', 'data']; // Removed 'function'
            const formattedMessages: Message[] = data
                .filter(msg => allowedRoles.includes(msg.role as any)) // Filter out unsupported roles
                .map(msg => {
                    let displayContent = msg.content || '';
                    // Attempt to parse content if it's a JSON string
                    let isToolCallContent = false;
                    if (displayContent.startsWith('[') && displayContent.endsWith(']')) { // Basic check for JSON array
                        try {
                            const parsedContent = JSON.parse(displayContent);
                            // Check if it's specifically a tool call structure
                            if (Array.isArray(parsedContent) && parsedContent.length > 0 && parsedContent[0]?.type === 'tool-call') {
                                isToolCallContent = true;
                                console.log(`[fetchChatMessages] Identified tool call content for message ${msg.id}`);
                            // Check if it's the text content structure
                            } else if (Array.isArray(parsedContent) && parsedContent.length > 0 && parsedContent[0] && typeof parsedContent[0].text === 'string') {
                                displayContent = parsedContent[0].text; // Extract text content
                                console.log(`[fetchChatMessages] Extracted text content from JSON for message ${msg.id}`);
                            } else {
                                console.warn(`[fetchChatMessages] Parsed JSON content for message ${msg.id} is not a recognized tool call or text format:`, parsedContent);
                            }
                        } catch (parseError) {
                            // If parsing fails, log it but keep the original string content
                            console.warn(`[fetchChatMessages] Failed to parse potential JSON content for message ${msg.id}:`, parseError);
                        }
                    }

                    return {
                        id: msg.id,
                        role: msg.role as Message['role'], // Cast to Message['role'] after filtering
                        content: isToolCallContent ? '' : displayContent, // Use empty string for tool calls, otherwise use extracted/original
                        createdAt: new Date(msg.created_at),
                        // Map image URL to attachment structure for display
                        experimental_attachments: msg.signedDownloadUrl ? [{
                            name: msg.image_url?.split('/').pop() || `image_${msg.id}`,
                            contentType: 'image/*', // Best guess
                            url: msg.signedDownloadUrl,
                        }] : undefined,
                        // Add tool_calls if available and match the structure expected by ai/react Message type
                        // tool_calls: msg.tool_calls ? msg.tool_calls.map(tc => ({ id: tc.id, type: 'tool_call', function: { name: tc.tool_name, arguments: JSON.stringify(tc.tool_input) } })) : undefined,
                        // Tool invocations (for display) might need separate mapping if structure differs
                    };
                });

            console.log(`Fetched ${formattedMessages.length} messages.`);
            setChatMessages(formattedMessages);
            setDisplayedMessagesCount(Math.min(formattedMessages.length, INITIAL_MESSAGE_COUNT));

            // *** ADDED: Trigger initial AI response if only the first user message exists ***
            if (formattedMessages.length === 1 && formattedMessages[0].role === 'user') {
                 console.log("[fetchChatMessages] First message is from user and no response yet. Triggering initial AI response.");
                 // Call originalHandleSubmit to trigger the /api/chat call
                 // Pass undefined for the event, and provide the necessary data payload
                 originalHandleSubmit(undefined, {
                     data: {
                         model: model, // Use the current model state
                         documentId: documentId, // Use the current documentId
                         // No specific editor context needed for this initial auto-response
                     } as any // Cast as any to match useChat options type
                 });
            } else if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === 'user') {
                 console.log("[fetchChatMessages] Last message is from user, but other messages exist. Not triggering automatic response.");
            }

            // Log state immediately after setting
            console.log('[fetchChatMessages] State set:', {
                totalMessages: formattedMessages.length, // Use the variable available here
                initialDisplayCount: Math.min(formattedMessages.length, INITIAL_MESSAGE_COUNT)
            });

        } catch (err: any) {
            console.error('Error fetching messages:', err);
            setError(`Failed to load messages: ${err.message}`); // Set page error
            setChatMessages([]); // Clear messages on error
        } finally {
            setIsLoadingMessages(false);
            // Removed log from here
        }
    }, [documentId, setChatMessages, setDisplayedMessagesCount, model, originalHandleSubmit]);

    // Initial data fetch on component mount or when documentId changes
    useEffect(() => {
        if (documentId) {
            fetchDocument();
            fetchChatMessages();
        }
        setProcessedToolCallIds(new Set());
        // Don't reset displayedMessagesCount here, fetchChatMessages handles initial set
    }, [documentId]);

    // Effect to sync displayedMessagesCount with incoming messages up to the initial limit
    useEffect(() => {
        const newPotentialCount = Math.min(chatMessages.length, INITIAL_MESSAGE_COUNT);
        if (newPotentialCount > displayedMessagesCount) {
            setDisplayedMessagesCount(newPotentialCount);
        }
        // This effect ensures that as messages stream in or are added by useChat
        // after the initial fetch, the displayed count increases automatically
        // up to INITIAL_MESSAGE_COUNT. If the user has clicked "Load More"
        // and displayedMessagesCount > INITIAL_MESSAGE_COUNT, this effect won't
        // decrease it, allowing the manual loading to persist.
    }, [chatMessages.length]); // Depend only on the total message count

    // --- ADDED: Effect to trigger initial response ---
    useEffect(() => {
        // Only run if we haven't triggered it yet, messages have loaded,
        // there's exactly one message, and it's from the user.
        if (!initialResponseTriggered && !isLoadingMessages && chatMessages.length === 1 && chatMessages[0].role === 'user') {
            console.log("[Initial Response Effect] First user message loaded. Triggering initial AI response.");
            originalHandleSubmit(undefined, {
                data: {
                    model: model, // Use the current model state
                    documentId: documentId, // Use the current documentId
                    // No editor context needed for this initial auto-response
                } as any // Cast as any to match useChat options type
            });
            setInitialResponseTriggered(true); // Mark as triggered to prevent re-runs
        }
    }, [chatMessages, initialResponseTriggered, isLoadingMessages, originalHandleSubmit, model, documentId]);

    // ADDED: Effect to reset the trigger when the document ID changes
    useEffect(() => {
        console.log("[Document Change Effect] Resetting initial response trigger for new document.");
        setInitialResponseTriggered(false);
    }, [documentId]);
    // --- END ADDED Effects ---

    // --- Editor Interaction Logic ---

    // Function to get editor content as Markdown (for AI context)
    const getEditorMarkdownContent = async (): Promise<string | null> => {
        const editor = editorRef.current;
        if (!editor) {
            toast.error('Editor instance not available.');
            return null;
        }
        try {
            // Ensure document exists and has content before accessing
            if (editor.document.length === 0 || !editor.document[0]) {
                 console.log("Editor content is empty, returning empty string for markdown.");
                 return "";
            }
            // Check if the first block's content is array-like before calling helper
            const firstBlockContent = editor.document[0].content;
            if (editor.document.length === 1 && (!Array.isArray(firstBlockContent) || getInlineContentText(firstBlockContent).trim() === '')) {
                console.log("Editor content is empty or only contains whitespace, returning empty string for markdown.");
                return "";
            }
            // Proceed with markdown conversion if content looks valid
            const markdown = await editor.blocksToMarkdownLossy(editor.document);
            console.log('Retrieved editor content as Markdown:', markdown.slice(0, 100) + '...');
            return markdown;
        } catch (error) {
            console.error('Failed to get editor content as Markdown:', error);
            toast.error('Error retrieving editor content.');
            return null;
        }
    };

    // --- Tool Execution Logic ---
    // (Identical to the logic from the previous merged version)
    const executeAddContent = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to add content.'); return; }
        console.log('Executing addContent with args:', args);
        try {
            const { markdownContent, targetBlockId } = args;
            if (typeof markdownContent !== 'string') { toast.error("Invalid content provided for addContent."); return; }
            let blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(markdownContent);
            if (blocksToInsert.length === 0 && markdownContent.trim() !== '') {
                console.warn("Markdown parsing resulted in empty blocks, inserting as paragraph.");
                // Wrap string content in the expected InlineContent structure
                // Cast to PartialBlock to satisfy linter
                blocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: markdownContent, styles: {} }] } as PartialBlock<typeof schema.blockSchema>);
            } else if (blocksToInsert.length === 0) {
                toast.info('AI suggested adding content, but it was empty.'); return;
            }
            let referenceBlock: Block | PartialBlock | undefined | null = targetBlockId ? editor.getBlock(targetBlockId) : editor.getTextCursorPosition().block;
            let placement: 'before' | 'after' = 'after';
            if (!referenceBlock) {
                console.warn(`addContent: Could not find reference block ID ${targetBlockId} or no cursor. Inserting at end.`);
                referenceBlock = editor.document[editor.document.length - 1];
                placement = 'after';
                if (!referenceBlock) {
                    console.log(`Document empty, replacing content with ${blocksToInsert.length} blocks.`);
                    editor.replaceBlocks(editor.document, blocksToInsert);
                    toast.success("Content added from AI."); return;
                }
            }
            // Ensure referenceBlock and its ID exist before inserting
            if (referenceBlock && referenceBlock.id) {
                console.log(`Inserting ${blocksToInsert.length} blocks`, placement, referenceBlock.id);
                editor.insertBlocks(blocksToInsert, referenceBlock.id, placement);
                toast.success('Content added from AI.');
            } else {
                 console.warn(`Could not insert blocks: referenceBlock or referenceBlock.id is missing. Reference block:`, referenceBlock);
                 toast.error("Failed to insert content: could not find reference block.");
            }
        } catch (error: any) { console.error('Failed to execute addContent:', error); toast.error(`Error adding content: ${error.message}`); }
    };
    const executeModifyContent = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to modify content.'); return; }
        console.log('Executing modifyContent with args:', args);
        try {
            const { targetBlockId, targetText, newMarkdownContent } = args;
            if (!targetBlockId) { toast.error('Modification failed: Missing target block ID.'); return; }
            const targetBlock = editor.getBlock(targetBlockId);
            if (!targetBlock) { toast.error(`Modification failed: Block ID ${targetBlockId} not found.`); return; }
            if (targetText && typeof newMarkdownContent === 'string') {
                console.log(`Attempting to modify text "${targetText}" in block ${targetBlock.id}`);
                if (!targetBlock.content || !Array.isArray(targetBlock.content)) { toast.error(`Modification failed: Block ${targetBlock.id} has no modifiable content.`); return; }
                const updatedContent = replaceTextInInlineContent(targetBlock.content, targetText, newMarkdownContent);
                if (updatedContent) {
                    if (editor.getBlock(targetBlock.id)) { editor.updateBlock(targetBlock.id, { content: updatedContent }); toast.success(`Text "${targetText}" modified in block.`); }
                    else { toast.error(`Modification failed: Target block ${targetBlock.id} disappeared before update.`); }
                } else { toast.warning(`Could not find text "${targetText}" to modify in block ${targetBlock.id}.`); }
            } else if (typeof newMarkdownContent === 'string') {
                let blocksToReplaceWith: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(newMarkdownContent);
                if (blocksToReplaceWith.length === 0 && newMarkdownContent.trim() !== '') {
                     // Wrap string content in the expected InlineContent structure
                     // Cast to PartialBlock to satisfy linter
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
                        console.log(`Replacing ${blockIdsToReplace.length} related list items.`);
                    } else { blockIdsToReplace = [targetBlock.id]; }
                }
                console.log(`Attempting to replace block(s) [${blockIdsToReplace.join(', ')}] with ${blocksToReplaceWith.length} new blocks.`);
                const existingBlockIds = blockIdsToReplace.filter(id => editor.getBlock(id));
                if (existingBlockIds.length === 0) { toast.error("Modification failed: Target blocks disappeared before replacement."); return; }
                if (existingBlockIds.length !== blockIdsToReplace.length) { toast.warning("Some target blocks were missing, replacing the ones found."); }
                if (blocksToReplaceWith.length > 0) { editor.replaceBlocks(existingBlockIds, blocksToReplaceWith); toast.success('Block content modified by AI.'); }
                else { console.log("Replacement content is empty, deleting original blocks:", existingBlockIds); editor.removeBlocks(existingBlockIds); toast.success('Original block(s) removed as replacement was empty.'); }
            } else { toast.error("Invalid arguments for modifyContent: newMarkdownContent must be a string."); }
        } catch (error: any) { console.error('Failed to execute modifyContent:', error); toast.error(`Error modifying content: ${error.message}`); }
    };
    const executeDeleteContent = async (args: any) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to delete content.'); return; }
        console.log('Executing deleteContent with args:', args);
        try {
            const { targetBlockId, targetText } = args;
            if (!targetBlockId) { toast.error('Deletion failed: Missing target block ID(s).'); return; }
            const blockIdsToDelete = Array.isArray(targetBlockId) ? targetBlockId : [targetBlockId];
            if (targetText && blockIdsToDelete.length === 1) {
                const targetBlock = editor.getBlock(blockIdsToDelete[0]);
                if (!targetBlock) { toast.error(`Deletion failed: Block ID ${blockIdsToDelete[0]} not found.`); return; }
                console.log(`Attempting to delete text "${targetText}" in block ${targetBlock.id}`);
                if (!targetBlock.content || !Array.isArray(targetBlock.content)) { toast.error(`Deletion failed: Block ${targetBlock.id} has no deletable content.`); return; }
                const updatedContent = deleteTextInInlineContent(targetBlock.content, targetText);
                if (updatedContent !== null) {
                    if (editor.getBlock(targetBlock.id)) {
                        const newText = getInlineContentText(updatedContent);
                        if (!newText.trim()) { console.log(`Content empty after delete, removing block ${targetBlock.id}`); editor.removeBlocks([targetBlock.id]); toast.success(`Removed block ${targetBlock.id}.`); }
                        else { editor.updateBlock(targetBlock.id, { content: updatedContent }); toast.success(`Text "${targetText}" deleted.`); }
                    } else { toast.error(`Deletion failed: Target block ${targetBlock.id} disappeared.`); }
                } else { toast.warning(`Could not find text "${targetText}" to delete in block ${targetBlock.id}.`); }
            } else {
                if (targetText) { toast.warning("Cannot delete specific text across multiple blocks. Deleting blocks instead."); }
                const existingBlockIds = blockIdsToDelete.filter(id => editor.getBlock(id));
                if (existingBlockIds.length === 0) { toast.error("Deletion failed: Target blocks disappeared."); return; }
                if (existingBlockIds.length !== blockIdsToDelete.length) { toast.warning("Some target blocks were missing, removing the ones found."); }
                console.log(`Removing blocks: ${existingBlockIds.join(', ')}`);
                editor.removeBlocks(existingBlockIds);
                toast.success(`Removed ${existingBlockIds.length} block(s).`);
            }
        } catch (error: any) { console.error('Failed to execute deleteContent:', error); toast.error(`Error deleting content: ${error.message}`); }
    };


    // --- Chat Interaction Logic ---

    const handlePaste = (event: React.ClipboardEvent) => {
        const items = event.clipboardData?.items; if (!items) return;
        const clipboardFiles = Array.from(items).map(item => item.getAsFile()).filter((f): f is File => f !== null);
        if (clipboardFiles.length > 0) {
            const validFiles = clipboardFiles.filter(f => f.type.startsWith('image/') || f.type.startsWith('text/'));
            if (validFiles.length > 0) {
                const dataTransfer = new DataTransfer(); validFiles.forEach(f => dataTransfer.items.add(f));
                setFiles(dataTransfer.files); toast.info(`${validFiles.length} file(s) attached.`);
                if (validFiles.length < clipboardFiles.length) { toast.warning("Ignored non-image/text files."); }
            } else { toast.error('Only image/text files accepted.'); }
        }
    };
    const handleDragOver = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); };
    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); setIsDragging(false);
        const droppedFiles = event.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
            const validFiles = Array.from(droppedFiles).filter(f => f.type.startsWith('image/') || f.type.startsWith('text/'));
            if (validFiles.length > 0) {
                const dataTransfer = new DataTransfer(); validFiles.forEach(f => dataTransfer.items.add(f));
                setFiles(dataTransfer.files); toast.info(`${validFiles.length} file(s) attached.`);
                if (validFiles.length < droppedFiles.length) { toast.warning("Ignored non-image/text files."); }
            } else { toast.error('Only image/text files accepted.'); }
        }
    };
    const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);
    useEffect(() => { scrollToBottom(); }, [chatMessages, scrollToBottom]);
    const handleUploadClick = () => { fileInputRef.current?.click(); };
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const validFiles = Array.from(event.target.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('text/'));
            if (validFiles.length > 0) {
                const dataTransfer = new DataTransfer(); validFiles.forEach(f => dataTransfer.items.add(f)); setFiles(dataTransfer.files);
                if (validFiles.length < event.target.files.length) { toast.warning("Ignored non-image/text files."); }
            } else { toast.error("No valid image/text files selected."); setFiles(null); }
        } else { setFiles(null); }
        if (event.target) event.target.value = ''; // Reset input
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey && !isChatLoading) { event.preventDefault(); formRef.current?.requestSubmit(); }
    };

    // Wrapped handleSubmit for useChat
    const handleSubmitWithContext = async (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) event.preventDefault();
        if (!documentId) { toast.error("Cannot send message: Document context missing."); return; }
        const currentFiles = files; const currentInput = input; const currentModel = model;
        // Lock loading state immediately
        const isSubmitting = isChatLoading || (!currentInput.trim() && (!currentFiles || currentFiles.length === 0));
        if (isSubmitting) return;

        // Clear input immediately for optimistic UI update (useChat handles this via originalHandleSubmit?)
        // handleInputChange({ target: { value: '' } } as any); // Clear input manually if needed


        setFiles(null); if (fileInputRef.current) fileInputRef.current.value = ''; // Clear staged files UI

        let editorContextData = {}; const editor = editorRef.current;
        if (includeEditorContent && editor) { /* Add full markdown */
            const markdownContent = await getEditorMarkdownContent();
            if (markdownContent !== null) { editorContextData = { editorMarkdownContent: markdownContent }; }
            setIncludeEditorContent(false);
        } else if (editor) { /* Add snippets */
            try {
                const currentBlocks = editor.document;
                if (currentBlocks?.length > 0) {
                    // Ensure content is InlineContent[] before passing to getInlineContentText
                    editorContextData = { editorBlocksContext: currentBlocks.map(b => ({ id: b.id, contentSnippet: (Array.isArray(b.content) ? getInlineContentText(b.content).slice(0, 100) : '') || `[${b.type}]` })) };
                }
            } catch (e) { console.error('Failed to get editor snippets:', e); toast.error('⚠️ Error getting editor context.'); }
        }

        let uploadedFilePaths: { name: string; path: string; contentType: string }[] = [];
        let firstImagePath: string | undefined = undefined; // Store path for message saving

        if (currentFiles && currentFiles.length > 0) { /* Upload files */
            toast.info(`Uploading ${currentFiles.length} file(s)...`);
            const uploadPromises = Array.from(currentFiles).map(async f => {
                try {
                    // 1. Get Signed URL
                    const signedUrlRes = await fetch('/api/storage/signed-url/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: f.name, contentType: f.type, documentId }) });
                    if (!signedUrlRes.ok) { const err = await signedUrlRes.json().catch(() => ({})); throw new Error(err.error?.message || `Upload URL error for ${f.name}`); }
                    const { data: urlData } = await signedUrlRes.json(); // Gets { signedUrl, path }

                    // 2. Upload File using Signed URL
                    const uploadRes = await fetch(urlData.signedUrl, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f });
                    if (!uploadRes.ok) { throw new Error(`Upload failed for ${f.name}`); }

                    // 3. Collect path for successful uploads
                    return { name: f.name, path: urlData.path, contentType: f.type };
                } catch (err: any) { console.error(`Upload error (${f.name}):`, err); toast.error(`Failed to upload ${f.name}`); return null; }
            });
            uploadedFilePaths = (await Promise.all(uploadPromises)).filter((r): r is { name: string; path: string; contentType: string } => r !== null);

            if (uploadedFilePaths.length !== currentFiles.length) { toast.warning("Some files failed upload."); }
            else if (uploadedFilePaths.length > 0) { toast.success(`${uploadedFilePaths.length} file(s) uploaded.`); }

            // Store the path of the first successfully uploaded image for the message DB entry
            firstImagePath = uploadedFilePaths.length > 0 ? uploadedFilePaths[0].path : undefined;
        }

        // --- Save the user message to the database FIRST ---
        try {
            console.log(`Saving user message to DB: content='${currentInput.slice(0,30)}...', imagePath='${firstImagePath}'`);
            const saveMessageResponse = await fetch(`/api/documents/${documentId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'user', // Hardcode role for user message
                    content: currentInput.trim() || null, // Send null if only image
                    imageUrlPath: firstImagePath // Send path if available
                }),
            });

            if (!saveMessageResponse.ok) {
                const errorData = await saveMessageResponse.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `Failed to save message (${saveMessageResponse.status})`);
            }
            const { data: savedMessage } = await saveMessageResponse.json();
            console.log('User message saved to DB:', savedMessage);
            // Optional: Could use savedMessage.id for better optimistic updates later if needed

            // --- Now, trigger the AI interaction using useChat's handler ---
            const submitOptions = {
                 // Provide necessary context for the AI.
                 // We no longer need imageUrlPath here, as the AI can retrieve it via GET messages if needed.
                 // Send the user's text input as the primary content for the AI turn.
                data: {
                    model: currentModel,
                    documentId,
                    ...editorContextData, // Editor context (snippets or full markdown)
                },
                 // For optimistic UI: useChat needs the user's input and potentially file previews.
                 // Pass the original File objects if they existed.
                options: { experimental_attachments: currentFiles ? Array.from(currentFiles) : undefined }
            };

            // Pass the event and options to the original useChat handler
            originalHandleSubmit(event, { ...submitOptions, data: submitOptions.data as any });

        } catch (saveError: any) {
             console.error("Error saving user message:", saveError);
             toast.error(`Failed to send message: ${saveError.message}`);
             // Don't proceed to call originalHandleSubmit if saving failed? Or allow AI call anyway?
             // For now, stopping here on save failure.
             // Need to potentially reset loading states if isChatLoading was tied to useChat hook only.
        }

        requestAnimationFrame(() => { if (inputRef.current) inputRef.current.style.height = 'auto'; }); // Reset input height after clear
    };

    // --- Side Effects ---

    // Process tool calls from messages
    useEffect(() => {
        const lastMessage = chatMessages[chatMessages.length - 1];
        console.log('[Tool Processing Effect Triggered] Last message:', lastMessage); // Log when effect runs

        if (lastMessage?.role === 'assistant' && lastMessage.toolInvocations) {
            console.log(`[Tool Processing Effect] Found ${lastMessage.toolInvocations.length} tool invocations in last message ID: ${lastMessage.id}. Current processed IDs:`, processedToolCallIds); // Log tool invocations found

            const callsToProcess = lastMessage.toolInvocations.filter(tc => {
                const alreadyProcessed = processedToolCallIds.has(tc.toolCallId);
                console.log(`[Tool Processing Effect] Checking Tool Call ID: ${tc.toolCallId}. Already processed: ${alreadyProcessed}`); // Log check for each tool call
                return !alreadyProcessed;
            });

            if (callsToProcess.length > 0) {
                console.log(`[Tool Processing Effect] Processing ${callsToProcess.length} new tool calls.`); // Log number of new calls to process
                const newProcessedIds = new Set(processedToolCallIds);
                callsToProcess.forEach(toolCall => {
                    newProcessedIds.add(toolCall.toolCallId); // Mark processed now
                    const { toolName, args } = toolCall;
                    console.log(`[Tool Call Received] ID: ${toolCall.toolCallId}, Name: ${toolName}`);
                    try {
                        let executed = false;
                        switch (toolName) {
                            case 'addContent': executeAddContent(args); executed = true; break;
                            case 'modifyContent': executeModifyContent(args); executed = true; break;
                            case 'deleteContent': executeDeleteContent(args); executed = true; break;
                            case 'request_editor_content': setIncludeEditorContent(true); toast.info('AI context requested.'); executed = true; break;
                            default: console.error(`Unknown tool: ${toolName}`); toast.error(`Unknown tool: ${toolName}`);
                        }
                        if (executed) console.log(`[Tool Call Processed] ${toolName}`);
                        else console.warn(`[Tool Call Unhandled] ${toolName}`);
                    } catch (toolError: any) { console.error(`Tool ${toolName} error:`, toolError); toast.error(`Tool error: ${toolError.message}`); }
                });
                setProcessedToolCallIds(newProcessedIds);
            }
        }
    }, [chatMessages, processedToolCallIds]); // Rerun when messages or processed IDs change


    // Resizable Pane Logic
    useEffect(() => {
        const calculateWidth = () => {
            if (!isChatCollapsed) { // Only calculate if pane is visible
                 const windowWidth = window.innerWidth;
                 const initialWidth = Math.max(MIN_CHAT_PANE_WIDTH_PX, (windowWidth * INITIAL_CHAT_PANE_WIDTH_PERCENT) / 100);
                 const potentialMaxWidth = (windowWidth * MAX_CHAT_PANE_WIDTH_PERCENT) / 100;
                 const effectiveMaxWidth = Math.max(potentialMaxWidth, MIN_CHAT_PANE_WIDTH_PX);
                 if (!isResizing) {
                     if (chatPaneWidth === null || chatPaneWidth > effectiveMaxWidth || chatPaneWidth < MIN_CHAT_PANE_WIDTH_PX) {
                         const newWidth = Math.max(MIN_CHAT_PANE_WIDTH_PX, Math.min(initialWidth, effectiveMaxWidth));
                         setChatPaneWidth(newWidth);
                     }
                 }
             }
        };
        calculateWidth(); // Initial calculation
        window.addEventListener('resize', calculateWidth);
        return () => window.removeEventListener('resize', calculateWidth);
    }, [isResizing, chatPaneWidth, isChatCollapsed]); // Recalc on resize, or when pane collapses/expands

    const dragHandleRef = useRef<HTMLDivElement>(null);
    const startWidthRef = useRef<number>(0);
    const startXRef = useRef<number>(0);
    const handleMouseMoveResize = useCallback((me: MouseEvent) => { // Define as useCallback
        requestAnimationFrame(() => {
            const currentX = me.clientX;
            const deltaX = currentX - startXRef.current;
            const newWidth = startWidthRef.current - deltaX;
            const windowWidth = window.innerWidth;
            const maxWidth = Math.max(MIN_CHAT_PANE_WIDTH_PX, (windowWidth * MAX_CHAT_PANE_WIDTH_PERCENT) / 100);
            const clampedWidth = Math.max(MIN_CHAT_PANE_WIDTH_PX, Math.min(newWidth, maxWidth));
            setChatPaneWidth(clampedWidth);
        });
    }, []); // No dependencies needed as it uses refs

    const handleMouseUpResize = useCallback(() => { // Define as useCallback
        setIsResizing(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMoveResize);
        window.removeEventListener('mouseup', handleMouseUpResize); // Remove self
         console.log("Mouse Up - Resizing stopped");
    }, [handleMouseMoveResize]); // Depends on the memoized mousemove handler

    const handleMouseDownResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!chatPaneWidth) return;
        console.log("Mouse Down - Resizing started");
        setIsResizing(true);
        startXRef.current = e.clientX;
        startWidthRef.current = chatPaneWidth;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', handleMouseMoveResize);
        window.addEventListener('mouseup', handleMouseUpResize);
    }, [chatPaneWidth, handleMouseMoveResize, handleMouseUpResize]); // Dependencies

    // Cleanup resize listeners on unmount
    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', handleMouseMoveResize);
            window.removeEventListener('mouseup', handleMouseUpResize);
             if (document.body.style.cursor === 'col-resize') { // Restore cursor if unmounted mid-drag
                 document.body.style.userSelect = '';
                 document.body.style.cursor = '';
             }
        };
    }, [handleMouseMoveResize, handleMouseUpResize]);


    // Send message content to editor
    const handleSendToEditor = async (content: string) => {
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available.'); return; }
        if (!content || content.trim() === '') { toast.info('Cannot send empty content to editor.'); return; }
        try {
            let blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(content);
             if (blocksToInsert.length === 0 && content.trim() !== '') {
                 // Wrap string content in the expected InlineContent structure
                 // Cast to PartialBlock to satisfy linter
                 blocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: content, styles: {} }] } as PartialBlock<typeof schema.blockSchema>);
             }
            else if (blocksToInsert.length === 0) { toast.info("Content was empty after parsing."); return; }

            const { block: currentBlock } = editor.getTextCursorPosition();
            let referenceBlockId: string | undefined = currentBlock?.id;
            if (!referenceBlockId) { referenceBlockId = editor.document[editor.document.length - 1]?.id; }

            if (referenceBlockId) { editor.insertBlocks(blocksToInsert, referenceBlockId, 'after'); }
            else { editor.replaceBlocks(editor.document, blocksToInsert); } // Handle empty doc
            toast.success('Content sent to editor.');
        } catch (error: any) { console.error('Send to editor error:', error); toast.error(`Send to editor error: ${error.message}`); }
    };

    // Manual Save Handler
    const handleSaveContent = useCallback(async () => {
        const editor = editorRef.current;
        if (!documentId) { toast.error("Cannot save: Document ID missing."); return; }
        if (!editor?.document) { console.warn('Save aborted: Editor content ref not available.'); return; }
        if (isSaving) return;

        setIsSaving(true); setError(null);
        console.log("Saving document content...");
        try {
            const currentEditorContent = editor.document; // Get content at time of save
            const response = await fetch(`/api/documents/${documentId}/content`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: currentEditorContent }),
            });
            if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error?.message || `Save failed (${response.status})`); }
            toast.success('Document saved!');
            const { data } = await response.json();
            if (documentData && data.updated_at) { setDocumentData({ ...documentData, updated_at: data.updated_at }); }
        } catch (err: any) { console.error("Save error:", err); setError(`Save failed: ${err.message}`); toast.error(`Save failed: ${err.message}`); }
        finally { setIsSaving(false); }
    }, [documentId, isSaving, documentData]);

    // Navigation Handlers
    const handleNewDocument = () => { console.log("Navigating to /launch"); router.push('/launch'); };

    // --- Title Editing Handlers ---
    const handleEditTitleClick = () => {
        if (!documentData) return;
        setNewTitleValue(documentData.name);
        setIsEditingTitle(true);
    };

    const handleCancelEditTitle = () => {
        setIsEditingTitle(false);
        setNewTitleValue(''); // Clear temporary value
    };

    const handleSaveTitle = async () => {
        if (!documentData || !newTitleValue.trim() || newTitleValue.trim() === documentData.name) {
            // If name is empty or unchanged, just cancel edit mode
            if (!newTitleValue.trim()) {
                toast.error("Document name cannot be empty.");
            }
            handleCancelEditTitle();
            return;
        }

        const originalTitle = documentData.name;
        const optimisticNewTitle = newTitleValue.trim();

        // Optimistic UI update
        setDocumentData(prevData => prevData ? { ...prevData, name: optimisticNewTitle } : null);
        setIsEditingTitle(false);

        try {
            const response = await fetch(`/api/documents/${documentId}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: optimisticNewTitle }), // Send only the name
                }
            );

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
                throw new Error(errData.error?.message || `Failed to rename document (${response.status})`);
            }

            const { data: updatedDoc } = await response.json();
            // Update timestamp from response if needed, though name change might not update it server-side unless explicit
            setDocumentData(prevData => prevData ? { ...prevData, updated_at: updatedDoc.updated_at || prevData.updated_at } : null);
            toast.success('Document renamed successfully!');

        } catch (err: any) {
            console.error('Error saving title:', err);
            toast.error(`Failed to rename: ${err.message}`);
            // Rollback optimistic update
            setDocumentData(prevData => prevData ? { ...prevData, name: originalTitle } : null);
            // Optionally re-enter edit mode?
            // setIsEditingTitle(true);
        }
    };

    // Add handler for Enter key in title input
    const handleTitleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            handleSaveTitle();
        } else if (event.key === 'Escape') {
            handleCancelEditTitle();
        }
    };
    // --- END Added Title Editing Handlers ---

    // --- Render Logic ---

    // Add log before returning JSX
    console.log('[Render Check] State before render:', {
        totalMessages: chatMessages.length,
        displayedCount: displayedMessagesCount,
        shouldShowLoadMore: chatMessages.length > displayedMessagesCount,
    });

    // Combined Loading State
    if (isLoadingDocument) {
        return <div className="flex justify-center items-center h-screen bg-[--bg-color] text-[--text-color]">Loading document...</div>;
    }

    // Error state if document fetch failed
    if (!documentData) {
        return (
            <div className="flex flex-col justify-center items-center h-screen text-center p-4 bg-[--bg-color]">
                <p className="text-red-500 text-xl mb-2">Error Loading Document</p>
                <p className="text-[--muted-text-color] mb-4">{error || 'Document not found or access denied.'}</p>
             <button onClick={() => router.push('/launch')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Go to Launch Pad</button>
            </div>
        );
    }

    // Main Render
    return (
        <div className="flex flex-row w-full h-full bg-[--bg-color] overflow-hidden" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {isDragging && <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center z-50 pointer-events-none"><p className="text-blue-800 dark:text-blue-200 font-semibold text-lg p-4 bg-white/80 dark:bg-black/80 rounded-lg shadow-lg">Drop files to attach</p></div>}

            {/* Editor Pane */}
            <div className="flex-1 flex flex-col p-4 border-r border-[--border-color] relative overflow-hidden">
                {/* Title Bar */}
                <div className="flex justify-between items-center mb-2 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                        {isEditingTitle ? (
                            <>
                                <input
                                    type="text"
                                    value={newTitleValue}
                                    onChange={(e) => setNewTitleValue(e.target.value)}
                                    onKeyDown={handleTitleInputKeyDown}
                                    className="flex-grow px-2 py-1 border border-[--border-color] rounded bg-[--input-bg] text-[--text-color] focus:outline-none focus:ring-1 focus:ring-[--primary-color] text-lg font-semibold"
                                    autoFocus
                                />
                                <button onClick={handleSaveTitle} className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900 rounded" title="Save Title"><Save size={18} /></button>
                                <button onClick={handleCancelEditTitle} className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded" title="Cancel"><X size={18} /></button>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-[--text-color] truncate" title={documentData.name}>{documentData.name}</h2>
                                <button onClick={handleEditTitleClick} className="p-1 text-[--muted-text-color] hover:text-[--text-color] hover:bg-[--hover-bg] rounded flex-shrink-0" title="Rename Document"><Edit size={16} /></button>
                            </>
                        )}
                    </div>
                    <div className="flex items-center space-x-2">
                        <button onClick={handleNewDocument} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded" title="New/Open (Launch Pad)"><DocumentPlusIcon className="h-5 w-5" /></button>
                        <button onClick={handleSaveContent} disabled={isSaving} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Save Document">
                            {isSaving ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ArrowDownTrayIcon className="h-5 w-5" />}
                        </button>
                    </div>
                </div>
                {/* Page Errors */}
                {error && !error.startsWith("Chat Error:") && <div className="mb-2 p-2 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-700 dark:text-red-200 text-sm">Error: {error}</div>}
                {/* Editor */}
                <div className="flex-1 flex flex-col relative border rounded-lg bg-[--editor-bg] border-[--border-color] shadow-sm overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 styled-scrollbar">
                        {initialEditorContent !== undefined ? (
                            <BlockNoteEditorComponent key={documentId} editorRef={editorRef} initialContent={initialEditorContent} />
                        ) : (
                            <p className="p-4 text-center text-[--muted-text-color]">Initializing editor...</p>
                         )}
                    </div>
                    {/* Collapsed Chat Input */}
                    {isChatCollapsed && <div className="p-4 pt-2 border-t border-[--border-color] z-10 bg-[--editor-bg] flex-shrink-0">
                        <form ref={formRef} onSubmit={handleSubmitWithContext} className="w-full flex flex-col items-center">
                            <ChatInputUI files={files} fileInputRef={fileInputRef} handleFileChange={handleFileChange} inputRef={inputRef} input={input} handleInputChange={handleInputChange} handleKeyDown={handleKeyDown} handlePaste={handlePaste} model={model} setModel={setModel} handleUploadClick={handleUploadClick} isLoading={isChatLoading} />
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
                        {/* Initial Loading */}
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
                            <ChatInputUI files={files} fileInputRef={fileInputRef} handleFileChange={handleFileChange} inputRef={inputRef} input={input} handleInputChange={handleInputChange} handleKeyDown={handleKeyDown} handlePaste={handlePaste} model={model} setModel={setModel} handleUploadClick={handleUploadClick} isLoading={isChatLoading} />
                        </form>
                    </div>
                }
            </motion.div>
        </div>
    );
} 
