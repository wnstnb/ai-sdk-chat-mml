# Implementing BM25-like Full-Text Search

This document outlines the steps taken and planned to implement BM25-like full-text search functionality in the application, enhancing the existing hybrid search capabilities. The goal is to provide more relevant search results by incorporating robust keyword search alongside semantic vector search, as recommended in [If You Only Do Vector Search Your AI App is NGMI](https://centrai.co/blog/vector-db-isnt-everything).

## Phase 1: Setup and Initial Backend Changes (Completed)

1.  **Understanding the Need:**
    *   Reviewed the article on the limitations of pure vector search and the benefits of hybrid search (Vector + FTS like BM25).
    *   Identified that the existing `searchByTitle` provided basic keyword matching on titles, but a more robust FTS on document content was needed.

2.  **Database Index Creation:**
    *   **Confirmed Target Column:** Verified that the `documents.searchable_content` column holds the full text for searching.
    *   **Checked Existing Indexes:** Ran SQL query `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'documents';` to confirm no existing FTS index was on `searchable_content`.
    *   **Created FTS Index:** Executed the following SQL in Supabase to create a GIN index on `searchable_content` using the English text search configuration:
        ```sql
        CREATE INDEX documents_searchable_content_fts_idx ON public.documents USING GIN (to_tsvector('english', searchable_content));
        ```
    *   **Verified No Impact:** Confirmed that creating this index would not negatively affect the existing functionality of fetching `searchable_content` for tagged documents (used for AI context injection), as that relies on primary key lookups.

3.  **Initial `searchService.ts` Modification (Placeholder BM25):**
    *   Added a new interface `ContentBM25SearchResult`.
    *   Implemented a placeholder `searchByContentBM25` function in `lib/ai/searchService.ts`. This initial version used Supabase's `.textSearch()` method with `type: 'websearch'` as a first step towards BM25.
        *   Recognized that `.textSearch()` directly might not provide true BM25 scores comparable to `ts_rank_cd`.
    *   Updated `combineAndRankResults` in `lib/ai/searchService.ts` to accept results from `searchByContentBM25` and include their scores in the final ranking (initially using `Math.max()` for score combination).

4.  **API Route Updates:**
    *   Modified the following API route files to call the new `searchByContentBM25` function and pass its results to `combineAndRankResults`:
        *   `app/api/chat-tag-search/route.ts`
        *   `app/api/search-documents/route.ts`
        *   `app/api/chat/route.ts` (specifically the `searchAndTagDocumentsTool`)
    *   Addressed TypeScript errors related to potentially null query parameters.

5.  **Database RPC Function for True BM25 Scoring:**
    *   **Decision:** Opted to create a PostgreSQL RPC function for better encapsulation, maintainability, and cleaner application code compared to embedding raw SQL.
    *   **Created RPC Function:** Executed the following SQL in Supabase to create the `search_documents_bm25` function:
        ```sql
        CREATE OR REPLACE FUNCTION search_documents_bm25(
            p_query_text TEXT,
            p_user_id_input UUID,
            p_match_count INT DEFAULT 10
        )
        RETURNS TABLE(id UUID, name TEXT, score REAL)
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RETURN QUERY
            SELECT
                d.id,
                d.name,
                ts_rank_cd(to_tsvector('english', d.searchable_content), websearch_to_tsquery('english', p_query_text)) AS bm25_score
            FROM
                public.documents d
            WHERE
                d.user_id = p_user_id_input
            AND
                d.searchable_content IS NOT NULL
            AND
                LENGTH(TRIM(p_query_text)) > 0
            AND
                to_tsvector('english', d.searchable_content) @@ websearch_to_tsquery('english', p_query_text)
            ORDER BY
                bm25_score DESC
            LIMIT p_match_count;
        END;
        $$;
        ```

## Phase 2: Integrating True BM25 Scoring and Further Enhancements (Upcoming)

1.  **Update `searchService.ts` to Use RPC:**
    *   Modify the `searchByContentBM25` function in `lib/ai/searchService.ts` to call the newly created `search_documents_bm25` RPC function using `supabase.rpc()`.
    *   Ensure the `contentScore` in `ContentBM25SearchResult` is populated with the `bm25_score` returned by the RPC.

2.  **Refine Score Combination (Rank Fusion - RRF):**
    *   Update the `combineAndRankResults` function in `lib/ai/searchService.ts`.
    *   Instead of `Math.max()`, implement Reciprocal Rank Fusion (RRF) to combine the scores/ranks from `titleMatches`, `semanticMatches`, and `contentMatches`. The RRF formula is `RRF(d) = Σ (r ∈ R) 1 / (k + rank(d))`.
    *   This will require converting raw scores from each search type into ranks first.

3.  **Testing and Evaluation:**
    *   Thoroughly test the search functionality with various queries, including those with specific jargon, to evaluate the impact of BM25 and RRF.
    *   Compare results against the previous implementation.

4.  **(Optional) Model-Based Reranking:**
    *   If further improvements are needed, consider implementing a model-based reranker as a final step.
    *   This would involve taking the top N results from the RRF-enhanced hybrid search and using a cross-encoder model (e.g., from Hugging Face or a third-party API like Cohere) to re-score and re-order them.

## Considerations

*   **Text Search Configuration:** The current implementation uses the `'english'` text search configuration. If supporting other languages or specific text processing needs arise, this might need to be adjusted or made more dynamic.
*   **RPC Function Security:** Ensure the RPC function has appropriate permissions and continues to respect Row Level Security (RLS) implicitly through the `user_id` filter.
*   **Performance Monitoring:** Monitor the performance of search queries, especially as the number of documents grows. 