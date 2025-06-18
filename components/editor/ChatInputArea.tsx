import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { ChatInputUI } from './ChatInputUI'; // Assuming ChatInputUI is in the same directory or adjust path
import type { AudioTimeDomainData } from '@/lib/hooks/editor/useChatInteractions'; // <<< Import type
import { TaggedDocument } from '@/lib/types'; // Import TaggedDocument from shared types
import { AttachedToastContainer } from '@/components/chat/AttachedToastContainer';
import { useAttachedToastContext } from '@/contexts/AttachedToastContext';

// Define TaggedDocument interface (assuming it might not be globally available here yet)
// interface TaggedDocument {
//     id: string;
//     name: string;
// }

// Define props based on what the form and ChatInputUI need from the parent (page.tsx hooks)
interface ChatInputAreaProps {
    // From useChatInteractions
    input: string;
    setInput: (value: string) => void;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    sendMessage: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
    isLoading: boolean; // isChatLoading in page.tsx
    model: string;
    setModel: React.Dispatch<React.SetStateAction<string>>;
    stop: () => void;
    
    // From useFileUpload
    files: FileList | null;
    handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handlePaste: (event: React.ClipboardEvent<Element>) => void;
    handleUploadClick: () => void;
    isUploading: boolean;
    uploadError: string | null;
    uploadedImagePath: string | null;
    
    // From useFollowUpStore
    followUpContext: string | null;
    setFollowUpContext: (context: string | null) => void;
    
    // Refs needed by ChatInputUI or form
    formRef: React.RefCallback<HTMLFormElement>;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    fileInputRef: React.RefObject<HTMLInputElement>;
    
    // General event handlers (might be handled within ChatInputUI or needed here)
    handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;

    // ADDED: To pass down for height adjustment logic
    isChatCollapsed?: boolean;

    // --- NEW AUDIO PROPS ---
    isRecording: boolean;
    isTranscribing: boolean;
    micPermissionError: boolean;
    startRecording: () => void;
    stopRecording: (timedOut?: boolean) => void;
    onCancelRecording?: () => void; // Cancel recording without sending
    audioTimeDomainData: AudioTimeDomainData; // <<< Add the prop type here
    recordingDuration: number; // Duration in seconds
    onSilenceDetected?: () => void; // Silence detection callback
    // --- END NEW AUDIO PROPS ---

    // --- ADD CLEAR PREVIEW PROP --- 
    clearPreview: () => void;
    // --- END CLEAR PREVIEW PROP ---

    // For document tagging - these props are still relevant
    taggedDocuments: TaggedDocument[];
    setTaggedDocuments: React.Dispatch<React.SetStateAction<TaggedDocument[]>>;
    // --- NEW: Props for Mini-Pane toggle (from parent, passed to ChatInputUI) ---
    isMiniPaneOpen?: boolean;
    onToggleMiniPane?: () => void;
    isMainChatCollapsed?: boolean;
    miniPaneToggleRef?: React.RefObject<HTMLButtonElement>; // Ref for the toggle button
    // --- END NEW ---

    // --- NEW: Orchestrator file upload props ---
    orchestratorHandleFileUploadStart?: (file: File) => Promise<string | null>;
    orchestratorCancelFileUpload?: () => void;
    orchestratorPendingFile?: any; // Will be defined properly in types
    orchestratorIsFileUploadInProgress?: () => boolean;
    orchestratorIsChatInputBusy?: boolean;
    orchestratorCurrentOperationStatusText?: string | null;
    // --- END NEW ---
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
    // Destructure all props
    input,
    setInput,
    handleInputChange,
    sendMessage,
    isLoading,
    model,
    setModel,
    stop,
    // --- NEW AUDIO PROPS DESTRUCTURED ---
    isRecording,
    isTranscribing,
    micPermissionError,
    startRecording,
    stopRecording,
    onCancelRecording, // Cancel recording without sending
    audioTimeDomainData, // <<< Destructure the new prop
    recordingDuration,
    onSilenceDetected,
    // --- END NEW AUDIO PROPS DESTRUCTURED ---
    files,
    handleFileChange,
    handlePaste,
    handleUploadClick,
    isUploading,
    uploadError,
    uploadedImagePath,
    followUpContext,
    setFollowUpContext,
    formRef,
    inputRef,
    fileInputRef,
    handleKeyDown,
    isChatCollapsed,
    // --- DESTRUCTURE CLEAR PREVIEW PROP ---
    clearPreview,
    // --- END DESTRUCTURE CLEAR PREVIEW PROP ---
    taggedDocuments, // Destructure taggedDocuments
    setTaggedDocuments, // Destructure setTaggedDocuments
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
    // Initialize attached toasts
    const { toasts } = useAttachedToastContext();
    // const [showTagDropdown, setShowTagDropdown] = useState(false); // Removed
    // const [tagQuery, setTagQuery] = useState(''); // Removed
    // const [tagSearchResults, setTagSearchResults] = useState<TaggedDocument[]>([]); // Removed
    // const [isTagSearchLoading, setIsTagSearchLoading] = useState(false); // Removed
    // const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null); // Removed
    // const [activeTagQuery, setActiveTagQuery] = useState<string | null>(null); // Removed

    // const fetchTaggableDocuments = useCallback(async (query: string) => { // Removed - logic moved to DocumentSearchInput
    // ... (implementation removed)
    // }, []);

