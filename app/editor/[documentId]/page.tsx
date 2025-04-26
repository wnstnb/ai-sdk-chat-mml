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
    const searchParams = useSearchParams();
    // Use assertion or check, assertion is simpler if we expect it to always exist here
    const documentId = params?.documentId as string; 
    // NEW: Pathname for navigation handling (Step 8)
    const pathname = usePathname();

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
    const [files, setFiles] = useState<FileList | null>(null); // Files staged for chat upload PREVIEW
    const [isDragging, setIsDragging] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null); // Chat input textarea
    const fileInputRef = useRef<HTMLInputElement>(null); // Hidden file input
    const messagesEndRef = useRef<HTMLDivElement>(null); // Chat scroll anchor

    // --- NEW: Infer Title State ---
    const [isInferringTitle, setIsInferringTitle] = useState(false);

    // --- NEW: Upload State ---
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
    // --- END NEW ---

    // --- NEW: State for pending initial submission ---
    const [pendingInitialSubmission, setPendingInitialSubmission] = useState<string | null>(null);

    // Loading/Error States
    const [isLoadingDocument, setIsLoadingDocument] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [isSaving, setIsSaving] = useState(false); // Editor save button state
    const [error, setError] = useState<string | null>(null); // General page error

    // --- NEW: Autosave State & Refs (Step 2) ---
    const [autosaveTimerId, setAutosaveTimerId] = useState<NodeJS.Timeout | null>(null);
    const [revertStatusTimerId, setRevertStatusTimerId] = useState<NodeJS.Timeout | null>(null); // For reverting 'saved' -> 'idle' (Step 9)
    const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle');
    const latestEditorContentRef = useRef<string | null>(null); // JSON stringified content
    const latestEditorBlocksRef = useRef<BlockNoteEditorType['document'] | null>(null); // Blocks for direct use
    const isContentLoadedRef = useRef<boolean>(false); // To prevent save on initial load
    const previousPathnameRef = useRef(pathname); // For navigation detection (Step 8)

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
        setInput, // <-- ADDED: Need setInput to populate from query param
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

    // --- Zustand Follow Up Store ---
    const followUpContext = useFollowUpStore((state) => state.followUpContext);
    const setFollowUpContext = useFollowUpStore((state) => state.setFollowUpContext);

    // --- DEBUG: Log followUpContext changes ---
    useEffect(() => {
        console.log("[EditorPage] followUpContext state updated:", followUpContext);
    }, [followUpContext]);
    // --- END DEBUG ---

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
    }, [documentId, setChatMessages, setDisplayedMessagesCount]); // Removed model, originalHandleSubmit

    // Initial data fetch on component mount or when documentId changes
    useEffect(() => {
        if (documentId) {
            fetchDocument();
            fetchChatMessages();
        }
        setProcessedToolCallIds(new Set());
        // Don't reset displayedMessagesCount here, fetchChatMessages handles initial set
    }, [documentId, fetchDocument, fetchChatMessages]); // Added fetchDocument, fetchChatMessages

    // --- NEW: Effect to read initial message from query parameter ---
    const routerForReplace = useRouter(); // Get router instance for replace
    useEffect(() => {
        const initialMsg = searchParams?.get('initialMsg'); // Add optional chaining
        if (initialMsg) {
            const decodedMsg = decodeURIComponent(initialMsg);
            console.log("[EditorPage Mount] Found initialMsg query param:", decodedMsg);
            setInput(decodedMsg); // Update chat input state
            setPendingInitialSubmission(decodedMsg); // Set pending submission trigger

            // Clean the URL by removing the query parameter
            // Use router.replace to avoid adding a new entry to history
            const currentPath = window.location.pathname; // Get current path without query
            routerForReplace.replace(currentPath, { scroll: false }); // scroll: false prevents jumping
        }
    // Run only once when the component mounts or documentId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps 
    }, [documentId]);

    // --- NEW: Effect to trigger submission once input state matches pending message ---
    useEffect(() => {
        // Only proceed if there's a message pending submission and it matches the current input
        if (pendingInitialSubmission && input === pendingInitialSubmission) {
            console.log("[EditorPage Submit Effect] Input matches pending submission. Triggering submit:", input);

            // Call the original useChat submit handler
            originalHandleSubmit(undefined, {
                data: {
                    model: model, // Use the current model state
                    documentId: documentId, // Use the current documentId
                    // Pass the input content explicitly in case useChat internal state is lagging?
                    // Let's try without first, relying on the check `input === pendingInitialSubmission`
                } as any // Cast as any to match useChat options type
            });

            // Clear the pending state ONLY after attempting submission
            // to prevent re-submission if the component re-renders before submit completes
            setPendingInitialSubmission(null);
        }
    // Dependencies: Run when input or pendingInitialSubmission changes
    // Also include other values used inside (originalHandleSubmit, model, documentId) as per exhaustive-deps rule
    // eslint-disable-next-line react-hooks/exhaustive-deps 
    }, [input, pendingInitialSubmission, originalHandleSubmit, model, documentId]);

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
    }, [chatMessages.length, displayedMessagesCount]); // Added displayedMessagesCount

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

    // --- NEW: Upload Function --- 
    const handleStartUpload = useCallback(async (file: File) => {
        if (!documentId) {
            toast.error("Cannot upload: Document context missing.");
            return;
        }
        if (isUploading) { // Prevent concurrent uploads from UI for simplicity
            toast.info("Please wait for the current upload to finish.");
            return;
        }

        setIsUploading(true);
        setUploadError(null);
        setUploadedImagePath(null); // Reset previous path if a new upload starts
        toast.info(`Uploading ${file.name}...`);

        try {
            // 1. Get Signed URL
            const signedUrlRes = await fetch('/api/storage/signed-url/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, contentType: file.type, documentId })
            });
            if (!signedUrlRes.ok) {
                const err = await signedUrlRes.json().catch(() => ({}));
                throw new Error(err.error?.message || `Upload URL error for ${file.name} (${signedUrlRes.status})`);
            }
            const { data: urlData } = await signedUrlRes.json(); // Gets { signedUrl, path }

            // 2. Upload File using Signed URL
            const uploadRes = await fetch(urlData.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });
            if (!uploadRes.ok) {
                // Attempt to get error details from storage response if possible
                const storageErrorText = await uploadRes.text();
                console.error("Storage Upload Error Text:", storageErrorText); 
                throw new Error(`Upload failed for ${file.name} (${uploadRes.status})`);
            }

            // 3. Success
            setUploadedImagePath(urlData.path);
            toast.success(`${file.name} uploaded successfully!`);

        } catch (err: any) {
            console.error(`Upload error (${file.name}):`, err);
            const errorMsg = `Failed to upload ${file.name}: ${err.message}`;
            setUploadError(errorMsg);
            toast.error(errorMsg);
            setFiles(null); // Clear preview on error
            setUploadedImagePath(null);
        } finally {
            setIsUploading(false);
        }
    }, [documentId, isUploading]); // Include isUploading to prevent overlap
    // --- END NEW --- 

    const handlePaste = (event: React.ClipboardEvent) => {
        const items = event.clipboardData?.items; if (!items) return;
        const clipboardFiles = Array.from(items).map(item => item.getAsFile()).filter((f): f is File => f !== null);
        if (clipboardFiles.length > 0) {
            const imageFiles = clipboardFiles.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                const firstImage = imageFiles[0]; // Handle one file at a time for simplicity now
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(firstImage);
                setFiles(dataTransfer.files); // Set for preview
                setUploadError(null); // Clear previous errors
                setUploadedImagePath(null); // Clear previous path
                handleStartUpload(firstImage); // Start upload immediately
            } else if (clipboardFiles.some(f => f.type.startsWith('text/'))) {
                console.log("Pasted content includes non-image files, allowing default paste behavior.");
            } else if (clipboardFiles.length > 0) {
                toast.error('Only image files can be pasted as attachments.');
            }
        }
    };
    const handleDragOver = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); };
    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); setIsDragging(false);
        const droppedFiles = event.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
            const imageFiles = Array.from(droppedFiles).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                const firstImage = imageFiles[0]; // Handle one file at a time
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(firstImage);
                setFiles(dataTransfer.files); // Set for preview
                setUploadError(null); // Clear previous errors
                setUploadedImagePath(null); // Clear previous path
                handleStartUpload(firstImage); // Start upload immediately
                if (imageFiles.length > 1) { toast.info("Attached the first image. Multiple file uploads coming soon!"); }
            } else { toast.error('Only image files accepted via drop.'); }
        }
    };
    const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);
    useEffect(() => { scrollToBottom(); }, [chatMessages, scrollToBottom]);
    const handleUploadClick = () => { 
        if (isUploading) { toast.info("Please wait for the current upload to finish."); return; } 
        fileInputRef.current?.click(); 
    };
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const imageFiles = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                const firstImage = imageFiles[0]; // Handle one file at a time
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(firstImage);
                setFiles(dataTransfer.files); // Set for preview
                setUploadError(null); // Clear previous errors
                setUploadedImagePath(null); // Clear previous path
                handleStartUpload(firstImage); // Start upload immediately
                if (imageFiles.length > 1) { toast.info("Selected the first image. Multiple file uploads coming soon!"); }
            } else { toast.error("No valid image files selected."); setFiles(null); }
        } else { setFiles(null); }
        if (event.target) event.target.value = ''; // Reset input
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        // Submit on Enter unless Shift is pressed OR upload is in progress
        if (event.key === 'Enter' && !event.shiftKey && !isChatLoading && !isUploading) { 
            event.preventDefault(); 
            // Check if there is content to submit (text or uploaded image)
            if (input.trim() || uploadedImagePath) {
                formRef.current?.requestSubmit(); 
            } else {
                toast.info("Please type a message or attach an image.");
            }
        }
    };

    // Wrapped handleSubmit for useChat - REVISED
    const handleSubmitWithContext = async (event?: React.FormEvent<HTMLFormElement>) => {
        if (event) event.preventDefault();
        if (!documentId) { toast.error("Cannot send message: Document context missing."); return; }
        
        // Combine follow-up context with current input
        const contextPrefix = followUpContext ? `${followUpContext}\n\n---\n\n` : '';
        const currentInput = contextPrefix + input;
        const currentModel = model;
        const imagePathToSend = uploadedImagePath;

        // Submission Guard: Check if loading, uploading, or no content (text or image)
        // Adjusted check to account for potentially only having followUpContext
        if (isChatLoading || isUploading || (!input.trim() && !imagePathToSend && !followUpContext)) {
            console.log('Submission prevented:', { isChatLoading, isUploading, currentInput: input, imagePathToSend, followUpContext });
            return; 
        }

        let editorContextData = {}; 
        const editor = editorRef.current;
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

        // --- NEW: Detect Summarization Task ---
        // Basic check: look for keywords related to summarizing outlines/points
        const isSummarizationTask = /\b(summar(y|ize|ies)|bullet|points?|outline|sources?|citations?)\b/i.test(currentInput) && currentInput.length > 25; // Require some length to avoid triggering on short phrases
        if (isSummarizationTask) {
            console.log("[handleSubmitWithContext] Summarization task detected based on input:", currentInput.slice(0, 50) + "...");
        }
        // --- END NEW ---

        // --- Save the user message to the database FIRST ---
        try {
            console.log(`Saving user message to DB: content='${currentInput.slice(0,30)}...', imagePath='${imagePathToSend}'`);
            const saveMessageResponse = await fetch(`/api/documents/${documentId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'user', 
                    content: currentInput.trim() || null, 
                    imageUrlPath: imagePathToSend // Send the path from state
                }),
            });

            if (!saveMessageResponse.ok) {
                const errorData = await saveMessageResponse.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `Failed to save message (${saveMessageResponse.status})`);
            }
            const { data: savedMessage } = await saveMessageResponse.json();
            console.log('User message saved to DB:', savedMessage);

            // --- Now, trigger the AI interaction using useChat's handler ---
            const submitOptions = {
                data: {
                    model: currentModel,
                    documentId,
                    ...editorContextData, 
                    firstImagePath: imagePathToSend, // Pass the path from state
                    // --- MODIFIED: Add taskHint conditionally ---
                    taskHint: isSummarizationTask ? 'summarize_and_cite_outline' : undefined,
                    // --- END MODIFIED ---
                },
                 // Optimistic UI: Pass the text input. Attachment preview is handled separately.
                 // We pass the FileList here for the useChat hook to potentially use internally for optimistic updates
                 // even though the actual upload is done. This mirrors the previous behaviour.
                 // If this causes issues, we might remove it or pass undefined.
                 // If this causes issues, we might remove it or pass undefined.
                 options: { experimental_attachments: files ? Array.from(files) : undefined }
            };

            // Pass the event and options to the original useChat handler
            originalHandleSubmit(event, { ...submitOptions, data: submitOptions.data as any });

            // Clear inputs/state AFTER successful submission start
            setUploadedImagePath(null);
            setFiles(null); // Clear preview files
            setFollowUpContext(null); // <-- ADDED: Clear follow-up context
            // useChat hook should handle clearing the text input (`input`)
            requestAnimationFrame(() => { if (inputRef.current) inputRef.current.style.height = 'auto'; });

        } catch (saveError: any) {
             console.error("Error saving user message or submitting:", saveError);
             toast.error(`Failed to send message: ${saveError.message}`);
        }
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
                            // Add case for webSearch to prevent 'Unknown tool' error
                            case 'webSearch':
                                console.log(`[Tool Call Acknowledged] ${toolName} - handled server-side.`);
                                // No client-side action needed, execution happens on backend
                                executed = true; // Mark as handled to prevent 'Unhandled' warning
                                break;
                            default: console.error(`Unknown tool: ${toolName}`); toast.error(`Unknown tool: ${toolName}`);
                        }
                        if (executed) console.log(`[Tool Call Processed] ${toolName}`);
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

    // --- NEW: Autosave Trigger Function (Step 3) ---
    const triggerSaveDocument = useCallback(async (content: string, docId: string) => {
        console.log(`[Autosave] Triggering save for document ${docId}`);
        try {
            const response = await fetch(`/api/documents/${docId}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: JSON.parse(content) }), // Parse back to object for API
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `Autosave failed (${response.status})`);
            }
            console.log(`[Autosave] Document ${docId} saved successfully.`);
            // Return true on success, can be used by caller
            return true;
        } catch (err: any) {
            console.error(`[Autosave] Failed to save document ${docId}:`, err);
            // Throw the error to be caught by the caller (handleEditorChange)
            throw err;
        }
    }, []); // No dependencies, uses arguments directly
    // --- END NEW ---

    // --- NEW: Autosave Handler for Editor Changes (Step 4 & 9) ---
    // MODIFIED: Accept full editor instance from the component
    const handleEditorChange = useCallback((editor: BlockNoteEditorType) => {
        console.log("--- handleEditorChange called ---"); // <<< Existing DEBUG LOG
        const editorContent = editor.document; // Extract document from editor instance

        // Prevent triggering save immediately after initial content load
        if (!isContentLoadedRef.current) {
            isContentLoadedRef.current = true;
            console.log("[handleEditorChange] Initial content flag SET to true. Returning."); // <<< ADDED DEBUG LOG
            latestEditorBlocksRef.current = editorContent;
            latestEditorContentRef.current = JSON.stringify(editorContent);
            return;
        }
        console.log("[handleEditorChange] Initial content flag is TRUE. Proceeding..."); // <<< ADDED DEBUG LOG

        console.log("[handleEditorChange] Editor content changed. Setting status to 'unsaved'."); // <<< ADDED DEBUG LOG
        latestEditorBlocksRef.current = editorContent;
        try {
            latestEditorContentRef.current = JSON.stringify(editorContent);
        } catch (stringifyError) {
             console.error("[handleEditorChange] Failed to stringify editor content:", stringifyError);
             setAutosaveStatus('error');
             return;
        }

        setAutosaveStatus('unsaved');

        // Clear timers
        if (revertStatusTimerId) {
            console.log("[handleEditorChange] Clearing existing REVERT timer:", revertStatusTimerId); // <<< ADDED DEBUG LOG
            clearTimeout(revertStatusTimerId);
            setRevertStatusTimerId(null);
        }
        if (autosaveTimerId) {
            console.log("[handleEditorChange] Clearing existing AUTOSAVE timer:", autosaveTimerId); // <<< ADDED DEBUG LOG
            clearTimeout(autosaveTimerId);
        }

        console.log("[handleEditorChange] Setting NEW autosave timer (3000ms)..."); // <<< ADDED DEBUG LOG
        const newTimerId = setTimeout(async () => {
            console.log("[Autosave Timer] --- Timer FIRED ---"); // <<< ADDED DEBUG LOG
            // Check refs and ID right before saving
            if (!editorRef.current || !documentId || !latestEditorContentRef.current) {
                console.warn("[Autosave Timer] Missing editorRef, documentId, or latest content. Aborting save.");
                setAutosaveTimerId(null);
                return;
            }
            const currentContentStr = latestEditorContentRef.current;

            console.log("[Autosave Timer] Setting status to 'saving'."); // <<< ADDED DEBUG LOG
            setAutosaveStatus('saving');
            try {
                console.log("[Autosave Timer] Calling triggerSaveDocument..."); // <<< ADDED DEBUG LOG
                await triggerSaveDocument(currentContentStr, documentId);
                console.log("[Autosave Timer] triggerSaveDocument SUCCESS. Setting status to 'saved'."); // <<< ADDED DEBUG LOG
                setAutosaveStatus('saved');

                // Set timer to revert status
                console.log("[Autosave Timer] Setting REVERT timer (2000ms)..."); // <<< ADDED DEBUG LOG
                const newRevertTimerId = setTimeout(() => {
                    console.log("[Revert Timer] --- Timer FIRED --- Setting status to 'idle'."); // <<< ADDED DEBUG LOG
                    setAutosaveStatus('idle');
                    setRevertStatusTimerId(null);
                }, 2000);
                setRevertStatusTimerId(newRevertTimerId);

            } catch (error) {
                console.error("[Autosave Timer] triggerSaveDocument FAILED:", error); // <<< ADDED DEBUG LOG
                setAutosaveStatus('error');
            } finally {
                console.log("[Autosave Timer] Clearing main autosave timer ID state."); // <<< ADDED DEBUG LOG
                setAutosaveTimerId(null);
            }
        }, 3000); // 3-second debounce

        console.log("[handleEditorChange] Storing NEW autosave timer ID:", newTimerId); // <<< ADDED DEBUG LOG
        setAutosaveTimerId(newTimerId);

    }, [documentId, triggerSaveDocument, autosaveTimerId, revertStatusTimerId]); // Include timers in deps to clear them correctly
    // --- END NEW ---

    // --- NEW: beforeunload Hook for Unsaved Changes (Step 7) ---
    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
             // Check if there are unsaved changes OR if an autosave is pending
            if (autosaveStatus === 'unsaved' || autosaveTimerId) {
                console.log('[beforeunload] Unsaved changes detected. Attempting synchronous save.');

                // Clear any pending autosave timer immediately
                if (autosaveTimerId) {
                    clearTimeout(autosaveTimerId);
                    // No need to setAutosaveTimerId(null) here, component is unloading
                }
                 // Clear status revert timer too
                if (revertStatusTimerId) {
                    clearTimeout(revertStatusTimerId);
                     // No need to setRevertStatusTimerId(null) here
                }


                // Attempt a synchronous (best-effort) save using fetch with keepalive
                // Use the latest content from the ref
                if (latestEditorContentRef.current && documentId) {
                    try {
                        const contentToSave = latestEditorContentRef.current;
                        const url = `/api/documents/${documentId}/content`;
                        const payload = JSON.stringify({ content: JSON.parse(contentToSave) }); // Parse back for API

                        // navigator.sendBeacon is another option, generally preferred for analytics
                        // but fetch with keepalive is often used for critical data saving like this.
                        // It's still best-effort.
                         if (navigator.sendBeacon) {
                            const blob = new Blob([payload], { type: 'application/json' });
                            navigator.sendBeacon(url, blob);
                            console.log('[beforeunload] Sent data via navigator.sendBeacon.');
                         } else {
                            // Fallback for browsers that don't support sendBeacon (less likely)
                            fetch(url, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: payload,
                                keepalive: true, // Important!
                            }).catch(err => {
                                // Errors here are hard to handle reliably as the page is closing. Log attempts.
                                console.warn('[beforeunload] fetch keepalive error (may be expected):', err);
                            });
                             console.log('[beforeunload] Sent data via fetch keepalive.');
                        }


                    } catch (err) {
                        // Catch errors during preparation (e.g., JSON.parse)
                        console.error('[beforeunload] Error preparing sync save data:', err);
                    }
                } else {
                    console.warn('[beforeunload] Could not attempt sync save: Missing content or document ID.');
                }

                // Standard way to prompt the user (though modern browsers often show generic messages)
                // event.preventDefault(); // Standard practice, might be needed for older browsers
                // event.returnValue = ''; // Standard practice
                // Note: Browsers are increasingly ignoring custom messages here for security.
                // The presence of the handler itself might trigger a generic "Leave site?" prompt
                // if changes were detected, which is often sufficient. We don't explicitly set returnValue.
            } else {
                 console.log('[beforeunload] No unsaved changes detected.');
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            console.log('[beforeunload] Cleanup: Removed listener.');
        };
    }, [autosaveStatus, autosaveTimerId, revertStatusTimerId, documentId]); // Dependencies: status, timers, docId
    // --- END NEW ---

    // --- NEW: Navigation Handling Hook (Step 8) ---
    useEffect(() => {
        // Check if navigating away from an editor page
        // Add check for pathname existence
        const isLeavingEditor = !!(previousPathnameRef.current?.startsWith('/editor/') && !pathname?.startsWith('/editor/'));

        if (isLeavingEditor && (autosaveStatus === 'unsaved' || autosaveTimerId)) {
            console.log('[Navigation] Leaving editor with unsaved changes. Triggering save.');

            // Clear pending timers
             if (autosaveTimerId) {
                clearTimeout(autosaveTimerId);
                setAutosaveTimerId(null); // Update state since component isn't unmounting yet
            }
            if (revertStatusTimerId) {
                 clearTimeout(revertStatusTimerId);
                 setRevertStatusTimerId(null);
            }

            // Trigger a save (fire-and-forget)
            if (latestEditorContentRef.current && documentId) {
                 setAutosaveStatus('saving'); // Show saving status briefly during navigation
                 triggerSaveDocument(latestEditorContentRef.current, documentId)
                    .then(() => {
                        console.log('[Navigation] Save successful.');
                         // Optionally update status briefly, though user is navigating away
                         // setAutosaveStatus('saved'); // Might not be visible
                    })
                    .catch(err => {
                        console.error("[Navigation] Save on navigate failed:", err);
                         // Don't revert status to 'error' here as user is leaving
                    });
            }
        }

        // Update the ref *after* checking the navigation condition
        // Add check for pathname existence
        if (pathname) {
           previousPathnameRef.current = pathname;
        }

    }, [pathname, autosaveStatus, autosaveTimerId, revertStatusTimerId, documentId, triggerSaveDocument]); // Dependencies
    // --- END NEW ---

    // --- NEW: Unmount Cleanup Hook for Timers (Step 9) ---
     useEffect(() => {
        // Return a cleanup function that runs on unmount
        return () => {
            console.log('[Unmount Cleanup] Clearing timers.');
            if (autosaveTimerId) {
                clearTimeout(autosaveTimerId);
                console.log('[Unmount Cleanup] Cleared autosaveTimerId:', autosaveTimerId);
            }
            if (revertStatusTimerId) {
                clearTimeout(revertStatusTimerId);
                 console.log('[Unmount Cleanup] Cleared revertStatusTimerId:', revertStatusTimerId);
            }
        };
    }, [autosaveTimerId, revertStatusTimerId]); // Re-run only if timer IDs change (to get latest ID for cleanup)
    // --- END NEW ---

    // Manual Save Handler - MODIFIED to interact with autosave
    const handleSaveContent = useCallback(async () => {
        const editor = editorRef.current;
        if (!documentId) { toast.error("Cannot save: Document ID missing."); return; }
        if (!editor?.document) { console.warn('Save aborted: Editor content ref not available.'); return; }
        if (isSaving) return; // Prevent multiple manual saves

        // --- NEW: Interact with Autosave ---
        console.log("[Manual Save] Triggered.");
        // Clear any pending autosave timer
        if (autosaveTimerId) {
            clearTimeout(autosaveTimerId);
            setAutosaveTimerId(null);
            console.log("[Manual Save] Cleared pending autosave timer.");
        }
         // Clear any pending status revert timer
        if (revertStatusTimerId) {
            clearTimeout(revertStatusTimerId);
            setRevertStatusTimerId(null);
            console.log("[Manual Save] Cleared pending status revert timer.");
        }
         // Set status to saving (overrides autosave status)
        setAutosaveStatus('saving');
        // --- END NEW ---

        setIsSaving(true); // Still use isSaving for button state specifically
        setError(null);
        console.log("Saving document content manually...");
        try {
            const currentEditorContent = editor.document; // Get content at time of save
            const stringifiedContent = JSON.stringify(currentEditorContent); // Use the same format as autosave ref

            // Update refs immediately for consistency
            latestEditorBlocksRef.current = currentEditorContent;
            latestEditorContentRef.current = stringifiedContent;

            // Use triggerSaveDocument for consistency (even though it parses back)
            // Alternatively, could call fetch directly here. Using triggerSaveDocument is slightly cleaner.
            await triggerSaveDocument(stringifiedContent, documentId);

            toast.success('Document saved!');
            // --- NEW: Set autosave status to 'saved' after manual save ---
            setAutosaveStatus('saved');
            // Set timer to revert to idle
             const newRevertTimerId = setTimeout(() => {
                 setAutosaveStatus('idle');
                 setRevertStatusTimerId(null);
             }, 2000);
             setRevertStatusTimerId(newRevertTimerId);
            // --- END NEW ---

            // Update document metadata timestamp if possible (API should return it)
            // Refetch or expect updated_at in response? Assuming API returns it.
            // const { data } = await response.json(); // triggerSaveDocument doesn't return full data
            // Need to fetch updated doc data or rely on API response structure if changed
            // For now, just log success.

        } catch (err: any) {
            console.error("[Manual Save] Save error:", err);
            setError(`Save failed: ${err.message}`);
            toast.error(`Save failed: ${err.message}`);
            // --- NEW: Set autosave status to 'error' on manual save failure ---
            setAutosaveStatus('error');
            // --- END NEW ---
        } finally {
            setIsSaving(false); // Reset manual save button state
             // Note: Autosave status is now managed independently ('saved' or 'error')
        }
    // Include autosave timers in dependencies
    }, [documentId, isSaving, /* Removed documentData */ autosaveTimerId, revertStatusTimerId, triggerSaveDocument]);

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

    const handleSaveTitle = async (titleToSave?: string) => {
        // Determine the title to actually save
        const finalTitle = titleToSave !== undefined ? titleToSave.trim() : newTitleValue.trim();

        if (!documentData || !finalTitle || finalTitle === documentData.name) {
            // If name is empty or unchanged, just cancel edit mode
            if (!finalTitle) {
                toast.error("Document name cannot be empty.");
            }
            handleCancelEditTitle(); // Also cancels if name is unchanged
            return;
        }

        const originalTitle = documentData.name;
        // Use finalTitle for optimistic update and API call
        const optimisticNewTitle = finalTitle;

        // Optimistic UI update
        setDocumentData(prevData => prevData ? { ...prevData, name: optimisticNewTitle } : null);
        setIsEditingTitle(false); // Exit edit mode after initiating save

        try {
            const response = await fetch(`/api/documents/${documentId}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: optimisticNewTitle }), // Send finalTitle
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
            handleSaveTitle(); // No argument - uses state from input
        } else if (event.key === 'Escape') {
            handleCancelEditTitle();
        }
    };
    // --- END Added Title Editing Handlers ---

    // --- NEW: Handle Infer Title Click ---
    const handleInferTitle = async () => {
        const editor = editorRef.current;
        if (!editor) {
            toast.error("Editor not ready.");
            return;
        }

        setIsInferringTitle(true);
        toast.info("Generating title based on content..."); // Inform user

        try {
            // 1. Get editor content as Markdown
            const blocks = editor.document;
            const markdown = await editor.blocksToMarkdownLossy(blocks);

            // 2. Extract snippet (first 500 chars, as per PRD)
            const snippet = markdown.substring(0, 500);

            // Basic check if snippet is empty after conversion/extraction
            if (!snippet.trim()) {
                 toast.warning("Cannot generate title from empty content.");
                 setIsInferringTitle(false);
                 return;
            }

            // 3. Call the backend API
            const response = await fetch('/api/generate-title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: snippet }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
                throw new Error(errorData.error || `Failed to generate title (${response.status})`);
            }

            const { title } = await response.json();

            if (!title) {
                throw new Error("Received empty title from API.");
            }

            // 4. Update the title using existing logic
            toast.success("Title suggested!");
            // Set the input field value directly
            setNewTitleValue(title);
            // Trigger the save mechanism (which also handles optimistic UI update if isEditingTitle is true)
            setIsEditingTitle(true); // Ensure save button appears if not already editing
            // We might need a slight delay or focus management here if needed,
            // but handleSaveTitle should pick up the new value from `newTitleValue`
            // No, actually call handleSaveTitle directly to persist it immediately
            await handleSaveTitle(title); // Call without arguments, uses newTitleValue state
            // setIsEditingTitle(false); // Exit edit mode after successful save // Keep edit mode active so user sees the change and can modify/confirm


        } catch (error) {
            console.error("Error inferring title:", error);
            const message = error instanceof Error ? error.message : "Unknown error occurred";
            toast.error(`Title generation failed: ${message}`);
        } finally {
            setIsInferringTitle(false);
        }
    };

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
             <button onClick={() => router.push('/launch')} className="mt-4 px-4 py-2 bg-[--editor-bg]-white rounded hover:bg-[--hover-bg]">Go to Launch Pad</button>
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
                                <button onClick={() => handleSaveTitle()} className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900 rounded" title="Save Title"><Save size={18} /></button>
                                <button onClick={handleCancelEditTitle} className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded" title="Cancel"><X size={18} /></button>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-[--text-color] truncate" title={documentData.name}>{documentData.name}</h2>
                                {/* --- NEW: Infer Title Button (Re-added) --- */}
                                <button
                                    onClick={handleInferTitle}
                                    className="p-1 rounded hover:bg-[--hover-bg] text-[--muted-text-color] hover:text-[--text-color] disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                    aria-label="Suggest title from content"
                                    title="Suggest title from content"
                                    disabled={isInferringTitle || !editorRef.current} // Disable while inferring or if editor not ready
                                >
                                    {isInferringTitle ? (
                                         <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                            style={{ display: 'flex' }} // Keep layout consistent
                                         >
                                             <Sparkles size={16} className="text-yellow-500" />
                                         </motion.div>
                                    ) : (
                                         <Sparkles size={16} />
                                    )}
                                </button>
                                {/* --- End: Infer Title Button --- */}
                                <button onClick={handleEditTitleClick} className="p-1 text-[--muted-text-color] hover:text-[--text-color] hover:bg-[--hover-bg] rounded flex-shrink-0" title="Rename Document"><Edit size={16} /></button>
                            </>
                        )}
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                        {/* --- SIMPLIFIED Autosave Status Indicator --- */}
                        <div className="flex items-center gap-1 text-sm border border-red-500 px-1" aria-live="polite" aria-atomic="true">
                            {/* Always render the status text */} 
                            <span className="text-red-500 font-bold">[{autosaveStatus}]</span>
                            {/* {autosaveStatus === 'unsaved' && <><Clock size={14} className="text-yellow-500" /><span>Unsaved</span></>} */} 
                            {/* {autosaveStatus === 'saving' && <><svg className="animate-spin h-3.5 w-3.5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Saving...</span></>} */} 
                            {/* {autosaveStatus === 'saved' && <><CheckCircle2 size={14} className="text-green-500" /><span>Saved</span></>} */} 
                            {/* {autosaveStatus === 'error' && <><AlertCircle size={14} className="text-red-500" /><span>Error</span></>} */} 
                        </div>
                        {/* --- END SIMPLIFIED --- */}
                        <button onClick={handleNewDocument} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded" title="New/Open (Launch Pad)"><DocumentPlusIcon className="h-5 w-5" /></button>
                        {/* Manual Save Button - Now uses isSaving state */}
                        <button onClick={handleSaveContent} disabled={isSaving || autosaveStatus === 'saving'} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Save Document Manually">
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
