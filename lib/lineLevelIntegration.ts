// Integration utilities connecting line-level targeting with existing tool functions
import { BlockNoteEditor } from '@blocknote/core';
import { 
  LineTarget,
  RelativePosition,
  findLinesByContent,
  findLineByPosition,
  findLineByRelativePosition,
  findOptimalInsertionPoint,
  targetPartialLineContent,
  getLineContext,
  analyzeDocumentLines
} from './lineLevelTargeting';
import { 
  analyzeConceptualUnits,
  expandSelectionToCompleteUnits,
  validateConceptualUnitIntegrity
} from './conceptualUnits';
import { createSafeOperationPlan } from './blockSafety';

/**
 * Enhanced line targeting that resolves natural language references to precise block IDs
 */
export interface LineTargetResolution {
  /** Resolved block IDs for the operation */
  blockIds: string[];
  /** Original line references provided */
  originalReferences: string[];
  /** Line targets that were found */
  resolvedLines: LineTarget[];
  /** Any lines that couldn't be resolved */
  unresolvedReferences: string[];
  /** Warnings about the resolution process */
  warnings: string[];
  /** Whether conceptual units were expanded */
  unitsExpanded: boolean;
}

/**
 * Enhanced content targeting for partial line modifications
 */
export interface PartialLineTargeting {
  /** Block ID containing the target content */
  blockId: string;
  /** Original content of the line */
  originalContent: string;
  /** Modified content after targeting */
  modifiedContent: string;
  /** Number of replacements made */
  replacementCount: number;
  /** Positions of the replacements */
  replacementPositions: Array<{ start: number; end: number }>;
  /** Warnings about the targeting operation */
  warnings: string[];
}

/**
 * Line-aware insertion targeting
 */
export interface LineInsertionTarget {
  /** Block ID for the insertion reference */
  referenceBlockId: string;
  /** Placement relative to the reference */
  placement: 'before' | 'after';
  /** Line context around the insertion point */
  lineContext: {
    referenceLine: LineTarget;
    beforeLines: LineTarget[];
    afterLines: LineTarget[];
  };
  /** Warnings about insertion placement */
  warnings: string[];
}

/**
 * Configuration for line-level tool integration
 */
export interface LineIntegrationConfig {
  /** Whether to automatically expand selections to complete conceptual units */
  autoExpandUnits: boolean;
  /** Whether to respect unit boundaries during relative positioning */
  respectUnitBoundaries: boolean;
  /** Context size for insertion point analysis */
  insertionContextSize: number;
  /** Maximum search results for content-based targeting */
  maxSearchResults: number;
  /** Whether to warn about partial unit operations */
  warnOnPartialUnits: boolean;
}

const defaultLineIntegrationConfig: LineIntegrationConfig = {
  autoExpandUnits: true,
  respectUnitBoundaries: true,
  insertionContextSize: 2,
  maxSearchResults: 10,
  warnOnPartialUnits: true
};

/**
 * Resolves natural language line references to precise block targeting
 */
