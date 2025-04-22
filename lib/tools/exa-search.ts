import { tool } from 'ai';
import { z } from 'zod';
import Exa from 'exa-js';

// Ensure you have the EXASEARCH_API_KEY environment variable set
export const exa = new Exa(process.env.EXA_API_KEY);

export const webSearch = tool({
  description: 'Search the web for up-to-date information using Exa AI',
  parameters: z.object({
    query: z.string().min(1).max(100).describe('The search query'),
  }),
  execute: async ({ query }) => {
    try {
      // Using searchAndContents to get both search results and their content
      // livecrawl: 'always' ensures we get the most recent content
      // numResults: 3 limits the output to the top 3 results
      const { results } = await exa.searchAndContents(query, {
        numResults: 3,
        // Consider adding text content options if needed, e.g.,
        // text: {
        //   maxCharacters: 1000,
        //   includeHtmlTags: false
        // }
      });

      // Map results to a simpler structure for the AI model
      return results.map(result => ({
        title: result.title ?? 'No title available', // Handle potential null titles
        url: result.url,
        // Ensure content exists and slice it
        content: result.text ? result.text.slice(0, 1000) : 'No content available',
        publishedDate: result.publishedDate ?? 'No date available', // Handle potential null dates
      }));
    } catch (error) {
      console.error('Exa search failed:', error);
      // Return an error message or structure that the AI can understand
      return {
        error: 'Failed to perform web search',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Example usage (can be removed or adapted for your application)
/*
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai'; // Or your preferred model provider

async function runSearch() {
  const { text, toolResults } = await generateText({
    model: openai('gpt-4o-mini'), // Use a model that supports tools
    prompt: 'What are the latest developments in AI regulation?',
    tools: { webSearch },
    maxToolRoundtrips: 1, // Limit to one search round
  });

  console.log('AI Response:', text);
  console.log('Search Results:', toolResults);
}

runSearch();
*/ 