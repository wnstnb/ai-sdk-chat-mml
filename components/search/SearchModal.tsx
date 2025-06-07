'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, SearchIcon, FileText, Clock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Omnibar } from '@/components/search/Omnibar';
import { useSearchStore } from '@/stores/useSearchStore';
import type { Document } from '@/types/supabase'; // Assuming Document type is available

// Define a type for recent documents, similar to CuboneFileType but simplified
type RecentDocumentItem = {
    id: string;
    name: string;
    updatedAt: string;
    path?: string; // Optional, for consistency if merging with other types
};

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    // We might need documentId if searches are context-specific, but Omnibar handles global search for now
    // documentId?: string; 
}

export const SearchModal: React.FC<SearchModalProps> = ({
    isOpen,
    onClose,
}) => {
    const router = useRouter();
    const [recentDocuments, setRecentDocuments] = useState<RecentDocumentItem[]>([]);
    const [isLoadingRecent, setIsLoadingRecent] = useState<boolean>(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const { searchQuery, searchResults, isLoadingSearch, searchError, clearSearch } = useSearchStore();

    const fetchRecentDocuments = useCallback(async () => {
        setIsLoadingRecent(true);
        setFetchError(null);
        try {
            // This is similar to how LaunchPage fetches and processes files.
            // Ideally, this would be a dedicated API endpoint: /api/documents/recent
            const response = await fetch('/api/file-manager'); // Fetch all files/folders
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `Failed to fetch recent documents (${response.status})`);
            }
            const { data }: { data: { documents: Document[], folders: any[] } } = await response.json();
            
            const recents: RecentDocumentItem[] = data.documents
                .filter(doc => doc && doc.id && doc.name && doc.updated_at) // Basic validation
                .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())
                .slice(0, 10)
                .map(doc => ({
                    id: doc.id,
                    name: doc.name,
                    updatedAt: doc.updated_at!,
                }));
            setRecentDocuments(recents);
        } catch (error: any) {
            console.error("Error fetching recent documents:", error);
            setFetchError(error.message || 'Could not load recent documents.');
            setRecentDocuments([]);
        } finally {
            setIsLoadingRecent(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            // When modal opens, if search query is empty, fetch recents.
            // Omnibar useEffect will clear results if query is empty.
            if (!searchQuery) {
                fetchRecentDocuments();
            }
            // Focus the search input in Omnibar when modal opens
            // This needs a way to access the inputRef inside Omnibar,
            // or Omnibar needs an autoFocus prop. For now, manual focus might be needed.
        } else {
            // Optional: Clear search when modal closes if desired
            // clearSearch(); 
        }
    }, [isOpen, searchQuery, fetchRecentDocuments]);

    const handleSelectResult = (documentId: string) => {
        clearSearch(); // Clear search state from store
        onClose(); // Close the modal
        router.push(`/editor/${documentId}`);
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
    
    const displayNoResults = !isLoadingSearch && !searchError && searchResults && searchResults.length === 0;
    const displayRecentDocs = !searchQuery && !isLoadingSearch && !searchError && recentDocuments.length > 0;
    const displayLoading = isLoadingSearch || isLoadingRecent;


    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out"
            onClick={onClose}
        >
            <div
                className="bg-[var(--editor-bg)] p-6 rounded-lg shadow-xl w-full max-w-2xl h-[70vh] flex flex-col text-[--text-color] transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modalFadeIn"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-semibold flex items-center">
                        <SearchIcon className="mr-2 h-5 w-5" /> Search Documents
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-[--hover-bg]"
                        aria-label="Close search"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Omnibar for search input */}
                <div className="mb-4 flex-shrink-0">
                    <Omnibar displayResultsInline={false} autoFocus={true} /> 
                    {/* 
                        displayResultsInline is set to false because results will be handled by this modal.
                        Omnibar's internal dropdown will not be shown.
                        We rely on useSearchStore to get results.
                    */}
                </div>

                {/* Results Area */}
                <div className="flex-grow overflow-y-auto min-h-0 pr-2"> {/* Added pr-2 for scrollbar */}
                    {displayLoading && (
                        <div className="p-4 text-center text-[--muted-text-color]">Loading...</div>
                    )}

                    {searchError && !isLoadingSearch && (
                        <div className="p-4 text-center text-red-500">Error: {searchError}</div>
                    )}
                    
                    {fetchError && !isLoadingRecent && (
                         <div className="p-4 text-center text-red-500">Error loading recent: {fetchError}</div>
                    )}

                    {/* Display Search Results from Omnibar/useSearchStore */}
                    {searchQuery && !isLoadingSearch && !searchError && searchResults && searchResults.length > 0 && (
                        <ul className="space-y-2">
                            <li className="text-sm text-[--muted-text-color] px-2 py-1">Search Results:</li>
                            {searchResults.map((result) => (
                                <li key={result.id}>
                                    <button
                                        onClick={() => handleSelectResult(result.id)}
                                        className="flex items-center w-full text-left px-3 py-2.5 rounded-md hover:bg-[--hover-bg] focus:outline-none focus:bg-[--hover-bg] transition-colors"
                                    >
                                        <FileText size={18} className="mr-3 text-[--accent-color] flex-shrink-0" />
                                        <div className="flex-grow overflow-hidden">
                                            <span className="block font-medium truncate text-[--text-color]">{result.name || 'Untitled Document'}</span>
                                            {/* Add more details if available, e.g., path or snippet */}
                                            
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    
                    {/* Display "No Results" from search */}
                    {searchQuery && displayNoResults && !searchError && (
                       <div className="p-4 text-center text-[--muted-text-color]">No results found for &quot;{searchQuery}&quot;.</div>
                    )}

                    {/* Display Recent Documents if no search query and not loading search results */}
                    {displayRecentDocs && !searchQuery && !isLoadingSearch && (
                        <ul className="space-y-2">
                             <li className="text-sm text-[--muted-text-color] px-2 py-1">Recent Documents:</li>
                            {recentDocuments.map((doc) => (
                                <li key={doc.id}>
                                    <button
                                        onClick={() => handleSelectResult(doc.id)}
                                        className="flex items-center w-full text-left px-3 py-2.5 rounded-md hover:bg-[--hover-bg] focus:outline-none focus:bg-[--hover-bg] transition-colors"
                                    >
                                        <Clock size={18} className="mr-3 text-[--accent-color] flex-shrink-0" />
                                        <div className="flex-grow overflow-hidden">
                                            <span className="block font-medium truncate text-[--text-color]">{doc.name || 'Untitled Document'}</span>
                                            {doc.updatedAt && <span className="text-xs text-[--muted-text-color]">Updated: {formatTimestamp(doc.updatedAt)}</span>}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    
                    {/* No recent documents found and no search query */}
                    {!searchQuery && !isLoadingRecent && !isLoadingSearch && !fetchError && recentDocuments.length === 0 && (
                         <div className="p-4 text-center text-[--muted-text-color]">No recent documents found.</div>
                    )}

                </div>

                {/* Footer (Optional, e.g., for tips or branding) */}
                {/* 
                <div className="mt-4 pt-3 border-t border-[--border-color] flex-shrink-0 text-center">
                    <p className="text-xs text-[--muted-text-color]">Powered by Search</p>
                </div>
                */}
            </div>
            {/* Re-using modal animation style from VersionHistoryModal */}
            <style jsx global>{`
                @keyframes modalFadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-modalFadeIn {
                    animation: modalFadeIn 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
}; 