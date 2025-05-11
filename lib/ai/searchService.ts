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
        match_threshold: 0.3, // Lower threshold to cast a wider net
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
  semanticMatches: SemanticSearchResult[]
): CombinedSearchResult[] {
  // Create a map to store combined scores
  const combinedScores = new Map<string, {
    id: string,
    name: string,
    titleScore: number,
    semanticScore: number
  }>();

  // Process title matches
  titleMatches.forEach(match => {
    combinedScores.set(match.id, {
      id: match.id,
      name: match.name,
      titleScore: match.titleMatchScore,
      semanticScore: 0 // Default if no semantic match
    });
  });

  // Process semantic matches
  semanticMatches.forEach(match => {
    const existing = combinedScores.get(match.id);
    if (existing) {
      existing.semanticScore = match.semanticScore;
    } else {
      combinedScores.set(match.id, {
        id: match.id,
        name: match.name,
        titleScore: 0, // Default if no title match
        semanticScore: match.semanticScore
      });
    }
  });

  // Calculate final scores and convert to array
  const results = Array.from(combinedScores.values()).map(item => ({
    id: item.id,
    name: item.name,
    finalScore: (0.55 * item.semanticScore) + (0.45 * item.titleScore)
  }));

  // Filter by threshold, sort by score, and limit results
  return results
    .filter(item => item.finalScore >= 0.6)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 10); // Limit to top 10 results
} 