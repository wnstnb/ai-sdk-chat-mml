import { createSupabaseServerClient } from '@/lib/supabase/server';

// Constants for Gemini API
const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const GEMINI_EMBEDDING_MODEL = 'models/text-embedding-004';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

// Types for search results
export interface TitleSearchResult {
  id: string;
  name: string;
  updated_at: string;
  searchable_content?: string | null;
  is_starred?: boolean;
  titleMatchScore: number;
}

export interface SemanticSearchResult {
  id: string;
  name: string;
  updated_at: string;
  searchable_content?: string | null;
  is_starred?: boolean;
  semanticScore: number;
}

// NEW: Interface for BM25 content search results
export interface ContentBM25SearchResult {
  id: string;
  name: string;
  updated_at: string;
  searchable_content?: string | null;
  is_starred?: boolean;
  contentScore: number; // Score from BM25-like text search
}

export interface CombinedSearchResult {
  id: string;
  name: string;
  finalScore: number;
  summary?: string;
  updated_at?: string;
  is_starred?: boolean;
}

// Interface for the match_documents RPC function result
interface MatchDocumentsResult {
  id: string;
  name: string;
  similarity: number;
}

// Search by title function
export async function searchByTitle(query: string): Promise<TitleSearchResult[]> {
  const supabase = createSupabaseServerClient();
  
  // Perform case-insensitive partial match on document names
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, name, updated_at, searchable_content, is_starred')
    .ilike('name', `%${query}%`);

  if (error) {
    console.error('Title search error:', error.message);
    throw new Error(`Failed to search by title: ${error.message}`);
  }

  // For title matches, we'll use a simple binary scoring:
  // 1.0 for exact match (case-insensitive)
  // 0.8 for partial match
  return (documents || []).map(doc => ({
    id: doc.id,
    name: doc.name,
    updated_at: doc.updated_at,
    searchable_content: doc.searchable_content,
    is_starred: doc.is_starred,
    titleMatchScore: doc.name.toLowerCase() === query.toLowerCase() ? 1.0 : 0.8
  }));
}

// NEW: Search by content using BM25-like full-text search
export async function searchByContentBM25(query: string): Promise<ContentBM25SearchResult[]> {
  const supabase = createSupabaseServerClient();

  // --- Get user ID ---
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('User not authenticated for BM25 search:', userError?.message);
    throw new Error('User not authenticated. BM25 search requires a user context.');
  }
  const userId = user.id;
  // --- END Get user ID ---

  // Call the RPC function search_documents_bm25
  const { data: rpcResults, error: rpcError } = await supabase
    .rpc('search_documents_bm25', {
      p_query_text: query,
      p_user_id_input: userId,
      p_match_count: 10
    });

  if (rpcError) {
    console.error('Content BM25 search RPC error:', rpcError.message);
    throw new Error(`Failed to search by content using RPC: ${rpcError.message}`);
  }

  if (!rpcResults || rpcResults.length === 0) {
    return [];
  }

  const docIds = rpcResults.map((doc: { id: string }) => doc.id);
  const { data: fullDocs, error: docsError } = await supabase
    .from('documents')
    .select('id, name, updated_at, searchable_content, is_starred')
    .in('id', docIds)
    .eq('user_id', userId); // Ensure we only fetch user's documents

  if (docsError) {
    console.error('Error fetching full document details for BM25 results:', docsError.message);
    // Return results from RPC with missing fields, or throw error
    return rpcResults.map((doc: { id: string, name: string, score: number }) => ({
    id: doc.id,
    name: doc.name,
    contentScore: doc.score,
    updated_at: new Date().toISOString(), // Fallback
    searchable_content: null, // Fallback
    is_starred: false, // Fallback
    }));
  }
  
  const fullDocsMap = new Map(fullDocs.map(fd => [fd.id, fd]));

  return rpcResults.map((doc: { id: string, name: string, score: number }) => {
    const fullDoc = fullDocsMap.get(doc.id);
    return {
      id: doc.id,
      name: doc.name,
      contentScore: doc.score,
      updated_at: fullDoc?.updated_at || new Date().toISOString(),
      searchable_content: fullDoc?.searchable_content || null,
      is_starred: fullDoc?.is_starred || false,
    };
  });
}

