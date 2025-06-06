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
  titleMatchScore: number;
}

export interface SemanticSearchResult {
  id: string;
  name: string;
  updated_at: string;
  searchable_content?: string | null;
  semanticScore: number;
}

// NEW: Interface for BM25 content search results
export interface ContentBM25SearchResult {
  id: string;
  name: string;
  updated_at: string;
  searchable_content?: string | null;
  contentScore: number; // Score from BM25-like text search
}

export interface CombinedSearchResult {
  id: string;
  name: string;
  finalScore: number;
  summary?: string;
  updated_at?: string;
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
    .select('id, name, updated_at, searchable_content')
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
  // Assumes the SQL function now returns id, name, updated_at, searchable_content, score
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

  // No longer need to fetch fullDocs separately if RPC returns all necessary fields
  // const docIds = rpcResults.map((doc: { id: string }) => doc.id);
  // const { data: fullDocs, error: docsError } = await supabase
  //   .from('documents')
  //   .select('id, name, updated_at, searchable_content')
  //   .in('id', docIds)
  //   .eq('user_id', userId);

  // if (docsError) {
  //   console.error('Error fetching full document details for BM25 results:', docsError.message);
  //   return rpcResults.map((doc: { id: string, name: string, score: number }) => ({
  //     id: doc.id,
  //     name: doc.name,
  //     contentScore: doc.score,
  //     updated_at: new Date().toISOString(), // Fallback
  //     searchable_content: null, // Fallback
  //   }));
  // }
  
  // const fullDocsMap = new Map(fullDocs.map(fd => [fd.id, fd]));

  return rpcResults.map((doc: { id: string, name: string, score: number, updated_at: string, searchable_content: string | null }) => {
    // const fullDoc = fullDocsMap.get(doc.id);
    return {
      id: doc.id,
      name: doc.name,
      contentScore: doc.score,
      updated_at: doc.updated_at || new Date().toISOString(), // Use directly from RPC
      searchable_content: doc.searchable_content || null, // Use directly from RPC
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
    // Assumes the SQL function now returns id, name, updated_at, searchable_content, similarity, folder_id
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

    // No longer need to fetch fullDocs separately if RPC returns all necessary fields
    // const docIds = rpcMatches.map((match: MatchDocumentsResult) => match.id);
    // const { data: fullDocs, error: docsError } = await supabase
    //   .from('documents')
    //   .select('id, name, updated_at, searchable_content')
    //   .in('id', docIds)
    //   .eq('user_id', userId);

    // if (docsError) {
    //   console.error('Error fetching full document details for semantic results:', docsError.message);
    //   return rpcMatches.map((match: MatchDocumentsResult) => ({
    //     id: match.id,
    //     name: match.name,
    //     semanticScore: match.similarity,
    //     updated_at: new Date().toISOString(), // Fallback
    //     searchable_content: null, // Fallback
    //   }));
    // }

    // const fullDocsMap = new Map(fullDocs.map(fd => [fd.id, fd]));

    // 3. Map results to our interface
    return rpcMatches.map((match: { id: string, name: string, similarity: number, updated_at: string, searchable_content: string | null, folder_id: string | null }) => {
      // const fullDoc = fullDocsMap.get(match.id);
      return {
        id: match.id,
        name: match.name,
        semanticScore: match.similarity,
        updated_at: match.updated_at || new Date().toISOString(), // Use directly from RPC
        searchable_content: match.searchable_content || null, // Use directly from RPC
        // folder_id is also available from match_documents if needed later: match.folder_id
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
    results: Array<{ id: string; name: string; score: number; updated_at?: string; searchable_content?: string | null; }>,
  ): Map<string, { rank: number; name: string; updated_at?: string; searchable_content?: string | null; }> => {
    // Sort by score descending to assign ranks
    const sortedResults = [...results].sort((a, b) => b.score - a.score);
    const ranks = new Map<string, { rank: number; name: string; updated_at?: string; searchable_content?: string | null; }>();
    sortedResults.forEach((result, index) => {
      ranks.set(result.id, { 
        rank: index + 1, 
        name: result.name, 
        updated_at: result.updated_at, 
        searchable_content: result.searchable_content 
      });
    });
    return ranks;
  };

  // Generate ranks for each type of search result
  // Ensure the 'score' property is consistent for the getRanks helper
  const titleRanks = getRanks(
    titleMatches.map(m => ({ 
      id: m.id, 
      name: m.name, 
      score: m.titleMatchScore, 
      updated_at: m.updated_at, 
      searchable_content: m.searchable_content 
    }))
  );
  const semanticRanks = getRanks(
    semanticMatches.map(m => ({ 
      id: m.id, 
      name: m.name, 
      score: m.semanticScore,
      updated_at: m.updated_at,
      searchable_content: m.searchable_content
    }))
  );
  const contentRanks = getRanks(
    contentMatches.map(m => ({ 
      id: m.id, 
      name: m.name, 
      score: m.contentScore,
      updated_at: m.updated_at,
      searchable_content: m.searchable_content
    }))
  );

  // Collect all unique document IDs
  const allDocIds = new Set<string>();
  titleMatches.forEach(m => allDocIds.add(m.id));
  semanticMatches.forEach(m => allDocIds.add(m.id));
  contentMatches.forEach(m => allDocIds.add(m.id));

  const rrfResults: Array<{ id: string; name: string; finalScore: number; summary?: string; updated_at?: string; }> = [];

  // Calculate RRF score for each document
  allDocIds.forEach(id => {
    let rrfScore = 0;
    let docName = ""; // To store the document name
    let docUpdatedAt: string | undefined = undefined;
    let docSummary: string | undefined = undefined;

    const titleInfo = titleRanks.get(id);
    if (titleInfo) {
      rrfScore += 1 / (rrfK + titleInfo.rank);
      docName = titleInfo.name;
      docUpdatedAt = titleInfo.updated_at;
      if (titleInfo.searchable_content) {
        docSummary = titleInfo.searchable_content.substring(0, 150) + (titleInfo.searchable_content.length > 150 ? '...' : '');
      }
    }

    const semanticInfo = semanticRanks.get(id);
    if (semanticInfo) {
      rrfScore += 1 / (rrfK + semanticInfo.rank);
      if (!docName) docName = semanticInfo.name;
      if (!docUpdatedAt) docUpdatedAt = semanticInfo.updated_at;
      if (!docSummary && semanticInfo.searchable_content) {
        docSummary = semanticInfo.searchable_content.substring(0, 150) + (semanticInfo.searchable_content.length > 150 ? '...' : '');
      }
    }

    const contentInfo = contentRanks.get(id);
    if (contentInfo) {
      rrfScore += 1 / (rrfK + contentInfo.rank);
      if (!docName) docName = contentInfo.name;
      if (!docUpdatedAt) docUpdatedAt = contentInfo.updated_at;
      if (!docSummary && contentInfo.searchable_content) {
        docSummary = contentInfo.searchable_content.substring(0, 150) + (contentInfo.searchable_content.length > 150 ? '...' : '');
      }
    }

    if (rrfScore > 0) {
      rrfResults.push({
        id,
        name: docName || "Unnamed Document", // Fallback name if somehow missed
        finalScore: rrfScore,
        summary: docSummary,
        updated_at: docUpdatedAt
      });
    }
  });

  // Sort results by RRF score in descending order
  rrfResults.sort((a, b) => b.finalScore - a.finalScore);

  // Limit to top 10 results
  return rrfResults.slice(0, 10);
} 