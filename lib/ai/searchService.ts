import { createSupabaseServerClient } from '@/lib/supabase/server';

// Constants for Gemini API
const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const GEMINI_EMBEDDING_MODEL = 'models/text-embedding-004';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;

// Types for search results
export interface TitleSearchResult {
  id: string;
  name: string;
  titleMatchScore: number;
}

export interface SemanticSearchResult {
  id: string;
  name: string;
  semanticScore: number;
}

// NEW: Interface for BM25 content search results
export interface ContentBM25SearchResult {
  id: string;
  name: string;
  contentScore: number; // Score from BM25-like text search
}

export interface CombinedSearchResult {
  id: string;
  name: string;
  finalScore: number;
  summary?: string;
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
    .select('id, name')
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
    titleMatchScore: doc.name.toLowerCase() === query.toLowerCase() ? 1.0 : 0.8
  }));
}

// NEW: Search by content using BM25-like full-text search
export async function searchByContentBM25(query: string): Promise<ContentBM25SearchResult[]> {
  const supabase = createSupabaseServerClient();

  // --- Get user ID ---
  // Similar to semantic search, BM25 search should be user-specific.
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('User not authenticated for BM25 search:', userError?.message);
    // Depending on requirements, you might return empty results or throw an error.
    // Throwing an error might be safer if user context is strictly required.
    // return []; 
    throw new Error('User not authenticated. BM25 search requires a user context.');
  }
  const userId = user.id;
  // --- END Get user ID ---

  // Call the RPC function search_documents_bm25
  const { data: documents, error: rpcError } = await supabase
    .rpc('search_documents_bm25', {
      p_query_text: query,
      p_user_id_input: userId,
      p_match_count: 10 // Or make this configurable if needed
    });

  if (rpcError) {
    console.error('Content BM25 search RPC error:', rpcError.message);
    throw new Error(`Failed to search by content using RPC: ${rpcError.message}`);
  }

  // Map the results from the RPC function to the ContentBM25SearchResult interface
  return (documents || []).map((doc: { id: string, name: string, score: number }) => ({
    id: doc.id,
    name: doc.name,
    contentScore: doc.score // Use the score returned by the RPC function
  }));
}

// Search by embeddings function
export async function searchByEmbeddings(query: string): Promise<SemanticSearchResult[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable not set for embedding generation");
  }

  const supabase = createSupabaseServerClient();
  
  // --- NEW: Get user ID --- 
  // Ensure you have a way to get the authenticated user's ID here.
  // This might involve using the supabase client if it's already auth-aware,
  // or you might need to pass it down from a higher-level context if searchService
  // is called from a place that has user session information.
  // For this example, I'll assume you can get it from the supabase client directly.
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('User not authenticated for semantic search:', userError?.message);
    throw new Error('User not authenticated. Semantic search requires a user context.');
  }
  const userId = user.id;
  // --- END NEW ---

  try {
    // 1. Generate query embedding using Gemini API
    const embedApiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: query }] },
        task_type: "RETRIEVAL_QUERY", // Use RETRIEVAL_QUERY for search queries
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
    const { data: matches, error: searchError } = await supabase
      .rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.55, // Lower threshold to cast a wider net
        match_count: 10, // Limit to top 10 matches
        user_id_input: userId
      });

    if (searchError) {
      console.error('Semantic search error:', searchError.message);
      throw new Error(`Failed to search by embeddings: ${searchError.message}`);
    }

    // 3. Map results to our interface
    return (matches || []).map((match: MatchDocumentsResult) => ({
      id: match.id,
      name: match.name,
      semanticScore: match.similarity
    }));

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
    results: Array<{ id: string; name: string; score: number }>,
  ): Map<string, { rank: number; name: string }> => {
    // Sort by score descending to assign ranks
    const sortedResults = [...results].sort((a, b) => b.score - a.score);
    const ranks = new Map<string, { rank: number; name: string }>();
    sortedResults.forEach((result, index) => {
      ranks.set(result.id, { rank: index + 1, name: result.name });
    });
    return ranks;
  };

  // Generate ranks for each type of search result
  // Ensure the 'score' property is consistent for the getRanks helper
  const titleRanks = getRanks(
    titleMatches.map(m => ({ id: m.id, name: m.name, score: m.titleMatchScore }))
  );
  const semanticRanks = getRanks(
    semanticMatches.map(m => ({ id: m.id, name: m.name, score: m.semanticScore }))
  );
  const contentRanks = getRanks(
    contentMatches.map(m => ({ id: m.id, name: m.name, score: m.contentScore }))
  );

  // Collect all unique document IDs
  const allDocIds = new Set<string>();
  titleMatches.forEach(m => allDocIds.add(m.id));
  semanticMatches.forEach(m => allDocIds.add(m.id));
  contentMatches.forEach(m => allDocIds.add(m.id));

  const rrfResults: Array<{ id: string; name: string; finalScore: number }> = [];

  // Calculate RRF score for each document
  allDocIds.forEach(id => {
    let rrfScore = 0;
    let docName = ""; // To store the document name

    const titleInfo = titleRanks.get(id);
    if (titleInfo) {
      rrfScore += 1 / (rrfK + titleInfo.rank);
      docName = titleInfo.name;
    }

    const semanticInfo = semanticRanks.get(id);
    if (semanticInfo) {
      rrfScore += 1 / (rrfK + semanticInfo.rank);
      if (!docName) docName = semanticInfo.name; // Use name if not already set
    }

    const contentInfo = contentRanks.get(id);
    if (contentInfo) {
      rrfScore += 1 / (rrfK + contentInfo.rank);
      if (!docName) docName = contentInfo.name; // Use name if not already set
    }

    if (rrfScore > 0) {
      rrfResults.push({
        id,
        name: docName || "Unnamed Document", // Fallback name if somehow missed
        finalScore: rrfScore
      });
    }
  });

  // Sort results by RRF score in descending order
  rrfResults.sort((a, b) => b.finalScore - a.finalScore);

  // Limit to top 10 results
  return rrfResults.slice(0, 10);
} 