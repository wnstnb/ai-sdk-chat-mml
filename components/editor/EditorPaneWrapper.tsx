import React from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import type { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { ChatInputUI } from './ChatInputUI'; // Assuming it's in the same directory

// Dynamically import BlockNoteEditorComponent with SSR disabled
// Define loading state consistent with page.tsx
const BlockNoteEditorComponent = dynamic(
    () => import('@/components/BlockNoteEditorComponent'),
    {
        ssr: false,
        loading: () => <p className="p-4 text-center text-[--muted-text-color]">Loading Editor...</p>,
    }
);

// Define props required by the EditorPaneWrapper and its potential children
interface EditorPaneWrapperProps {
    // For BlockNoteEditorComponent
    documentId: string; // Needed for key prop
    initialContent: PartialBlock<any>[] | undefined;
    editorRef: React.RefObject<BlockNoteEditor<any>>; 
    onEditorContentChange: (editor: BlockNoteEditor<any>) => void; // Renamed from handleEditorChange
    
    // For Collapsed Chat Input section
    isChatCollapsed: boolean;
    
    // Props for the collapsed ChatInputUI (similar to ChatInputArea)
    // From useChatInteractions
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>) => void;
    handleSubmit: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
    isLoading: boolean; 
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
    // General event handlers
    handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const EditorPaneWrapper: React.FC<EditorPaneWrapperProps> = ({
    documentId,
    initialContent,
    editorRef,
    onEditorContentChange,
    isChatCollapsed,
    // Destructure all props needed for collapsed ChatInputUI
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
        <div className="flex-1 flex flex-col relative border rounded-lg bg-[--editor-bg] border-[--border-color] shadow-sm overflow-hidden">
            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto p-4 styled-scrollbar">
                {initialContent !== undefined ? (
                    <BlockNoteEditorComponent
                        key={documentId} 
                        editorRef={editorRef}
                        initialContent={initialContent}
                        onEditorContentChange={onEditorContentChange} 
                    />
                ) : (
                    // Consistent loading state
                    <p className="p-4 text-center text-[--muted-text-color]">Initializing editor...</p>
                )}
            </div>

            {/* Collapsed Chat Input (Rendered conditionally at the bottom) */}
            {isChatCollapsed && (
                <div className="p-4 pt-2 border-t border-[--border-color] z-10 bg-[--editor-bg] flex-shrink-0">
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
                        {/* Use ChatInputUI directly here */}
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
            )}
        </div>
    );
}; 