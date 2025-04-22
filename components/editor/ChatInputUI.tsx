'use client';

import React, { useEffect, KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AttachmentIcon, SendIcon } from '@/components/icons';
import { ModelSelector } from '@/components/ModelSelector';
import { TextFilePreview } from './TextFilePreview'; // Import from sibling file

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
}) => {
    // Adjust textarea height dynamically based on content
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [input, inputRef]);

    return (
        <>
            <AnimatePresence>
                {files && files.length > 0 && (
                    <div className="flex flex-row gap-2 px-4 w-full md:px-0 mb-2 overflow-x-auto styled-scrollbar-thin">
                        {Array.from(files).map((file) =>
                            file.type.startsWith('image') ? (
                                <div key={file.name} className="flex-shrink-0 relative">
                                    <motion.img
                                        src={URL.createObjectURL(file)}
                                        alt={file.name}
                                        className="rounded-md w-16 h-16 object-cover"
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; /* Hide broken image preview */ }}
                                    />
                                </div>
                            ) : file.type.startsWith('text') ? (
                                <motion.div
                                    key={file.name}
                                    className="flex-shrink-0 text-[8px] leading-tight w-20 h-16 overflow-hidden text-zinc-500 border p-1 rounded-lg bg-[--message-bg] border-[--border-color] text-[--text-color]"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                >
                                    <TextFilePreview file={file} />
                                </motion.div>
                            ) : null
                        )}
                    </div>
                )}
            </AnimatePresence>

            <input
                type="file"
                multiple
                accept="image/*,text/*" // Allow text and image files
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
                disabled={isLoading}
            />

            <div className="flex flex-col w-full bg-[--input-bg] rounded-lg p-2 border border-[--border-color] shadow-sm">
                <div className="flex-grow w-full mb-2">
                    <textarea
                        ref={inputRef}
                        rows={1}
                        className="bg-transparent w-full outline-none text-[--text-color] placeholder-[--muted-text-color] resize-none overflow-y-auto max-h-40 align-bottom"
                        placeholder="Ask a question or give instructions..."
                        value={input}
                        onChange={handleInputChange} // Use useChat's handler
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        disabled={isLoading} // Disable during loading
                    />
                </div>

                <div className="flex items-center justify-between w-full">
                    <div className="pl-1 pr-2">
                        <ModelSelector model={model} setModel={setModel} />
                    </div>

                    <div className="flex items-center space-x-2 ml-auto">
                        <button
                            type="button"
                            onClick={handleUploadClick}
                            disabled={isLoading}
                            className="p-1 rounded-md text-[--muted-text-color] hover:bg-[--hover-bg] hover:text-[--text-color] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Upload Files"
                            title="Attach Files"
                        >
                            <span className="w-5 h-5 block">
                                <AttachmentIcon aria-hidden="true" />
                            </span>
                        </button>
                        <button
                            type="submit" // Triggers form submission handled by useChat wrapper
                            disabled={isLoading || (!input.trim() && (!files || files.length === 0))}
                            className="p-1 rounded-md text-[--muted-text-color] disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:bg-[--hover-bg] enabled:hover:text-[--text-color] focus:outline-none"
                            aria-label="Send message"
                            title="Send message"
                        >
                            <span className="w-5 h-5 block">
                                <SendIcon aria-hidden="true" />
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}; 