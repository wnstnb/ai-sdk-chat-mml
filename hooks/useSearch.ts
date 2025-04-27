// hooks/useSearch.ts

// Define the expected structure of a search result item
// This should match the structure returned by your API and used in the Omnibar/store
interface SearchResult {
    id: string;
    name: string;
    folder_id: string | null;
    similarity?: number; // Optional similarity score from vector search
}

/**
 * Triggers a search request to the backend API.
 * @param query The search query string.
 * @returns A promise that resolves to an array of SearchResult objects.
 * @throws An error if the search request fails.
 */
export const triggerSearch = async (query: string): Promise<SearchResult[]> => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        // Return empty array immediately if the query is empty or whitespace
        return [];
    }

    console.log(`[triggerSearch] Fetching results for query: "${trimmedQuery}"`); // Debug log
    try {
        const response = await fetch(`/api/search-documents?query=${encodeURIComponent(trimmedQuery)}`);

        if (!response.ok) {
            let errorData;
            try {
                // Try to parse error details from the response body
                errorData = await response.json();
            } catch (parseError) {
                // If parsing fails, use the status text
                errorData = { error: response.statusText };
            }
            console.error("[triggerSearch] API Error Response:", errorData);
            // Construct a meaningful error message
            const errorMessage = errorData?.error || errorData?.details || `Search request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        const results: SearchResult[] = await response.json();
        console.log(`[triggerSearch] Received ${results.length} results.`); // Debug log
        return results;

    } catch (error) {
        console.error("[triggerSearch] Error fetching search results:", error);
        // Re-throw the error so it can be caught by the calling component (Omnibar)
        // The calling component is responsible for updating the UI state (e.g., setting searchError)
        throw error;
    }
}; 