export const resolveLineTargets = async (
  editor: BlockNoteEditor<any>,
  lineReferences: string[],
  config: LineIntegrationConfig = defaultLineIntegrationConfig
): Promise<LineTargetResolution> => {
  const blockIds: string[] = [];
  const resolvedLines: LineTarget[] = [];
  const unresolvedReferences: string[] = [];
  const warnings: string[] = [];

  // Try different resolution strategies for each reference
  for (const reference of lineReferences) {
    let resolved = false;

    // Strategy 1: Direct block ID reference
    if (reference.startsWith('block-') || reference.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
      try {
        const block = editor.getBlock(reference);
        if (block) {
          const documentAnalysis = await analyzeDocumentLines(editor);
          const lineNumber = documentAnalysis.lineMap.get(reference);
          if (lineNumber !== undefined) {
            const lineTarget = documentAnalysis.lines[lineNumber];
            blockIds.push(reference);
            resolvedLines.push(lineTarget);
            resolved = true;
          }
        }
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Strategy 2: Line number reference (e.g., "line 5", "5")
    if (!resolved) {
      const lineNumberMatch = reference.match(/(?:line\s+)?(\d+)/i);
      if (lineNumberMatch) {
        const lineNumber = parseInt(lineNumberMatch[1], 10) - 1; // Convert to 0-based
        const lineTarget = await findLineByPosition(editor, lineNumber);
        if (lineTarget) {
          blockIds.push(lineTarget.blockId);
          resolvedLines.push(lineTarget);
          resolved = true;
        }
      }
    }

    // Strategy 3: Content-based reference (search for text)
    if (!resolved && reference.length > 2) {
      const searchResult = await findLinesByContent(editor, reference, {
        includePartialMatches: true,
        maxResults: 1 // Take first match for single resolution
      });
      
      if (searchResult.matches.length > 0) {
        const lineTarget = searchResult.matches[0];
        blockIds.push(lineTarget.blockId);
        resolvedLines.push(lineTarget);
        resolved = true;
        
        if (searchResult.matches.length > 1) {
          warnings.push(`Multiple matches found for "${reference}", using first match`);
        }
      }
    }

    // Strategy 4: Relative position reference (e.g., "2 lines after block-123")
    if (!resolved) {
      const relativeMatch = reference.match(/(\d+)\s+lines?\s+(before|after)\s+(.+)/i);
      if (relativeMatch) {
        const offset = parseInt(relativeMatch[1], 10);
        const direction = relativeMatch[2].toLowerCase() as 'before' | 'after';
        const referenceTarget = relativeMatch[3];

        // First resolve the reference target
        const referenceResolution = await resolveLineTargets(editor, [referenceTarget], config);
        if (referenceResolution.blockIds.length > 0) {
          const relativePosition: RelativePosition = {
            referenceLineId: referenceResolution.blockIds[0],
            direction,
            offset,
            respectUnitBoundaries: config.respectUnitBoundaries
          };

          const result = await findLineByRelativePosition(editor, relativePosition);
          if (result.targetLineId && result.lineTarget) {
            blockIds.push(result.targetLineId);
            resolvedLines.push(result.lineTarget);
            resolved = true;
            warnings.push(...result.warnings);
          }
        }
      }
    }

    if (!resolved) {
      unresolvedReferences.push(reference);
    }
  }

  // Auto-expand to complete conceptual units if configured
  let unitsExpanded = false;
  if (config.autoExpandUnits && blockIds.length > 0) {
    const conceptualUnits = await analyzeConceptualUnits(editor);
    const expansion = expandSelectionToCompleteUnits(
      blockIds,
      conceptualUnits,
      { warnOnExpansion: config.warnOnPartialUnits }
    );

    if (expansion.addedBlockIds.length > 0) {
      unitsExpanded = true;
      blockIds.push(...expansion.addedBlockIds);
      warnings.push(...expansion.expansionWarnings);

      // Add line targets for expanded blocks
      const documentAnalysis = await analyzeDocumentLines(editor);
      for (const addedBlockId of expansion.addedBlockIds) {
        const lineNumber = documentAnalysis.lineMap.get(addedBlockId);
        if (lineNumber !== undefined) {
          resolvedLines.push(documentAnalysis.lines[lineNumber]);
        }
      }
    }
  }

  return {
    blockIds: [...new Set(blockIds)], // Remove duplicates
    originalReferences: lineReferences,
    resolvedLines,
    unresolvedReferences,
    warnings,
    unitsExpanded
  };
};

/**
 * Resolves optimal insertion point using line-level targeting
 */
export const resolveInsertionTarget = async (
  editor: BlockNoteEditor<any>,
  insertionReference?: string,
  config: LineIntegrationConfig = defaultLineIntegrationConfig
): Promise<LineInsertionTarget> => {
  let referenceBlockId: string;
  let placement: 'before' | 'after' = 'after';
  const warnings: string[] = [];

  if (!insertionReference) {
    // No reference - use end of document
    const optimalPoint = await findOptimalInsertionPoint(editor);
    referenceBlockId = optimalPoint.insertionBlockId;
    placement = optimalPoint.placement;
    warnings.push(...optimalPoint.warnings);
  } else {
    // Parse insertion reference
    const beforeMatch = insertionReference.match(/before\s+(.+)/i);
    const afterMatch = insertionReference.match(/after\s+(.+)/i);
    
    let targetReference = insertionReference;
    if (beforeMatch) {
      placement = 'before';
      targetReference = beforeMatch[1];
    } else if (afterMatch) {
      placement = 'after';
      targetReference = afterMatch[1];
    }

    // Resolve the target reference
    const resolution = await resolveLineTargets(editor, [targetReference], config);
    
    if (resolution.blockIds.length > 0) {
      referenceBlockId = resolution.blockIds[0];
      warnings.push(...resolution.warnings);

      if (resolution.blockIds.length > 1) {
        warnings.push(`Multiple targets resolved, using first: ${referenceBlockId}`);
      }
    } else {
      // Fallback to end of document
      const optimalPoint = await findOptimalInsertionPoint(editor);
      referenceBlockId = optimalPoint.insertionBlockId;
      placement = optimalPoint.placement;
      warnings.push(`Could not resolve "${insertionReference}", using document end`);
      warnings.push(...optimalPoint.warnings);
    }
  }

  // Get line context around the insertion point
  const lineContext = await getLineContext(editor, referenceBlockId, config.insertionContextSize);

  return {
    referenceBlockId,
    placement,
    lineContext: {
      referenceLine: lineContext.targetLine,
      beforeLines: lineContext.beforeLines,
      afterLines: lineContext.afterLines
    },
    warnings: [...warnings, ...lineContext.contextWarnings]
  };
};

/**
 * Performs partial line content targeting for surgical modifications
 */
export const performPartialLineTargeting = async (
  editor: BlockNoteEditor<any>,
  lineReference: string,
  targetText: string,
  newText: string,
  options: {
    replaceAll?: boolean;
    caseSensitive?: boolean;
    wordBoundary?: boolean;
  } = {}
): Promise<PartialLineTargeting> => {
  const resolution = await resolveLineTargets(editor, [lineReference]);
  
  if (resolution.blockIds.length === 0) {
    throw new Error(`Could not resolve line reference: ${lineReference}`);
  }

  if (resolution.blockIds.length > 1) {
    throw new Error(`Line reference resolved to multiple lines: ${lineReference}`);
  }

  const blockId = resolution.blockIds[0];
  const lineTarget = resolution.resolvedLines[0];
  const originalContent = lineTarget.content;

  const targeting = targetPartialLineContent(originalContent, targetText, newText, options);

  return {
    blockId,
    originalContent,
    modifiedContent: targeting.modifiedContent,
    replacementCount: targeting.replacementCount,
    replacementPositions: targeting.positions,
    warnings: resolution.warnings
  };
};

/**
 * Enhanced line-aware tool execution that validates operations
 */
export const validateLineAwareOperation = async (
  editor: BlockNoteEditor<any>,
  operation: 'add' | 'modify' | 'delete' | 'createChecklist',
  targetReferences: string[],
  config: LineIntegrationConfig = defaultLineIntegrationConfig
): Promise<{
  isValid: boolean;
  blockIds: string[];
  warnings: string[];
  errors: string[];
  operationPlan?: any;
}> => {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Resolve line targets
    const resolution = await resolveLineTargets(editor, targetReferences, config);
    
    if (resolution.unresolvedReferences.length > 0) {
      errors.push(`Could not resolve references: ${resolution.unresolvedReferences.join(', ')}`);
    }

    if (resolution.blockIds.length === 0) {
      errors.push('No valid targets found for operation');
      return { isValid: false, blockIds: [], warnings, errors };
    }

    warnings.push(...resolution.warnings);

    // Validate conceptual unit integrity
    const conceptualUnits = await analyzeConceptualUnits(editor);
    const unitValidation = validateConceptualUnitIntegrity(
      resolution.blockIds,
      operation === 'delete' ? 'delete' : operation === 'modify' ? 'modify' : 'move',
      conceptualUnits
    );

    if (!unitValidation.isValid) {
      errors.push(`Operation would break conceptual unit integrity: ${unitValidation.suggestedAction}`);
    }

    warnings.push(...unitValidation.warnings);

    // Create operation plan using existing safety mechanisms
    let operationPlan;
    try {
      operationPlan = createSafeOperationPlan(editor, {
        type: operation,
        content: '', // Will be filled by actual operation
        referenceBlockId: resolution.blockIds[0]
      });

      if (!operationPlan.isValid) {
        errors.push(`Safety validation failed: ${operationPlan.errorMessage}`);
      }
    } catch (error) {
      warnings.push(`Could not create safety plan: ${(error as Error).message}`);
    }

    return {
      isValid: errors.length === 0,
      blockIds: resolution.blockIds,
      warnings,
      errors,
      operationPlan
    };

  } catch (error) {
    errors.push(`Validation failed: ${(error as Error).message}`);
    return { isValid: false, blockIds: [], warnings, errors };
  }
};

/**
 * Gets enhanced context for AI operations with line-level awareness
 */
export const getLineAwareOperationContext = async (
  editor: BlockNoteEditor<any>,
  targetReferences: string[],
  contextSize: number = 3
): Promise<{
  targetLines: LineTarget[];
  contextLines: LineTarget[];
  operationSummary: string;
  structuralWarnings: string[];
}> => {
  const resolution = await resolveLineTargets(editor, targetReferences);
  const contextLines: LineTarget[] = [];
  const structuralWarnings: string[] = [];

  // Get context around each target line
  for (const lineTarget of resolution.resolvedLines) {
    const context = await getLineContext(editor, lineTarget.blockId, contextSize);
    contextLines.push(...context.beforeLines, context.targetLine, ...context.afterLines);
    structuralWarnings.push(...context.contextWarnings);
  }

  // Remove duplicates while preserving order
  const uniqueContextLines = contextLines.filter((line, index, array) => 
    array.findIndex(l => l.blockId === line.blockId) === index
  );

  // Create operation summary
  const lineCount = resolution.resolvedLines.length;
  const unitCount = new Set(resolution.resolvedLines.filter(l => l.isPartOfUnit).map(l => l.unitInfo?.unitId)).size;
  
  let operationSummary = `Targeting ${lineCount} line${lineCount === 1 ? '' : 's'}`;
  if (unitCount > 0) {
    operationSummary += ` across ${unitCount} conceptual unit${unitCount === 1 ? '' : 's'}`;
  }
  if (resolution.unitsExpanded) {
    operationSummary += ' (selection expanded to preserve unit integrity)';
  }

  return {
    targetLines: resolution.resolvedLines,
    contextLines: uniqueContextLines,
    operationSummary,
    structuralWarnings: [...resolution.warnings, ...structuralWarnings]
  };
}; 