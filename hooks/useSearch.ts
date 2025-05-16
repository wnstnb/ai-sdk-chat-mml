// hooks/useSearch.ts

// Define the expected structure of a search result item
// This should match the structure returned by your API and used in the Omnibar/store
interface SearchResult {
    id: string;
    name: string;
    folder_id: string | null;
    similarity?: number; // Optional similarity score from vector search
    summary?: string;
}

/**
 * Triggers a search request to the backend API.
 * @param query The search query string.
 * @param searchType Determines which search API endpoint and method to use. 'default' uses POST /api/search-documents. 'tagging' uses GET /api/chat-tag-search.
 * @returns A promise that resolves to an array of SearchResult objects.
 * @throws An error if the search request fails.
 */
export const triggerSearch = async (query: string, searchType: 'default' | 'tagging' = 'default'): Promise<SearchResult[]> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        // Return empty array immediately if the query is empty or whitespace
        return [];
    }

    console.log(`[triggerSearch] Fetching results for query: "${trimmedQuery}" using type: "${searchType}"`); // Debug log
    try {
        let response: Response;
        if (searchType === 'tagging') {
            // Use GET /api/chat-tag-search
            response = await fetch(`/api/chat-tag-search?q=${encodeURIComponent(trimmedQuery)}`);
        } else {
            // Default: Use POST /api/search-documents
            response = await fetch('/api/search-documents', { // NEW POST request
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: trimmedQuery }),
            });
        }

        if (!response.ok) {
            let errorData;
            try {
                // Try to parse error details from the response body
                errorData = await response.json();
            } catch (parseError) {
                // If parsing fails, use the status text
                errorData = { error: response.statusText };
            }
            console.error(`[triggerSearch] API Error Response (type: ${searchType}):`, errorData);
            // Construct a meaningful error message
            const errorMessage = errorData?.error || errorData?.details || `Search request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        let results: SearchResult[];
        if (searchType === 'tagging') {
            const apiResponse = await response.json();
            // Adapt from { documents: [{ id, name }] } to SearchResult[]
            results = (apiResponse.documents || []).map((doc: { id: string, name: string }) => ({
                id: doc.id,
                name: doc.name,
                folder_id: null, // Not provided by this endpoint
                similarity: undefined, // Not provided by this endpoint
            }));
        } else {
            results = await response.json(); // Assuming this returns SearchResult[] directly
        }
        
        console.log(`[triggerSearch] Received ${results.length} results (type: ${searchType}).`);
        return results;

    } catch (error) {
        console.error(`[triggerSearch] Error fetching search results (type: ${searchType}):`, error);
        // Re-throw the error so it can be caught by the calling component (Omnibar)
        // The calling component is responsible for updating the UI state (e.g., setting searchError)
        throw error;
    }
}; 