'use client';

import React, { useEffect, KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MicIcon, StopCircleIcon } from 'lucide-react';
import { AttachmentIcon, SendIcon } from '@/components/icons';
import { ModelSelector } from '@/components/ModelSelector';
import { TextFilePreview } from './TextFilePreview'; // Import from sibling file
import Image from 'next/image'; // Import Next.js Image

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
    isLoading: boolean; // From useChat (AI response generation)
    isUploading: boolean; // File upload in progress state
    uploadError: string | null; // File upload error message
    uploadedImagePath: string | null; // Path of successfully uploaded image
    onStop?: () => void; // Optional handler for stopping AI generation
    isChatCollapsed?: boolean; // To trigger height adjustment
    // --- NEW PROPS --- 
    isRecording: boolean;
    isTranscribing: boolean;
    micPermissionError: boolean;
    startRecording: () => void;
    stopRecording: () => void;
    // --- END NEW PROPS ---
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
    // --- NEW PROPS DESTRUCTURED ---
    isRecording,
    isTranscribing,
    micPermissionError,
    startRecording,
    stopRecording,
    // --- END NEW PROPS DESTRUCTURED ---
}) => {
    // Adjust textarea height dynamically based on content
    useEffect(() => {
        // Run on mount (due to key change) and when input changes
        if (inputRef.current) {
            console.log('ChatInputUI useEffect: Adjusting height'); // Debug log
            inputRef.current.style.height = 'auto'; // Reset height first
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
        // No timeout needed here anymore
    }, [input, inputRef]); // Remove isChatCollapsed dependency

    // Determine if send button should be enabled for *submitting text*
    const canSubmitText = !isLoading && !isUploading && !isTranscribing && !!input.trim();

    // Determine if mic button should be enabled
    const canRecord = !isLoading && !isUploading && !isRecording && !isTranscribing && !micPermissionError;

    const handleButtonClick = () => {
        if (isLoading && onStop) { // Stop AI Generation
            onStop();
        } else if (isRecording) { // Stop Recording
            stopRecording();
        } else if (!input.trim() && !uploadedImagePath) { // Start Recording (only if input is empty and no image)
            startRecording();
        } else {
            // Let the parent form handle text/image submission
            // If not using a form, you might need an onSubmit prop
        }
    };

    // Determine button properties dynamically
    let buttonIcon: React.ReactNode;
    let buttonTitle: string;
    let buttonDisabled: boolean;
    let buttonType: "button" | "submit";
    let buttonOnClick: (() => void) | undefined = handleButtonClick;
    let buttonClassName = `w-full h-full flex items-center justify-center rounded-full text-[--muted-text-color] focus:outline-none`;
    let showLoadingSpinner = isLoading; // Show spinner only for AI loading
    let showPulsingIndicator = isRecording; // Show pulsing effect when recording

    if (isLoading) { // AI Response Loading
        buttonIcon = <StopIcon aria-hidden="true" />;
        buttonTitle = "Stop generating";
        buttonDisabled = false; // Always allow stopping
        buttonType = "button";
        buttonClassName += ` bg-[--hover-bg]`;
    } else if (isRecording) { // Currently Recording
        buttonIcon = <StopCircleIcon aria-hidden="true" />;
        buttonTitle = "Stop recording";
        buttonDisabled = false; // Always allow stopping recording
        buttonType = "button";
        buttonClassName += ` bg-red-500/20 text-red-500 hover:bg-red-500/30`; // Active recording style
    } else if (!input.trim() && !uploadedImagePath) { // Input is empty, show Mic
        buttonIcon = <MicIcon aria-hidden="true" />;
        buttonTitle = micPermissionError ? "Mic permission denied" : (isTranscribing ? "Transcribing..." : "Record audio input");
        buttonDisabled = !canRecord || isTranscribing; // Disable if cannot record or is transcribing
        buttonType = "button";
        buttonClassName += buttonDisabled ? ` opacity-50 cursor-not-allowed` : ` enabled:hover:bg-[--hover-bg] enabled:hover:text-[--text-color]`;
    } else { // Input has text or image, show Send
        buttonIcon = <SendIcon aria-hidden="true" />;
        buttonTitle = "Send message";
        buttonDisabled = !canSubmitText || isTranscribing; // Disable if cannot submit or is transcribing
        buttonType = "submit";
        buttonClassName += buttonDisabled ? ` opacity-50 cursor-not-allowed` : ` enabled:hover:bg-[--hover-bg] enabled:hover:text-[--text-color]`;
        buttonOnClick = undefined; // Use form's onSubmit for type="submit"
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
                                                className={`rounded-md object-cover ${isUploading ? 'opacity-50' : ''}`}
                                                onLoad={() => URL.revokeObjectURL(URL.createObjectURL(file))} // Clean up object URL
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
                disabled={isLoading || isUploading || isRecording || isTranscribing} // Also disable file input
            />

            <div className="flex flex-col w-full bg-[--input-bg] rounded-lg p-2 border border-[--border-color] shadow-sm">
                 {/* ... textarea ... */}
                 <textarea
                     ref={inputRef}
                     rows={1}
                     className="bg-transparent w-full outline-none text-[--text-color] placeholder-[--muted-text-color] resize-none overflow-y-auto max-h-40 align-bottom"
                     placeholder={isUploading ? "Uploading image..." : (isLoading ? "Generating response..." : (isRecording ? "Recording audio..." : (isTranscribing ? "Transcribing audio..." : "Ask a question, give instructions, or click mic...") ))}
                     value={input}
                     onChange={handleInputChange}
                     onKeyDown={handleKeyDown}
                     onPaste={handlePaste}
                     disabled={isLoading || isUploading || isRecording || isTranscribing} // Disable textarea during busy states
                 />
                 {/* ... bottom controls ... */}
                 <div className="flex items-center justify-between w-full mt-2">
                     <div className="pl-1 pr-2">
                         <ModelSelector 
                             model={model} 
                             setModel={setModel} 
                             disabled={isRecording || isTranscribing || isLoading || isUploading} 
                         />
                     </div>
                     <div className="flex items-center space-x-2 ml-auto">
                         <button
                             type="button"
                             onClick={handleUploadClick}
                             disabled={isLoading || isUploading || isRecording || isTranscribing} // Also disable during recording/transcribing
                             className="p-1 rounded-md text-[--muted-text-color] hover:bg-[--hover-bg] hover:text-[--text-color] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                             title="Attach Image"
                         >
                             <span className="w-5 h-5 block"><AttachmentIcon aria-hidden="true" /></span>
                         </button>
                         <div className="relative w-8 h-8 flex items-center justify-center"> {/* Container for positioning animation */}
                             {showLoadingSpinner && (
                                 <div className="absolute inset-0 border-2 border-[--primary-color] border-t-transparent rounded-full animate-spin pointer-events-none"></div>
                             )}
                             {showPulsingIndicator && (
                                 <div className="absolute inset-0 rounded-full bg-red-500 opacity-50 animate-ping pointer-events-none"></div> // Pulsing effect
                             )}
                             <button
                                 type={buttonType}
                                 onClick={buttonOnClick}
                                 disabled={buttonDisabled}
                                 className={buttonClassName}
                                 title={buttonTitle}
                             >
                                 <span className="w-5 h-5 block">
                                     {buttonIcon}
                                 </span>
                             </button>
                         </div>
                     </div>
                 </div>
            </div>
        </>
    );
};