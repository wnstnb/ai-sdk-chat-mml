// Placeholder for web scraping service
// This service will handle API calls to the backend for scraping content.

import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ApplicationError } from '../utils/errorHandling'; // Import ApplicationError

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api'; // Adjusted for Next.js
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Represents the result of scraping a single URL
interface ScrapedUrlResult {
  url: string;
  title?: string;
  content?: string;      // Extracted main content
  rawHtml?: string;      // Optional: Full raw HTML if requested/available
  processedDate: string; // ISO date string of when it was processed
  error?: string;        // Error message if scraping this specific URL failed
  status: 'success' | 'error' | 'pending'; // Status of this specific URL
}

// Represents the actual data structure from the /api/web-scrape endpoint
interface ScrapedData {
  // An array of results, one for each URL processed
  results: ScrapedUrlResult[];
  // Optional overall error if the entire batch request had an issue not specific to one URL
  overallError?: string; 
  // Optional: could include batch processing metadata
  batchId?: string;
  processingTimeMs?: number;
}

// Add a custom property to AxiosRequestConfig for retries
interface AxiosRequestConfigWithRetries extends InternalAxiosRequestConfig {
  retries?: number;
}

class WebScraperApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log('API call successful:', response.config.url);
        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as AxiosRequestConfigWithRetries | undefined;
        const { response } = error;
        const errorMessage = error.message;
        const requestUrl = config?.url || 'Unknown URL';

        console.error(`API call to ${requestUrl} failed: ${errorMessage}`, { 
          status: response?.status,
          data: response?.data,
          config 
        });
        // TODO: Integrate with a monitoring service here (e.g., Sentry.captureException(error))

        const currentRetries = config?.retries ?? 0;

        if (response?.status === 429) {
          console.warn(`Rate limit hit for ${requestUrl}. Retrying with existing backoff strategy. Consider implementing Retry-After header support.`);
          // Note: The existing retry logic below will handle this.
        }

        // Retry logic for specific conditions
        if (config && currentRetries < MAX_RETRIES && 
            response && ![401, 403, 422].includes(response.status) // Do not retry for auth or validation errors
           ) {
            config.retries = currentRetries + 1;
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * config.retries!));
          console.log(`Retrying API call: ${requestUrl}, attempt # ${config.retries}`);
          return this.client.request(config);
        }
        return Promise.reject(error);
      }
    );
  }

  public async scrapeWebContent(urls: string[], processingType: 'full_text' | 'summarize'): Promise<ScrapedData> {
    console.log('Scraping web content for:', urls, 'Processing type:', processingType);
    try {
      const response = await this.client.post<ScrapedData>('/web-scrape', {
        urls,
        processingType,
      });

      // Check for API-reported errors even if HTTP status is 2xx
      if (response.data.overallError) {
        console.warn('Web scraping API reported an overall error:', response.data.overallError);
        throw new ApplicationError(`Scraping service error: ${response.data.overallError}`, {
          context: { urls, processingType, apiResponse: response.data },
          isTrusted: true, // This is an error reported by our API, so we can consider it trusted
        });
      }

      // Optionally, check if all individual URL results have errors
      const allFailed = response.data.results?.every(result => result.status === 'error');
      if (allFailed && response.data.results?.length > 0) {
        console.warn('Web scraping API reported all URLs failed.');
        // Consolidate error messages or use a generic one
        const firstErrorMessage = response.data.results[0].error || 'All URLs failed to scrape.';
        throw new ApplicationError(`Scraping failed for all URLs. Example error: ${firstErrorMessage}` , {
          context: { urls, processingType, apiResponse: response.data },
          isTrusted: true,
        });
      }

      return response.data;
    } catch (error) {
      // Log the error with context before re-throwing or wrapping
      console.error('Error in scrapeWebContent:', {
        originalError: error,
        urls,
        processingType,
      });

      if (axios.isAxiosError(error)) {
        // Re-throw the original AxiosError to be handled by the centralized handler
        // The centralized handler will format the user-facing message
        console.error('Web scraping request failed (AxiosError re-thrown):', {
          message: error.message,
          status: error.response?.status,
          responseData: error.response?.data,
          url: error.config?.url,
        });
        throw error; // Re-throw the original Axios error
      } else if (error instanceof ApplicationError) {
        // If it's already an ApplicationError (e.g., from overallError check), just re-throw
        throw error;
      } else {
        // For non-Axios errors or other unexpected errors caught here
        console.error('Web scraping request failed (UnknownError wrapped):', error);
        throw new ApplicationError('An unexpected error occurred during the web scraping process.', {
          cause: error as Error, // Preserve the original error as cause
          context: { urls, processingType },
          isTrusted: false, // Mark as untrusted as it's an unexpected client-side issue
        });
      }
    }
  }
}

const webScraperApiClient = new WebScraperApiClient();
export default webScraperApiClient;

export const fetchScrapedContent = async (urls: string[], processingType: 'full_text' | 'summarize') => {
  console.log('Fetching scraped content for (old function):', urls, 'processing type:', processingType);
  // This can now use the new client. Its return type would be Promise<ScrapedData>.
  // For now, keeping the message and 'as any' to avoid breaking existing type inference if this old function is used.
  // return webScraperApiClient.scrapeWebContent(urls, processingType);
  return Promise.resolve({ message: 'Not yet implemented by old function, use webScraperApiClient.scrapeWebContent' } as any);
}; 