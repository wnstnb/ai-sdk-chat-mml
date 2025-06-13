// Content preservation guards for AI tool operations
import { Block, PartialBlock, BlockNoteEditor } from '@blocknote/core';
import { getInlineContentText } from './editorUtils';

/**
 * Configuration for content preservation behavior
 */
export interface ContentPreservationConfig {
  maxReplacementRatio: number; // Maximum ratio of new content to existing content (0.1 = 10%)
  minContentThreshold: number; // Minimum character count to trigger protection
  maxBatchDeletePercent: number; // Maximum percentage of document that can be deleted in one operation
  warnOnLargeChanges: boolean; // Show warnings for large content changes
  protectSpecialBlocks: boolean; // Extra protection for tables, images, etc.
}

export const defaultPreservationConfig: ContentPreservationConfig = {
  maxReplacementRatio: 0.1, // Warn if replacing >90% of content with <10% new content
  minContentThreshold: 100, // Protect content over 100 characters
  maxBatchDeletePercent: 75, // Don't allow deletion of >75% of document
  warnOnLargeChanges: true,
  protectSpecialBlocks: true
};

export interface ContentImpact {
  charactersAffected: number;
  blocksAffected: number;
  percentOfDocument: number;
  contentTypes: string[];
}

/**
 * Content preservation result
 */
export interface ContentPreservationResult {
  isAllowed: boolean;
  shouldWarn: boolean;
  errorMessage?: string;
  warningMessage?: string;
  preservationReason?: string;
  impact?: ContentImpact;
  suggestedAction?: string;
}

/**
 * Analyzes the content of a block to determine its character count and type
 */
export const analyzeBlockContent = (block: Block | PartialBlock): {
  characterCount: number;
  blockType: string;
  hasRichContent: boolean;
} => {
  let characterCount = 0;
  let hasRichContent = false;

  // Handle different block types
  if (block.content && Array.isArray(block.content)) {
    characterCount = getInlineContentText(block.content as any).length;
  } else if (block.type === 'table') {
    // Tables are considered rich content
    hasRichContent = true;
    characterCount = 50; // Estimate for table content
  } else if (block.type === 'image' || block.type === 'file') {
    hasRichContent = true;
    characterCount = 20; // Estimate for media content
  }

  return {
    characterCount,
    blockType: block.type || 'unknown',
    hasRichContent
  };
};

/**
 * Analyzes the impact of modifying or deleting blocks
 */
export const analyzeContentImpact = (
  editor: BlockNoteEditor<any>,
  targetBlockIds: string[],
  newContent?: string | string[]
): ContentImpact => {
  let totalCharactersAffected = 0;
  const contentTypes = new Set<string>();
  const documentLength = editor.document.length > 0 ? editor.document.length : 1; // Avoid division by zero

  for (const blockId of targetBlockIds) {
    const block = editor.getBlock(blockId);
    if (block) {
      const analysis = analyzeBlockContent(block);
      totalCharactersAffected += analysis.characterCount;
      contentTypes.add(analysis.blockType);
    }
  }

  return {
    charactersAffected: totalCharactersAffected,
    blocksAffected: targetBlockIds.length,
    percentOfDocument: (targetBlockIds.length / documentLength) * 100,
    contentTypes: Array.from(contentTypes)
  };
};

/**
 * Validates modification operations to prevent content loss
 */
