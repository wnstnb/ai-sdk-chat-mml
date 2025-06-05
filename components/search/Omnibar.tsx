'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input'; // Re-enabled Shadcn Input
import { Button } from '@/components/ui/button';
import { XIcon, SearchIcon, Loader2 } from 'lucide-react';
import { useSearchStore } from '@/stores/useSearchStore';
import { useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';
import { triggerSearch } from '@/hooks/useSearch'; // This hook needs to be created next

interface OmnibarProps {
    displayResultsInline?: boolean;
    searchType?: 'default' | 'tagging'; // NEW: Prop to control search behavior
    autoFocus?: boolean; // ADDED: autoFocus prop
}

// Reuse SearchResult interface from store or define locally if needed
interface SearchResult {
    id: string;
    name: string;
    folder_id: string | null;
    similarity?: number;
}

export function Omnibar({ displayResultsInline = false, searchType = 'default', autoFocus = false }: OmnibarProps) {
    const router = useRouter();
    const {
        searchQuery,
        searchResults,
        isLoadingSearch,
        searchError,
        setSearchQuery,
        clearSearch,
        setIsLoadingSearch,
        setSearchResults,
        setSearchError,
        setIsSearching // Use setIsSearching from store
    } = useSearchStore();

    // Local state for the input value, syncs with store
    const [inputValue, setInputValue] = useState(searchQuery);
    const [debouncedQuery] = useDebounce(inputValue, 500);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null); // Ref for dropdown to detect outside clicks

    // Update local input value when global store query changes (e.g., on clearSearch)
    useEffect(() => {
        setInputValue(searchQuery);
    }, [searchQuery]);

    // ADDED: Effect to autoFocus input if prop is true
    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    // Effect to trigger search when debounced query changes
    useEffect(() => {
        const performSearch = async () => {
            if (debouncedQuery.trim()) {
                console.log(`Performing search for: ${debouncedQuery}`); // Debug log
                setIsLoadingSearch(true);
                setIsSearching(true); // Mark search as active
                setSearchError(null);
                try {
                     // Call the actual search function, passing the searchType
                     const results = await triggerSearch(debouncedQuery, searchType);
                     setSearchResults(results); // Use actual results
                } catch (error: any) {
                    console.error('Search failed:', error);
                    const errorMsg = error?.message || 'Search failed';
                    setSearchError(errorMsg);
                    setSearchResults(null);
                    toast.error(`Search failed: ${errorMsg}`); // Add user feedback
                } finally {
                    setIsLoadingSearch(false);
                }
            } else {
                // Clear results immediately if input is cleared, rely on clearSearch for full reset
                 if (inputValue === '') {
                    // Check if the user explicitly cleared the input vs debounced becoming empty
                    // If they cleared it, use clearSearch to reset everything
                     clearSearch();
                 } else {
                    // If debouncedQuery is empty but inputValue isn't (e.g., initial load), do nothing yet
                    // Let clearSearch handle the final reset if needed
                 }
            }
        };
        performSearch();
     }, [debouncedQuery, setIsLoadingSearch, setSearchError, setIsSearching, clearSearch, setSearchResults, searchType]); // Removed inputValue dependency


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newQuery = e.target.value;
        setInputValue(newQuery); // Update local state immediately
        // Update store query - this will trigger isSearching flag if query has content
        setSearchQuery(newQuery);
    };


    const handleSelectResult = (result: SearchResult) => {
        clearSearch(); // Clear search state on selection
        router.push(`/editor/${result.id}`);
        inputRef.current?.blur(); // Optionally blur input
    };

    const handleClear = () => {
        clearSearch();
        setInputValue(''); // Ensure local input is also cleared
        inputRef.current?.focus();
    };

    // Close dropdown if clicked outside
     useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current && !inputRef.current.contains(event.target as Node)) {
                 // Don't clear results, just hide dropdown by maybe blurring input or setting a local state?
                 // For now, let's just blur which implicitly might hide if focus is lost
                 // inputRef.current?.blur(); // This might be too aggressive
                 // A local state 'isDropdownVisible' might be better here.
                 // For simplicity now, we rely on input blur or clearing search.
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);


    return (
        <div className="relative w-full max-w-lg mx-auto"> {/* Adjust styling as needed */} 
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            {/* Using Shadcn Input */}
            <Input
                ref={inputRef}
                type="text"
                placeholder="Search documents..."
                value={inputValue} // Use local input value
                onChange={handleInputChange} // Use dedicated handler
                className="pl-10 pr-10" // Standard Shadcn input takes care of most styling
                aria-label="Search documents"
                autoFocus={autoFocus} // ADDED: Pass autoFocus to Input component
            />
            {/* Loading Indicator */}
            {isLoadingSearch && (
                <Loader2 className="absolute right-10 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}
            {/* Clear Button */}
            {inputValue && !isLoadingSearch && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7" // Made slightly larger for easier click
                    onClick={handleClear}
                    aria-label="Clear search"
                >
                    <XIcon className="h-4 w-4" />
                </Button>
            )}

            {/* Inline Results Dropdown */}
            {displayResultsInline && searchQuery && ( // Show dropdown only if inline and query exists
                <div 
                    ref={dropdownRef} // Add ref to dropdown container
                    className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto"
                    role="listbox"
                 >
                    {isLoadingSearch && !searchResults && ( // Show loading only if results aren't yet available
                        <div className="p-4 text-center text-muted-foreground">Searching...</div>
                    )}
                    {searchError && (
                        <div className="p-4 text-center text-destructive">Error: {searchError}</div>
                    )}
                    {!isLoadingSearch && searchResults && searchResults.length === 0 && (
                        <div className="p-4 text-center text-muted-foreground">No results found.</div>
                    )}
                    {/* Render results only when not loading AND results are available */}
                    {!isLoadingSearch && searchResults && searchResults.length > 0 && (
                        <ul>
                            {searchResults.map((result) => (
                                <li key={result.id}>
                                    <button
                                        onClick={() => handleSelectResult(result)}
                                        className="block w-full text-left px-4 py-2 hover:bg-accent focus:outline-none focus:bg-accent rounded-sm" // Added rounding
                                        role="option"
                                        aria-selected="false" // Manage aria-selected if implementing keyboard nav
                                     >
                                        {/* Improve result display */}
                                        <span className="block font-medium truncate">{result.name || 'Untitled Document'}</span>
                                        {/* Optionally add folder info or other context */}
                                        {/* {result.folder_id && <span className="text-xs text-muted-foreground">In Folder ...</span>} */}
                                        
                                        
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

// Placeholder for toast - replace with your actual toast implementation
const toast = {
    error: (message: string) => console.error("Toast Error:", message),
}; 