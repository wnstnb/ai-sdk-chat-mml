// Target block safety mechanisms for AI tool operations
import { Block, PartialBlock, BlockNoteEditor } from '@blocknote/core';
import { BlockValidationResult } from './blockValidation';

/**
 * Safety result for block operations with detailed targeting information
 */
export interface BlockSafetyResult extends BlockValidationResult {
  resolvedTargets?: string[];
  fallbackUsed?: boolean;
  fallbackReason?: string;
  affectedBlockCount?: number;
}

/**
 * Configuration for target resolution behavior
 */
export interface TargetResolutionConfig {
  allowFallback: boolean;
  maxTargetCount?: number;
  requireExplicitTarget?: boolean;
  preferCursorPosition?: boolean;
}

/**
 * Safely resolves target blocks with intelligent fallback mechanisms
 */
export const resolveTargetBlocks = (
  editor: BlockNoteEditor<any>,
  targetBlockIds?: string | string[] | null,
  config: TargetResolutionConfig = { allowFallback: true }
): BlockSafetyResult => {
  // Handle empty/null targets
  if (!targetBlockIds || (Array.isArray(targetBlockIds) && targetBlockIds.length === 0)) {
    if (!config.allowFallback) {
      return {
        isValid: false,
        errorMessage: 'No target block specified and fallback is disabled'
      };
    }

    // Try cursor position first if preferred
    if (config.preferCursorPosition) {
      const cursorBlock = editor.getTextCursorPosition().block;
      if (cursorBlock && cursorBlock.id) {
        return {
          isValid: true,
          resolvedTargets: [cursorBlock.id],
          fallbackUsed: true,
          fallbackReason: 'Used current cursor position',
          affectedBlockCount: 1,
          warnings: ['No target specified, using cursor position']
        };
      }
    }

    // Fallback to end of document
    const lastBlock = editor.document[editor.document.length - 1];
    if (lastBlock && lastBlock.id) {
      return {
        isValid: true,
        resolvedTargets: [lastBlock.id],
        fallbackUsed: true,
        fallbackReason: 'Used end of document',
        affectedBlockCount: 1,
        warnings: ['No target specified, using end of document']
      };
    }

    // Document is empty
    return {
      isValid: true,
      resolvedTargets: [],
      fallbackUsed: true,
      fallbackReason: 'Document is empty, will create first block',
      affectedBlockCount: 0,
      warnings: ['Document is empty, content will be added as first block']
    };
  }

  // Normalize to array
  const blockIds = Array.isArray(targetBlockIds) ? targetBlockIds : [targetBlockIds];
  
  // Check max target count
  if (config.maxTargetCount && blockIds.length > config.maxTargetCount) {
    return {
      isValid: false,
      errorMessage: `Too many target blocks (${blockIds.length}), maximum allowed is ${config.maxTargetCount}`
    };
  }

  // Validate each block ID and check existence
  const validTargets: string[] = [];
  const missingTargets: string[] = [];
  const warnings: string[] = [];

  for (const blockId of blockIds) {
    // Basic format validation
    if (!blockId || typeof blockId !== 'string') {
      missingTargets.push(blockId);
      continue;
    }

    // Check if block exists
    const block = editor.getBlock(blockId);
    if (!block) {
      missingTargets.push(blockId);
    } else {
      validTargets.push(blockId);
    }
  }

  // Handle missing targets
  if (missingTargets.length > 0) {
    const errorMsg = `Target block(s) not found: ${missingTargets.join(', ')}`;
    
    // If some targets are valid, it's a partial failure
    if (validTargets.length > 0) {
      warnings.push(`${errorMsg}. Will proceed with ${validTargets.length} valid targets.`);
      return {
        isValid: true,
        resolvedTargets: validTargets,
        affectedBlockCount: validTargets.length,
        warnings
      };
    }

    // All targets are invalid
    if (config.allowFallback) {
      // Try to use a fallback
      const cursorBlock = editor.getTextCursorPosition().block;
      if (cursorBlock && cursorBlock.id) {
        return {
          isValid: true,
          resolvedTargets: [cursorBlock.id],
          fallbackUsed: true,
          fallbackReason: errorMsg + ', using cursor position as fallback',
          affectedBlockCount: 1,
          warnings: [errorMsg + ', falling back to cursor position']
        };
      }

      const lastBlock = editor.document[editor.document.length - 1];
      if (lastBlock && lastBlock.id) {
        return {
          isValid: true,
          resolvedTargets: [lastBlock.id],
          fallbackUsed: true,
          fallbackReason: errorMsg + ', using end of document as fallback',
          affectedBlockCount: 1,
          warnings: [errorMsg + ', falling back to end of document']
        };
      }
    }

    return {
      isValid: false,
      errorMessage: errorMsg
    };
  }

  // All targets are valid
  return {
    isValid: true,
    resolvedTargets: validTargets,
    affectedBlockCount: validTargets.length
  };
};

/**
 * Verifies that target blocks are safe for the intended operation
 */
