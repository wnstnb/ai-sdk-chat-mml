// Placeholder for web scraping service
// This service will handle API calls to the backend for scraping content.

import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

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
      return response.data;
    } catch (error) {
      let classifiedErrorMessage = 'Failed to scrape web content due to an unexpected error.';

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ message?: string; error?: string }>;
        const status = axiosError.response?.status;
        const apiErrorMessage = axiosError.response?.data?.message || axiosError.response?.data?.error || axiosError.message;

        console.error('Web scraping request failed (AxiosError):', {
          message: axiosError.message,
          status,
          responseData: axiosError.response?.data,
          url: axiosError.config?.url,
        });

        if (status) {
          switch (status) {
            case 400:
              classifiedErrorMessage = `Bad request to scraping API: ${apiErrorMessage}`;
              break;
            case 401:
            case 403:
              classifiedErrorMessage = `Authentication/Authorization error with scraping API: ${apiErrorMessage}`;
              // TODO: Trigger re-authentication flow if applicable
              break;
            case 404:
              classifiedErrorMessage = `Scraping API endpoint not found: ${apiErrorMessage}`;
              break;
            case 422:
              classifiedErrorMessage = `Invalid input for scraping API: ${apiErrorMessage}`;
              break;
            case 429:
              classifiedErrorMessage = `Rate limit exceeded with scraping API. Please try again later. Original: ${apiErrorMessage}`;
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              classifiedErrorMessage = `Scraping API server error (status ${status}): ${apiErrorMessage}. Retries were attempted.`;
              break;
            default:
              classifiedErrorMessage = `Scraping API request failed with status ${status}: ${apiErrorMessage}`;
          }
        } else if (axiosError.request) {
          // Network error (no response received)
          classifiedErrorMessage = `Network error while contacting scraping API: ${apiErrorMessage}`;
          console.error('Network error details:', axiosError.request);
        } else {
          // Other Axios error (e.g., setup error)
          classifiedErrorMessage = `Axios error during scraping API request: ${apiErrorMessage}`;
        }
      } else {
        // Non-Axios error
        console.error('Web scraping request failed (UnknownError):', error);
        // classifiedErrorMessage remains the default
      }
      // TODO: Integrate with a monitoring service here (e.g., Sentry.captureException(new Error(classifiedErrorMessage), { extra: { originalError: error } }))
      throw new Error(classifiedErrorMessage);
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