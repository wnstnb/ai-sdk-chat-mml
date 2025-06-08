import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, Part } from "@google/generative-ai";
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

interface CacheOptions {
  max: number; // Maximum number of items in cache
  ttl: number; // Time to live in milliseconds
}

const defaultCacheOptions: CacheOptions = {
  max: 100, // Store up to 100 items
  ttl: 1000 * 60 * 60, // Cache for 1 hour
};

export class PDFProcessingService {
  private generativeAI: GoogleGenerativeAI;
  private model: string = "gemini-2.5-flash-preview-05-20"; // As per task details
  private extractCache: LRUCache<string, string>;
  private summarizeCache: LRUCache<string, string>;

  constructor(apiKey?: string, cacheOptions: Partial<CacheOptions> = {}) {
    const key = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) {
      throw new Error("Gemini API key is not provided. Please set GOOGLE_GENERATIVE_AI_API_KEY environment variable.");
    }
    this.generativeAI = new GoogleGenerativeAI(key);

    const finalCacheOptions = { ...defaultCacheOptions, ...cacheOptions };
    this.extractCache = new LRUCache<string, string>(finalCacheOptions);
    this.summarizeCache = new LRUCache<string, string>(finalCacheOptions);
  }

  private generateCacheKey(data: Buffer | string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  public async extractText(pdfSource: Buffer | string, sourceType: 'buffer' | 'url'): Promise<string> {
    let pdfBuffer: Buffer;

    if (sourceType === 'url') {
      if (typeof pdfSource !== 'string') {
        throw new Error("Invalid pdfSource: Expected a URL string for sourceType 'url'.");
      }
      try {
        const response = await fetch(pdfSource);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF from URL: ${response.status} ${response.statusText}`);
        }
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.toLowerCase().startsWith('application/pdf')) {
          throw new Error(`Invalid file type: URL must point to a PDF document. Received Content-Type: ${contentType || 'N/A'}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        pdfBuffer = Buffer.from(arrayBuffer);
      } catch (error) {
        console.error("Error fetching or processing PDF from URL:", error);
        throw new Error(`Could not retrieve PDF from URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (sourceType === 'buffer') {
      if (!(pdfSource instanceof Buffer)) {
        throw new Error("Invalid pdfSource: Expected a Buffer for sourceType 'buffer'.");
      }
      pdfBuffer = pdfSource;
    } else {
      throw new Error("Invalid sourceType. Must be 'buffer' or 'url'.");
    }

    // Common processing for both buffer and URL (after URL is fetched to buffer)
    if (pdfBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds the limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
    }

    // Validate PDF content for buffer source (magic number check)
    if (sourceType === 'buffer') {
      // Check for PDF magic number (%PDF-)
      if (pdfBuffer.length < 5 || pdfBuffer.toString('utf8', 0, 5) !== '%PDF-') {
        // A more robust check might involve looking for %PDF- within the first 1024 bytes
        // or using a library if available and simple. For now, a direct check at the start.
        throw new Error("Invalid file content: The uploaded file does not appear to be a valid PDF document.");
      }
    }

    const cacheKey = this.generateCacheKey(pdfBuffer);
    const cachedResult = this.extractCache.get(cacheKey);
    if (cachedResult) {
      console.log("Returning cached extraction result.");
      return cachedResult;
    }

    const generationConfig: GenerationConfig = {
      responseMimeType: "text/plain",
    };
    
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const parts: Part[] = [
      {
        inlineData: {
          mimeType: "application/pdf",
          data: pdfBuffer.toString("base64"),
        },
      },
      {
        text: "Extract all text content from this PDF. If tables are present, convert them to Markdown format. Ensure all other text is also extracted accurately."
      }
    ];

    try {
      const model = this.generativeAI.getGenerativeModel({ model: this.model, safetySettings, generationConfig });
      const result = await model.generateContent({ contents: [{ role: "user", parts }] });
      const response = result.response;
      
      if (!response || !response.candidates || response.candidates.length === 0) {
          throw new Error("No content generated or response was empty.");
      }
      
      // Assuming the first candidate has the content
      const candidate = response.candidates[0];
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
          throw new Error("No parts found in the generated content.");
      }

      // Concatenate all text parts
      const extractedText = candidate.content.parts.map(part => part.text).join("");
      this.extractCache.set(cacheKey, extractedText);
      return extractedText;

    } catch (error) {
      console.error("Error extracting text from PDF with Gemini API:", error);
      if (error instanceof Error) {
          throw new Error(`Gemini API error: ${error.message}`);
      }
      throw new Error("An unknown error occurred during PDF text extraction.");
    }
  }

  public async summarizeText(text: string): Promise<string> {
    if (!text || text.trim().length === 0) {
      throw new Error("Input text for summarization cannot be empty.");
    }

    const cacheKey = this.generateCacheKey(text);
    const cachedResult = this.summarizeCache.get(cacheKey);
    if (cachedResult) {
      console.log("Returning cached summarization result.");
      return cachedResult;
    }

    const generationConfig: GenerationConfig = {
      // temperature: 0.7, // Adjust as needed
      // topK: 1,
      // topP: 1,
      // maxOutputTokens: 2048, // Adjust based on expected summary length
      responseMimeType: "text/plain",
    };

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const parts: Part[] = [
      { text: `Please summarize the following text concisely:

${text}` }
    ];

    try {
      const model = this.generativeAI.getGenerativeModel({ model: this.model, safetySettings, generationConfig });
      const result = await model.generateContent({ contents: [{ role: "user", parts }] });
      const response = result.response;

      if (!response || !response.candidates || response.candidates.length === 0) {
        throw new Error("No summary generated or response was empty.");
      }

      const candidate = response.candidates[0];
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error("No parts found in the generated summary.");
      }

      const summaryText = candidate.content.parts.map(part => part.text).join("").trim();
      this.summarizeCache.set(cacheKey, summaryText);
      return summaryText;

    } catch (error) {
      console.error("Error summarizing text with Gemini API:", error);
      if (error instanceof Error) {
        throw new Error(`Gemini API error during summarization: ${error.message}`);
      }
      throw new Error("An unknown error occurred during text summarization.");
    }
  }
} 