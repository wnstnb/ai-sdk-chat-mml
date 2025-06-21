import React from 'react';
import { Undo, Redo, SaveAll, ClipboardCopy, Clock, Share2, CheckCircle, X } from 'lucide-react';
import { BlockNoteEditor } from '@blocknote/core';
import { AutosaveStatusIndicator } from '@/app/components/editor/AutosaveStatusIndicator';
import { useModalStore } from '@/stores/useModalStore';

interface EditorBottomActionBarProps {
    // Editor reference for undo/redo operations
    editorRef: React.RefObject<BlockNoteEditor<any>>;
    
    // Auto-save status and manual save
    autosaveStatus: 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';
    handleSaveContent: () => void;
    isSaving: boolean;
    
    // Version history
    onOpenHistory: () => void;
    
    // Auto-save batch context
    batchContext?: {
        isInBatch: boolean;
        batchType: 'ai-tools' | 'user-typing' | 'manual';
        batchChangesCount: number;
    };
    
    // Local save status for diff-based saves
    localSaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
}

export const EditorBottomActionBar: React.FC<EditorBottomActionBarProps> = ({
    editorRef,
    autosaveStatus,
    handleSaveContent,
    isSaving,
    onOpenHistory,
    batchContext,
    localSaveStatus,
}) => {
    const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied' | 'error'>('idle');
    const { openShareDocumentModal } = useModalStore();

    const handleCopyContent = async () => {
        if (!editorRef.current || editorRef.current.document.length === 0) {
            console.warn('Editor is empty or not available for copy.');
            setCopyStatus('error');
            setTimeout(() => setCopyStatus('idle'), 2000);
            return;
        }

        try {
            const editor = editorRef.current;
            const markdown = await editor.blocksToMarkdownLossy(editor.document);

            if (markdown.trim() === '') {
                console.warn('Editor content is effectively empty after Markdown conversion.');
                setCopyStatus('error');
                setTimeout(() => setCopyStatus('idle'), 2000);
                return;
            }

            await navigator.clipboard.writeText(markdown);
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        } catch (err) {
            console.error('Failed to copy content to clipboard:', err);
            setCopyStatus('error');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }
    };

    const handleUndo = () => {
        if (editorRef.current) {
            editorRef.current.undo();
        }
    };

    const handleRedo = () => {
        if (editorRef.current) {
            editorRef.current.redo();
        }
    };

    return (
        <div className="flex items-center justify-between px-1 py-1 bg-[--editor-bg] flex-shrink-0">
            {/* Left side: Auto-save status */}
            <div className="flex items-center">
                <AutosaveStatusIndicator 
                    status={autosaveStatus} 
                    batchContext={batchContext} 
                    localSaveStatus={localSaveStatus} 
                />
            </div>
            
            {/* Right side: Quick action buttons */}
            <div className="flex items-center space-x-2">
                {/* Undo/Redo buttons */}
                <button 
                    onClick={handleUndo} 
                    disabled={!editorRef.current} 
                    className="p-2 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed" 
                    title="Undo (Ctrl+Z)"
                >
                    <Undo size={18} />
                </button>
                <button 
                    onClick={handleRedo} 
                    disabled={!editorRef.current} 
                    className="p-2 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed" 
                    title="Redo (Ctrl+Y)"
                >
                    <Redo size={18} />
                </button>
                
                {/* Manual Save button */}
                <button 
                    onClick={handleSaveContent} 
                    disabled={isSaving || autosaveStatus === 'saving'} 
                    className="p-2 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed" 
                    title="Save Document Manually"
                >
                    {isSaving ? (
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <SaveAll className="h-5 w-5" />
                    )}
                </button>

                {/* Copy Content button */}
                <button
                    onClick={handleCopyContent}
                    disabled={!editorRef.current || editorRef.current.document.length === 0 || copyStatus === 'copied' || copyStatus === 'error'}
                    className="p-2 text-[--text-color] hover:bg-[--hover-bg] rounded disabled:opacity-50 disabled:cursor-not-allowed"
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

                {/* Version History button */}
                <button 
                    onClick={onOpenHistory} 
                    className="p-2 text-[--text-color] hover:bg-[--hover-bg] rounded" 
                    title="Version History"
                >
                    <Clock size={20} />
                </button>

                {/* Share button */}
                <button 
                    onClick={openShareDocumentModal} 
                    className="p-2 text-[--text-color] hover:bg-[--hover-bg] rounded" 
                    title="Share Document"
                >
                    <Share2 size={20} />
                </button>
            </div>
        </div>
    );
}; 