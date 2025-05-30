import { create } from 'zustand';

export interface SearchResult {
    id: string;
    name: string;
    folder_id: string | null;
    similarity?: number;
}

interface SearchState {
    searchQuery: string;
    searchResults: SearchResult[] | null;
    isSearching: boolean;
    isLoadingSearch: boolean;
    searchError: string | null;
    setSearchQuery: (query: string) => void;
    setSearchResults: (results: SearchState['searchResults'] | null) => void;
    setIsSearching: (searching: boolean) => void;
    setIsLoadingSearch: (loading: boolean) => void;
    setSearchError: (error: string | null) => void;
    clearSearch: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
    searchQuery: '',
    searchResults: null,
    isSearching: false,
    isLoadingSearch: false,
    searchError: null,
    setSearchQuery: (query) => set({ searchQuery: query, isSearching: query.trim().length > 0 }),
    setSearchResults: (results) => set({ searchResults: results }),
    setIsSearching: (searching) => set({ isSearching: searching }),
    setIsLoadingSearch: (loading) => set({ isLoadingSearch: loading }),
    setSearchError: (error) => set({ searchError: error }),
    clearSearch: () => set({
        searchQuery: '',
        searchResults: null,
        isSearching: false,
        isLoadingSearch: false,
        searchError: null,
    }),
})); 