    // const debouncedFetchTaggableDocuments = useCallback(debounce(fetchTaggableDocuments, 300), [fetchTaggableDocuments]); // Removed

    // useEffect(() => { // Removed
    //     if (tagQuery) { // Removed
    //         debouncedFetchTaggableDocuments(tagQuery); // Removed
    //     } else { // Removed
    //         setTagSearchResults([]); // Removed
    //     } // Removed
    // }, [tagQuery, debouncedFetchTaggableDocuments]); // Removed

    // This is the original handleInputChange passed from the parent, now used directly by ChatInputUI
    // The @mention specific logic is removed.
    const localHandleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => {
        handleInputChange(e); 
    };

    // const handleTagSelect = (doc: TaggedDocument) => { // Removed old tag selection logic
    // ... (implementation removed)
    // };

    const handleAddTaggedDocument = (docToAdd: TaggedDocument) => {
        // Prevent adding duplicates
        if (!taggedDocuments.find(doc => doc.id === docToAdd.id)) {
            setTaggedDocuments(prevDocs => [...prevDocs, docToAdd]);
        }
    };

    const handleRemoveTaggedDocument = (docIdToRemove: string) => {
        setTaggedDocuments(prevDocs => prevDocs.filter(doc => doc.id !== docIdToRemove));
    };

    return (
        <div className="w-full px-0 pb-4 pt-4 flex-shrink-0 bg-[--bg-secondary] relative">
            {/* Attached Toast Container */}
            <AttachedToastContainer toasts={toasts} />
            {/* Display area for selected document tags (pills) - REMOVED */}
            {/* {taggedDocuments.length > 0 && (
                <div className="w-full px-4 md:px-0 mb-2 flex flex-wrap gap-2">
                    {taggedDocuments.map((doc) => (
                        <div 
                            key={doc.id} 
                            className="flex items-center bg-[--button-bg] text-[--button-text-color] text-xs px-2 py-1 rounded-full"
                        >
                            <span className="mr-1">{doc.name}</span>
                            <button 
                                onClick={() => handleRemoveTaggedDocument(doc.id)}
                                className="ml-1 text-[--muted-text-color] hover:text-[--text-color]"
                                title="Remove document"
                                type="button" // Important for forms
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )} */}
            
                            <form ref={formRef} onSubmit={sendMessage} className="w-full flex flex-col items-center">
                {/* Follow Up Context Display */}
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
                {/* Re-use ChatInputUI component, passing down audio props */}
                <ChatInputUI 
                    isChatCollapsed={isChatCollapsed}
                    files={files} 
                    fileInputRef={fileInputRef} 
                    handleFileChange={handleFileChange} 
                    inputRef={inputRef} 
                    input={input} 
                    handleInputChange={localHandleInputChange} 
                    handleKeyDown={handleKeyDown} 
                    handlePaste={handlePaste} 
                    model={model} 
                    setModel={setModel} 
                    handleUploadClick={handleUploadClick} 
                    isLoading={isLoading} 
                    isUploading={isUploading} 
                    uploadError={uploadError} 
                    uploadedImagePath={uploadedImagePath} 
                    onStop={stop} 
                    // --- NEW AUDIO PROPS PASSED DOWN ---
                    isRecording={isRecording}
                    isTranscribing={isTranscribing}
                    micPermissionError={micPermissionError}
                    startRecording={startRecording}
                    stopRecording={stopRecording}
                    onCancelRecording={onCancelRecording} // Cancel recording without sending
                    audioTimeDomainData={audioTimeDomainData} // <<< Pass the prop down
                    recordingDuration={recordingDuration}
                    onSilenceDetected={onSilenceDetected}
                    clearPreview={clearPreview} // <-- PASS PROP DOWN
                    // --- END NEW AUDIO PROPS PASSED DOWN ---
                    
                    // Pass new props for document tagging to ChatInputUI
                    taggedDocuments={taggedDocuments}
                    onAddTaggedDocument={handleAddTaggedDocument}
                    onRemoveTaggedDocument={handleRemoveTaggedDocument}
                    // --- NEW: Pass Mini-Pane props to ChatInputUI ---
                    isMiniPaneOpen={isMiniPaneOpen}
                    onToggleMiniPane={onToggleMiniPane}
                    isMainChatCollapsed={isMainChatCollapsed}
                    miniPaneToggleRef={miniPaneToggleRef} // Pass the ref down
                    // --- END NEW ---

                    // --- NEW: Pass orchestrator props to ChatInputUI ---
                    orchestratorHandleFileUploadStart={orchestratorHandleFileUploadStart}
                    orchestratorCancelFileUpload={orchestratorCancelFileUpload}
                    orchestratorPendingFile={orchestratorPendingFile}
                    orchestratorIsFileUploadInProgress={orchestratorIsFileUploadInProgress}
                    orchestratorIsChatInputBusy={orchestratorIsChatInputBusy}
                    orchestratorCurrentOperationStatusText={orchestratorCurrentOperationStatusText}
                    // --- END NEW ---
                />
            </form>
            {/* {showTagDropdown && dropdownPosition && ( // Removed old dropdown rendering
                <DocumentTagDropdown 
                    matchingDocuments={tagSearchResults} 
                    onSelectDocument={handleTagSelect} 
                    isLoading={isTagSearchLoading} 
                    position={dropdownPosition} 
                />
            )} */}
        </div>
    );
}; 