export const verifyBlockOperationSafety = (
  editor: BlockNoteEditor<any>,
  blockIds: string[],
  operation: 'modify' | 'delete' | 'insertAfter' | 'insertBefore',
  options: {
    preventDocumentWipe?: boolean;
    requireContent?: boolean;
    allowedBlockTypes?: string[];
  } = {}
): BlockSafetyResult => {
  const {
    preventDocumentWipe = true,
    requireContent = false,
    allowedBlockTypes
  } = options;

  const warnings: string[] = [];
  const documentLength = editor.document.length;

  // Check for document wipe prevention
  if (preventDocumentWipe && operation === 'delete' && blockIds.length >= documentLength) {
    return {
      isValid: false,
      errorMessage: 'Operation would delete all content in the document',
      suggestedFallback: 'Leave at least one block or add content before deleting'
    };
  }

  // Warn about large-scale operations
  if (blockIds.length > documentLength * 0.5) {
    warnings.push(`Operation affects ${blockIds.length} out of ${documentLength} blocks (>${Math.round(documentLength * 50)}% of document)`);
  }

  // Verify blocks exist and check constraints
  for (const blockId of blockIds) {
    const block = editor.getBlock(blockId);
    if (!block) {
      return {
        isValid: false,
        errorMessage: `Target block ${blockId} not found or has been removed`
      };
    }

    // Check content requirement
    if (requireContent && (!block.content || (Array.isArray(block.content) && block.content.length === 0))) {
      warnings.push(`Block ${blockId} has no content - operation may have unexpected results`);
    }

    // Check allowed block types
    if (allowedBlockTypes && !allowedBlockTypes.includes(block.type)) {
      return {
        isValid: false,
        errorMessage: `Block ${blockId} is of type '${block.type}', but operation only supports: ${allowedBlockTypes.join(', ')}`
      };
    }

    // Special safety checks for different block types
    if (block.type === 'table' && operation === 'modify') {
      // Tables need special handling
      warnings.push(`Modifying table block ${blockId} - ensure new content is valid table structure`);
    }

    if ((block.type === 'image' || block.type === 'file') && operation === 'modify') {
      warnings.push(`Modifying ${block.type} block ${blockId} - content modification may not behave as expected`);
    }
  }

  return {
    isValid: true,
    warnings,
    affectedBlockCount: blockIds.length
  };
};

/**
 * Creates a safe operation plan with validated targets and fallbacks
 */
export const createSafeOperationPlan = (
  editor: BlockNoteEditor<any>,
  operation: {
    type: 'add' | 'modify' | 'delete' | 'createChecklist' | 'modifyTable';
    targetBlockIds?: string | string[] | null;
    referenceBlockId?: string | null;
    content?: string | string[];
  }
): BlockSafetyResult & {
  operationPlan?: {
    resolvedTargets: string[];
    resolvedReference?: string;
    safetyChecksPass: boolean;
    operationScope: 'single' | 'batch' | 'insertion';
  }
} => {
  const { type, targetBlockIds, referenceBlockId, content } = operation;

  // Handle insertion operations (add, createChecklist)
  if (type === 'add' || type === 'createChecklist') {
    const referenceResolution = resolveTargetBlocks(editor, referenceBlockId, {
      allowFallback: true,
      maxTargetCount: 1,
      preferCursorPosition: true
    });

    if (!referenceResolution.isValid) {
      return referenceResolution;
    }

    // Validate content safety for insertions
    if (content) {
      const contentArray = Array.isArray(content) ? content : [content];
      for (const item of contentArray) {
        if (typeof item === 'string' && item.length > 10000) {
          return {
            isValid: false,
            errorMessage: 'Content is too large for safe insertion (>10,000 characters)'
          };
        }
      }
    }

         return {
       ...referenceResolution,
       operationPlan: {
         resolvedTargets: [],
         resolvedReference: referenceResolution.resolvedTargets?.[0],
         safetyChecksPass: true,
         operationScope: 'insertion'
       }
     };
  }

  // Handle modification/deletion operations
  if (!targetBlockIds) {
    return {
      isValid: false,
      errorMessage: `${type} operation requires target block IDs`
    };
  }

  const targetResolution = resolveTargetBlocks(editor, targetBlockIds, {
    allowFallback: false,
    maxTargetCount: type === 'modifyTable' ? 1 : 50
  });

  if (!targetResolution.isValid) {
    return targetResolution;
  }

  const resolvedTargets = targetResolution.resolvedTargets || [];

  // Verify operation safety
  const safetyCheck = verifyBlockOperationSafety(
    editor,
    resolvedTargets,
    type === 'delete' ? 'delete' : 'modify',
    {
      preventDocumentWipe: true,
      requireContent: type === 'modify',
      allowedBlockTypes: type === 'modifyTable' ? ['table'] : undefined
    }
  );

  if (!safetyCheck.isValid) {
    return safetyCheck;
  }

  return {
    isValid: true,
    warnings: [...(targetResolution.warnings || []), ...(safetyCheck.warnings || [])],
    affectedBlockCount: resolvedTargets.length,
    operationPlan: {
      resolvedTargets,
      safetyChecksPass: true,
      operationScope: resolvedTargets.length === 1 ? 'single' : 'batch'
    }
  };
};

/**
 * Enhanced error reporting for failed operations
 */
export const generateSafetyErrorReport = (
  operation: string,
  safety: BlockSafetyResult,
  originalArgs: any
): string => {
  let report = `[${operation}] Safety check failed: ${safety.errorMessage || 'Unknown error'}`;

  if (safety.suggestedFallback) {
    report += `\nSuggested action: ${safety.suggestedFallback}`;
  }

  if (safety.affectedBlockCount !== undefined) {
    report += `\nWould have affected ${safety.affectedBlockCount} blocks`;
  }

  report += `\nOriginal arguments: ${JSON.stringify(originalArgs, null, 2)}`;

  return report;
}; 