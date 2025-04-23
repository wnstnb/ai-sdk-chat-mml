'use client';

import React, { useEffect, KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AttachmentIcon, SendIcon } from '@/components/icons';
import { ModelSelector } from '@/components/ModelSelector';
import { TextFilePreview } from './TextFilePreview'; // Import from sibling file

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

// --- Chat Input UI Component (JSX only - Copied) ---
interface ChatInputUIProps {
    files: FileList | null;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    inputRef: React.RefObject<HTMLTextAreaElement>;
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
    isLoading: boolean; // From useChat
    isUploading: boolean; // NEW: Upload in progress state
    uploadError: string | null; // NEW: Upload error message
    uploadedImagePath: string | null; // NEW: Path of successfully uploaded image
    onStop?: () => void; // Optional handler for stopping generation
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
    isLoading,
    isUploading,
    uploadError,
    uploadedImagePath,
    onStop,
}) => {
    // Adjust textarea height dynamically based on content
    useEffect(() => {
        // Always adjust height if the ref exists
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [input, inputRef]);

    // Determine if send button should be enabled for *submitting*
    // The button itself might be active for stopping
    const canSubmit = !isLoading && !isUploading && (!!input.trim() || !!uploadedImagePath);

    const handleSendClick = () => {
        if (isLoading && onStop) {
            onStop();
        } else {
            // Let the parent form handle submission
            // If not using a form, you might need an onSubmit prop
        }
    };

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
                                            <img // Using simple img tag, motion wrapper was removed for simplicity here
                                                src={URL.createObjectURL(file)}
                                                alt={file.name}
                                                className={`rounded-md w-16 h-16 object-cover ${isUploading ? 'opacity-50' : ''}`}
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
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
                disabled={isLoading || isUploading} 
            />

            <div className="flex flex-col w-full bg-[--input-bg] rounded-lg p-2 border border-[--border-color] shadow-sm">
                 {/* ... textarea ... */}
                 <textarea
                     ref={inputRef}
                     rows={1}
                     className="bg-transparent w-full outline-none text-[--text-color] placeholder-[--muted-text-color] resize-none overflow-y-auto max-h-40 align-bottom"
                     placeholder={isUploading ? "Uploading image..." : (isLoading ? "Generating response..." : "Ask a question or give instructions...")}
                     value={input}
                     onChange={handleInputChange}
                     onKeyDown={handleKeyDown}
                     onPaste={handlePaste}
                     disabled={isLoading || isUploading} 
                 />
                 {/* ... bottom controls ... */}
                 <div className="flex items-center justify-between w-full mt-2"> {/* Added mt-2 */} 
                     <div className="pl-1 pr-2">
                         <ModelSelector model={model} setModel={setModel} />
                     </div>
                     <div className="flex items-center space-x-2 ml-auto">
                         <button
                             type="button"
                             onClick={handleUploadClick}
                             disabled={isLoading || isUploading}
                             className="p-1 rounded-md text-[--muted-text-color] hover:bg-[--hover-bg] hover:text-[--text-color] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                             title="Attach Image"
                         >
                             <span className="w-5 h-5 block"><AttachmentIcon aria-hidden="true" /></span>
                         </button>
                         {/* Send/Stop Button Container */}
                         <div className="relative w-8 h-8 flex items-center justify-center"> {/* Container for positioning animation */}
                             {isLoading && (
                                 <div className="absolute inset-0 border-2 border-[--primary-color] border-t-transparent rounded-full animate-spin pointer-events-none"></div>
                             )}
                             <button
                                 type={isLoading ? "button" : "submit"} // Change type based on loading state
                                 onClick={handleSendClick} // Use combined handler
                                 // Disable only if not loading AND cannot submit
                                 disabled={!isLoading && !canSubmit}
                                 className={`w-full h-full flex items-center justify-center rounded-full text-[--muted-text-color] disabled:opacity-50 disabled:cursor-not-allowed ${isLoading ? 'bg-[--hover-bg]' : 'enabled:hover:bg-[--hover-bg] enabled:hover:text-[--text-color] focus:outline-none'}`}
                                 title={isLoading ? "Stop generating" : "Send message"}
                             >
                                 <span className="w-5 h-5 block">
                                     {isLoading ? <StopIcon aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
                                 </span>
                             </button>
                         </div>
                     </div>
                 </div>
            </div>
        </>
    );
}; 