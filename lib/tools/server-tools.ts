import { tool } from 'ai';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import Exa from 'exa-js';
import {
  searchByTitle,
  searchByEmbeddings,
  searchByContentBM25,
  combineAndRankResults,
  type TitleSearchResult,
  type SemanticSearchResult,
  type ContentBM25SearchResult,
  type CombinedSearchResult
} from '@/lib/ai/searchService';

// Initialize Exa client
const exa = new Exa(process.env.EXA_API_KEY);

// Server-side tool execution framework with error handling
async function safeExecuteTool<T>(
  toolName: string,
  executor: () => Promise<T>
): Promise<T | { error: string; details?: string }> {
  try {
    console.log(`[ServerTools] Executing ${toolName}...`);
    const result = await executor();
    console.log(`[ServerTools] ${toolName} completed successfully`);
    return result;
  } catch (error) {
    console.error(`[ServerTools] Error executing ${toolName}:`, error);
    return {
      error: `Failed to execute ${toolName}`,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

// ===== SERVER-SIDE TOOL DEFINITIONS =====

// Web Search Tool (refactored from lib/tools/exa-search.ts)
export const webSearchTool = tool({
  description: 'Search the web for up-to-date information using Exa AI',
  parameters: z.object({
    query: z.string().min(1).max(100).describe('The search query'),
  }),
  execute: async ({ query }) => {
    return safeExecuteTool('webSearch', async () => {
      if (!process.env.EXA_API_KEY) {
        throw new Error('EXA_API_KEY environment variable is not set');
      }

      // Using searchAndContents to get both search results and their content
      const { results } = await exa.searchAndContents(query, {
        numResults: 3,
        livecrawl: "always",
        type: "auto",
      });

      // Map results to a simpler structure for the AI model
      return {
        results: results.map(result => ({
          title: result.title ?? 'No title available',
          url: result.url,
          content: result.text ? result.text.slice(0, 1000) : 'No content available',
          publishedDate: result.publishedDate ?? 'No date available',
        })),
        searchPerformed: true,
        queryUsed: query,
      };
    });
  },
});

// Search and Tag Documents Tool (refactored from app/api/chat/route.ts)
export const searchAndTagDocumentsTool = tool({
  description: 'Searches documents by title and semantic content. Returns a list of relevant documents that the user can choose to tag for context.',
  parameters: z.object({
    searchQuery: z.string().describe("The user's query to search for in the documents."),
  }),
  execute: async ({ searchQuery }) => {
    return safeExecuteTool('searchAndTagDocuments', async () => {
      // Perform all three searches in parallel using the existing functions
      const [titleMatches, semanticMatches, contentMatches] = await Promise.all([
        searchByTitle(searchQuery),
        searchByEmbeddings(searchQuery),
        searchByContentBM25(searchQuery)
      ]);
      
      // Combine and rank results using the existing function
      const combinedResults = combineAndRankResults(
        titleMatches, 
        semanticMatches, 
        contentMatches
      );
      
      // Format results for the AI to present
      return {
        documents: combinedResults.map(doc => ({
          id: doc.id,
          name: doc.name,
          confidence: doc.finalScore,
          summary: doc.summary || undefined
        })),
        searchPerformed: true,
        queryUsed: searchQuery,
        presentationStyle: 'listWithTagButtons'
      };
    });
  }
});

// Combined server tools export
export const serverTools = {
  webSearch: webSearchTool,
  searchAndTagDocumentsTool: searchAndTagDocumentsTool,
};

// Export individual tools for backwards compatibility
export { webSearchTool as webSearch }; 