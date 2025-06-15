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
    PointerEvent,
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
import {
    validateToolOperation,
    BlockValidationResult
} from '@/lib/blockValidation';
import {
    createSafeOperationPlan,
    generateSafetyErrorReport,
    BlockSafetyResult
} from '@/lib/blockSafety';
import {
    ToolErrorHandler,
    CommonErrors,
    SuccessFeedback,
    ErrorUtils
} from '@/lib/errorHandling';
import {
    checkContentPreservation,
    ContentPreservationResult,
    createContentSnapshot,
    ContentSnapshot
} from '@/lib/contentPreservation';

// Zustand Store
import { useFollowUpStore } from '@/lib/stores/followUpStore';
import { usePreferenceStore } from '@/lib/stores/preferenceStore'; // Import preference store
import { useModalStore } from '@/stores/useModalStore'; // Corrected Path
import { useAuthStore } from '@/lib/stores/useAuthStore';


// --- NEW: Import the hooks ---
import { useDocument } from '@/app/lib/hooks/editor/useDocument';
import { useInitialChatMessages } from '@/app/lib/hooks/editor/useInitialChatMessages';
// --- NEW: Import the useTitleManagement hook ---
import { useTitleManagement } from '@/lib/hooks/editor/useTitleManagement'; // Corrected path
// --- NEW: Import the useChatPane hook ---
import { useChatPane } from '@/lib/hooks/editor/useChatPane';
// --- NEW: Import the useFileUpload hook ---
import { useFileUpload } from '@/lib/hooks/editor/useFileUpload'; // Corrected Path
// --- NEW: Import the useChatInteractions hook ---
import { useChatInteractions } from '@/lib/hooks/editor/useChatInteractions';
import { ChatInputArea } from '@/components/editor/ChatInputArea'; // Import the new component
import { ChatMessagesList } from '@/components/editor/ChatMessagesList'; // Import the new component
import { ChatPaneWrapper } from '@/components/editor/ChatPaneWrapper'; // Import the new wrapper
import { EditorPaneWrapper } from '@/components/editor/EditorPaneWrapper'; // Import the new wrapper
import { ChatPaneTab } from '@/components/chat/ChatPaneTab'; // <-- ADD THIS IMPORT
import { CollapseChatTab } from '@/components/chat/CollapseChatTab'; // <-- ADD THIS IMPORT
// NEW: Import useMediaQuery hook
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
// --- NEW: Import VersionHistoryModal ---
import { VersionHistoryModal } from '@/components/editor/VersionHistoryModal';
// --- NEW: Import DocumentReplacementConfirmationModal ---
import DocumentReplacementConfirmationModal from '@/components/modals/DocumentReplacementConfirmationModal';
// --- Use standard aiToast utility for proper positioning ---
import { aiToast } from '@/lib/utils/aiToast';
// REMOVED: SearchModal import for now, will be re-added at a higher level
// import { SearchModal } from '@/components/search/SearchModal'; 
import { useSWRConfig } from 'swr'; // ADDED for cache mutation
// NEW: Import MobileChatDrawer
import { MobileChatDrawer } from '@/components/chat/MobileChatDrawer';
// NEW: Import styles for EditorPage specific elements (like mobile toggle button)
// import styles from './EditorPage.module.css'; // styles will be from FloatingActionTab.module.css directly or this file if specific overrides needed
// NEW: Import FloatingActionTab
import { FloatingActionTab } from '@/components/chat/FloatingActionTab';
// ADDED: Import client chat operation store and states
import { useClientChatOperationStore } from '@/lib/stores/useClientChatOperationStore';
import { BlockStatus } from '@/app/lib/clientChatOperationState';
import { AIToolState, AudioState, FileUploadState } from '@/app/lib/clientChatOperationState';
import { AttachedToastProvider } from '@/contexts/AttachedToastContext';
import { CollaborationProvider, useCollaborationContext } from '@/contexts/CollaborationContext';

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