export const validateContentModification = (
  editor: BlockNoteEditor<any>,
  targetBlockIds: string[],
  newContent: string | string[],
  config: ContentPreservationConfig = defaultPreservationConfig
): ContentPreservationResult => {
  const impact = analyzeContentImpact(editor, targetBlockIds, newContent);
  
  // Calculate replacement ratio
  const newContentArray = Array.isArray(newContent) ? newContent : [newContent];
  const totalNewCharacters = newContentArray.join('').length;
  
  const replacementRatio = impact.charactersAffected > 0 
    ? totalNewCharacters / impact.charactersAffected 
    : 1;

  // Check if this is a large content replacement with small new content
  if (impact.charactersAffected >= config.minContentThreshold && 
      replacementRatio < config.maxReplacementRatio) {
    return {
      isAllowed: false,
      shouldWarn: false,
      errorMessage: `Content replacement blocked: Replacing ${impact.charactersAffected} characters with ${totalNewCharacters} characters (${Math.round(replacementRatio * 100)}% replacement ratio)`,
      preservationReason: 'Large content would be replaced with significantly smaller content',
      impact,
      suggestedAction: 'Review the content change or use more specific targeting to modify only the intended portion'
    };
  }

  // Check for special block protection
  if (config.protectSpecialBlocks && 
      (impact.contentTypes.includes('table') || 
       impact.contentTypes.includes('image') || 
       impact.contentTypes.includes('file'))) {
    
    // Extra caution for special blocks
    if (replacementRatio < 0.5) {
      return {
        isAllowed: false,
        shouldWarn: false,
        errorMessage: `Modification blocked: Special content blocks (${impact.contentTypes.join(', ')}) require careful handling`,
        preservationReason: 'Special content blocks (tables, images, files) have extra protection',
        impact,
        suggestedAction: 'Use block-specific tools or confirm the modification is intentional'
      };
    }
  }

  // Large change warnings
  if (config.warnOnLargeChanges && 
      (impact.percentOfDocument > 25 || impact.charactersAffected > 500)) {
    return {
      isAllowed: true,
      shouldWarn: true,
      warningMessage: `Large content modification: Affecting ${impact.blocksAffected} blocks (${Math.round(impact.percentOfDocument)}% of document) with ${impact.charactersAffected} characters`,
      impact
    };
  }

  return {
    isAllowed: true,
    shouldWarn: false,
    impact
  };
};

/**
 * Validates deletion operations to prevent content loss
 */
export const validateContentDeletion = (
  editor: BlockNoteEditor<any>,
  targetBlockIds: string[],
  config: ContentPreservationConfig = defaultPreservationConfig
): ContentPreservationResult => {
  const impact = analyzeContentImpact(editor, targetBlockIds);
  const documentLength = editor.document.length;

  // Prevent deletion of entire document
  if (impact.blocksAffected >= documentLength) {
    return {
      isAllowed: false,
      shouldWarn: false,
      errorMessage: 'Deletion blocked: Cannot delete all content from the document',
      preservationReason: 'Document must retain at least one block',
      impact,
      suggestedAction: 'Add new content before deleting existing content, or delete blocks individually'
    };
  }

  // Prevent deletion of large portions of the document
  if (impact.percentOfDocument > config.maxBatchDeletePercent) {
    return {
      isAllowed: false,
      shouldWarn: false,
      errorMessage: `Deletion blocked: Cannot delete ${Math.round(impact.percentOfDocument)}% of the document in one operation (limit: ${config.maxBatchDeletePercent}%)`,
      preservationReason: 'Batch deletion percentage exceeds safety threshold',
      impact,
      suggestedAction: 'Delete content in smaller batches or confirm this is intentional'
    };
  }

  // Special block protection
  if (config.protectSpecialBlocks && 
      (impact.contentTypes.includes('table') || 
       impact.contentTypes.includes('image') || 
       impact.contentTypes.includes('file'))) {
    
    if (impact.blocksAffected > 1 && impact.contentTypes.length > 0) {
      return {
        isAllowed: true,
        shouldWarn: true,
        warningMessage: `Deleting special content: ${impact.contentTypes.join(', ')} blocks will be permanently removed`,
        impact
      };
    }
  }

  // Large deletion warnings
  if (config.warnOnLargeChanges && 
      (impact.percentOfDocument > 15 || impact.charactersAffected > 300)) {
    return {
      isAllowed: true,
      shouldWarn: true,
      warningMessage: `Large content deletion: Removing ${impact.blocksAffected} blocks (${Math.round(impact.percentOfDocument)}% of document) with ${impact.charactersAffected} characters`,
      impact
    };
  }

  return {
    isAllowed: true,
    shouldWarn: false,
    impact
  };
};

