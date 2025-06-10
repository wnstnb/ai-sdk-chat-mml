// Enhanced block validation utilities for AI tool operations
import { Block, PartialBlock, BlockNoteEditor } from '@blocknote/core';

/**
 * Validation result type for block operations
 */
export interface BlockValidationResult {
  isValid: boolean;
  errorMessage?: string;
  warnings?: string[];
  suggestedFallback?: string;
}

/**
 * Block ID format validation - ensures block IDs are valid UUIDs or valid formats
 */
export const validateBlockId = (blockId: string): BlockValidationResult => {
  if (!blockId || typeof blockId !== 'string') {
    return {
      isValid: false,
      errorMessage: 'Block ID must be a non-empty string'
    };
  }

  // BlockNote typically uses UUID format or similar
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(blockId)) {
    return {
      isValid: false,
      errorMessage: 'Block ID must be in valid UUID format'
    };
  }

  return { isValid: true };
};

/**
 * Validates that block IDs exist in the editor and are accessible
 */
export const validateBlocksExist = (
  editor: BlockNoteEditor<any>,
  blockIds: string[]
): BlockValidationResult => {
  const nonExistentBlocks: string[] = [];
  const warnings: string[] = [];

  for (const blockId of blockIds) {
    const idValidation = validateBlockId(blockId);
    if (!idValidation.isValid) {
      return {
        isValid: false,
        errorMessage: `Invalid block ID format: ${blockId} - ${idValidation.errorMessage}`
      };
    }

    const block = editor.getBlock(blockId);
    if (!block) {
      nonExistentBlocks.push(blockId);
    }
  }

  if (nonExistentBlocks.length > 0) {
    return {
      isValid: false,
      errorMessage: `Block(s) not found: ${nonExistentBlocks.join(', ')}`
    };
  }

  return { isValid: true, warnings };
};

/**
 * Validates that blocks are in appropriate states for modification
 */
export const validateBlocksForModification = (
  editor: BlockNoteEditor<any>,
  blockIds: string[]
): BlockValidationResult => {
  const existenceValidation = validateBlocksExist(editor, blockIds);
  if (!existenceValidation.isValid) {
    return existenceValidation;
  }

  const warnings: string[] = [];
  
  for (const blockId of blockIds) {
    const block = editor.getBlock(blockId);
    if (!block) continue; // Already validated above

    // Check if block has content property for content-based operations
    if (!block.content && block.type !== 'table') {
      warnings.push(`Block ${blockId} has no content property - modification may have unexpected results`);
    }

    // Check for special block types that need careful handling
    if (block.type === 'table' && !block.content) {
      warnings.push(`Table block ${blockId} appears to be empty`);
    }
  }

  return { isValid: true, warnings };
};

/**
 * Validates content safety - checks for potential issues with content
 */
export const validateContentSafety = (content: string): BlockValidationResult => {
  const warnings: string[] = [];

  // Check for extremely long content that might cause performance issues
  if (content.length > 10000) {
    warnings.push('Content is very long and may impact editor performance');
  }

  // Check for potentially problematic patterns
  if (content.includes('<script>')) {
    return {
      isValid: false,
      errorMessage: 'Content contains potentially unsafe script tags'
    };
  }

  // Check for excessive nested structures
  const nestedListCount = (content.match(/^\s*[\-\*\+]/gm) || []).length;
  if (nestedListCount > 100) {
    warnings.push('Content contains many list items - may impact performance');
  }

  return { isValid: true, warnings };
};

/**
 * Validates that an operation makes sense in the current document context
 */
export const validateOperationContext = (
  editor: BlockNoteEditor<any>,
  operation: 'add' | 'modify' | 'delete' | 'createChecklist' | 'modifyTable',
  targetBlockIds?: string[]
): BlockValidationResult => {
  const documentLength = editor.document.length;
  const warnings: string[] = [];

  // Check if document is empty and operation requires context
  if (documentLength === 0 && operation !== 'add') {
    return {
      isValid: false,
      errorMessage: `Cannot perform ${operation} operation on empty document`
    };
  }

  // Check for operations on large selections
  if (targetBlockIds && targetBlockIds.length > documentLength * 0.5) {
    warnings.push(`Operation targets ${targetBlockIds.length} blocks out of ${documentLength} total - this affects a large portion of the document`);
  }

  // Validate delete operations don't remove entire document
  if (operation === 'delete' && targetBlockIds && targetBlockIds.length === documentLength) {
    return {
      isValid: false,
      errorMessage: 'Cannot delete all blocks - document would become empty',
      suggestedFallback: 'Leave at least one block or add new content first'
    };
  }

  return { isValid: true, warnings };
};

