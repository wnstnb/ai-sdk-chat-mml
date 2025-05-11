import React, { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { TaggedDocument } from "../../lib/types";
// Assuming DocumentTagDropdown exists and is adaptable, or we'll inline a simple dropdown.
// For now, let's assume a simple list rendering if DocumentTagDropdown is not perfectly suitable.
// import DocumentTagDropdown from './DocumentTagDropdown'; 

interface DocumentSearchInputProps {
    onDocumentSelected: (doc: TaggedDocument) => void;
    disabled?: boolean;
}

// Debounce function (can be moved to a shared utils file)
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const debounced = (...args: Parameters<F>) => {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
        timeout = setTimeout(() => func(...args), waitFor);
    };
    return debounced as (...args: Parameters<F>) => ReturnType<F>;
}

export const DocumentSearchInput: React.FC<DocumentSearchInputProps> = ({ onDocumentSelected, disabled }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TaggedDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const dropdownListRef = useRef<HTMLDivElement>(null);

    // Implement debounced search API call
    const searchDocuments = useCallback(debounce(async (searchQuery: string) => {
        if (searchQuery.length === 0) {
            setResults([]);
            setShowDropdown(false);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`/api/chat-tag-search?q=${encodeURIComponent(searchQuery)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setResults(data.documents || []);
            setShowDropdown(true);
        } catch (error) {
            console.error("Error fetching documents:", error);
            setResults([]);
            setShowDropdown(false);
        } finally {
            setLoading(false);
        }
    }, 300), []); // 300ms debounce delay

    useEffect(() => {
        searchDocuments(query);
    }, [query, searchDocuments]);

    const handleSelectDocument = (doc: TaggedDocument) => {
        onDocumentSelected(doc);
        setQuery('');
        setResults([]);
        setShowDropdown(false);
    };

    const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setShowDropdown(false);
        }
    };

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setShowDropdown(false);
            // Optional: Clear query on escape if desired, though PRD doesn't specify.
            // setQuery(''); 
            inputRef.current?.blur(); // Remove focus from input
        }
        // TODO: Add arrow key navigation and Enter key selection
    }, []);

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        // Add keydown listener to the input or document for escape key
        const currentInputRef = inputRef.current;
        currentInputRef?.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            currentInputRef?.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleClickOutside, handleKeyDown]);

    useLayoutEffect(() => {
        if (showDropdown && inputRef.current && dropdownListRef.current) {
            const inputRect = inputRef.current.getBoundingClientRect();
            const dropdownElement = dropdownListRef.current;

            // Reset styles for measurement
            dropdownElement.style.top = 'auto';
            dropdownElement.style.bottom = 'auto';
            dropdownElement.style.maxHeight = ''; // Reset to allow measuring full potential height up to max-h-60

            const dropdownHeight = dropdownElement.offsetHeight;
            const spaceBelow = window.innerHeight - inputRect.bottom;
            const spaceAbove = inputRect.top;
            const margin = 8; // 0.5rem or 8px

            let openUpwards = false;

            // Prefer opening downwards. If not enough space below, and more (and enough) space above, open upwards.
            if (spaceBelow < dropdownHeight + margin && spaceAbove > spaceBelow && spaceAbove > dropdownHeight + margin) {
                openUpwards = true;
            }

            if (openUpwards) {
                dropdownElement.style.bottom = '100%';
                dropdownElement.style.top = 'auto';
                dropdownElement.style.marginBottom = '4px'; // Corresponds to tailwind mt-1 or mb-1
                dropdownElement.style.marginTop = '0';
                dropdownElement.style.maxHeight = `${Math.max(50, spaceAbove - margin)}px`; // Min height of 50px
            } else {
                dropdownElement.style.top = '100%';
                dropdownElement.style.bottom = 'auto';
                dropdownElement.style.marginTop = '4px'; // Corresponds to tailwind mt-1 or mb-1
                dropdownElement.style.marginBottom = '0';
                dropdownElement.style.maxHeight = `${Math.max(50, spaceBelow - margin)}px`; // Min height of 50px
            }
        }
    }, [showDropdown, results, loading]);

    // Add basic styling
    return (
        <div className="relative max-w-32 document-search-input" ref={dropdownRef}> {/* Added relative and full width */}
            <input
                ref={inputRef}
                type="text"
                placeholder="Tag documents"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={disabled}
                className="text-xs w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white dark:focus:ring-blue-600 dark:focus:border-blue-600" // Added styling classes
                onFocus={() => query.length > 0 && results.length > 0 && setShowDropdown(true)} // Show dropdown on focus if there are results
            />
            {showDropdown && (
                <div 
                    ref={dropdownListRef}
                    className="text-xs absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg overflow-y-auto"
                >
                    {loading ? (
                        <div className="px-3 py-2 text-gray-600 dark:text-gray-400">Loading...</div>
                    ) : results.length > 0 ? (
                        results.map((doc) => (
                            <div 
                                key={doc.id} 
                                onClick={() => handleSelectDocument(doc)}
                                className="cursor-pointer px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200" // Added styling classes
                            >
                                {doc.name}
                            </div>
                        ))
                    ) : (
                        <div className="px-3 py-2 text-gray-600 dark:text-gray-400">No results</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DocumentSearchInput; 