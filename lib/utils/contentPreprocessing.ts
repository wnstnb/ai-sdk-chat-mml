import { PartialBlock } from '@blocknote/core';
import type { BlockNoteEditor } from '@blocknote/core';

/**
 * Content preprocessing utility for consistent AI content insertion in BlockNote
 * 
 * This utility addresses the inconsistent behavior of BlockNote's tryParseMarkdownToBlocks()
 * by pre-processing content to ensure line breaks create separate blocks.
 */

export interface PreprocessingResult {
  blocks: PartialBlock[];
  success: boolean;
  fallbackUsed: boolean;
  originalContentLength: number;
  processedBlockCount: number;
}

export interface PreprocessingOptions {
  preserveCodeBlocks?: boolean;
  preserveListStructure?: boolean;
  minBlockLength?: number;
  maxBlocksPerContent?: number;
  forceSingleNewlineSplit?: boolean;
}

/**
 * Pre-processes AI-generated content to ensure consistent block creation
 * Splits content by double newlines and handles edge cases
 */
export async function preprocessAIContent(
  content: string,
  editor: BlockNoteEditor<any>,
  options: PreprocessingOptions = {}
): Promise<PreprocessingResult> {
  const {
    preserveCodeBlocks = true,
    preserveListStructure = true,
    minBlockLength = 1,
    maxBlocksPerContent = 100
  } = options;

  console.log('[contentPreprocessing] Starting preprocessing for content:', content.substring(0, 100) + '...');

  // Early return for empty content
  if (!content || content.trim().length === 0) {
    return {
      blocks: [],
      success: true,
      fallbackUsed: false,
      originalContentLength: 0,
      processedBlockCount: 0
    };
  }

  try {
    // First, try the original BlockNote parser
    const originalBlocks = await editor.tryParseMarkdownToBlocks(content);
    
    // If BlockNote parsed successfully and created multiple blocks, use it
    if (originalBlocks.length > 1) {
      console.log('[contentPreprocessing] BlockNote parser succeeded, using original result');
      return {
        blocks: originalBlocks,
        success: true,
        fallbackUsed: false,
        originalContentLength: content.length,
        processedBlockCount: originalBlocks.length
      };
    }

    // If BlockNote returned a single block, check if it contains newlines
    if (originalBlocks.length === 1) {
      const blockContent = extractTextFromBlock(originalBlocks[0]);
      if (!blockContent.includes('\n')) {
        // Single block without newlines is fine
        console.log('[contentPreprocessing] Single block without newlines, using original result');
        return {
          blocks: originalBlocks,
          success: true,
          fallbackUsed: false,
          originalContentLength: content.length,
          processedBlockCount: 1
        };
      }
    }

    // BlockNote failed or returned single block with newlines - use our preprocessing
    console.log('[contentPreprocessing] BlockNote parser failed or returned single block with newlines, applying preprocessing');
    
    const preprocessedBlocks = await preprocessContentManually(content, editor, {
      preserveCodeBlocks,
      preserveListStructure,
      minBlockLength,
      maxBlocksPerContent
    });

    return {
      blocks: preprocessedBlocks,
      success: true,
      fallbackUsed: true,
      originalContentLength: content.length,
      processedBlockCount: preprocessedBlocks.length
    };

  } catch (error) {
    console.error('[contentPreprocessing] Error during preprocessing:', error);
    
    // Ultimate fallback: create a single paragraph
    const fallbackBlock: PartialBlock = {
      type: 'paragraph',
      content: [{ type: 'text', text: content, styles: {} }]
    };

    return {
      blocks: [fallbackBlock],
      success: false,
      fallbackUsed: true,
      originalContentLength: content.length,
      processedBlockCount: 1
    };
  }
}

/**
 * Manually preprocesses content by splitting on double newlines or single newlines based on content type
 */
async function preprocessContentManually(
  content: string,
  editor: BlockNoteEditor<any>,
  options: PreprocessingOptions
): Promise<PartialBlock[]> {
  const { preserveCodeBlocks, preserveListStructure, minBlockLength, maxBlocksPerContent, forceSingleNewlineSplit } = options;
  
  // Handle code blocks specially if requested
  if (preserveCodeBlocks && content.includes('```')) {
    return await handleCodeBlockContent(content, editor);
  }

  // Determine splitting strategy
  const isPoetryOrFormatted = forceSingleNewlineSplit || detectPoetryOrFormattedText(content);
  
  console.log('[contentPreprocessing] Content analysis:', {
    isPoetryOrFormatted,
    forceSingleNewlineSplit,
    contentPreview: content.substring(0, 100) + '...'
  });

  let paragraphs: string[];
  
  if (isPoetryOrFormatted) {
    // Split on single newlines for poetry/formatted text
    paragraphs = content
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length >= minBlockLength!);
    
    console.log('[contentPreprocessing] Using single newline split, got', paragraphs.length, 'lines');
  } else {
    // Split content by double newlines (paragraph boundaries) for regular prose
    paragraphs = content
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length >= minBlockLength!);
    
    console.log('[contentPreprocessing] Using double newline split, got', paragraphs.length, 'paragraphs');
  }

  // Limit the number of blocks to prevent performance issues
  const limitedParagraphs = paragraphs.slice(0, maxBlocksPerContent!);

  const blocks: PartialBlock[] = [];

  for (const paragraph of limitedParagraphs) {
    try {
      // Try to parse each paragraph individually
      const paragraphBlocks = await editor.tryParseMarkdownToBlocks(paragraph);
      
      if (paragraphBlocks.length > 0) {
        blocks.push(...paragraphBlocks);
      } else {
        // Fallback to plain paragraph
        blocks.push({
          type: 'paragraph',
          content: [{ type: 'text', text: paragraph, styles: {} }]
        });
      }
    } catch (error) {
      console.warn('[contentPreprocessing] Failed to parse paragraph, using fallback:', paragraph.substring(0, 50));
      // Fallback to plain paragraph
      blocks.push({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph, styles: {} }]
      });
    }
  }

  return blocks;
}