/**
 * Enhanced validation for multi-block operations
 */
export const validateBatchOperation = (
  editor: BlockNoteEditor<any>,
  blockIds: string[],
  operation: string,
  contents?: string[]
): BlockValidationResult => {
  // Basic array validation
  if (!Array.isArray(blockIds)) {
    return {
      isValid: false,
      errorMessage: 'Block IDs must be provided as an array'
    };
  }

  if (blockIds.length === 0) {
    return {
      isValid: false,
      errorMessage: 'At least one block ID must be provided'
    };
  }

  // Content array validation for operations that need it
  if (contents && !Array.isArray(contents)) {
    return {
      isValid: false,
      errorMessage: 'Contents must be provided as an array'
    };
  }

  // Length matching validation
  if (contents && contents.length !== blockIds.length) {
    return {
      isValid: false,
      errorMessage: 'Number of content items must match number of block IDs'
    };
  }

  // Validate each block exists
  const existenceValidation = validateBlocksExist(editor, blockIds);
  if (!existenceValidation.isValid) {
    return existenceValidation;
  }

  // Check for reasonable batch size
  const warnings: string[] = [];
  if (blockIds.length > 50) {
    warnings.push(`Large batch operation (${blockIds.length} blocks) - consider breaking into smaller operations`);
  }

  return { isValid: true, warnings };
};

/**
 * Validates reference block for insertion operations
 */
export const validateReferenceBlock = (
  editor: BlockNoteEditor<any>,
  targetBlockId?: string | null
): BlockValidationResult => {
  // If no target specified, use cursor position or end of document
  if (!targetBlockId) {
    const cursorBlock = editor.getTextCursorPosition().block;
    if (cursorBlock) {
      return { 
        isValid: true, 
        warnings: ['No target block specified, using cursor position'],
        suggestedFallback: cursorBlock.id 
      };
    }

    const lastBlock = editor.document[editor.document.length - 1];
    if (lastBlock) {
      return { 
        isValid: true, 
        warnings: ['No target block specified, using end of document'],
        suggestedFallback: lastBlock.id 
      };
    }

    // Empty document
    return { 
      isValid: true, 
      warnings: ['Document is empty, content will be inserted as first block'] 
    };
  }

  // Validate the specified target block
  const blockValidation = validateBlocksExist(editor, [targetBlockId]);
  return blockValidation;
};

/**
 * Comprehensive validation function that combines multiple checks
 */
export const validateToolOperation = (
  editor: BlockNoteEditor<any>,
  operation: {
    type: 'add' | 'modify' | 'delete' | 'createChecklist' | 'modifyTable';
    targetBlockIds?: string[];
    content?: string | string[];
    referenceBlockId?: string | null;
  }
): BlockValidationResult => {
  const { type, targetBlockIds, content, referenceBlockId } = operation;

  // Validate operation context
  const contextValidation = validateOperationContext(editor, type, targetBlockIds);
  if (!contextValidation.isValid) {
    return contextValidation;
  }

  // Validate target blocks if specified
  if (targetBlockIds && targetBlockIds.length > 0) {
    const targetValidation = validateBlocksForModification(editor, targetBlockIds);
    if (!targetValidation.isValid) {
      return targetValidation;
    }
  }

  // Validate reference block for insertion operations
  if (type === 'add' || type === 'createChecklist') {
    const referenceValidation = validateReferenceBlock(editor, referenceBlockId);
    if (!referenceValidation.isValid) {
      return referenceValidation;
    }
  }

  // Validate content safety
  if (content) {
    const contentArray = Array.isArray(content) ? content : [content];
    for (const contentItem of contentArray) {
      const safetyValidation = validateContentSafety(contentItem);
      if (!safetyValidation.isValid) {
        return safetyValidation;
      }
    }
  }

  // Validate batch operations
  if (targetBlockIds && targetBlockIds.length > 1) {
    const batchValidation = validateBatchOperation(
      editor, 
      targetBlockIds, 
      type,
      Array.isArray(content) ? content : undefined
    );
    if (!batchValidation.isValid) {
      return batchValidation;
    }
  }

  return { isValid: true };
}; 