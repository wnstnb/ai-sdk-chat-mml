import React from 'react';
import { X } from 'lucide-react';
import { ChatInputUI } from './ChatInputUI'; // Assuming ChatInputUI is in the same directory or adjust path

// Define props based on what the form and ChatInputUI need from the parent (page.tsx hooks)
interface ChatInputAreaProps {
    // From useChatInteractions
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
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
    formRef: React.RefObject<HTMLFormElement>;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    fileInputRef: React.RefObject<HTMLInputElement>;
    
    // General event handlers (might be handled within ChatInputUI or needed here)
    handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
    // Destructure all props
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    model,
    setModel,
    stop,
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
}) => {
    return (
        <div className="w-full px-0 pb-4 border-t border-[--border-color] pt-4 flex-shrink-0 bg-[--bg-secondary]">
            <form ref={formRef} onSubmit={handleSubmit} className="w-full flex flex-col items-center">
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
                {/* Re-use ChatInputUI component */}
                <ChatInputUI 
                    files={files} 
                    fileInputRef={fileInputRef} 
                    handleFileChange={handleFileChange} 
                    inputRef={inputRef} 
                    input={input} 
                    handleInputChange={handleInputChange} 
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
                />
            </form>
        </div>
    );
}; 