/**
 * Handles content that contains code blocks
 */
async function handleCodeBlockContent(
  content: string,
  editor: BlockNoteEditor<any>
): Promise<PartialBlock[]> {
  const blocks: PartialBlock[] = [];
  
  // Split by code block boundaries
  const parts = content.split(/(```[\s\S]*?```)/);
  
  for (const part of parts) {
    if (part.trim().length === 0) continue;
    
    if (part.startsWith('```') && part.endsWith('```')) {
      // This is a code block - preserve as single block
      try {
        const codeBlocks = await editor.tryParseMarkdownToBlocks(part);
        if (codeBlocks.length > 0) {
          blocks.push(...codeBlocks);
        } else {
          // Fallback for code block
          blocks.push({
            type: 'codeBlock',
            content: part.replace(/^```\w*\n?/, '').replace(/\n?```$/, ''),
            props: { language: 'text' }
          } as PartialBlock);
        }
      } catch (error) {
        // Fallback for code block
        blocks.push({
          type: 'codeBlock',
          content: part.replace(/^```\w*\n?/, '').replace(/\n?```$/, ''),
          props: { language: 'text' }
        } as PartialBlock);
      }
    } else {
      // Regular content - determine splitting strategy
      const isPoetryOrFormatted = detectPoetryOrFormattedText(part);
      
      let paragraphs: string[];
      if (isPoetryOrFormatted) {
        // Split on single newlines for poetry/formatted text
        paragraphs = part.split('\n').map(p => p.trim()).filter(p => p.length > 0);
      } else {
        // Split by double newlines for regular prose
        paragraphs = part.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
      }
      
      for (const paragraph of paragraphs) {
        try {
          const paragraphBlocks = await editor.tryParseMarkdownToBlocks(paragraph);
          if (paragraphBlocks.length > 0) {
            blocks.push(...paragraphBlocks);
          } else {
            blocks.push({
              type: 'paragraph',
              content: [{ type: 'text', text: paragraph, styles: {} }]
            });
          }
        } catch (error) {
          blocks.push({
            type: 'paragraph',
            content: [{ type: 'text', text: paragraph, styles: {} }]
          });
        }
      }
    }
  }
  
  return blocks;
}

/**
 * Extracts plain text from a BlockNote block for analysis
 */
function extractTextFromBlock(block: PartialBlock): string {
  if (!block.content) return '';
  
  if (typeof block.content === 'string') {
    return block.content;
  }
  
  if (Array.isArray(block.content)) {
    return block.content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          return item.text || '';
        }
        return '';
      })
      .join('');
  }
  
  return '';
}

/**
 * Validates the preprocessing result
 */
export function validatePreprocessingResult(result: PreprocessingResult): boolean {
  if (!result.success) return false;
  if (result.blocks.length === 0 && result.originalContentLength > 0) return false;
  if (result.processedBlockCount > 100) return false;
  
  return true;
}

/**
 * Creates a summary of the preprocessing operation for logging
 */
export function createPreprocessingSummary(result: PreprocessingResult): string {
  const { success, fallbackUsed, originalContentLength, processedBlockCount } = result;
  
  return `Preprocessing: ${success ? 'SUCCESS' : 'FAILED'} | ` +
         `Fallback: ${fallbackUsed ? 'YES' : 'NO'} | ` +
         `Content: ${originalContentLength} chars → ${processedBlockCount} blocks`;
}

/**
 * Detects if content appears to be poetry or formatted text that should split on single newlines
 */
function detectPoetryOrFormattedText(content: string): boolean {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Need at least 3 lines to detect poetry patterns
  if (lines.length < 3) {
    return false;
  }
  
  // Poetry indicators:
  // 1. Multiple lines of similar length (within 20% variance)
  // 2. Lines that are relatively short (under 80 characters typically)
  // 3. No double newlines (all single newlines)
  // 4. Lines don't end with periods (prose usually does)
  
  const avgLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
  const maxLength = Math.max(...lines.map(line => line.length));
  const minLength = Math.min(...lines.map(line => line.length));
  
  // Check for similar line lengths (within 50% variance for poetry)
  const lengthVariance = (maxLength - minLength) / avgLength;
  const shortLines = avgLength < 80; // Poetry tends to have shorter lines
  const noDoubleNewlines = !content.includes('\n\n');
  const fewPeriods = lines.filter(line => line.endsWith('.')).length < lines.length * 0.3;
  
  // Score the poetry likelihood
  let poetryScore = 0;
  if (lengthVariance < 0.5) poetryScore += 2;
  if (shortLines) poetryScore += 1;
  if (noDoubleNewlines) poetryScore += 2;
  if (fewPeriods) poetryScore += 1;
  if (lines.length > 10) poetryScore += 1; // Long poems are more likely
  
  console.log('[contentPreprocessing] Poetry detection:', {
    lines: lines.length,
    avgLength,
    lengthVariance,
    shortLines,
    noDoubleNewlines,
    fewPeriods,
    poetryScore
  });
  
  return poetryScore >= 3; // Threshold for poetry detection
} 