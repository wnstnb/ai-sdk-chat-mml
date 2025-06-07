import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { BlockNoteEditor, PartialBlock /*, BlockNoteEditorOptions */ } from '@blocknote/core'; // Temporarily comment out BlockNoteEditorOptions if it causes issues with `editable`
import { BlockNoteViewRaw, useBlockNote } from '@blocknote/react'; // Use BlockNoteViewRaw
import "@blocknote/core/style.css";
import { toast } from 'sonner';
// import { useTheme } from 'next-themes'; // Temporarily comment out

// Define the structure of a version item (unified from API)
interface Version {
    version_id: string;
    content: PartialBlock[]; 
    timestamp: string;
    save_type: 'autosave' | 'manual_save';
}

interface VersionHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    documentId: string;
    onRestoreContent: (restoredBlocks: PartialBlock[]) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
    isOpen,
    onClose,
    documentId,
    onRestoreContent,
}) => {
    const [versions, setVersions] = useState<Version[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
    const [selectedVersionContent, setSelectedVersionContent] = useState<PartialBlock[] | undefined>(undefined);
    const [isLoadingVersions, setIsLoadingVersions] = useState<boolean>(false);
    const [isRestoring, setIsRestoring] = useState<boolean>(false); 
    // const { theme } = useTheme(); // Temporarily comment out
    const currentTheme = 'light'; // Placeholder for theme

    // Let TypeScript infer the type for editorOptions for now
    const editorOptions = {
        editable: false,
        initialContent: selectedVersionContent,
    };

    const editor = useBlockNote(
        editorOptions,
        [selectedVersionContent] 
    );

    const fetchVersions = useCallback(async () => {
        if (!documentId) return;
        setIsLoadingVersions(true);
        setSelectedVersionContent(undefined); 
        console.log(`[VersionHistoryModal] Fetching versions for documentId: ${documentId}`); // Log documentId
        const apiUrl = `/api/documents/${documentId}/versions`;
        console.log(`[VersionHistoryModal] Calling API: ${apiUrl}`); // Log API URL
        try {
            const response = await fetch(apiUrl);
            console.log(`[VersionHistoryModal] API response status: ${response.status}`); // Log status

            if (!response.ok) {
                let errorText = response.statusText;
                try {
                    const errorData = await response.json();
                    console.error("[VersionHistoryModal] API error response (JSON):", errorData);
                    errorText = errorData.error || JSON.stringify(errorData) || errorText;
                } catch (e) {
                    // If response is not JSON, try to get text
                    try {
                        errorText = await response.text();
                        console.error("[VersionHistoryModal] API error response (text):", errorText);
                    } catch (textError) {
                        console.error("[VersionHistoryModal] Could not parse API error response as JSON or text.");
                    }
                }
                throw new Error(`Failed to fetch versions (${response.status}): ${errorText}`);
            }
            const data = await response.json(); 
            console.log("[VersionHistoryModal] API response data:", data); // Log successful data
            const fetchedVersions = data.data || [];
            setVersions(fetchedVersions);
            if (fetchedVersions.length > 0) {
                setSelectedVersionId(fetchedVersions[0].version_id);
                setSelectedVersionContent(fetchedVersions[0].content);
            } else {
                setSelectedVersionId(null);
                setSelectedVersionContent(undefined);
            }
        } catch (error) {
            console.error("Error fetching versions:", error);
        } finally {
            setIsLoadingVersions(false);
        }
    }, [documentId]);

    useEffect(() => {
        if (isOpen) {
            fetchVersions();
        }
    }, [isOpen, fetchVersions]);

    const handleVersionSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const versionId = event.target.value;
        const selected = versions.find(v => v.version_id === versionId);
        if (selected) {
            setSelectedVersionId(selected.version_id);
            setSelectedVersionContent(selected.content);
        }
    };

    const handleRestoreVersion = async () => {
        if (!selectedVersionId || !documentId) return;
        const selectedVersion = versions.find(v => v.version_id === selectedVersionId);
        if (!selectedVersion) return;

        setIsRestoring(true);
        try {
            const response = await fetch(`/api/documents/${documentId}/versions/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    version_id: selectedVersion.version_id,
                    save_type: selectedVersion.save_type,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("Failed to restore version:", response.status, errorData);
                toast.error(errorData.error || 'Failed to restore version process.');
                throw new Error(errorData.error || 'Failed to restore version');
            }

            if (selectedVersionContent) {
                onRestoreContent(selectedVersionContent);
                toast.success("Version restoration initiated!");
            } else {
                toast.error("Selected version content not available for restoration.");
                console.error("Error restoring version: selectedVersionContent is undefined.");
            }
        } catch (error) {
            toast.error('Error during version restoration process.', { id: 'restore-error-generic' });
            console.error("General error restoring version:", error); 
        } finally {
            setIsRestoring(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    const formatTimestamp = (timestamp: string) => {
        try {
            return new Date(timestamp).toLocaleString();
        } catch (e) {
            return "Invalid date";
        }
    };

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out"
            onClick={onClose} 
        >
            <div 
                className="bg-[var(--editor-bg)] p-6 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col text-[--text-color] transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modalFadeIn"
                onClick={(e) => e.stopPropagation()} 
            >
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-semibold">Version History</h2> {/* Simplified title */}
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-[--hover-bg]"
                        aria-label="Close version history"
                    >
                        <X size={24} />
                    </button>
                </div>
                
                {isLoadingVersions && (
                    <div className="flex-grow flex items-center justify-center">
                        <p className="text-[--muted-text-color]">Loading versions...</p>
                    </div>
                )}

                {!isLoadingVersions && versions.length === 0 && (
                    <div className="flex-grow flex items-center justify-center">
                        <p className="text-[--muted-text-color]">No versions found.</p> {/* Simplified message */}
                    </div>
                )}

                {!isLoadingVersions && versions.length > 0 && (
                    <div className="flex flex-col md:flex-row gap-4 flex-grow min-h-0"> 
                        <div className="w-full md:w-1/3 flex flex-col">
                            <label htmlFor="version-select" className="block text-sm font-medium text-[--muted-text-color] mb-1">
                                Select version:
                            </label>
                            <select
                                id="version-select"
                                value={selectedVersionId || ''}
                                onChange={handleVersionSelect}
                                className="block w-full p-2 border border-[--border-color] rounded-md bg-[--input-bg] text-[--text-color] focus:ring-[--primary-color] focus:border-[--primary-color] mb-4"
                            >
                                {versions.map((version) => (
                                    <option key={version.version_id} value={version.version_id}>
                                        {`${version.save_type === 'manual_save' ? 'Manual' : 'Auto'} - ${formatTimestamp(version.timestamp)}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="w-full md:w-2/3 flex-grow flex flex-col border border-[--border-color] rounded-md overflow-hidden bg-[--editor-bg]"> 
                           {editor && selectedVersionContent ? (
                                <BlockNoteViewRaw 
                                    editor={editor} 
                                    theme={currentTheme as 'light' | 'dark'}
                                    editable={false}
                                    sideMenu={false}
                                    slashMenu={false}
                                    formattingToolbar={false}
                                />
                            ) : (
                                <div className="flex-grow flex items-center justify-center p-4 text-center text-[--muted-text-color]">
                                    {isLoadingVersions ? 'Loading versions...' : (selectedVersionId ? 'Loading preview...' : 'Select a version.')}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="mt-6 flex justify-end space-x-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-[--border-color] rounded hover:bg-[--hover-bg] disabled:opacity-50"
                        disabled={isRestoring}
                    >
                        Close
                    </button>
                    <button
                        onClick={handleRestoreVersion}
                        disabled={!selectedVersionId || isRestoring || isLoadingVersions || versions.length === 0}
                        className="px-4 py-2 bg-[--primary-color] text-[--button-text-color] rounded hover:bg-[--primary-color-hover] disabled:opacity-50 flex items-center justify-center min-w-[150px]"
                    >
                        {isRestoring ? (
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-[--button-text-color]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg> 
                        ) : null}
                        {isRestoring ? 'Restoring...' : 'Restore this Version'}
                    </button>
                </div>
            </div>
             <style jsx global>{`
                @keyframes modalFadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-modalFadeIn {
                    animation: modalFadeIn 0.3s ease-out forwards;
                }
                /* Ensure BlockNoteViewRaw takes up available space */
                .bn-container {
                    height: 100%;
                    overflow-y: auto; /* Add scroll for content within BlockNote */
                }
            `}</style>
        </div>
    );
}; 