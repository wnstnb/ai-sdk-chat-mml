import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Edit, Save, X, Sparkles, Clock, ClipboardCopy, CheckCircle, SaveAll } from 'lucide-react';
import { DocumentPlusIcon } from '@heroicons/react/24/outline';
import { AutosaveStatusIndicator } from '@/app/components/editor/AutosaveStatusIndicator';
import { BlockNoteEditor } from '@blocknote/core'; // Added for editorRef type
import { useModalStore } from '@/stores/useModalStore'; // Import the modal store

// Define the props for the EditorTitleBar component
interface EditorTitleBarProps {
    // From useTitleManagement hook
    currentTitle: string;
    isEditingTitle: boolean;
    newTitleValue: string;
    setNewTitleValue: (value: string) => void;
    handleTitleInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    handleSaveTitle: () => void;
    handleCancelEditTitle: () => void;
    handleEditTitleClick: () => void;
    isInferringTitle: boolean;
    handleInferTitle: () => void;
    editorRef: React.RefObject<BlockNoteEditor<any>>; // Need editorRef for disabling infer title button

    // From page.tsx state/handlers
    autosaveStatus: 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';
    handleNewDocument: () => void;
    handleSaveContent: () => void;
    isSaving: boolean; // Manual save button state
    onOpenHistory: () => void; // Prop to open version history modal
}

export const EditorTitleBar: React.FC<EditorTitleBarProps> = ({
    currentTitle,
    isEditingTitle,
    newTitleValue,
    setNewTitleValue,
    handleTitleInputKeyDown,
    handleSaveTitle,
    handleCancelEditTitle,
    handleEditTitleClick,
    isInferringTitle,
    handleInferTitle,
    editorRef, // Receive editorRef
    autosaveStatus,
    handleSaveContent,
    isSaving,
    onOpenHistory, // Destructure new prop
}) => {
    const { openNewDocumentModal } = useModalStore(); // Get the action from the store
    const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied' | 'error'>('idle');

    const handleCopyContent = async () => {
        if (!editorRef.current || editorRef.current.document.length === 0) {
            console.warn('Editor is empty or not available for copy.');
            setCopyStatus('error'); // Briefly show error if trying to copy empty
            setTimeout(() => setCopyStatus('idle'), 2000);
            return;
        }

        try {
            const editor = editorRef.current;
            const markdown = await editor.blocksToMarkdownLossy(editor.document);

            if (markdown.trim() === '') {
                console.warn('Editor content is effectively empty after Markdown conversion.');
                setCopyStatus('error'); // Treat as an error or neutral if preferred
                setTimeout(() => setCopyStatus('idle'), 2000);
                return;
            }

            await navigator.clipboard.writeText(markdown);
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000); // Revert to idle after 2 seconds
        } catch (err) {
            console.error('Failed to copy content to clipboard:', err);
            setCopyStatus('error');
            setTimeout(() => setCopyStatus('idle'), 2000); // Revert to idle after 2 seconds
        }
    };

    return (
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
                        <h2 className="text-lg font-semibold text-[--text-color] truncate" title={currentTitle}>{currentTitle}</h2>
                        <button
                            onClick={handleInferTitle}
                            className="p-1 rounded hover:bg-[--hover-bg] text-[--muted-text-color] hover:text-[--text-color] disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                            aria-label="Suggest title from content"
                            title="Suggest title from content"
                            disabled={isInferringTitle || !editorRef.current} // Use prop
                        >
                            {isInferringTitle ? (
                                 <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                    style={{ display: 'flex' }}
                                 >
                                     <Sparkles size={16} className="text-yellow-500" />
                                 </motion.div>
                            ) : (
                                 <Sparkles size={16} />
                            )}
                        </button>
                        <button onClick={handleEditTitleClick} className="p-1 text-[--muted-text-color] hover:text-[--text-color] hover:bg-[--hover-bg] rounded flex-shrink-0" title="Rename Document"><Edit size={16} /></button>
                    </>
                )}
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
                <AutosaveStatusIndicator status={autosaveStatus} />
                <button 
                    onClick={openNewDocumentModal} // Changed to call the store action directly
                    className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded" 
                    title="Create New Document"
                >
                    <DocumentPlusIcon className="h-5 w-5" />
                </button>
                <button onClick={handleSaveContent} disabled={isSaving || autosaveStatus === 'saving'} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed" title="Save Document Manually">
                   {isSaving ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SaveAll className="h-5 w-5" />}
                </button>

                {/* NEW "COPY CONTENT" BUTTON - START */}
                <button
                    onClick={handleCopyContent}
                    disabled={!editorRef.current || editorRef.current.document.length === 0 || copyStatus === 'copied' || copyStatus === 'error'}
                    className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                        copyStatus === 'copied' ? "Content Copied to Clipboard!" :
                        copyStatus === 'error' ? "Failed to copy content" :
                        "Copy Document Content (Markdown)"
                    }
                >
                    {copyStatus === 'copied' ? (
                        <CheckCircle size={20} className="text-green-500" />
                    ) : copyStatus === 'error' ? (
                        <X size={20} className="text-red-500" /> 
                    ) : (
                        <ClipboardCopy size={20} />
                    )}
                </button>
                {/* NEW "COPY CONTENT" BUTTON - END */}

                <button onClick={onOpenHistory} className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded" title="Version History">
                    <Clock size={20} />
                </button>
            </div>
        </div>
    );
}; 