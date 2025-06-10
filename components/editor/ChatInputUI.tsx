'use client';

import React, { useEffect, useLayoutEffect, KeyboardEvent, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MicIcon, StopCircleIcon, X, History, GalleryVerticalEnd, ImageUp, Minimize, Send } from 'lucide-react';
import { ModelSelector } from '@/components/ModelSelector';
import { TextFilePreview } from './TextFilePreview'; // Import from sibling file
import Image from 'next/image'; // Import Next.js Image
import CustomAudioVisualizer from './CustomAudioVisualizer'; // <<< NEW: Import custom visualizer
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions'; // <<< NEW: Import type
import { DocumentSearchInput } from '../chat/DocumentSearchInput'; // <<< NEW: Import DocumentSearchInput
import { TaggedDocument } from '@/lib/types'; // Import TaggedDocument from shared types

// --- Helper Icon Component ---
const StopIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        {...props}
    >
        <path
            fillRule="evenodd"
            d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z"
            clipRule="evenodd"
        />
    </svg>
);

// --- Chat Input UI Component Props (Updated) ---
interface ChatInputUIProps {
    files: FileList | null;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    inputRef: React.Ref<HTMLTextAreaElement>;
    input: string; // From useChat
    handleInputChange: ( // From useChat
        e:
        | React.ChangeEvent<HTMLInputElement>
        | React.ChangeEvent<HTMLTextAreaElement>
    ) => void;
    handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    handlePaste: (event: React.ClipboardEvent) => void;
    model: string;
    setModel: React.Dispatch<React.SetStateAction<string>>;
    handleUploadClick: () => void;
    isLoading: boolean; // From useChat (AI response generation)
    isUploading: boolean; // File upload in progress state
    uploadError: string | null; // File upload error message
    uploadedImagePath: string | null; // Path of successfully uploaded image
    onStop?: () => void; // Optional handler for stopping AI generation
    isChatCollapsed?: boolean; // To trigger height adjustment
    // NEW: Prop to render the collapsed message toggle icon
    renderCollapsedMessageToggle?: React.ReactNode;
    
    // --- AUDIO PROPS (Now Optional) --- 
    isRecording?: boolean; // << Made optional
    isTranscribing?: boolean; // << Made optional
    micPermissionError?: boolean; // << Made optional
    startRecording?: () => void; // << Made optional
    stopRecording?: () => void; // << Made optional
    audioTimeDomainData?: AudioTimeDomainData; // << Made optional
    clearPreview: () => void; // Add clearPreview from useFileUpload hook
    // --- NEW: Add recordingDuration prop ---
    recordingDuration?: number;
    // --- END AUDIO PROPS ---

    // --- NEW Document Tagging Props ---
    taggedDocuments?: TaggedDocument[]; // Optional, for UI cues or limits
    onAddTaggedDocument?: (doc: TaggedDocument) => void;
    onRemoveTaggedDocument?: (docId: string) => void; // <<< ADD THIS PROP TYPE
    // --- END Document Tagging Props ---
    // --- NEW: Props for Mini-Pane toggle ---
    isMiniPaneOpen?: boolean;
    onToggleMiniPane?: () => void;
    isMainChatCollapsed?: boolean;
    miniPaneToggleRef?: React.RefObject<HTMLButtonElement>; // Ref for the toggle button
    // --- END NEW ---

    // --- NEW: Orchestrator file upload props ---
    orchestratorHandleFileUploadStart?: (file: File) => Promise<string | null>;
    orchestratorCancelFileUpload?: () => void;
    orchestratorPendingFile?: any; // Will be properly typed later
    orchestratorIsFileUploadInProgress?: () => boolean;
    orchestratorIsChatInputBusy?: boolean;
    orchestratorCurrentOperationStatusText?: string | null;
    // --- END NEW ---
}