// Search by embeddings function
export async function searchByEmbeddings(query: string): Promise<SemanticSearchResult[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable not set for embedding generation");
  }

  const supabase = createSupabaseServerClient();
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('User not authenticated for semantic search:', userError?.message);
    throw new Error('User not authenticated. Semantic search requires a user context.');
  }
  const userId = user.id;

  try {
    // 1. Generate query embedding using Gemini API
    const embedApiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: query }] },
        task_type: "RETRIEVAL_QUERY",
      }),
    });

    if (!embedApiResponse.ok) {
      const errorBody = await embedApiResponse.text();
      console.error("Gemini API Error Response (Query Embedding):", errorBody);
      throw new Error(`Gemini query embedding request failed with status ${embedApiResponse.status}`);
    }

    const embedApiData = await embedApiResponse.json();
    if (!embedApiData.embedding?.values) {
      throw new Error("Invalid response structure from Gemini API: embedding.values missing");
    }

    const queryEmbedding = embedApiData.embedding.values;

    // 2. Search for similar documents using the match_documents RPC function
    const { data: rpcMatches, error: searchError } = await supabase
      .rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.55,
        match_count: 10,
        user_id_input: userId
      });

    if (searchError) {
      console.error('Semantic search error:', searchError.message);
      throw new Error(`Failed to search by embeddings: ${searchError.message}`);
    }

    if (!rpcMatches || rpcMatches.length === 0) {
      return [];
    }

    const docIds = rpcMatches.map((match: MatchDocumentsResult) => match.id);
    const { data: fullDocs, error: docsError } = await supabase
      .from('documents')
      .select('id, name, updated_at, searchable_content, is_starred')
      .in('id', docIds)
      .eq('user_id', userId); // Ensure we only fetch user's documents

    if (docsError) {
      console.error('Error fetching full document details for semantic results:', docsError.message);
      // Return results from RPC with missing fields, or throw error
      return rpcMatches.map((match: MatchDocumentsResult) => ({
        id: match.id,
        name: match.name,
        semanticScore: match.similarity,
        updated_at: new Date().toISOString(), // Fallback
        searchable_content: null, // Fallback
        is_starred: false, // Fallback
      }));
    }

    const fullDocsMap = new Map(fullDocs.map(fd => [fd.id, fd]));

    // 3. Map results to our interface
    return rpcMatches.map((match: MatchDocumentsResult) => {
      const fullDoc = fullDocsMap.get(match.id);
      return {
      id: match.id,
      name: match.name,
        semanticScore: match.similarity,
        updated_at: fullDoc?.updated_at || new Date().toISOString(),
        searchable_content: fullDoc?.searchable_content || null,
        is_starred: fullDoc?.is_starred || false,
      };
    });

  } catch (error) {
    console.error('Error in semantic search:', error);
    throw error;
  }
}

// Combine and rank results function
export function combineAndRankResults(
  titleMatches: TitleSearchResult[],
  semanticMatches: SemanticSearchResult[],
  contentMatches: ContentBM25SearchResult[], // NEW: Add contentMatches
  rrfK: number = 60 // Constant for RRF, k in the formula 1/(k + rank)
): CombinedSearchResult[] {
  // Helper function to get ranks from a list of search results
  const getRanks = (
    results: Array<{ id: string; name: string; score: number; updated_at?: string; searchable_content?: string | null; is_starred?: boolean; }>
  ): Map<string, { rank: number; name: string; updated_at?: string; searchable_content?: string | null; is_starred?: boolean; }> => {
    // Sort by score descending to assign ranks
    const sortedResults = [...results].sort((a, b) => b.score - a.score);
    const ranks = new Map<string, { rank: number; name: string; updated_at?: string; searchable_content?: string | null; is_starred?: boolean; }>();
    sortedResults.forEach((result, index) => {
      ranks.set(result.id, { 
        rank: index + 1, 
        name: result.name, 
        updated_at: result.updated_at,
        searchable_content: result.searchable_content,
        is_starred: result.is_starred
      });
    });
    return ranks;
  };

  const titleRanks = getRanks(titleMatches.map(tm => ({ ...tm, score: tm.titleMatchScore })));
  const semanticRanks = getRanks(semanticMatches.map(sm => ({ ...sm, score: sm.semanticScore })));
  const contentRanks = getRanks(contentMatches.map(cm => ({ ...cm, score: cm.contentScore })));

  const allDocIds = new Set<string>([
    ...titleMatches.map(doc => doc.id),
    ...semanticMatches.map(doc => doc.id),
    ...contentMatches.map(doc => doc.id)
  ]);

  const combinedScores = new Map<string, { score: number; name?: string; updated_at?: string; searchable_content?: string | null; is_starred?: boolean; }>();

  allDocIds.forEach(id => {
    let rrfScore = 0;
    let name: string | undefined;
    let updated_at: string | undefined;
    let searchable_content: string | null | undefined;
    let is_starred: boolean | undefined;

    const titleRankInfo = titleRanks.get(id);
    if (titleRankInfo) {
      rrfScore += 1 / (rrfK + titleRankInfo.rank);
      name = titleRankInfo.name;
      updated_at = titleRankInfo.updated_at;
      searchable_content = titleRankInfo.searchable_content;
      is_starred = titleRankInfo.is_starred;
    }

    const semanticRankInfo = semanticRanks.get(id);
    if (semanticRankInfo) {
      rrfScore += 1 / (rrfK + semanticRankInfo.rank);
      if (!name) name = semanticRankInfo.name;
      if (!updated_at) updated_at = semanticRankInfo.updated_at;
      if (searchable_content === undefined) searchable_content = semanticRankInfo.searchable_content;
      if (is_starred === undefined) is_starred = semanticRankInfo.is_starred;
    }
    
    const contentRankInfo = contentRanks.get(id);
    if (contentRankInfo) {
      rrfScore += 1 / (rrfK + contentRankInfo.rank);
      if (!name) name = contentRankInfo.name;
      if (!updated_at) updated_at = contentRankInfo.updated_at;
      if (searchable_content === undefined) searchable_content = contentRankInfo.searchable_content;
      if (is_starred === undefined) is_starred = contentRankInfo.is_starred;
    }

    if (name) {
      combinedScores.set(id, { score: rrfScore, name, updated_at, searchable_content, is_starred });
    }
  });

  const rankedResults = Array.from(combinedScores.entries()).map(([id, data]) => ({
    id,
    data
  }));

  rankedResults.sort((a, b) => b.data.score - a.data.score);

  return rankedResults.slice(0, 10).map(doc => ({
    id: doc.id,
    name: doc.data.name!,
    finalScore: doc.data.score,
    summary: doc.data.searchable_content ? doc.data.searchable_content.substring(0, 150) + '...' : 'No preview available.',
    updated_at: doc.data.updated_at,
    is_starred: doc.data.is_starred,
  }));
} 