/**
 * Validates insertion operations for potential issues
 */
export const validateContentInsertion = (
  editor: BlockNoteEditor<any>,
  content: string | string[],
  targetPosition?: string,
  config: ContentPreservationConfig = defaultPreservationConfig
): ContentPreservationResult => {
  const contentArray = Array.isArray(content) ? content : [content];
  const totalCharacters = contentArray.join('').length;
  const documentLength = editor.document.length;

  // Check for extremely large content insertions
  if (totalCharacters > 5000) {
    return {
      isAllowed: true,
      shouldWarn: true,
      warningMessage: `Large content insertion: Adding ${totalCharacters} characters to the document`,
      impact: {
        charactersAffected: totalCharacters,
        blocksAffected: contentArray.length,
        percentOfDocument: 0, // Insertion doesn't replace existing content
        contentTypes: ['new_content']
      }
    };
  }

  // Check for potential content that might be malformed
  for (const item of contentArray) {
    if (typeof item === 'string' && item.includes('<script>')) {
      return {
        isAllowed: false,
        shouldWarn: false,
        errorMessage: 'Content insertion blocked: Potentially unsafe content detected',
        preservationReason: 'Content contains potentially dangerous script tags',
        suggestedAction: 'Remove script tags from the content before insertion'
      };
    }
  }

  return {
    isAllowed: true,
    shouldWarn: false,
    impact: {
      charactersAffected: totalCharacters,
      blocksAffected: contentArray.length,
      percentOfDocument: 0,
      contentTypes: ['new_content']
    }
  };
};

/**
 * Creates a backup snapshot of content before modification
 */
export interface ContentSnapshot {
  blockId: string;
  originalContent: any;
  timestamp: number;
  operation: string;
}

export const createContentSnapshot = (
  editor: BlockNoteEditor<any>,
  blockIds: string[],
  operation: string
): ContentSnapshot[] => {
  const snapshots: ContentSnapshot[] = [];
  
  for (const blockId of blockIds) {
    const block = editor.getBlock(blockId);
    if (block) {
      snapshots.push({
        blockId,
        originalContent: JSON.parse(JSON.stringify(block)), // Deep copy
        timestamp: Date.now(),
        operation
      });
    }
  }
  
  return snapshots;
};

/**
 * Comprehensive content preservation check for all operations
 */
export const checkContentPreservation = (
  editor: BlockNoteEditor<any>,
  operation: {
    type: 'modify' | 'delete' | 'insert';
    targetBlockIds?: string[];
    content?: string | string[];
    referenceBlockId?: string;
  },
  config: ContentPreservationConfig = defaultPreservationConfig
): ContentPreservationResult => {
  const { type, targetBlockIds, content, referenceBlockId } = operation;

  switch (type) {
    case 'modify':
      if (!targetBlockIds || !content) {
        return {
          isAllowed: false,
          shouldWarn: false,
          errorMessage: 'Invalid modification operation: missing targets or content'
        };
      }
      return validateContentModification(editor, targetBlockIds, content, config);

    case 'delete':
      if (!targetBlockIds) {
        return {
          isAllowed: false,
          shouldWarn: false,
          errorMessage: 'Invalid deletion operation: missing target blocks'
        };
      }
      return validateContentDeletion(editor, targetBlockIds, config);

    case 'insert':
      if (!content) {
        return {
          isAllowed: false,
          shouldWarn: false,
          errorMessage: 'Invalid insertion operation: missing content'
        };
      }
      return validateContentInsertion(editor, content, referenceBlockId, config);

    default:
      return {
        isAllowed: false,
        shouldWarn: false,
        errorMessage: `Unknown operation type: ${type}`
      };
  }
}; 