export const ChatInputUI: React.FC<ChatInputUIProps> = ({
    files,
    fileInputRef,
    handleFileChange,
    inputRef,
    input,
    handleInputChange,
    handleKeyDown,
    handlePaste,
    model,
    setModel,
    handleUploadClick,
    isLoading, // AI response generation
    isUploading,
    uploadError,
    uploadedImagePath,
    onStop, // Stop AI generation
    isChatCollapsed,
    // DESTRUCTURE NEW PROP
    renderCollapsedMessageToggle,
    clearPreview, // Destructure the new prop
    // --- AUDIO PROPS DESTRUCTURED (with defaults/checks) ---
    isRecording = false, // Default to false if not provided
    isTranscribing = false,
    micPermissionError = false, // Default to false
    startRecording,
    stopRecording,
    audioTimeDomainData = null, // Default to null
    // --- NEW: Destructure recordingDuration ---
    recordingDuration = 0,
    // --- END AUDIO PROPS DESTRUCTURED ---

    // --- NEW Document Tagging Props DESTRUCTURED ---
    taggedDocuments,
    onAddTaggedDocument,
    onRemoveTaggedDocument, // <<< DESTRUCTURE THIS PROP
    // --- END Document Tagging Props DESTRUCTURED ---
    // --- NEW: Destructure Mini-Pane props ---
    isMiniPaneOpen,
    onToggleMiniPane,
    isMainChatCollapsed,
    miniPaneToggleRef, // Destructure the ref
    // --- END NEW ---

    // --- NEW: Destructure orchestrator props ---
    orchestratorHandleFileUploadStart,
    orchestratorCancelFileUpload,
    orchestratorPendingFile,
    orchestratorIsFileUploadInProgress,
    orchestratorIsChatInputBusy,
    orchestratorCurrentOperationStatusText,
    // --- END NEW ---
}) => {
    // Tooltip state remains if needed elsewhere, otherwise remove
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

    // --- NEW: Callback ref logic for textarea ---
    const [actualTextareaNode, setActualTextareaNode] = useState<HTMLTextAreaElement | null>(null);

    const textareaCallbackRef = useCallback((node: HTMLTextAreaElement | null) => {
        setActualTextareaNode(node); // Update local state with the node
        // Update the parent's inputRef
        if (typeof inputRef === 'function') {
            inputRef(node);
        } else if (inputRef && typeof inputRef === 'object' && 'current' in inputRef) {
            (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
    }, [inputRef]); // inputRef prop is a dependency

    // Adjust textarea height dynamically based on content
    useLayoutEffect(() => {
        if (actualTextareaNode) { // Use the state variable holding the node
            // console.log('[ChatInputUI] Adjusting height. isChatCollapsed:', isChatCollapsed, 'ScrollHeight:', actualTextareaNode.scrollHeight);
            actualTextareaNode.style.height = 'auto'; // Reset height first to get accurate scrollHeight
            actualTextareaNode.style.height = `${actualTextareaNode.scrollHeight}px`;
        }
    }, [input, actualTextareaNode, isChatCollapsed]); // Depend on input, the node, AND isChatCollapsed

    // Determine if send button should be enabled (check depends on optional props)
    const canSubmitText = !isLoading && !isUploading && !(isTranscribing ?? false) && !!input.trim();

    // Determine if mic button should be enabled (check depends on optional props)
    const canRecord = !!startRecording && !!stopRecording && !isLoading && !isUploading && !(isRecording ?? false) && !(isTranscribing ?? false) && !(micPermissionError ?? false);
    const micAvailable = !!startRecording && !!stopRecording; // Check if mic functions are even provided

    // --- NEW: Format recording duration ---
    const formatDuration = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    };
    // --- END: Format recording duration ---

    // Simplified Mic button handler (check if functions exist)
    const handleMicButtonClick = () => {
        console.log('[ChatInputUI] handleMicButtonClick called! State:', {
            isRecording,
            canRecord,
            micAvailable,
            hasStartRecording: !!startRecording,
            hasStopRecording: !!stopRecording
        });
        
        if (isRecording && stopRecording) {
            console.log('[ChatInputUI] Stop button clicked. Calling stopRecording().');
            stopRecording();
        } else if (canRecord && startRecording) {
             console.log('[ChatInputUI] Mic button clicked. Calling startRecording().');
            startRecording();
        } else {
            console.warn('[ChatInputUI] Mic button action prevented. Conditions/Props not met.');
            if (!micAvailable) {
                 console.warn('[ChatInputUI] Audio recording functions (start/stop) were not provided.');
                 // Optionally show a message indicating audio input is unavailable in this context
            }
        }
    };

    // Determine button properties dynamically (consider optional props)
    let buttonIcon: React.ReactNode;
    let buttonTitle: string;
    let buttonDisabled: boolean;
    let buttonType: "button" | "submit";
    let buttonOnClick: (() => void) | undefined = undefined;
    let buttonClassName = `w-full h-full flex items-center justify-center rounded-full text-[--muted-text-color] focus:outline-none`;
    let showLoadingSpinner = isLoading;
    
    // Debug: Log button state determination (removed due to infinite loop)
    // let showPulsingIndicator = isRecording; // Removed as it's not used directly in the JSX below, pulsing is handled by CustomAudioVisualizer

    // --- Button State Determination --- 
    // NEW ORDER: Prioritize recording state for the mic button's direct action
    if (isRecording) { 
        // console.log('[ChatInputUI] Button state: RECORDING/STOP'); // Debug removed
        buttonIcon = <StopCircleIcon aria-hidden="true" />;
        buttonTitle = "Stop recording";
        buttonDisabled = !stopRecording; 
        buttonType = "button";
        buttonClassName += ` bg-red-500/20 text-red-500 hover:bg-red-500/30`;
        buttonOnClick = handleMicButtonClick; // This calls the recording stop flow
    } else if (isLoading) { // General loading state (e.g., AI responding or file uploading)
        // console.log('[ChatInputUI] Button state: LOADING/STOP'); // Debug removed
        showLoadingSpinner = true; // Ensure spinner is shown if generally loading but not recording
        buttonIcon = <StopIcon aria-hidden="true" />;
        buttonTitle = "Stop generating";
        buttonDisabled = false; 
        buttonType = "button";
        buttonClassName += ` bg-[--hover-bg]`;
        buttonOnClick = onStop; // This calls the general AI/operation stop flow
    } else if (micAvailable && !input.trim() && !uploadedImagePath) { 
        // console.log('[ChatInputUI] Button state: MICROPHONE'); // Debug removed
        buttonIcon = <MicIcon aria-hidden="true" />;
        buttonTitle = micPermissionError ? "Mic permission denied" : "Start recording";
        buttonDisabled = !canRecord || micPermissionError;
        buttonType = "button";
        buttonClassName += micPermissionError ? ` cursor-not-allowed` : ` hover:bg-[--hover-bg]`;
        buttonOnClick = handleMicButtonClick; // This calls the recording start flow
    } else { // Send Message Mode
        // console.log('[ChatInputUI] Button state: SEND'); // Debug removed
        showLoadingSpinner = false; // Explicitly no spinner in send mode
        buttonIcon = <Send aria-hidden="true" />;
        buttonTitle = "Send message";
        buttonDisabled = !input.trim() && !uploadedImagePath;
        buttonType = "submit";
        buttonClassName += ` hover:bg-[--hover-bg]`;
        buttonOnClick = undefined; // Form submission handles it
    }

    return (
        <>
            {/* --- File Preview & Upload Status Area --- */} 
            <AnimatePresence>
                {/* Conditional rendering wrapper for the entire status/preview block */}
                {(files && files.length > 0) || uploadError ? (
                    <motion.div 
                        className="flex flex-col gap-2 px-4 w-full md:px-0 mb-2"
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        {/* Error Display */}
                        {uploadError && (
                            <div 
                                className="text-xs text-red-600 dark:text-red-400 p-1.5 rounded bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700/50"
                            >
                                Upload Error: {uploadError}
                            </div>
                        )}
                        {/* Previews */} 
                        {files && files.length > 0 && (
                            <div className="flex flex-row gap-2 overflow-x-auto styled-scrollbar-thin">
                                {Array.from(files).map((file) => (
                                    <div key={file.name} className="flex-shrink-0 relative group">
                                        {/* Image Preview */}
                                        {file.type.startsWith('image/') && (
                                            <Image 
                                                src={URL.createObjectURL(file)}
                                                alt={file.name}
                                                width={64}
                                                height={64}
                                                className={`rounded-md object-cover ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                                                onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)} // Clean up object URL
                                            />
                                        )}
                                        {/* Text File Preview */}
                                        {file.type.startsWith('text/') && (
                                            <TextFilePreview file={file} />
                                        )}
                                        {/* Uploading Indicator */}
                                        {isUploading && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
                                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            </div>
                                        )}
                                        {/* Close Button - only show if NOT uploading */}
                                        {!isUploading && (
                                            <button
                                                type="button"
                                                onClick={clearPreview} // Call clearPreview on click
                                                className="absolute top-0 right-0 -mt-1 -mr-1 p-0.5 bg-gray-600 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none focus:ring-1 focus:ring-red-500"
                                                aria-label="Remove image preview"
                                                title="Remove image"
                                            >
                                                <X size={12} strokeWidth={3} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {/* Hidden File Input */}
            <input
                type="file"
                accept="image/*" 
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
                disabled={isLoading || isUploading || (isRecording ?? false) || (isTranscribing ?? false)} // Also disable file input
            />

            {/* --- Main Input and Controls Area --- */}
            <div className="flex flex-col w-full bg-[--input-bg] rounded-lg p-2 border border-[--border-color] shadow-sm">
                {/* Row 1: Document Search Input and Tagged Pills */}
                {onAddTaggedDocument && (
                    <div className="flex items-start gap-x-2 mb-2"> {/* Main flex container for this row */}
                        
                        {/* Container for Document Search Input */}
                        <div className="flex-shrink-0"> 
                            <DocumentSearchInput
                                onDocumentSelected={onAddTaggedDocument}
                                disabled={(isRecording ?? false) || (isTranscribing ?? false) || isLoading || isUploading}
                            />
                        </div>

                        {/* Container for Tagged Document Pills */}
                        <div className="flex flex-wrap gap-1 flex-grow min-w-0"> 
                            {taggedDocuments && taggedDocuments.length > 0 ? (
                                taggedDocuments.map(doc => (
                                    <div 
                                        key={doc.id} 
                                        className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-md text-xs flex items-center"
                                        title={doc.name} // Show full name on hover
                                    >
                                        <span className="truncate max-w-[150px]">{doc.name}</span> {/* Truncate long names */}
                                        {/* Placeholder for remove button - would need onRemoveTaggedDocument prop */}
                                        {onRemoveTaggedDocument && (
                                            <button
                                                type="button" // Prevent form submission
                                                onClick={() => onRemoveTaggedDocument(doc.id)}
                                                className="ml-1.5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 focus:outline-none"
                                                title={`Remove ${doc.name}`}
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <span className="text-xs text-[--muted-text-color] italic"></span>
                            )}
                        </div>
                    </div>
                )}
                {/* Row 2 (Original Row 1): Container for textarea or visualizer */}
                <div className="relative w-full flex items-center min-h-[40px]">
                    {/* Conditional Rendering (Check isRecording before rendering visualizer) */}
                    {isRecording ? (
                        <div className="absolute inset-0 flex items-center justify-center p-1 z-10">
                            {/* --- NEW: Display Timer --- */}
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[--muted-text-color] z-20">
                                {formatDuration(recordingDuration)}
                            </span>
                            {/* --- END: Display Timer --- */}
                            <CustomAudioVisualizer
                                audioTimeDomainData={audioTimeDomainData} // Pass potentially null data
                            />
                        </div>
                    ) : (
                        <textarea
                            ref={textareaCallbackRef} // Use the callback ref here
                            rows={1}
                            className="chat-input-text bg-transparent w-full outline-none text-[--text-color] placeholder-[--muted-text-color] resize-none overflow-y-auto max-h-40"
                            // Adjust placeholder based on optional props
                            placeholder={isUploading ? "Uploading image..." : (isLoading ? "Generating response..." : (isRecording ? "Recording audio..." : (isTranscribing ? "Transcribing audio..." : (micAvailable ? "Type, show or say anything..." : "Type or show something...") ) ))}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            // Disable based on optional props
                            disabled={isLoading || isUploading || (isRecording ?? false) || (isTranscribing ?? false)} 
                        />
                    )}
                </div>
                {/* Bottom controls (Adjust ModelSelector/Button disabled states) */} 
                <div className="flex items-center justify-between w-full mt-2">
                    <div className="flex items-center space-x-2 flex-grow">
                        <div className="pl-1 pr-2">
                            <ModelSelector 
                                model={model} 
                                setModel={setModel} 
                                disabled={(isRecording ?? false) || (isTranscribing ?? false) || isLoading || isUploading} 
                                elementClassName="border-none bg-[--input-bg]"
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-auto">
                        <button
                            type="button"
                            onClick={handleUploadClick}
                            disabled={isLoading || isUploading || (isRecording ?? false) || (isTranscribing ?? false)} 
                            className="p-1 rounded-md text-[--muted-text-color] hover:bg-[--hover-bg] hover:text-[--text-color] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Attach Image"
                        >
                            <span className="w-5 h-5 block"><ImageUp aria-hidden="true" /></span>
                        </button>
                        <div className="relative w-8 h-8 flex items-center justify-center">
                            {showLoadingSpinner && (
                                <div className="absolute inset-0 border-2 border-[--primary-color] border-t-transparent rounded-full animate-spin pointer-events-none"></div>
                            )}
                            {isRecording && (
                                <div className="absolute inset-0 rounded-full bg-red-500 opacity-50 animate-ping pointer-events-none"></div> // Pulsing effect
                            )}
                            <button
                                type={buttonType}
                                onClick={buttonOnClick} // Already checks if functions exist
                                disabled={buttonDisabled}
                                className={buttonClassName}
                                title={buttonTitle}
                            >
                                <span className="w-5 h-5 block">
                                    {buttonIcon}
                                </span>
                            </button>
                        </div>
                       {/* Render the passed-in toggle icon button if it exists */}
                       {renderCollapsedMessageToggle}
                       {/* --- NEW: Mini-Pane Toggle Button --- */}
                       {isMainChatCollapsed && onToggleMiniPane && (
                            <button
                                ref={miniPaneToggleRef} // Apply the ref here
                                type="button"
                                onClick={onToggleMiniPane}
                                className="p-1 rounded-md text-[--muted-text-color] hover:bg-[--hover-bg] hover:text-[--text-color] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                title={isMiniPaneOpen ? "Hide Chat History" : "Show Chat History"}
                                aria-label={isMiniPaneOpen ? "Hide Chat History" : "Show Chat History"}
                            >
                                {isMiniPaneOpen ? <Minimize size={20} /> : <GalleryVerticalEnd size={20} />}
                            </button>
                       )}
                       {/* --- END NEW --- */}
                    </div>
                </div>
            </div>
        </>
    );
};

export default ChatInputUI;