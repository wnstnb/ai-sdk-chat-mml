import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Edit, Save, X, Sparkles, Star } from 'lucide-react';
import { BlockNoteEditor } from '@blocknote/core'; // Added for editorRef type
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import TuonLogoIcon from '@/components/ui/TuonLogoIcon'; // ADDED: Import TuonLogoIcon
import styles from '@/components/sidebar/Sidebar.module.css'; // ADDED: Import sidebar styles
import { useModalStore } from '@/stores/useModalStore'; // ADDED: Import modal store

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
    handleInferTitle: () => Promise<void>;
    editorRef: React.RefObject<BlockNoteEditor<any>>; // Need editorRef for disabling infer title button

    // ADDED for starring
    isDocumentStarred: boolean;
    onToggleDocumentStar: () => void;
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
    // ADDED for starring
    isDocumentStarred,
    onToggleDocumentStar,
}) => {
    const [titleValue, setTitleValue] = useState(currentTitle);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const { openMobileSidebar } = useModalStore(); // ADDED: Get functions from store

    return (
        <div className="flex justify-between items-center mb-2 flex-shrink-0">
            <div className="flex items-center gap-2 flex-grow min-w-0">
                {/* UPDATED: Mobile-only Tuon logo button to open sidebar */}
                {isMobile && (
                    <button
                        onClick={openMobileSidebar} // UPDATED: Use store function
                        className={styles.toggleButton}
                        aria-label="Open sidebar"
                    >
                        <TuonLogoIcon className={styles.toggleButtonLogo} />
                    </button>
                )}

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
                        {/* Star Button for current document */}
                        <button 
                            onClick={onToggleDocumentStar}
                            className="p-1 text-yellow-500 hover:text-yellow-400 rounded focus:outline-none focus:ring-1 focus:ring-yellow-500 ml-1 flex-shrink-0"
                            aria-label={isDocumentStarred ? `Unstar this document` : `Star this document`}
                            title={isDocumentStarred ? "Unstar document" : "Star document"}
                        >
                            {isDocumentStarred ? <Star size={16} className="fill-current" /> : <Star size={16} />}
                        </button>
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
            {/* Quick action buttons moved to EditorBottomActionBar */}
            <div className="flex items-center space-x-2 flex-shrink-0">
                {/* Keep only essential title bar elements - quick actions moved to bottom */}
            </div>
        </div>
    );
}; 