// --- Inner component that uses CollaborationContext ---
function EditorPageContent() {
    // --- Top-Level Hooks (React, Next.js) ---
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const documentId = params?.documentId as string;
    
    // Get collaboration context and auth state
    const { initializeCollaboration } = useCollaborationContext();
    const { user } = useAuthStore(); 
    
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
    const desktopResizeDragStartRef = useRef<{ x: number; initialWidth: number } | null>(null); // NEW Ref for desktop resizing
    const editorPaneRef = useRef<HTMLDivElement>(null); // For scroll syncing

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
    // --- ADDED: State for intelligent auto-save batching ---
    const [autosaveBatchContext, setAutosaveBatchContext] = useState<{
        isInBatch: boolean;
        batchType: 'ai-tools' | 'user-typing' | 'manual';
        batchStartTime: number | null;
        batchChangesCount: number;
        lastChangeTime: number | null;
    }>({
        isInBatch: false,
        batchType: 'user-typing',
        batchStartTime: null,
        batchChangesCount: 0,
        lastChangeTime: null,
    });
    // --- ADDED: State for diff-based autosave tracking ---
    const lastServerSaveRef = useRef<{
        content: string | null;
        timestamp: number;
        changesSinceLastSave: number;
    }>({
        content: null,
        timestamp: Date.now(),
        changesSinceLastSave: 0,
    });
    const [localSaveStatus, setLocalSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    // --- ADDED STATE for pending mobile editor tool call ---
    const [pendingMobileEditorToolCall, setPendingMobileEditorToolCall] = useState<{ toolName: string; args: any; toolCallId: string } | null>(null);
    // --- NEW: State for Version History Modal ---
    const [isVersionHistoryModalOpen, setIsVersionHistoryModalOpen] = useState(false);
    // --- NEW: State for the form element (for callback ref) ---
    const [formElement, setFormElement] = useState<HTMLFormElement | null>(null);
    // --- NEW: State for Mini-Pane ---
    const [isMiniPaneOpen, setIsMiniPaneOpen] = useState(false);
    // --- NEW: State for tracking unread messages in mini pane ---
    const [unreadMiniPaneCount, setUnreadMiniPaneCount] = useState(0);
    // --- NEW: Ref to track the last seen message count ---
    const lastSeenMessageCountRef = useRef(0);
    // --- ADDED: State for document star status ---
    const [currentDocIsStarred, setCurrentDocIsStarred] = useState(false);
    // --- NEW: State for current theme ---
    const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
    // --- NEW: State for pane resizing ---
    const [isPaneBeingResized, setIsPaneBeingResized] = useState(false);
    // --- NEW: Restore local state for mobile pane visibility ---
    const [mobileVisiblePane, setMobileVisiblePane] = useState<'editor' | 'chat'>('editor');
    // --- NEW: State for pending content to be added to the editor on mobile ---
    const [pendingContentForEditor, setPendingContentForEditor] = useState<string | null>(null);
    // --- NEW: State to track client-side tool processing ---
    const [isProcessingClientTools, setIsProcessingClientTools] = useState(false);
    // --- NEW: State for document replacement confirmation modal ---
    const [documentReplacementConfirmation, setDocumentReplacementConfirmation] = useState<{
        isOpen: boolean;
        args?: any;
        isProcessing?: boolean;
    }>({ isOpen: false });

    // --- Note: isChatInputBusy and currentOperationStatusText now come from useChatInteractions ---
    // Example to test UI states:
    // useEffect(() => {
    //     // Simulate an operation
    //     setIsChatInputBusy(true);
    //     setCurrentOperationStatusText("Processing AI action: createChecklist..."); // REQ-1.3, REQ-6.2, REQ-7.3
    //     const timer = setTimeout(() => {
    //         setIsChatInputBusy(false);
    //         setCurrentOperationStatusText(null);
    //     }, 7000); // Increased duration for testing
    //     return () => clearTimeout(timer);
    // }, []);

    // --- ADDED: Access client chat operation store actions ---
    const {
        setAIToolState,
        setAudioState,
        setFileUploadState,
        setCurrentToolCallId,
        setCurrentOperationDescription,
        resetChatOperationState,
        setOperationStates,
        setBlockStatus,
        clearBlockStatus,
    } = useClientChatOperationStore();

    // --- Custom Hooks --- (Order is important!)
    const { documentData, initialEditorContent, isLoadingDocument, error: documentError } = useDocument(documentId);
    
    // Initialize collaboration when document and user are available
    useEffect(() => {
        if (documentData && user?.id) {
            initializeCollaboration(
                documentId,
                user.id,
                user.user_metadata?.name || user.email || 'Anonymous User',
                undefined // Let it generate a color
            );
        }
    }, [documentData, user, documentId, initializeCollaboration]);
    
    // --- ADDED: Initialize diff tracking when document loads ---
    useEffect(() => {
        if (documentData?.content) {
            const initialContent = JSON.stringify(documentData.content);
            lastServerSaveRef.current = {
                content: initialContent,
                timestamp: Date.now(),
                changesSinceLastSave: 0,
            };
            console.log('[Diff Tracking] Initialized with document content');
        }
    }, [documentData?.content]);
    // --- ADDED: SWR config for cache mutation ---
    const { mutate } = useSWRConfig();
    // NEW: Add useMediaQuery hook
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT_QUERY);

    // Added for Live Summaries
    const { openVoiceSummaryModal, setEditorRef, setBlockStatusFunction } = useModalStore(); // Get setEditorRef
    const { currentTitle, isEditingTitle, newTitleValue, isInferringTitle, handleEditTitleClick, handleCancelEditTitle, handleSaveTitle, handleTitleInputKeyDown, handleInferTitle, setNewTitleValue } = useTitleManagement({
        documentId,
        initialName: documentData?.name || '',
        editorRef,
    });
    // CORRECTED Destructuring from useChatPane
    const { 
        isExpanded: isChatPaneExpanded,
        isCollapsed: isChatPaneCollapsed,
        toggleExpanded: toggleChatPane,
        previousWidth: chatPanePreviousWidth, // Will store '30%' or '450px' etc.
        handleWidthChange: handleChatPaneWidthChange,
        // Do not destructure mobileVisiblePane or toggleMobilePane from useChatPane here,
        // EditorPage will use its own local state for this.
    } = useChatPane({}); // Pass empty object or relevant props if any are added back to UseChatPaneProps
    
    const { files, isUploading, uploadError, uploadedImagePath, uploadedImageSignedUrl, handleFileSelectEvent, handleFilePasteEvent, handleFileDropEvent, clearPreview, uploadFileForOrchestrator, fetchDownloadUrlForPath } = useFileUpload({ documentId });
    
    // Debug: Image upload state (removed due to infinite loop)
    
    const { isLoadingMessages, initialMessages } = useInitialChatMessages({
        documentId,
        setPageError
    });

    // --- NEW: Initialize processedToolCallIds with completed tool calls from initial messages ---
    useEffect(() => {
        console.log('[ToolInit] useEffect triggered. initialMessages length:', initialMessages?.length || 0);
        if (!initialMessages || initialMessages.length === 0) {
            console.log('[ToolInit] No initial messages to process');
            return;
        }

        const completedToolCallIds = new Set<string>();

        console.log('[ToolInit] Processing initial messages for completed tool calls:', initialMessages.length);

        // Create a map of all tool result messages for quick lookup
        const toolResultMessages = new Map<string, any>();
        for (const message of initialMessages) {
            const msgAny = message as any;
            if (msgAny.role === 'tool' && msgAny.tool_call_id) {
                toolResultMessages.set(msgAny.tool_call_id, msgAny);
                console.log(`[ToolInit] Found tool result message for call ID: ${msgAny.tool_call_id}`);
            }
        }

        // Check for tool calls that already have results in the initial messages
        for (const message of initialMessages) {
            console.log(`[ToolInit] Checking message ${message.id}, role: ${message.role}, content type: ${typeof message.content}`);
            console.log(`[ToolInit] Message content:`, message.content);
            
            if (message.role === 'assistant') {
                // Handle different content formats
                let messageContent = message.content;
                
                // If content is a string, try to parse it as JSON
                if (typeof messageContent === 'string') {
                    try {
                        messageContent = JSON.parse(messageContent);
                        console.log(`[ToolInit] Parsed string content to:`, messageContent);
                    } catch (e) {
                        console.log(`[ToolInit] Failed to parse string content as JSON:`, e);
                        // Keep as string if parsing fails
                    }
                }
                
                // Check parts-based tool invocations (AI SDK format)
                if (messageContent && Array.isArray(messageContent)) {
                    console.log(`[ToolInit] Message ${message.id} has ${messageContent.length} content parts`);
                    for (const part of messageContent) {
                        console.log(`[ToolInit] Part type: ${part.type}`);
                        if (part.type === 'tool-invocation' && part.toolInvocation) {
                            const toolCallId = part.toolInvocation.toolCallId;
                            // Mark as completed if it has state 'result' OR if there's a corresponding tool result message
                            if (part.toolInvocation.state === 'result' || toolResultMessages.has(toolCallId)) {
                                console.log(`[ToolInit] Found completed tool call in parts: ${toolCallId} (state: ${part.toolInvocation.state}, hasResult: ${toolResultMessages.has(toolCallId)})`);
                                completedToolCallIds.add(toolCallId);
                            }
                        }
                        // NEW: Check for tool-call content parts (incomplete tool calls)
                        else if (part.type === 'tool-call') {
                            const toolCall = part as any;
                            const toolCallId = toolCall.toolCallId;
                            if (toolResultMessages.has(toolCallId)) {
                                console.log(`[ToolInit] Found completed tool-call: ${toolCallId} (${toolCall.toolName})`);
                                completedToolCallIds.add(toolCallId);
                            } else {
                                console.log(`[ToolInit] ⚠️  INCOMPLETE TOOL CALL DETECTED: ${toolCallId} (${toolCall.toolName}) - NO RESULT MESSAGE FOUND`);
                                console.log(`[ToolInit] This is likely the source of duplicate execution on page refresh!`);
                                // DON'T mark as completed - let it re-execute to complete the conversation
                            }
                        }
                    }
                }
                
                // Check toolInvocations-based format (legacy format)
                const msgAny = message as any;
                if (msgAny.toolInvocations && Array.isArray(msgAny.toolInvocations)) {
                    console.log(`[ToolInit] Message ${message.id} has ${msgAny.toolInvocations.length} toolInvocations`);
                    for (const toolInvocation of msgAny.toolInvocations) {
                        console.log(`[ToolInit] ToolInvocation: ${toolInvocation.toolName} (${toolInvocation.toolCallId})`);
                        // Check if there's a corresponding tool result message
                        if (toolResultMessages.has(toolInvocation.toolCallId)) {
                            console.log(`[ToolInit] Found result message for tool call: ${toolInvocation.toolCallId}`);
                            completedToolCallIds.add(toolInvocation.toolCallId);
                        }
                    }
                }

                // Also check for tool_calls array (another possible format)
                if (msgAny.tool_calls && Array.isArray(msgAny.tool_calls)) {
                    console.log(`[ToolInit] Message ${message.id} has ${msgAny.tool_calls.length} tool_calls`);
                    for (const toolCall of msgAny.tool_calls) {
                        if (toolCall.id && toolResultMessages.has(toolCall.id)) {
                            console.log(`[ToolInit] Found result message for tool_calls format: ${toolCall.id}`);
                            completedToolCallIds.add(toolCall.id);
                        }
                    }
                }
            }
        }

        if (completedToolCallIds.size > 0) {
            console.log('[ToolInit] Setting processedToolCallIds with completed tool calls:', Array.from(completedToolCallIds));
            setProcessedToolCallIds(completedToolCallIds);
        } else {
            console.log('[ToolInit] No completed tool calls found in initial messages');
        }
    }, [initialMessages]);

    // --- NEW: Get initialTaggedDocIdsString from searchParams ---
    const initialTaggedDocIdsString = searchParams.get('taggedDocIds');
    // --- END NEW ---
    
    // Debug: Chat interactions input (removed due to infinite loop)
    
    const {
        messages,
        setMessages, // Allow direct setting of messages for history loading
        input,
        setInput,
        handleInputChange,
        sendMessage,
        isLoading: isAiLoading, // Renamed to avoid conflict with document loading state
        reload,
        stop, // Stop AI generation
        model,
        setModel,
        // --- NEW AUDIO PROPS --- 
        isRecording,
        isTranscribing,
        micPermissionError,
        handleMicrophoneClick,
        handleStopRecording, 
        audioTimeDomainData, // <<< NEW: Exposed audio data for visualization
        // --- END NEW AUDIO PROPS ---
        // --- NEW TAGGED DOCUMENTS PROPS ---
        taggedDocuments,
        setTaggedDocuments,
        // --- END NEW TAGGED DOCUMENTS PROPS ---
        addToolResult,
        // --- NEW: Orchestrator-specific file upload handlers/state ---
        handleFileUpload,
        cancelFileUpload,
        pendingFile,
        isFileUploadInProgress,
        // --- NEW: Orchestrator general busy state and status text ---
        isChatInputBusy,
        currentOperationStatusText,
    } = useChatInteractions({
        documentId,
        initialModel,
        initialMessages, // Corrected: was initialChatMessages, should be initialMessages
        editorRef,
        uploadedImagePath, // From useFileUpload
        uploadedImageSignedUrl, // From useFileUpload
        isUploading, // From useFileUpload
        clearFileUploadPreview: clearPreview, // From useFileUpload
        initialTaggedDocIdsString, // From URL search params
        uploadFileForOrchestrator,
        fetchDownloadUrlForPath,
    });
    
    // Create aliases for missing functions expected by components
    const startRecording = handleMicrophoneClick;
    const stopRecording = handleStopRecording;
    const orchestratorHandleFileUploadStart = handleFileUpload;
    const orchestratorCancelFileUpload = cancelFileUpload;
    const orchestratorPendingFile = pendingFile;
    const orchestratorIsFileUploadInProgress = isFileUploadInProgress;
    const orchestratorIsChatInputBusy = isChatInputBusy;
    const orchestratorCurrentOperationStatusText = currentOperationStatusText;
    
    const { followUpContext, setFollowUpContext } = useFollowUpStore();

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

    // --- ADDED: Smart Auto-Save Batching Helpers ---
    const startAIToolsBatch = useCallback(() => {
        console.log('[AutoSave Batch] Starting AI tools batch');
        setAutosaveBatchContext(prev => ({
            ...prev,
            isInBatch: true,
            batchType: 'ai-tools',
            batchStartTime: Date.now(),
            batchChangesCount: 0,
            lastChangeTime: null,
        }));
    }, []);

    const endAIToolsBatch = useCallback(() => {
        console.log('[AutoSave Batch] Ending AI tools batch');
        setAutosaveBatchContext(prev => ({
            ...prev,
            isInBatch: false,
            batchStartTime: null,
        }));
    }, []);

    // --- ADDED: Diff Analysis and Local Storage Utilities ---
    const analyzeContentDiff = useCallback((currentContent: string, previousContent: string | null): {
        isSignificant: boolean;
        metrics: {
            charDelta: number;
            wordDelta: number;
            linesDelta: number;
            blockStructureChanged: boolean;
            timeSinceLastSave: number;
        };
    } => {
        if (!previousContent) {
            return {
                isSignificant: true,
                metrics: { charDelta: currentContent.length, wordDelta: 0, linesDelta: 0, blockStructureChanged: false, timeSinceLastSave: 0 }
            };
        }

        const charDelta = Math.abs(currentContent.length - previousContent.length);
        const currentWords = currentContent.split(/\s+/).length;
        const previousWords = previousContent.split(/\s+/).length;
        const wordDelta = Math.abs(currentWords - previousWords);
        
        const currentLines = currentContent.split('\n').length;
        const previousLines = previousContent.split('\n').length;
        const linesDelta = Math.abs(currentLines - previousLines);
        
        // Check for structural changes (new blocks, headers, lists, etc.)
        const blockStructureChanged = linesDelta > 0 || 
            currentContent.includes('# ') !== previousContent.includes('# ') ||
            currentContent.includes('- ') !== previousContent.includes('- ') ||
            currentContent.includes('1. ') !== previousContent.includes('1. ');

        const timeSinceLastSave = Date.now() - lastServerSaveRef.current.timestamp;

        // Determine significance based on multiple factors
        const isSignificant = 
            charDelta > 200 ||                           // Major text changes
            wordDelta > 50 ||                            // Substantial word count change
            blockStructureChanged ||                     // Structure changes (paragraphs, lists, headers)
            timeSinceLastSave > 10 * 60 * 1000 ||       // 10+ minutes since last server save
            lastServerSaveRef.current.changesSinceLastSave >= 5; // 5+ local saves accumulated

        return {
            isSignificant,
            metrics: { charDelta, wordDelta, linesDelta, blockStructureChanged, timeSinceLastSave }
        };
    }, []);

    const saveToLocalStorage = useCallback(async (content: string) => {
        try {
            setLocalSaveStatus('saving');
            const localSaveData = {
                content: JSON.parse(content),
                timestamp: Date.now(),
                documentId,
            };
            localStorage.setItem(`tuon-editor-draft-${documentId}`, JSON.stringify(localSaveData));
            setLocalSaveStatus('saved');
            
            // Auto-revert local save status after 1 second
            setTimeout(() => setLocalSaveStatus('idle'), 1000);
            
            console.log('[Local Save] Content saved to localStorage');
            return true;
        } catch (error) {
            console.error('[Local Save] Failed to save to localStorage:', error);
            setLocalSaveStatus('error');
            setTimeout(() => setLocalSaveStatus('idle'), 2000);
            return false;
        }
    }, [documentId]);

    const promoteLocalSaveToServer = useCallback(async (): Promise<boolean> => {
        try {
            const localData = localStorage.getItem(`tuon-editor-draft-${documentId}`);
            if (!localData) return false;

            const { content } = JSON.parse(localData);
            const response = await fetch(`/api/documents/${documentId}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });

            if (response.ok) {
                // Update server save tracking
                lastServerSaveRef.current = {
                    content: JSON.stringify(content),
                    timestamp: Date.now(),
                    changesSinceLastSave: 0,
                };
                // Clear local storage after successful server save
                localStorage.removeItem(`tuon-editor-draft-${documentId}`);
                console.log('[Promote Save] Local save promoted to server successfully');
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Promote Save] Failed to promote local save to server:', error);
            return false;
        }
    }, [documentId]);

    const getAutosaveDelay = useCallback((batchContext: typeof autosaveBatchContext) => {
        const currentTime = Date.now();
        
        if (batchContext.batchType === 'ai-tools') {
            if (batchContext.isInBatch) {
                // While AI tools are actively running, use a longer delay to batch changes
                return 8000; // 8 seconds to allow for multiple tool calls
            } else {
                // AI tools batch just ended, save more quickly
                return 2000; // 2 seconds after AI tools finish
            }
        } else if (batchContext.batchType === 'user-typing') {
            // Standard delay for user typing
            return 3000; // 3 seconds for normal user interaction
        } else {
            // Manual or other contexts
            return 1000; // 1 second for immediate saves
        }
    }, []);

    const handleEditorChange = useCallback((editor: BlockNoteEditorType) => {
        console.log('[handleEditorChange] CALLED - document length:', editor.document.length);
        console.log('[handleEditorChange] Current batch context:', autosaveBatchContext);
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

        // Update batch context with this change
        const currentTime = Date.now();
        setAutosaveBatchContext(prev => {
            const updatedContext = {
                ...prev,
                batchChangesCount: prev.batchChangesCount + 1,
                lastChangeTime: currentTime,
            };

            // If not in an AI batch and this looks like user typing, set user-typing context
            if (!prev.isInBatch && prev.batchType !== 'user-typing') {
                updatedContext.batchType = 'user-typing';
                updatedContext.batchStartTime = currentTime;
            }

            return updatedContext;
        });

        setAutosaveStatus('unsaved');
        if (revertStatusTimerId) {
            clearTimeout(revertStatusTimerId);
            setRevertStatusTimerId(null);
        }
        if (autosaveTimerId) {
            clearTimeout(autosaveTimerId);
        }

        // Use intelligent delay based on current batch context
        const delay = getAutosaveDelay(autosaveBatchContext);
        console.log(`[handleEditorChange] Using ${delay}ms delay for ${autosaveBatchContext.batchType} context`);

        const newTimerId = setTimeout(async () => {
            const editorInstance = editorRef.current;
            const currentBlocks = latestEditorBlocksRef.current;
            const currentContentString = latestEditorContentRef.current;
            if (!editorInstance || !documentId || !currentContentString || !currentBlocks) {
                console.warn("[Autosave Timer] Aborting save: Missing editor, documentId, content string, or blocks.");
                setAutosaveStatus('error');
                return;
            }

            // Check if we should skip this save due to another change happening soon in AI batch
            if (autosaveBatchContext.isInBatch && autosaveBatchContext.batchType === 'ai-tools') {
                const timeSinceLastChange = Date.now() - (autosaveBatchContext.lastChangeTime || Date.now());
                if (timeSinceLastChange < 1000) { // If a change happened within last 1 second
                    console.log('[Autosave Timer] Skipping save due to recent change in AI batch');
                    return;
                }
            }

            // --- ADDED: Diff Analysis for Smart Save Decision ---
            let shouldUseServerSave = true; // Default for AI tools and first saves
            let diffMetrics = null;

            // Only analyze diffs for user typing (not AI tools)
            if (autosaveBatchContext.batchType === 'user-typing') {
                const diffAnalysis = analyzeContentDiff(currentContentString, lastServerSaveRef.current.content);
                diffMetrics = diffAnalysis.metrics;
                shouldUseServerSave = diffAnalysis.isSignificant;
                
                console.log(`[Autosave Diff] Analysis:`, {
                    isSignificant: diffAnalysis.isSignificant,
                    metrics: diffMetrics,
                    changesSinceLastSave: lastServerSaveRef.current.changesSinceLastSave
                });
            }

            console.log(`[Autosave Timer] Executing ${shouldUseServerSave ? 'SERVER' : 'LOCAL'} save after ${delay}ms delay. Batch context:`, autosaveBatchContext);

            if (!shouldUseServerSave) {
                // --- LOCAL SAVE PATH (leverages existing content preparation) ---
                const saveSuccess = await saveToLocalStorage(currentContentString);
                if (saveSuccess) {
                    lastServerSaveRef.current.changesSinceLastSave += 1;
                    console.log(`[Local Save] Completed. Total local changes: ${lastServerSaveRef.current.changesSinceLastSave}`);
                }
                return; // Exit early for local saves
            }

            // --- SERVER SAVE PATH (existing logic preserved) ---
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
                
                // --- ADDED: Update server save tracking after successful save ---
                lastServerSaveRef.current = {
                    content: currentContentString,
                    timestamp: Date.now(),
                    changesSinceLastSave: 0,
                };
                
                console.log(`[Autosave Timer] Server save completed successfully. Changes in batch: ${autosaveBatchContext.batchChangesCount}${diffMetrics ? `, Diff: +${diffMetrics.charDelta} chars, +${diffMetrics.wordDelta} words` : ''}`);
                setAutosaveStatus('saved');
                
                // Reset batch context after successful save (unless still in AI batch)
                if (!autosaveBatchContext.isInBatch) {
                    setAutosaveBatchContext(prev => ({
                        ...prev,
                        batchChangesCount: 0,
                        batchStartTime: null,
                        lastChangeTime: null,
                    }));
                }
                
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
        }, delay);
        setAutosaveTimerId(newTimerId);
    }, [documentId, autosaveTimerId, revertStatusTimerId, setEditorRef, autosaveBatchContext, getAutosaveDelay]);

    // Effect to set editorRef object in the global store - Reinstated and Corrected
    useEffect(() => {
        // editorRef is the object from useRef(), which is stable across renders.
        // We set this object into the store so other components can access it.
        console.log('[EditorPage useEffect] Setting editorRef in store. editorRef object:', editorRef);
        setEditorRef(editorRef as React.RefObject<BlockNoteEditor<any> | null>);
        setBlockStatusFunction(setBlockStatus); // Register setBlockStatus function
        
        // Cleanup to nullify the ref in store when EditorPage unmounts
        return () => {
            console.log('[EditorPage useEffect Cleanup] Setting editorRef in store to null.');
            setEditorRef(null);
            setBlockStatusFunction(null); // Clear setBlockStatus function
        };
    }, [setEditorRef, setBlockStatusFunction]); // Dependency on setEditorRef ensures it runs if the store setter changes, editorRef object itself is stable.

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
        console.log('[EditorPage handleKeyDown] Conditions: isChatLoading:', isAiLoading, 'isUploading:', isUploading);
        console.log('[EditorPage handleKeyDown] Input content:', input.trim(), 'Uploaded image:', uploadedImagePath);

        if (event.key === 'Enter' && !event.shiftKey && !isAiLoading && !isUploading) {
            console.log('[EditorPage handleKeyDown] Enter pressed without Shift, not loading/uploading.');
            event.preventDefault();
            if (input.trim() || uploadedImagePath) {
                console.log('[EditorPage handleKeyDown] Valid input found. Calling handleSubmit from useChatInteractions.');
                sendMessage(); // Call the hook's sendMessage directly
            } else {
                toast.info("Please type a message or attach an image.");
                console.log('[EditorPage handleKeyDown] No input or image to submit.');
            }
        }
    }, [isAiLoading, isUploading, input, uploadedImagePath, sendMessage]); // Updated dependency

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

    // Helper function to handle validation results
    const handleValidationResult = (validation: BlockValidationResult, operation: string): boolean => {
        if (!validation.isValid) {
            console.error(`[${operation}] Validation failed:`, validation.errorMessage);
            toast.error(`${operation} failed: ${validation.errorMessage}`);
            return false;
        }

        if (validation.warnings && validation.warnings.length > 0) {
            validation.warnings.forEach(warning => {
                console.warn(`[${operation}] Warning:`, warning);
                
                // Show console warning only for cursor position fallback, not as toast
                if (warning.includes('No target specified, using cursor position')) {
                    // Already logged to console above, skip toast
                    return;
                }
                
                toast.warning(warning);
            });
        }

        return true;
    };

    // Define execute* functions (not wrapped in useCallback as they are called within useEffect)
    const executeAddContent = async (args: any) => {
        console.log('[addContent] EXECUTION STARTED - args:', args);
        console.log('[addContent] Current editor document length:', editorRef.current?.document?.length);
        
        // Start AI tools batch if not already started
        if (!autosaveBatchContext.isInBatch) {
            startAIToolsBatch();
        }
        
        const editor = editorRef.current;
        if (!editor) { 
            console.log('[addContent] Editor not available');
            toast.error('Editor not available to add content.'); 
            return; 
        }
        
        try {
            const { markdownContent, targetBlockId } = args;
            console.log('[addContent] Processing content:', markdownContent, 'target:', targetBlockId);
            
            if (typeof markdownContent !== 'string') { 
                toast.error("Invalid content provided for addContent."); 
                return; 
            }

            // Handle multiple insertion points if targetBlockId is an array
            const targetBlockIds = Array.isArray(targetBlockId) ? targetBlockId : [targetBlockId];
            const results: {
                success: Array<{ targetId: string; insertedCount: number; referenceId?: string }>;
                failed: Array<{ targetId: string; reason: string }>;
                totalInserted: number;
            } = { success: [], failed: [], totalInserted: 0 };
            
            // Parse markdown content once for reuse
            let blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(markdownContent);
            if (blocksToInsert.length === 0 && markdownContent.trim() !== '') {
                blocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: markdownContent, styles: {} }] } as PartialBlock<typeof schema.blockSchema>);
            } else if (blocksToInsert.length === 0) {
                toast.error("No content to insert.");
                return;
            }
            
            // Process each target block ID
            for (let i = 0; i < targetBlockIds.length; i++) {
                const currentTargetId = targetBlockIds[i];
                
                try {
                    // Enhanced validation and safety using new utilities for each target
                    const safetyPlan = createSafeOperationPlan(editor, {
                        type: 'add',
                        content: markdownContent,
                        referenceBlockId: currentTargetId
                    });
                    
                    if (!safetyPlan.isValid) {
                        const errorReport = generateSafetyErrorReport('addContent', safetyPlan, { ...args, targetBlockId: currentTargetId });
                        console.error(errorReport);
                        results.failed.push({ targetId: currentTargetId, reason: safetyPlan.errorMessage || 'Safety validation failed' });
                        continue;
                    }

                    // Log safety information
                    if (safetyPlan.fallbackUsed) {
                        console.info(`[addContent] Using fallback for target ${currentTargetId}: ${safetyPlan.fallbackReason}`);
                    }
                    
                    if (!handleValidationResult(safetyPlan, 'addContent')) {
                        results.failed.push({ targetId: currentTargetId, reason: 'Validation failed' });
                        continue;
                    }
                    
                    // Use the safely resolved reference block from the safety plan
                    const resolvedReferenceId = safetyPlan.operationPlan?.resolvedReference || currentTargetId;
                    let referenceBlock: Block | PartialBlock | undefined | null = resolvedReferenceId ? editor.getBlock(resolvedReferenceId) : editor.getTextCursorPosition().block;
                    let placement: 'before' | 'after' = 'after';
                    
                    if (!referenceBlock) {
                        referenceBlock = editor.document[editor.document.length - 1];
                        placement = 'after';
                        if (!referenceBlock) {
                            // Only for first target, replace document
                            if (i === 0) {
                                const replacedBlocks = editor.replaceBlocks(editor.document, blocksToInsert);
                                
                                // Set highlighting status for replaced blocks
                                if (Array.isArray(replacedBlocks)) {
                                    replacedBlocks.forEach(block => {
                                        if (block?.id) {
                                            console.log('[DEBUG] Setting block status for block:', block.id);
                                            setBlockStatus(block.id, BlockStatus.MODIFIED, 'insert');
                                        }
                                    });
                                }
                                
                                results.success.push({ targetId: 'document-root', insertedCount: blocksToInsert.length });
                                results.totalInserted += blocksToInsert.length;
                            } else {
                                results.failed.push({ targetId: currentTargetId, reason: 'Empty document, content already inserted' });
                            }
                            continue;
                        }
                    }
                    
                    if (referenceBlock && referenceBlock.id) {
                        // Insert blocks and get their IDs for highlighting
                        const insertedBlocks = editor.insertBlocks(blocksToInsert, referenceBlock.id, placement);
                        
                        // Set highlighting status for newly inserted blocks
                        if (Array.isArray(insertedBlocks)) {
                            insertedBlocks.forEach(block => {
                                if (block?.id) {
                                    console.log('[DEBUG] Setting block status for inserted block:', block.id);
                                    setBlockStatus(block.id, BlockStatus.MODIFIED, 'insert');
                                }
                            });
                        }
                        
                        results.success.push({ targetId: currentTargetId, insertedCount: blocksToInsert.length, referenceId: referenceBlock.id });
                        results.totalInserted += blocksToInsert.length;
                    } else {
                        results.failed.push({ targetId: currentTargetId, reason: 'Could not find reference block' });
                    }
                    
                } catch (error: any) {
                    console.error(`Failed to insert content at target ${currentTargetId}:`, error);
                    results.failed.push({ targetId: currentTargetId, reason: error.message });
                }
            }
            
            // Provide feedback based on results using batched toast system
            if (results.failed.length === 0) {
                // Use batched toast for successful insertions
                const insertedBlockIds = results.success.flatMap(s => 
                    Array.from({ length: s.insertedCount }, (_, idx) => s.referenceId)
                ).filter((id): id is string => Boolean(id));
                
                const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
                createBatchedToolToast(
                    'addContent',
                    'success',
                    'insert',
                    insertedBlockIds
                );
                handleEditorChange(editor);
            } else if (results.success.length === 0) {
                // Use batched toast for failures
                const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
                createBatchedToolToast(
                    'addContent',
                    'error',
                    'error',
                    results.failed.map(f => f.targetId)
                );
            } else {
                // Partial success - use batched toast for successful insertions
                const insertedBlockIds = results.success.flatMap(s => 
                    Array.from({ length: s.insertedCount }, (_, idx) => s.referenceId)
                ).filter((id): id is string => Boolean(id));
                
                const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
                createBatchedToolToast(
                    'addContent',
                    'success',
                    'insert',
                    insertedBlockIds
                );
                // Also show batched toast for failures
                createBatchedToolToast(
                    'addContent',
                    'error',
                    'error',
                    results.failed.map(f => f.targetId)
                );
                handleEditorChange(editor);
            }
            
            return { 
                status: 'forwarded to client', 
                results,
                insertedBlockIds: results.success.flatMap(s => Array.from({ length: s.insertedCount }, (_, idx) => `${s.referenceId}_${idx}`))
            };
            
        } catch (error: any) { 
            console.error('Failed to execute addContent:', error); 
            toast.error(`Error adding content: ${error.message}`); 
        }
        
        console.log('[addContent] EXECUTION COMPLETED');
    };
    const executeModifyContent = async (args: any) => {
        // Start AI tools batch if not already started
        if (!autosaveBatchContext.isInBatch) {
            startAIToolsBatch();
        }
        
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to modify content.'); return; }
        console.log('[Client Tool] executeModifyContent called with args:', args);

        const { targetBlockId, newMarkdownContent, targetText } = args; // Assuming targetText might be used, though often null for multi-block

        if (!targetBlockId || newMarkdownContent === undefined) {
          toast.error('Invalid arguments for modifyContent: targetBlockId and newMarkdownContent are required.');
          console.error('Invalid args for modifyContent:', args);
          return;
        }

        // Enhanced validation and safety using new utilities
        const safetyPlan = createSafeOperationPlan(editor, {
            type: 'modify',
            targetBlockIds: targetBlockId,
            content: newMarkdownContent
        });
        
        if (!safetyPlan.isValid) {
            const errorReport = generateSafetyErrorReport('modifyContent', safetyPlan, args);
            console.error(errorReport);
            toast.error(`modifyContent failed: ${safetyPlan.errorMessage}`);
            return;
        }

        if (!handleValidationResult(safetyPlan, 'modifyContent')) {
            return;
        }

        // Use resolved targets from safety plan
        const blockIds = safetyPlan.operationPlan?.resolvedTargets || (Array.isArray(targetBlockId) ? targetBlockId : [targetBlockId]);
        const contents = Array.isArray(newMarkdownContent) ? newMarkdownContent : [newMarkdownContent];

        if (blockIds.length !== contents.length && Array.isArray(targetBlockId) && Array.isArray(newMarkdownContent)) {
            toast.error('Mismatch between targetBlockId array length and newMarkdownContent array length.');
            console.error('executeModifyContent length mismatch:', args);
            return;
        }
        
        // Define listTypes using string literals as per standard BlockNote usage if schema access is problematic
        const listTypes = ["bulletListItem", "numberedListItem", "checkListItem"];

        // Enhanced results tracking for batch operations
        const results: {
            success: Array<{ targetId: string; blockType?: string }>;
            failed: Array<{ targetId: string; reason: string }>;
        } = { success: [], failed: [] };

        for (let i = 0; i < blockIds.length; i++) {
          const id = blockIds[i];
          const originalBlock = editor.getBlock(id);

          if (!originalBlock) {
            const errorHandler = ToolErrorHandler.getInstance();
            const errorContext = CommonErrors.targetNotFound('modifyContent', id);
            errorHandler.reportError(errorContext);
            results.failed.push({ targetId: id, reason: 'Block not found' });
            continue;
          }

          const currentMarkdown = contents[i];
          const checklistRegex = /^\*\s+\[\s*([xX]?)\s*\]\s*(.*)$/;
          const checklistMatch = currentMarkdown.match(checklistRegex);

          let blockDefinitionToUpdate: PartialBlock | undefined = undefined;

          try {
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
                const errorHandler = ToolErrorHandler.getInstance();
                const errorContext = CommonErrors.invalidContent('modifyContent', 'markdown');
                errorContext.details = `Failed to parse markdown: "${currentMarkdown}"`;
                errorContext.targetId = id;
                errorHandler.reportError(errorContext);
                results.failed.push({ targetId: id, reason: 'Markdown parsing failed' });
                continue;
              }
            }

            if (blockDefinitionToUpdate) {
              const { id: payloadId, ...finalPayload } = blockDefinitionToUpdate as PartialBlock & {id?: string};
              editor.updateBlock(id, finalPayload as PartialBlock);
              
              // Set highlighting status for modified block
              console.log('[DEBUG] Setting block status for modified block:', id);
              setBlockStatus(id, BlockStatus.MODIFIED, 'update');
              
              results.success.push({ targetId: id, blockType: blockDefinitionToUpdate.type as string });
            }
          } catch (error: any) {
            const errorHandler = ToolErrorHandler.getInstance();
            const errorContext = CommonErrors.systemError('modifyContent', error);
            errorContext.targetId = id;
            errorHandler.reportError(errorContext);
            results.failed.push({ targetId: id, reason: ErrorUtils.extractErrorMessage(error) });
          }
        }

        // Enhanced feedback using batched toast system to prevent flooding
        if (results.failed.length === 0 && results.success.length > 0) {
          // Use batched toast for successful modifications
          const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
          createBatchedToolToast(
            'modifyContent',
            'success',
            'update',
            results.success.map(r => r.targetId)
          );
          handleEditorChange(editor); 
        } else if (results.success.length === 0 && results.failed.length > 0) {
          // Use batched toast for failures
          const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
          createBatchedToolToast(
            'modifyContent',
            'error',
            'error',
            results.failed.map(r => r.targetId)
          );
          console.error(`[modifyContent] All ${results.failed.length} modification(s) failed`);
        } else if (results.success.length > 0 && results.failed.length > 0) {
          // Partial success - use batched toast for successful modifications
          const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
          createBatchedToolToast(
            'modifyContent',
            'success',
            'update',
            results.success.map(r => r.targetId)
          );
          // Also show batched toast for failures
          createBatchedToolToast(
            'modifyContent',
            'error',
            'error',
            results.failed.map(r => r.targetId)
          );
          handleEditorChange(editor);
        } else if (blockIds.length > 0) {
          toast.info("No changes applied to blocks.");
        }
    };
    const executeDeleteContent = async (args: any) => {
        // Start AI tools batch if not already started
        if (!autosaveBatchContext.isInBatch) {
            startAIToolsBatch();
        }
        
        const editor = editorRef.current;
        if (!editor) { toast.error('Editor not available to delete content.'); return; }
        try {
            const { targetBlockId, targetText } = args;
            if (!targetBlockId) { toast.error('Deletion failed: Missing target block ID(s).'); return; }
            
            // Enhanced validation and safety using new utilities
            const safetyPlan = createSafeOperationPlan(editor, {
                type: 'delete',
                targetBlockIds: targetBlockId
            });
            
            if (!safetyPlan.isValid) {
                const errorReport = generateSafetyErrorReport('deleteContent', safetyPlan, args);
                console.error(errorReport);
                toast.error(`deleteContent failed: ${safetyPlan.errorMessage}`);
                return;
            }

            if (!handleValidationResult(safetyPlan, 'deleteContent')) {
                return;
            }

            // Use resolved targets from safety plan
            const blockIdsToDelete = safetyPlan.operationPlan?.resolvedTargets || (Array.isArray(targetBlockId) ? targetBlockId : [targetBlockId]);
            
            // Enhanced results tracking for batch operations
            const results: {
                success: Array<{ targetId: string; operation: 'text_deleted' | 'block_removed' }>;
                failed: Array<{ targetId: string; reason: string }>;
            } = { success: [], failed: [] };

            if (targetText && blockIdsToDelete.length === 1) {
                // Single block text deletion
                const id = blockIdsToDelete[0];
                const targetBlock = editor.getBlock(id);
                
                if (!targetBlock) { 
                    const errorHandler = ToolErrorHandler.getInstance();
                    const errorContext = CommonErrors.targetNotFound('deleteContent', id);
                    errorHandler.reportError(errorContext);
                    return; 
                }
                
                if (!targetBlock.content || !Array.isArray(targetBlock.content)) { 
                    const errorHandler = ToolErrorHandler.getInstance();
                    const errorContext = CommonErrors.invalidContent('deleteContent', 'block content');
                    errorContext.details = `Block ${targetBlock.id} has no deletable content`;
                    errorContext.targetId = id;
                    errorHandler.reportError(errorContext);
                    return; 
                }
                
                const updatedContent = deleteTextInInlineContent(targetBlock.content, targetText);
                if (updatedContent !== null) {
                    if (editor.getBlock(targetBlock.id)) {
                        const newText = getInlineContentText(updatedContent);
                        if (!newText.trim()) { 
                            // Set delete preview status instead of removing immediately
                            setBlockStatus(targetBlock.id, BlockStatus.MODIFIED, 'delete');
                            // editor.removeBlocks([targetBlock.id]); 
                            
                            // Use enhanced toast with block navigation for block deletion
                            const { createBlockStatusToast } = await import('@/lib/utils/aiToast');
                            createBlockStatusToast(
                                [targetBlock.id],
                                'modified',
                                'delete',
                                `Block marked for removal`
                            );
                            // handleEditorChange(editor); 
                        } else { 
                            editor.updateBlock(targetBlock.id, { content: updatedContent }); 
                            
                            // Use batched toast for text deletion
                            const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
                            createBatchedToolToast(
                                'deleteContent',
                                'success',
                                'delete',
                                [targetBlock.id]
                            );
                            handleEditorChange(editor); 
                        }
                    } else { 
                        const errorHandler = ToolErrorHandler.getInstance();
                        const errorContext = CommonErrors.systemError('deleteContent', new Error(`Target block ${targetBlock.id} disappeared during operation`));
                        errorHandler.reportError(errorContext);
                    }
                } else { 
                    toast.warning(`Could not find text "${targetText}" to delete in block ${targetBlock.id}.`); 
                }
            } else {
                // Multi-block deletion
                if (targetText) { 
                    toast.warning("Cannot delete specific text across multiple blocks. Deleting blocks instead."); 
                }
                
                // Check which blocks exist
                for (const id of blockIdsToDelete) {
                    const block = editor.getBlock(id);
                    if (block) {
                        results.success.push({ targetId: id, operation: 'block_removed' });
                    } else {
                        results.failed.push({ targetId: id, reason: 'Block not found or disappeared' });
                    }
                }
                
                if (results.success.length === 0) { 
                    const errorHandler = ToolErrorHandler.getInstance();
                    const errorContext = CommonErrors.targetNotFound('deleteContent', 'all targets');
                    errorContext.details = 'All target blocks disappeared';
                    errorHandler.reportError(errorContext);
                    return; 
                }
                
                const existingBlockIds = results.success.map(r => r.targetId);
                
                // Set delete preview status for each block instead of removing immediately
                existingBlockIds.forEach(blockId => {
                    setBlockStatus(blockId, BlockStatus.MODIFIED, 'delete');
                });
                
                // Store the blocks to delete for later cleanup (commented out immediate deletion)
                // editor.removeBlocks(existingBlockIds);
                
                // Enhanced feedback with batched toast system
                if (results.failed.length === 0) {
                    // Use batched toast for successful deletions
                    const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
                    createBatchedToolToast(
                        'deleteContent',
                        'success',
                        'delete',
                        existingBlockIds
                    );
                } else {
                    // Partial success - use batched toast for successful deletions
                    const { createBatchedToolToast } = await import('@/lib/utils/aiToast');
                    createBatchedToolToast(
                        'deleteContent',
                        'success',
                        'delete',
                        existingBlockIds
                    );
                    // Also show batched toast for failures
                    createBatchedToolToast(
                        'deleteContent',
                        'error',
                        'error',
                        results.failed.map(f => f.targetId)
                    );
                    console.warn(`[deleteContent] Some blocks were missing:`, results.failed);
                }
                
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

            // Handle multiple insertion points if targetBlockId is an array
            const targetBlockIds = Array.isArray(targetBlockId) ? targetBlockId : [targetBlockId];
            const results: {
                success: Array<{ targetId: string; insertedCount: number; referenceId?: string }>;
                failed: Array<{ targetId: string; reason: string }>;
                totalInserted: number;
            } = { success: [], failed: [], totalInserted: 0 };

            // Create checklist blocks once for reuse
            const blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = items.map(itemText => ({
                type: 'checkListItem',
                props: { checked: false }, // BlockNote uses boolean false for unchecked
                content: itemText ? [{ type: 'text', text: itemText, styles: {} }] : [],
            }));

            // Process each target block ID
            for (let i = 0; i < targetBlockIds.length; i++) {
                const currentTargetId = targetBlockIds[i];
                
                try {
                    // Enhanced validation and safety using new utilities for each target
                    const safetyPlan = createSafeOperationPlan(editor, {
                        type: 'createChecklist',
                        content: items,
                        referenceBlockId: currentTargetId
                    });
                    
                    if (!safetyPlan.isValid) {
                        const errorReport = generateSafetyErrorReport('createChecklist', safetyPlan, { ...args, targetBlockId: currentTargetId });
                        console.error(errorReport);
                        results.failed.push({ targetId: currentTargetId, reason: safetyPlan.errorMessage || 'Safety validation failed' });
                        continue;
                    }

                    // Log safety information
                    if (safetyPlan.fallbackUsed) {
                        console.info(`[createChecklist] Using fallback for target ${currentTargetId}: ${safetyPlan.fallbackReason}`);
                    }

                    if (!handleValidationResult(safetyPlan, 'createChecklist')) {
                        results.failed.push({ targetId: currentTargetId, reason: 'Validation failed' });
                        continue;
                    }

                    // Use the safely resolved reference block from the safety plan
                    const resolvedReferenceId = safetyPlan.operationPlan?.resolvedReference || currentTargetId;
                    let referenceBlock: Block | PartialBlock | undefined | null = resolvedReferenceId ? editor.getBlock(resolvedReferenceId) : editor.getTextCursorPosition().block;
                    let placement: 'before' | 'after' = 'after';

                    if (!referenceBlock) {
                        const lastBlock = editor.document[editor.document.length - 1];
                        if (lastBlock) {
                            referenceBlock = lastBlock;
                            placement = 'after';
                        } else {
                            // Only for first target, replace document
                            if (i === 0) {
                                const replacedBlocks = editor.replaceBlocks(editor.document, blocksToInsert);
                                
                                // Set highlighting status for replaced blocks
                                if (Array.isArray(replacedBlocks)) {
                                    replacedBlocks.forEach(block => {
                                        if (block?.id) {
                                            setBlockStatus(block.id, BlockStatus.MODIFIED, 'insert');
                                        }
                                    });
                                }
                                
                                results.success.push({ targetId: 'document-root', insertedCount: blocksToInsert.length });
                                results.totalInserted += blocksToInsert.length;
                            } else {
                                results.failed.push({ targetId: currentTargetId, reason: 'Empty document, checklist already inserted' });
                            }
                            continue;
                        }
                    }
                    
                    // Ensure the reference block still exists if it was fetched by ID
                    if (currentTargetId && !editor.getBlock(currentTargetId)) {
                        console.warn(`Reference block ${currentTargetId} not found or disappeared.`);
                        // Fallback: try inserting at the end or current cursor
                        const currentPosBlock = editor.getTextCursorPosition().block;
                        if (currentPosBlock && currentPosBlock.id) {
                            referenceBlock = currentPosBlock;
                        } else {
                            const lastDocBlock = editor.document[editor.document.length - 1];
                            if (lastDocBlock && lastDocBlock.id) {
                                referenceBlock = lastDocBlock;
                            } else {
                                results.failed.push({ targetId: currentTargetId, reason: 'No valid reference block found' });
                                continue;
                            }
                        }
                    }

                    if (referenceBlock && referenceBlock.id) {
                        const insertedBlocks = editor.insertBlocks(blocksToInsert, referenceBlock.id, placement);
                        
                        // Set highlighting status for newly inserted checklist blocks
                        if (Array.isArray(insertedBlocks)) {
                            insertedBlocks.forEach(block => {
                                if (block?.id) {
                                    console.log('[DEBUG] Setting block status for checklist block:', block.id);
                                    setBlockStatus(block.id, BlockStatus.MODIFIED, 'insert');
                                }
                            });
                        }
                        
                        results.success.push({ targetId: currentTargetId, insertedCount: blocksToInsert.length, referenceId: referenceBlock.id });
                        results.totalInserted += blocksToInsert.length;
                    } else {
                        results.failed.push({ targetId: currentTargetId, reason: 'Could not find reference block' });
                    }

                } catch (error: any) {
                    console.error(`Failed to insert checklist at target ${currentTargetId}:`, error);
                    results.failed.push({ targetId: currentTargetId, reason: error.message });
                }
            }

            // Provide feedback based on results
            if (results.failed.length === 0) {
                toast.success(`Checklist created at ${results.success.length} location(s). Total items inserted: ${results.totalInserted}`);
                handleEditorChange(editor);
            } else if (results.success.length === 0) {
                toast.error(`Failed to create checklist at any of the ${targetBlockIds.length} target location(s).`);
            } else {
                toast.warning(`Partial success: Checklist created at ${results.success.length} location(s), failed at ${results.failed.length} location(s).`);
                handleEditorChange(editor);
            }

            return { 
                status: 'forwarded to client', 
                results,
                insertedBlockIds: results.success.flatMap(s => Array.from({ length: s.insertedCount }, (_, idx) => `${s.referenceId}_checklist_${idx}`))
            };

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

            // Enhanced validation and safety using new utilities
            const safetyPlan = createSafeOperationPlan(editor, {
                type: 'modifyTable',
                targetBlockIds: [tableBlockId],
                content: newTableMarkdown
            });
            
            if (!safetyPlan.isValid) {
                const errorReport = generateSafetyErrorReport('modifyTable', safetyPlan, args);
                console.error(errorReport);
                toast.error(`modifyTable failed: ${safetyPlan.errorMessage}`);
                return;
            }

            if (!handleValidationResult(safetyPlan, 'modifyTable')) {
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
            const replacedBlocks = editor.replaceBlocks([tableBlockId], newBlocks);
            
            // Set highlighting status for modified table blocks
            if (Array.isArray(replacedBlocks)) {
                replacedBlocks.forEach(block => {
                    if (block?.id) {
                        console.log('[DEBUG] Setting block status for table block:', block.id);
                        setBlockStatus(block.id, BlockStatus.MODIFIED, 'update');
                    }
                });
            }
            
            toast.success(`Table block ${tableBlockId} updated.`);
            handleEditorChange(editor); // Trigger state update and autosave

        } catch (error: any) {
            console.error('Error processing modifyTable tool call:', error);
            toast.error(`Failed to modify table: ${error.message}`);
        }
    };

    const executeReplaceAllContent = async (args: any) => {
        console.log('[ServerSide-ClientTool][replaceAllContent] EXECUTION STARTED - args:', args);
        
        // Start AI tools batch if not already started
        if (!autosaveBatchContext.isInBatch) {
            startAIToolsBatch();
        }
        
        const editor = editorRef.current;
        if (!editor) { 
            console.log('[ServerSide-ClientTool][replaceAllContent] Editor not available');
            toast.error('Editor not available to replace content.'); 
            return; 
        }
        
        try {
            const { newMarkdownContent, requireConfirmation = true } = args;
            console.log('[ServerSide-ClientTool][replaceAllContent] Processing content:', { 
                contentLength: newMarkdownContent?.length,
                requireConfirmation 
            });
            
            if (typeof newMarkdownContent !== 'string') { 
                toast.error("Invalid content provided for replaceAllContent."); 
                return; 
            }

            // If confirmation is required, show confirmation modal
            if (requireConfirmation) {
                console.log('[ServerSide-ClientTool][replaceAllContent] Showing confirmation modal');
                setDocumentReplacementConfirmation({
                    isOpen: true,
                    args: { newMarkdownContent, requireConfirmation: false }, // Disable nested confirmation
                    isProcessing: false
                });
                return; // Exit early, will be resumed after confirmation
            }
            
            // Get existing blocks for metadata and snapshot
            const previousBlocks = editor.document;
            const previousBlockIds = previousBlocks.map(block => block.id);
            console.log(`[ServerSide-ClientTool][replaceAllContent] Replacing ${previousBlockIds.length} blocks`);
            
            // Parse the new markdown content
            let blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(newMarkdownContent);
            if (blocksToInsert.length === 0 && newMarkdownContent.trim() !== '') {
                blocksToInsert.push({ 
                    type: 'paragraph', 
                    content: [{ type: 'text', text: newMarkdownContent, styles: {} }] 
                } as PartialBlock<typeof schema.blockSchema>);
            } else if (blocksToInsert.length === 0) {
                toast.error("No content to replace with.");
                return;
            }
            
             // Replace all document content using explicit transaction grouping
             // This ensures the entire replacement operation is grouped as a single undo/redo operation
             const insertedBlocks = editor.transact(() => {
                 console.log('[ServerSide-ClientTool][replaceAllContent] Starting transaction for document replacement');
                 const result = editor.replaceBlocks(editor.document, blocksToInsert);
                 console.log('[ServerSide-ClientTool][replaceAllContent] Document replacement completed within transaction');
                 return result;
             });
             
             // Set highlighting status for newly inserted blocks
             if (Array.isArray(insertedBlocks)) {
                 insertedBlocks.forEach(block => {
                     if (block?.id) {
                         console.log('[ServerSide-ClientTool][replaceAllContent] Setting block status for replaced block:', block.id);
                         setBlockStatus(block.id, BlockStatus.MODIFIED, 'insert');
                     }
                 });
             }
             
             // Use the enhanced toast system from the codebase
             const { createBlockStatusToast } = await import('@/lib/utils/aiToast');
             
             // Create enhanced toast with Undo functionality by extending the createBlockStatusToast function
             const insertedBlockIds = Array.isArray(insertedBlocks) ? insertedBlocks.map(block => block.id) : [];
             console.log(`[ServerSide-ClientTool][replaceAllContent] Successfully replaced ${previousBlockIds.length} blocks with ${insertedBlockIds.length} new blocks`);
             
             // Use the standard attached toast system with undo functionality
             const { aiToast } = await import('@/lib/utils/aiToast');
             
             // Create a styled success toast with affected block IDs to force it into AttachedToastContainer
             // and add undo functionality through a custom message
             const undoToastMessage = `Document replaced (${insertedBlockIds.length} blocks) - Press Ctrl+Z to undo`;
             const toastId = aiToast.success(undoToastMessage, {
                 affectedBlockIds: insertedBlockIds.length > 0 ? insertedBlockIds : ['document-root'], // Use actual block IDs or fallback to force attached container
                 id: 'document-replacement-undo',
                 duration: 10000, // Longer duration for destructive actions
                 action: 'insert',
                 onScrollToChange: (blockId: string) => {
                     // Optional: scroll to the first replaced block
                     const blockElement = document.querySelector(`[data-id="${blockId}"]`);
                     if (blockElement) {
                         blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     }
                 }
             });
             
             console.log('[ServerSide-ClientTool][replaceAllContent] Enhanced attached toast created with keyboard undo hint');
             
             handleEditorChange(editor);
             
             return { 
                 status: 'forwarded to client', 
                 replacedBlockIds: previousBlockIds,
                 insertedBlockIds: insertedBlockIds,
                 blockCount: insertedBlockIds.length
             };
            
        } catch (error: any) { 
            console.error('[ServerSide-ClientTool][replaceAllContent] Failed to execute replaceAllContent:', error); 
            toast.error(`Error replacing content: ${error.message}`); 
        }
        
        console.log('[ServerSide-ClientTool][replaceAllContent] EXECUTION COMPLETED');
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
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.parts && lastMessage.parts.length > 0) {
            const toolInvocationParts = lastMessage.parts.filter(
              (part): part is { type: 'tool-invocation'; toolInvocation: ToolInvocation & { state?: string } } => // Add state to type
                part.type === 'tool-invocation' && part.toolInvocation != null
            );

            const callsToProcessThisRun: Array<ToolInvocation & { state?: string }> = [];
            const idsToMarkAsProcessed = new Set(processedToolCallIds);

            for (const part of toolInvocationParts) {
                const toolCall = part.toolInvocation;
                const toolCallId = toolCall.toolCallId;
                
                // Check if this tool call already has a result message in the current messages
                const hasResultMessage = messages.some(msg => {
                    const msgAny = msg as any;
                    return msgAny.role === 'tool' && msgAny.tool_call_id === toolCallId;
                });
                
                // Enhanced completion check: state='result' OR result message exists OR already processed
                if (toolCall.state === 'result' || hasResultMessage || processedToolCallIds.has(toolCallId)) {
                    console.log(`[ToolProcessing] Tool call ${toolCallId} already completed (state: ${toolCall.state}, hasResult: ${hasResultMessage}, processed: ${processedToolCallIds.has(toolCallId)})`);
                    idsToMarkAsProcessed.add(toolCallId); // Ensure it's considered processed
                    continue; // Don't re-process
                }

                // Only add for processing if none of the completion conditions are met
                console.log(`[ToolProcessing] Adding tool call ${toolCallId} for processing`);
                callsToProcessThisRun.push(toolCall);
            }

            if (callsToProcessThisRun.length > 0) {
                // Filter out server-side tools - they are handled by the backend and don't need frontend processing
                const serverSideTools = ['webSearch', 'searchAndTagDocumentsTool'];
                const clientSideCallsToProcess = callsToProcessThisRun.filter(toolCall => 
                    !serverSideTools.includes(toolCall.toolName)
                );

                // Mark server-side tools as processed without executing them
                callsToProcessThisRun.forEach(toolCall => {
                    if (serverSideTools.includes(toolCall.toolName)) {
                        console.log(`[ToolProcessing] Skipping server-side tool: ${toolCall.toolName} (ID: ${toolCall.toolCallId})`);
                        idsToMarkAsProcessed.add(toolCall.toolCallId);
                    }
                });

                clientSideCallsToProcess.forEach(async (toolCall) => {
                    // Add to idsToMarkAsProcessed immediately before attempting execution within this run.
                    // This set (idsToMarkAsProcessed) will be used to update the main processedToolCallIds state later.
                    idsToMarkAsProcessed.add(toolCall.toolCallId); 
                    const { toolName, args } = toolCall;
                    const editorTargetingTools = ['addContent', 'modifyContent', 'deleteContent', 'modifyTable', 'createChecklist', 'replaceAllContent']; // Added createChecklist and replaceAllContent

                    // ADDED: Set initial AI tool state when tool call is detected
                    setOperationStates({
                        aiToolState: AIToolState.DETECTED,
                        currentToolCallId: toolCall.toolCallId,
                        currentOperationDescription: `AI requests: ${toolName}`
                    });

                    if (isMobile && mobileVisiblePane === 'chat' && editorTargetingTools.includes(toolName)) {
                        console.log(`[ToolProcessing] Mobile view, chat visible. Queuing ${toolName} (ID: ${toolCall.toolCallId}) and switching to editor.`);
                        setPendingMobileEditorToolCall({ toolName, args, toolCallId: toolCall.toolCallId });
                        setMobileVisiblePane('editor');
                    } else {
                        console.log(`[ToolProcessing] Executing ${toolName} (ID: ${toolCall.toolCallId}) immediately.`);
                        
                        // ADDED: Set executing state before tool execution
                        setOperationStates({
                            aiToolState: AIToolState.EXECUTING,
                            currentOperationDescription: `Executing: ${toolName} with input: ${JSON.stringify(args).substring(0, 100)}...`
                        });

                        try {
                            switch (toolName) {
                                case 'addContent': 
                                    await executeAddContent(args);
                                    // ADDED: Set awaiting result state before addToolResult
                                    setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
                                    addToolResult({ toolCallId: toolCall.toolCallId, result: { status: 'forwarded to client' } });
                                    break;
                                case 'modifyContent': 
                                    await executeModifyContent(args);
                                    // ADDED: Set awaiting result state before addToolResult
                                    setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
                                    addToolResult({ toolCallId: toolCall.toolCallId, result: { status: 'forwarded to client' } });
                                    break;
                                case 'deleteContent': 
                                    await executeDeleteContent(args);
                                    // ADDED: Set awaiting result state before addToolResult
                                    setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
                                    addToolResult({ toolCallId: toolCall.toolCallId, result: { status: 'forwarded to client' } });
                                    break;
                                case 'modifyTable': 
                                    await executeModifyTable(args);
                                    // ADDED: Set awaiting result state before addToolResult
                                    setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
                                    addToolResult({ toolCallId: toolCall.toolCallId, result: { status: 'forwarded to client' } });
                                    break;
                                case 'createChecklist': 
                                    await executeCreateChecklist(args);
                                    // ADDED: Set awaiting result state before addToolResult
                                    setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
                                    addToolResult({ toolCallId: toolCall.toolCallId, result: { status: 'forwarded to client' } });
                                    break;
                                case 'replaceAllContent': 
                                    await executeReplaceAllContent(args);
                                    // ADDED: Set awaiting result state before addToolResult
                                    setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
                                    addToolResult({ toolCallId: toolCall.toolCallId, result: { status: 'forwarded to client' } });
                                    break;
                                case 'request_editor_content': setIncludeEditorContent(true); toast.info('AI context requested.'); break;
                                default: 
                                    console.error(`Unknown tool: ${toolName}`); 
                                    toast.error(`Unknown tool: ${toolName}`);
                                    // ADDED: Reset state on unknown tool
                                    resetChatOperationState();
                            }
                        } catch (toolError: any) {
                            console.error(`Tool ${toolName} error:`, toolError);
                            toast.error(`Tool error: ${toolError.message}`);
                            // ADDED: Reset state on tool execution error
                            resetChatOperationState();
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
        messages, 
        processedToolCallIds, 
        executeAddContent, 
        executeModifyContent, 
        executeDeleteContent, 
        executeModifyTable, 
        executeCreateChecklist, 
        executeReplaceAllContent, // <-- ADDED to dependency array
        isMobile, 
        mobileVisiblePane,
        setPendingMobileEditorToolCall,
        setMobileVisiblePane,
        setIncludeEditorContent,
        addToolResult, // Added for completing client-side tool calls
        setOperationStates, // ADDED
        setAIToolState, // ADDED
        resetChatOperationState, // ADDED
    ]);

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
                case 'replaceAllContent': executeReplaceAllContent(args); break; // <-- ADDED CASE
                default:
                    console.warn("[Mobile Editor] Unknown tool name:", toolName);
                    toast.error(`Unknown tool: ${toolName}`);
            }
            
            // Clear the pending tool call
            setPendingMobileEditorToolCall(null);
        }
    }, [mobileVisiblePane, pendingMobileEditorToolCall, executeAddContent, executeModifyContent, executeDeleteContent, executeModifyTable, executeCreateChecklist, executeReplaceAllContent]); // <-- ADDED to dependency array

    // --- NEW: Event listener for Gemini tool execution ---
    useEffect(() => {
        const handleGeminiToolExecution = (event: CustomEvent) => {
            console.log('[EditorPage] ❌ UNEXPECTED: Gemini tool execution event received for GPT model:', event.detail);
            console.log('[EditorPage] This should NOT happen with GPT models! This may be the source of duplicate executions.');
            
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
                        
                    case 'replaceAllContent':
                        if (isMobile && mobileVisiblePane !== 'editor') {
                            setPendingMobileEditorToolCall({ 
                                toolName: action, 
                                args: params, 
                                toolCallId: `gemini-${Date.now()}` 
                            });
                            setMobileVisiblePane('editor');
                            toast.info("Switching to editor to apply changes...");
                        } else {
                            executeReplaceAllContent(params);
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

    // --- NEW: Event listener for confirmed block deletion after preview ---
    useEffect(() => {
        const handleBlockDeleteConfirmed = (event: CustomEvent) => {
            const { blockId } = event.detail;
            const editor = editorRef.current;
            
            if (editor && blockId) {
                console.log(`[EditorPage] Confirming deletion of block ${blockId} after preview`);
                const blockExists = editor.getBlock(blockId);
                if (blockExists) {
                    editor.removeBlocks([blockId]);
                    handleEditorChange(editor);
                    console.log(`[EditorPage] Successfully removed block ${blockId}`);
                } else {
                    console.warn(`[EditorPage] Block ${blockId} not found for deletion`);
                }
            }
        };
        
        // Add event listener
        document.addEventListener('block-delete-confirmed', handleBlockDeleteConfirmed as EventListener);
        
        // Cleanup
        return () => {
            document.removeEventListener('block-delete-confirmed', handleBlockDeleteConfirmed as EventListener);
        };
    }, [handleEditorChange]);

    useEffect(() => { /* Effect for beforeunload */
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            // --- ADDED: Promote any local saves to server before leaving ---
            const hasLocalSave = localStorage.getItem(`tuon-editor-draft-${documentId}`);
            if (hasLocalSave && documentId) {
                console.log('[BeforeUnload] Local save detected, promoting to server...');
                try {
                    const { content } = JSON.parse(hasLocalSave);
                    const payload = JSON.stringify({ content });
                    const url = `/api/documents/${documentId}/content`;
                    
                    if (navigator.sendBeacon) {
                        const blob = new Blob([payload], { type: 'application/json' });
                        const sent = navigator.sendBeacon(url, blob);
                        console.log('[BeforeUnload] Local save promotion via beacon:', sent ? 'Success' : 'Failed');
                        if (sent) {
                            localStorage.removeItem(`tuon-editor-draft-${documentId}`);
                        }
                    } else {
                        fetch(url, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: payload,
                            keepalive: true,
                        }).then(() => {
                            localStorage.removeItem(`tuon-editor-draft-${documentId}`);
                        }).catch(err => console.error('[BeforeUnload] Local save promotion failed:', err));
                    }
                } catch (error) {
                    console.error('[BeforeUnload] Failed to promote local save:', error);
                }
            }
            
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
        if (isLeavingEditor) {
            // --- ADDED: Promote local saves to server on navigation ---
            promoteLocalSaveToServer().then(promoted => {
                if (promoted) {
                    console.log('[Navigation] Local save promoted to server');
                }
            }).catch(err => console.error('[Navigation] Failed to promote local save:', err));
            
            if (autosaveStatus === 'unsaved' || autosaveTimerId) {
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
        }
        if (pathname) {
           previousPathnameRef.current = pathname;
        }
    }, [pathname, autosaveStatus, autosaveTimerId, revertStatusTimerId, documentId, triggerSaveDocument, promoteLocalSaveToServer]);

    useEffect(() => { /* Effect for unmount cleanup */
        return () => {
            if (autosaveTimerId) clearTimeout(autosaveTimerId);
            if (revertStatusTimerId) clearTimeout(revertStatusTimerId);
        };
    }, [autosaveTimerId, revertStatusTimerId]);

    useEffect(() => { /* Effect for scrolling chat */
         scrollToBottom(); 
    }, [messages, scrollToBottom]);

    // --- ADDED: Effect to automatically end AI tools batch when processing is complete ---
    useEffect(() => {
        // Check if we should end the AI tools batch
        if (autosaveBatchContext.isInBatch && autosaveBatchContext.batchType === 'ai-tools') {
            // End batch if:
            // 1. Not processing client tools anymore
            // 2. AI is not loading
            // 3. Some time has passed since batch started (to allow tools to finish)
            const batchAge = Date.now() - (autosaveBatchContext.batchStartTime || Date.now());
            const minBatchDuration = 1000; // Minimum 1 second
            
            if (!isProcessingClientTools && !isAiLoading && batchAge > minBatchDuration) {
                console.log('[AutoSave Batch] Ending AI tools batch - processing complete');
                endAIToolsBatch();
                
                // Trigger a save with the shorter delay after batch ends
                if (autosaveTimerId) {
                    clearTimeout(autosaveTimerId);
                    const editor = editorRef.current;
                    if (editor && documentId && latestEditorContentRef.current) {
                        const delay = getAutosaveDelay({ ...autosaveBatchContext, isInBatch: false });
                        console.log(`[AutoSave Batch] Scheduling final save with ${delay}ms delay`);
                        
                        const newTimerId = setTimeout(async () => {
                            console.log('[AutoSave Batch] Executing final batch save');
                            setAutosaveStatus('saving');
                            
                            let markdownContent: string | null = null;
                                                         if (latestEditorBlocksRef.current && latestEditorBlocksRef.current.length > 0) {
                                 try {
                                     markdownContent = await editor.blocksToMarkdownLossy(latestEditorBlocksRef.current);
                                     markdownContent = markdownContent?.trim() || null;
                                 } catch (markdownError) {
                                     console.error("[Final Batch Save] Error generating markdown:", markdownError);
                                 }
                             }
                            
                                                         let jsonContent: Block[] | null = null;
                             try {
                                 if (!latestEditorContentRef.current) {
                                     console.warn("[Final Batch Save] No content to save");
                                     setAutosaveStatus('error');
                                     return;
                                 }
                                 jsonContent = JSON.parse(latestEditorContentRef.current);
                             } catch (parseError) {
                                 console.error("[Final Batch Save] Failed to parse content string:", parseError);
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
                                    throw new Error(errData.error?.message || `Final batch save failed (${response.status})`);
                                }
                                
                                console.log(`[Final Batch Save] Completed successfully after AI batch. Total changes: ${autosaveBatchContext.batchChangesCount}`);
                                setAutosaveStatus('saved');
                                
                                // Reset batch context completely
                                setAutosaveBatchContext({
                                    isInBatch: false,
                                    batchType: 'user-typing',
                                    batchStartTime: null,
                                    batchChangesCount: 0,
                                    lastChangeTime: null,
                                });
                                
                                const revertTimer = setTimeout(() => {
                                    setAutosaveStatus(status => status === 'saved' ? 'idle' : status);
                                    setRevertStatusTimerId(null);
                                }, 2000);
                                setRevertStatusTimerId(revertTimer);
                            } catch (saveError: any) {
                                console.error("[Final Batch Save] Failed:", saveError);
                                toast.error(`Final batch save failed: ${saveError.message}`);
                                setAutosaveStatus('error');
                            }
                        }, delay);
                        setAutosaveTimerId(newTimerId);
                    }
                }
            }
        }
    }, [isProcessingClientTools, isAiLoading, autosaveBatchContext, endAIToolsBatch, autosaveTimerId, getAutosaveDelay, documentId]);
    
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
        if (!editor) {
            if (isMobile && mobileVisiblePane === 'chat') {
                console.log('[handleSendToEditor] Mobile chat view, editor not ready. Stashing content.');
                setPendingContentForEditor(content);
                setMobileVisiblePane('editor'); // Switch to editor view
            } else {
                console.error("Editor not available and not in mobile chat view. Cannot send content.");
                toast.error("Editor is not ready. Please try again.");
            }
            return;
        }

        try {
            let blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(content);
             if (blocksToInsert.length === 0 && content.trim() !== '') {
                 blocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: content, styles: {} }] } as PartialBlock<typeof schema.blockSchema>);
             }
            else if (blocksToInsert.length === 0) return;
            const { block: currentBlock } = editor.getTextCursorPosition();
            let referenceBlockId: string | undefined = currentBlock?.id;
            if (!referenceBlockId) { referenceBlockId = editor.document[editor.document.length - 1]?.id; }
            let insertedBlocks: any = [];
            if (referenceBlockId) { 
                insertedBlocks = editor.insertBlocks(blocksToInsert, referenceBlockId, 'after'); 
            }
            else { 
                insertedBlocks = editor.replaceBlocks(editor.document, blocksToInsert); 
            }
            
            // Trigger highlighting for manually added content
            if (Array.isArray(insertedBlocks)) {
                insertedBlocks.forEach((block: any) => {
                    if (block?.id) {
                        setBlockStatus(block.id, BlockStatus.MODIFIED, 'insert');
                    }
                });
            }
            
            // Use enhanced toast with block navigation
            if (Array.isArray(insertedBlocks) && insertedBlocks.length > 0) {
                const insertedBlockIds = insertedBlocks
                    .map((block: any) => block?.id)
                    .filter((id): id is string => Boolean(id));
                
                if (insertedBlockIds.length > 0) {
                    const { createBlockStatusToast } = await import('@/lib/utils/aiToast');
                    createBlockStatusToast(
                        insertedBlockIds,
                        'modified',
                        'insert',
                        `Content added to editor (${insertedBlockIds.length} block${insertedBlockIds.length > 1 ? 's' : ''})`
                    );
                } else {
                    toast.success('Content successfully added to editor.');
                }
            } else {
                toast.success('Content successfully added to editor.');
            }
            handleEditorChange(editor);
        } catch (error: any) { 
            console.error('Failed to add content to editor:', error); 
            toast.error(`Could not add content to the editor. Please try again. (Error: ${error.message})`); 
        }
    };
    // UPDATED: Toggle handler to use new state from useChatPane
    const handleToggleChat = () => {
        if (isMobile) {
            setMobileVisiblePane(pane => pane === 'chat' ? 'editor' : 'chat');
            if (mobileVisiblePane === 'editor') { // If switching to chat, ensure mini-pane is closed
                setIsMiniPaneOpen(false);
            }
        } else {
            toggleChatPane(); // Use the function from useChatPane
            // Check the state *after* toggle to determine if it just opened
            // If isChatPaneExpanded will be true AFTER toggle, it means it was collapsed and is now opening.
            if (!isChatPaneCollapsed) { // This means it IS currently expanded (will be true if toggleChatPane just made it expanded)
                setIsMiniPaneOpen(false);
            }
        }
    };

    // --- NEW: Effect to initialize the assistant message count reference on first load ---
    useEffect(() => {
        if (messages && lastSeenMessageCountRef.current === 0) {
            // On initial load, count only assistant messages and set the ref without incrementing unread count
            const assistantMessageCount = messages.filter(msg => msg.role === 'assistant').length;
            lastSeenMessageCountRef.current = assistantMessageCount;
        }
    }, [messages]);

    // --- NEW: Effect to track new assistant messages for mini pane indicator ---
    useEffect(() => {
        if (!messages) return;
        
        // Count only assistant messages
        const currentAssistantMessageCount = messages.filter(msg => msg.role === 'assistant').length;
        
        // If we have more assistant messages than we last saw (and it's not the initial load)
        if (currentAssistantMessageCount > lastSeenMessageCountRef.current && lastSeenMessageCountRef.current >= 0) {
            const newAssistantMessagesCount = currentAssistantMessageCount - lastSeenMessageCountRef.current;
            
            // Only increment unread count if mini pane is closed
            if (!isMiniPaneOpen) {
                setUnreadMiniPaneCount(prev => prev + newAssistantMessagesCount);
            }
            
            // Update the last seen count
            lastSeenMessageCountRef.current = currentAssistantMessageCount;
        }
        
        // If mini pane is open, reset unread count
        if (isMiniPaneOpen) {
            setUnreadMiniPaneCount(0);
        }
    }, [messages, isMiniPaneOpen]);

    // --- NEW: Handler for Mini-Pane Toggle ---
    const handleToggleMiniPane = () => {
        setIsMiniPaneOpen(prev => {
            const newState = !prev;
            // Clear unread count when opening the mini pane
            if (newState) {
                setUnreadMiniPaneCount(0);
            }
            return newState;
        });
    };

    // --- NEW: Desktop Pane Resize Handlers ---
    const handleDesktopResizePointerMove = useCallback((event: globalThis.PointerEvent) => { // Explicitly use globalThis.PointerEvent
        if (!desktopResizeDragStartRef.current) return;
        event.preventDefault(); 
        const newWidth = window.innerWidth - event.clientX;
        const minPx = MIN_CHAT_PANE_WIDTH_PX;
        const maxPx = window.innerWidth * (MAX_CHAT_PANE_WIDTH_PERCENT / 100);
        const clampedWidth = Math.max(minPx, Math.min(newWidth, maxPx));
        handleChatPaneWidthChange(`${clampedWidth}px`);
    }, [handleChatPaneWidthChange]);

    const handleDesktopResizePointerUp = useCallback(() => {
        document.removeEventListener('pointermove', handleDesktopResizePointerMove);
        document.removeEventListener('pointerup', handleDesktopResizePointerUp);
        desktopResizeDragStartRef.current = null;
        document.body.style.cursor = '';
        setIsPaneBeingResized(false); // <<< ADDED: Set resizing to false
    }, [handleDesktopResizePointerMove]);

    const handleDesktopResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => { // This is from JSX, React.PointerEvent is correct
        if (event.button !== 0) return;
        event.preventDefault();
        setIsPaneBeingResized(true); // <<< ADDED: Set resizing to true
        let currentWidthPx;
        if (chatPanePreviousWidth.endsWith('px')) {
            currentWidthPx = parseFloat(chatPanePreviousWidth);
        } else if (chatPanePreviousWidth.endsWith('%')) {
            currentWidthPx = (parseFloat(chatPanePreviousWidth) / 100) * window.innerWidth;
        } else {
            currentWidthPx = (INITIAL_CHAT_PANE_WIDTH_PERCENT / 100) * window.innerWidth;
        }
        desktopResizeDragStartRef.current = { x: event.clientX, initialWidth: currentWidthPx };
        document.addEventListener('pointermove', handleDesktopResizePointerMove);
        document.addEventListener('pointerup', handleDesktopResizePointerUp);
        document.body.style.cursor = 'col-resize';
    }, [chatPanePreviousWidth, handleChatPaneWidthChange, handleDesktopResizePointerMove, handleDesktopResizePointerUp]);
    // --- END NEW: Desktop Pane Resize Handlers ---

    // --- NEW: Toggle function for mobile pane visibility ---
    const handleToggleMobilePane = () => {
        setMobileVisiblePane(pane => pane === 'chat' ? 'editor' : 'chat');
    };

    // --- NEW: Handlers for document replacement confirmation ---
    const handleDocumentReplacementConfirm = async () => {
        if (!documentReplacementConfirmation.args) {
            console.error('[replaceAllContent] No args found for confirmation');
            return;
        }

        console.log('[replaceAllContent] User confirmed replacement, proceeding...');
        setDocumentReplacementConfirmation(prev => ({ ...prev, isProcessing: true }));
        
        try {
            // Execute the replacement with confirmation disabled
            await executeReplaceAllContent(documentReplacementConfirmation.args);
        } finally {
            // Close the modal
            setDocumentReplacementConfirmation({ isOpen: false });
        }
    };

    const handleDocumentReplacementCancel = () => {
        console.log('[replaceAllContent] User cancelled replacement');
        setDocumentReplacementConfirmation({ isOpen: false });
        toast.info('Document replacement cancelled');
    };

    // --- NEW: Effect to handle pending content for editor on mobile ---
    useEffect(() => {
        if (pendingContentForEditor && mobileVisiblePane === 'editor' && isMobile) {
            const editor = editorRef.current;
            if (editor) {
                // Short delay to ensure editor is fully rendered and ready after pane switch
                setTimeout(async () => {
                    try {
                        let blocksToInsert: PartialBlock<typeof schema.blockSchema>[] = await editor.tryParseMarkdownToBlocks(pendingContentForEditor);
                        if (blocksToInsert.length === 0 && pendingContentForEditor.trim() !== '') {
                            blocksToInsert.push({ type: 'paragraph', content: [{ type: 'text', text: pendingContentForEditor, styles: {} }] } as PartialBlock<typeof schema.blockSchema>);
                        }
                        if (blocksToInsert.length > 0) {
                            const { block: currentBlock } = editor.getTextCursorPosition();
                            let referenceBlockId: string | undefined = currentBlock?.id;
                            if (!referenceBlockId && editor.document.length > 0) {
                                referenceBlockId = editor.document[editor.document.length - 1]?.id;
                            }
                            let insertedBlocks: any = [];
                            if (referenceBlockId) {
                                insertedBlocks = editor.insertBlocks(blocksToInsert, referenceBlockId, 'after');
                            } else {
                                insertedBlocks = editor.replaceBlocks(editor.document, blocksToInsert);
                            }
                            
                            // Trigger highlighting for manually added content (mobile)
                            if (Array.isArray(insertedBlocks)) {
                                insertedBlocks.forEach((block: any) => {
                                    if (block?.id) {
                                        setBlockStatus(block.id, BlockStatus.MODIFIED, 'insert');
                                    }
                                });
                            }
                            
                            // Use enhanced toast with block navigation (mobile)
                            if (Array.isArray(insertedBlocks) && insertedBlocks.length > 0) {
                                const insertedBlockIds = insertedBlocks
                                    .map((block: any) => block?.id)
                                    .filter((id): id is string => Boolean(id));
                                
                                if (insertedBlockIds.length > 0) {
                                    const { createBlockStatusToast } = await import('@/lib/utils/aiToast');
                                    createBlockStatusToast(
                                        insertedBlockIds,
                                        'modified',
                                        'insert',
                                        `Content added to editor (${insertedBlockIds.length} block${insertedBlockIds.length > 1 ? 's' : ''})`
                                    );
                                } else {
                                    toast.success('Content added to editor.');
                                }
                            } else {
                                toast.success('Content added to editor.');
                            }
                            handleEditorChange(editor); // Ensure changes are saved/propagated
                        }
                    } catch (error: any) {
                        console.error('Failed to add pending content to editor:', error);
                        toast.error(`Could not add pending content: ${error.message}`);
                    } finally {
                        setPendingContentForEditor(null); // Clear pending content
                    }
                }, 100); // 100ms delay, adjust if needed
            } else {
                // This case should ideally not happen if logic is correct,
                // but as a fallback, retry or notify.
                console.warn('[useEffect] Editor not ready for pending content, will retry or it might be lost.');
                // Consider a retry mechanism or re-setting pending content if editor doesn't become available.
            }
        }
    }, [pendingContentForEditor, mobileVisiblePane, isMobile, editorRef, handleEditorChange]); // Added handleEditorChange to dependencies

    // --- Effect for dynamic theme changes ---
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

    // --- useEffect for Client-Side Tool Execution (OpenAI models) ---
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];

        console.log('[ToolProcessing2] Checking last message:', {
            messageId: lastMessage?.id,
            role: lastMessage?.role,
            hasToolInvocations: !!(lastMessage as any)?.toolInvocations?.length,
            toolInvocationsCount: (lastMessage as any)?.toolInvocations?.length || 0,
            isAiLoading,
            isProcessingClientTools,
            processedToolCallIds: Array.from(processedToolCallIds)
        });

        if (
            lastMessage?.role === 'assistant' &&
            (lastMessage as any).toolInvocations?.length &&
            !isAiLoading && // Not currently loading an AI response
            !isProcessingClientTools // Not already processing a batch of client tools
        ) {
            const clientToolNames = ['addContent', 'modifyContent', 'deleteContent', 'createChecklist', 'modifyTable', 'replaceAllContent'];
            const invocationsToProcess = (lastMessage as any).toolInvocations.filter(
                (inv: any) => {
                    console.log(`[ToolProcessing2] Evaluating tool invocation: ${inv.toolName} (ID: ${inv.toolCallId})`);
                    
                    // Skip if already processed
                    if (processedToolCallIds.has(inv.toolCallId)) {
                        console.log(`[ToolProcessing2] Skipping ${inv.toolName} (ID: ${inv.toolCallId}) - already in processedToolCallIds`);
                        return false;
                    }
                    
                    // Skip if not a client-side tool
                    if (!clientToolNames.includes(inv.toolName)) {
                        console.log(`[ToolProcessing2] Skipping ${inv.toolName} (ID: ${inv.toolCallId}) - not a client-side tool`);
                        return false;
                    }
                    
                    // Enhanced check: Skip if there's already a tool result message for this tool call
                    const hasResultMessage = messages.some(msg => {
                        const msgAny = msg as any;
                        return msgAny.role === 'tool' && msgAny.tool_call_id === inv.toolCallId;
                    });
                    
                    if (hasResultMessage) {
                        console.log(`[ToolProcessing2] Skipping ${inv.toolName} (ID: ${inv.toolCallId}) - already has result message`);
                        // Also mark it as processed to prevent future processing
                        setProcessedToolCallIds(prev => new Set([...prev, inv.toolCallId]));
                        return false;
                    }
                    
                    // Additional check: Look for tool invocations with state 'result' (from AI SDK)
                    if (inv.state === 'result') {
                        console.log(`[ToolProcessing2] Skipping ${inv.toolName} (ID: ${inv.toolCallId}) - state is 'result'`);
                        // Mark as processed
                        setProcessedToolCallIds(prev => new Set([...prev, inv.toolCallId]));
                        return false;
                    }
                    
                    console.log(`[ToolProcessing2] Including ${inv.toolName} (ID: ${inv.toolCallId}) for processing`);
                    return true;
                }
            );

            if (invocationsToProcess.length > 0) {
                const processInvocations = async () => {
                    setIsProcessingClientTools(true); // Set flag before starting batch
                    console.log('[Client Tool State] Started processing batch, isProcessingClientTools set to true.');

                    // Add all current tool call IDs to processed set immediately to prevent re-entry for this batch
                    setProcessedToolCallIds(prev => {
                        const newSet = new Set(prev);
                        invocationsToProcess.forEach((inv: any) => newSet.add(inv.toolCallId));
                        return newSet;
                    });

                    for (const toolInvocation of invocationsToProcess as any[]) {
                        // ADDED: Set initial AI tool state when tool call is detected
                        setOperationStates({
                            aiToolState: AIToolState.DETECTED,
                            currentToolCallId: toolInvocation.toolCallId,
                            currentOperationDescription: `AI requests: ${toolInvocation.toolName}`
                        });

                        // ADDED: Set executing state before tool execution
                        setOperationStates({
                            aiToolState: AIToolState.EXECUTING,
                            currentOperationDescription: `Executing: ${toolInvocation.toolName} with input: ${JSON.stringify(toolInvocation.args).substring(0, 100)}...`
                        });

                        let result: any;
                        try {
                            console.log(`[Client Tool] Attempting to execute: ${toolInvocation.toolName} with ID ${toolInvocation.toolCallId}`);
                            if (toolInvocation.toolName === 'addContent') {
                                result = await executeAddContent(toolInvocation.args);
                            } else if (toolInvocation.toolName === 'modifyContent') {
                                result = await executeModifyContent(toolInvocation.args);
                            } else if (toolInvocation.toolName === 'deleteContent') {
                                result = await executeDeleteContent(toolInvocation.args);
                            } else if (toolInvocation.toolName === 'createChecklist') {
                                result = await executeCreateChecklist(toolInvocation.args);
                            } else if (toolInvocation.toolName === 'modifyTable') {
                                result = await executeModifyTable(toolInvocation.args);
                            } else if (toolInvocation.toolName === 'replaceAllContent') {
                                result = await executeReplaceAllContent(toolInvocation.args);
                            } else {
                                console.warn(`[Client Tool] Unknown tool in batch: ${toolInvocation.toolName}`);
                                result = { success: false, error: `Unknown client-side tool: ${toolInvocation.toolName}` };
                                // ADDED: Reset state on unknown tool
                                resetChatOperationState();
                                continue;
                            }

                            if (result === undefined) {
                                console.warn(`[Client Tool] Tool ${toolInvocation.toolName} (ID: ${toolInvocation.toolCallId}) returned undefined. Defaulting to error result.`);
                                result = { success: false, error: `Tool ${toolInvocation.toolName} did not return a defined result.` };
                            }

                            // ADDED: Set awaiting result state before addToolResult
                            setAIToolState(AIToolState.AWAITING_RESULT_IN_STATE);
                        } catch (error: any) {
                            console.error(`[Client Tool] Error executing ${toolInvocation.toolName} (ID: ${toolInvocation.toolCallId}):`, error);
                            result = { success: false, error: `Execution failed for ${toolInvocation.toolName}: ${error.message || 'Unknown error'}` };
                            // ADDED: Reset state on tool execution error
                            resetChatOperationState();
                        }
                        
                        console.log(`[Client Tool] Adding result for ${toolInvocation.toolName} (ID: ${toolInvocation.toolCallId}):`, JSON.stringify(result));
                        addToolResult({ toolCallId: toolInvocation.toolCallId, result });
                    }
                    // DO NOT set isProcessingClientTools to false here anymore.
                    // This will be handled by the new useEffect below.
                };
                processInvocations();
            }
        }
    }, [
        messages, 
        isAiLoading, 
        isProcessingClientTools, 
        addToolResult, 
        executeAddContent, 
        executeModifyContent, 
        executeDeleteContent, 
        executeCreateChecklist, 
        executeModifyTable, 
        executeReplaceAllContent, // ADDED
        processedToolCallIds, 
        setProcessedToolCallIds,
        setOperationStates, // ADDED
        setAIToolState, // ADDED
        resetChatOperationState, // ADDED
    ]);

    // --- NEW useEffect to manage isProcessingClientTools completion ---
    useEffect(() => {
        if (!isProcessingClientTools) {
            return; // Only act if we are currently in a processing state.
        }

        if (isAiLoading) {
            return; // Don't unlock if the AI is currently generating a new response.
        }

        // Find the last assistant message that had tool_invocations
        let lastAssistantMessageWithTools: Message | undefined = undefined;
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role === 'assistant' && msg.toolInvocations?.length) {
                lastAssistantMessageWithTools = msg;
                break;
            }
        }

        if (lastAssistantMessageWithTools && lastAssistantMessageWithTools.toolInvocations) {
            // Check if all tool_calls from this assistant message have a corresponding 'tool' result message
            const allToolCallsHaveResults = lastAssistantMessageWithTools.toolInvocations.every(inv => {
                return messages.some(resultMsg => {
                    // Cast to any to bypass persistent linter error, assuming runtime structure is correct
                    const { role, tool_call_id } = resultMsg as any;
                    if (role === 'tool' && typeof tool_call_id === 'string') {
                        return tool_call_id === inv.toolCallId;
                    }
                    return false;
                });
            });

            if (allToolCallsHaveResults) {
                setIsProcessingClientTools(false);
                console.log('[Client Tool State] All tool calls from the last assistant message now have results in chatMessages. isProcessingClientTools set to false.');
            } else {
                console.log(`[Client Tool State] Still waiting for tool results to appear in chatMessages for the last assistant turn.`);
            }
        } else {
            // No assistant message with pending tools found (e.g., last message was user, or assistant message had no tools).
            // This means client-side processing (if any was triggered by a prior assistant message) should be complete or wasn't needed for the last turn.
            setIsProcessingClientTools(false);
            console.log('[Client Tool State] No assistant message with pending tool calls found. isProcessingClientTools set to false.');
        }
    }, [messages, isProcessingClientTools, isAiLoading, setIsProcessingClientTools]);

    // --- Render Logic ---
    // Find the last assistant message to pass down
    const lastAssistantMessage = [...messages].reverse().find(msg => msg.role === 'assistant');

    // --- Render Check --- (This was the original console.log, now commented out. Uncommenting might cause infinite loops)
    // console.log('[Render Check] State before render:', {
    //     totalMessages: messages.length,
    //     // shouldShowLoadMore: false, 
    //     isMobile, 
    //     mobileVisiblePane,
    // });

    // --- NEW: Calculations for ARIA attributes for resize handle ---
    let currentWidthPxCalculated = 0;
    if (typeof window !== 'undefined') { // Ensure window is defined
        if (chatPanePreviousWidth.endsWith('px')) {
            currentWidthPxCalculated = parseFloat(chatPanePreviousWidth);
        } else if (chatPanePreviousWidth.endsWith('%')) {
            currentWidthPxCalculated = (parseFloat(chatPanePreviousWidth) / 100) * window.innerWidth;
        } else {
            // Fallback or default if format is unexpected.
            currentWidthPxCalculated = (INITIAL_CHAT_PANE_WIDTH_PERCENT / 100) * window.innerWidth;
        }
    }
    const ariaMinChatPaneWidth = MIN_CHAT_PANE_WIDTH_PX;
    const ariaMaxChatPaneWidth = typeof window !== 'undefined' ? window.innerWidth * (MAX_CHAT_PANE_WIDTH_PERCENT / 100) : 1000; // Default max if window undefined
    // --- END NEW ---

    // --- NEW: Keyboard handler for desktop pane resize ---
    const handleDesktopResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            let currentPx = 0;
            if (typeof window !== 'undefined') {
                if (chatPanePreviousWidth.endsWith('px')) {
                    currentPx = parseFloat(chatPanePreviousWidth);
                } else if (chatPanePreviousWidth.endsWith('%')) {
                    currentPx = (parseFloat(chatPanePreviousWidth) / 100) * window.innerWidth;
                } else {
                    currentPx = (INITIAL_CHAT_PANE_WIDTH_PERCENT / 100) * window.innerWidth;
                }
            } else { return; } // Cannot resize if window is not defined

            const step = 10; // Resize by 10px
            // Pane is on the right. Moving its left edge:
            // Left Arrow: moves the edge to the left, pane gets wider.
            // Right Arrow: moves the edge to the right, pane gets narrower.
            let newWidthPx = event.key === 'ArrowLeft' ? currentPx + step : currentPx - step;

            const minPx = MIN_CHAT_PANE_WIDTH_PX;
            const maxPx = window.innerWidth * (MAX_CHAT_PANE_WIDTH_PERCENT / 100);
            newWidthPx = Math.max(minPx, Math.min(newWidthPx, maxPx));

            handleChatPaneWidthChange(`${newWidthPx}px`);
        }
    }, [chatPanePreviousWidth, handleChatPaneWidthChange]);
    // --- END NEW ---

    // Main Render
    return (
        <div className="flex flex-row w-full h-full bg-[--bg-color] overflow-hidden relative" 
            onDragOver={handleDragOver} 
            onDragLeave={handleDragLeave} 
            onDrop={handleDrop}
        >
            {isDragging && <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center z-50 pointer-events-none"><p className="text-blue-800 dark:text-blue-200 font-semibold text-lg p-4 bg-white/80 dark:bg-black/80 rounded-lg shadow-lg">Drop files to attach</p></div>}



            {/* Conditional Rendering based on isMobile */}
            {isMobile ? (
                // --- Mobile Layout: Show only one pane ---
                <>
                    {mobileVisiblePane === 'editor' && (
                        <>
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
                                    batchContext={autosaveBatchContext}
                                    localSaveStatus={localSaveStatus}
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
                                        sendMessage={sendMessage}
                                        isLoading={isAiLoading}
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
                                        unreadMiniPaneCount={unreadMiniPaneCount}
                                        // Mini pane content props
                                        miniPaneMessages={messages}
                                        miniPaneIsLoadingMessages={isLoadingMessages}
                                        miniPaneIsAiLoading={isAiLoading}
                                        miniPaneMessagesEndRef={messagesEndRef}
                                        currentTheme={currentTheme} // Pass down the theme
                                    />
                                </div>
                            </div>
                            {/* --- NEW: Mobile Chat Toggle Button (Replaced) --- */}
                            <FloatingActionTab 
                                onClick={handleToggleMobilePane}
                                isOpen={false} /* When editor is visible, chat drawer is not open */
                                ariaLabel="Open chat drawer"
                            />
                        </>
                    )}
                    {mobileVisiblePane === 'chat' && (
                         <MobileChatDrawer
                            isOpen={mobileVisiblePane === 'chat'}
                            onClose={handleToggleMobilePane}
                         >
                             {/* ChatPaneWrapper becomes the child of MobileChatDrawer */}
                             <ChatPaneWrapper
                                isChatCollapsed={false} // Chat is visible in the drawer, so not collapsed
                                chatMessages={messages}
                                isLoadingMessages={isLoadingMessages}
                                isChatLoading={isAiLoading || isProcessingClientTools} // MODIFIED HERE
                                handleSendToEditor={handleSendToEditor}
                                messagesEndRef={messagesEndRef}
                                messageLoadBatchSize={MESSAGE_LOAD_BATCH_SIZE}
                                input={input}
                                setInput={setInput}
                                taggedDocuments={taggedDocuments}
                                setTaggedDocuments={setTaggedDocuments}
                                handleInputChange={handleInputChange}
                                sendMessage={sendMessage}
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
                                formRef={setFormElement} // Pass the callback ref here
                                inputRef={inputRef}
                                fileInputRef={fileInputRef}
                                handleKeyDown={handleKeyDown}
                                // initialChatPaneWidthPercent={100} // REMOVED - Mobile takes full width by default
                                // minChatPaneWidthPx={0} // REMOVED - No min width constraint needed for full-width mobile
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
                                isMobile={isMobile}
                                activeMobilePane={mobileVisiblePane}
                                onToggleMobilePane={handleToggleMobilePane}
                                // --- NEW: Pass orchestrator props to mobile ChatPaneWrapper ---
                                orchestratorHandleFileUploadStart={orchestratorHandleFileUploadStart}
                                orchestratorCancelFileUpload={orchestratorCancelFileUpload}
                                orchestratorPendingFile={orchestratorPendingFile}
                                orchestratorIsFileUploadInProgress={orchestratorIsFileUploadInProgress}
                                orchestratorIsChatInputBusy={orchestratorIsChatInputBusy}
                                orchestratorCurrentOperationStatusText={orchestratorCurrentOperationStatusText}
                                // --- END NEW ---
                            />
                         </MobileChatDrawer>
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
                            batchContext={autosaveBatchContext}
                            localSaveStatus={localSaveStatus}
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
                                isChatCollapsed={isChatPaneCollapsed}
                                lastMessageContent={lastAssistantMessage?.content}
                                lastAssistantMessageId={lastAssistantMessage?.id}
                                handleSendToEditor={handleSendToEditor}
                                input={input}
                                handleInputChange={handleInputChange}
                                sendMessage={sendMessage}
                                isLoading={isAiLoading}
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
                                isMainChatCollapsed={isChatPaneCollapsed} // Main chat is collapsed when pane is collapsed
                                miniPaneToggleRef={miniPaneToggleRef} // Pass the ref down
                                unreadMiniPaneCount={unreadMiniPaneCount}
                                // Mini pane content props
                                miniPaneMessages={messages}
                                miniPaneIsLoadingMessages={isLoadingMessages}
                                miniPaneIsAiLoading={isAiLoading}
                                miniPaneMessagesEndRef={messagesEndRef}
                                currentTheme={currentTheme} // Pass down the theme
                            />
                        </div>
                    </div>

                    {/* NEW Draggable Resize Divider (Desktop, when chat pane is expanded) */}
                    {!isChatPaneCollapsed && !isMobile && (
                        <div 
                            onPointerDown={handleDesktopResizePointerDown} // Attach the drag handler
                            className="h-full cursor-col-resize bg-transparent group flex-shrink-0 flex items-center justify-center w-[7px] hover:bg-[--accent-color]/20 transition-colors duration-150"
                            title="Resize chat pane"
                            // --- NEW ACCESSIBILITY ATTRIBUTES ---
                            tabIndex={0}
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize chat pane"
                            aria-controls="chat-pane-resizable"
                            aria-valuenow={currentWidthPxCalculated} // Use calculated value
                            aria-valuemin={ariaMinChatPaneWidth}
                            aria-valuemax={ariaMaxChatPaneWidth}
                            onKeyDown={handleDesktopResizeKeyDown}
                            // --- END NEW ---
                        >
                            <div className="h-full w-[1px] bg-[--border-color] group-hover:w-[3px] group-hover:bg-[--accent-color] transition-all duration-150" />
                        </div>
                    )}

                    {/* Render ChatPaneTab when collapsed on desktop */}
                    {isChatPaneCollapsed && !isMobile && (
                        <ChatPaneTab 
                            onExpand={toggleChatPane} 
                            onWidthChange={handleChatPaneWidthChange} 
                            isChatPaneExpanded={isChatPaneExpanded}
                        />
                    )}

                    {/* Chat Pane with Animation (Desktop only) */}
                    <AnimatePresence>
                        {!isChatPaneCollapsed && !isMobile && (
                            <motion.div
                                key="chat-pane"
                                id="chat-pane-resizable" // --- NEW: Added ID for aria-controls ---
                                initial={{ width: 0, opacity: 0 }}
                                animate={{
                                    width: chatPanePreviousWidth || `${INITIAL_CHAT_PANE_WIDTH_PERCENT}%`, 
                                    opacity: 1
                                }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={isPaneBeingResized ? { type: 'tween', duration: 0 } : { duration: 0.3, ease: 'easeInOut' }} // <<< MODIFIED: Conditional transition
                                style={{
                                    flexShrink: 0,
                                    overflow: 'hidden',
                                }}
                                className="h-full flex flex-col bg-[--bg-secondary] relative"
                            >
                                <ChatPaneWrapper
                                    isChatCollapsed={isChatPaneCollapsed} // Pass the correct state
                                    chatMessages={messages}
                                    isLoadingMessages={isLoadingMessages}
                                    isChatLoading={isAiLoading || isProcessingClientTools} // MODIFIED HERE
                                    handleSendToEditor={handleSendToEditor}
                                    messagesEndRef={messagesEndRef}
                                    messageLoadBatchSize={MESSAGE_LOAD_BATCH_SIZE}
                                    input={input}
                                    setInput={setInput}
                                    taggedDocuments={taggedDocuments}
                                    setTaggedDocuments={setTaggedDocuments}
                                    handleInputChange={handleInputChange}
                                    sendMessage={sendMessage}
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
                                    // REMOVED redundant props: initialChatPaneWidthPercent, minChatPaneWidthPx
                                    isRecording={isRecording}
                                    isTranscribing={isTranscribing}
                                    micPermissionError={micPermissionError}
                                    startRecording={startRecording}
                                    stopRecording={stopRecording}
                                    audioTimeDomainData={audioTimeDomainData}
                                    clearPreview={clearPreview}
                                    isMiniPaneOpen={isMiniPaneOpen}
                                    onToggleMiniPane={handleToggleMiniPane}
                                    isMainChatCollapsed={isChatPaneCollapsed && !isMiniPaneOpen} // Pass this new prop
                                    miniPaneToggleRef={miniPaneToggleRef} // Pass the ref down
                                    currentTheme={currentTheme} // Pass down the theme
                                    // --- NEW: Pass orchestrator props to desktop ChatPaneWrapper ---
                                    orchestratorHandleFileUploadStart={orchestratorHandleFileUploadStart}
                                    orchestratorCancelFileUpload={orchestratorCancelFileUpload}
                                    orchestratorPendingFile={orchestratorPendingFile}
                                    orchestratorIsFileUploadInProgress={orchestratorIsFileUploadInProgress}
                                    orchestratorIsChatInputBusy={orchestratorIsChatInputBusy}
                                    orchestratorCurrentOperationStatusText={orchestratorCurrentOperationStatusText}
                                    // --- END NEW ---
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* NEW: CollapseChatTab when expanded on desktop */}
                    {!isChatPaneCollapsed && !isMobile && (
                        <CollapseChatTab 
                            onCollapse={toggleChatPane} 
                            chatPaneWidth={chatPanePreviousWidth || `${INITIAL_CHAT_PANE_WIDTH_PERCENT}%`} 
                        />
                    )}
                </>
            )}

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

            {/* --- NEW: Document Replacement Confirmation Modal --- */}
            <DocumentReplacementConfirmationModal
                isOpen={documentReplacementConfirmation.isOpen}
                onClose={handleDocumentReplacementCancel}
                onConfirm={handleDocumentReplacementConfirm}
                isProcessing={documentReplacementConfirmation.isProcessing}
            />
            {/* --- END NEW --- */}
        </div>
    );
}

// --- Main Editor Page Component ---
export default function EditorPage() {
    return (
        <AttachedToastProvider>
            <CollaborationProvider>
                <EditorPageContent />
            </CollaborationProvider>
        </AttachedToastProvider>
    );
} 
