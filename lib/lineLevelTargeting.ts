// Line-level targeting precision utilities for surgical block operations
import { Block, PartialBlock, BlockNoteEditor } from '@blocknote/core';
import { getInlineContentText } from '@/lib/editorUtils';
import { 
  ConceptualUnit, 
  ConceptualUnitAnalysisResult, 
  analyzeConceptualUnits,
  findConceptualUnitForBlock 
} from './conceptualUnits';
import { 
  DocumentHierarchyAnalysis, 
  analyzeDocumentHierarchy,
  getBlockHierarchicalContext 
} from './hierarchyPreservation';

/**
 * Represents a line target with precise positioning information
 */
export interface LineTarget {
  /** Block ID that represents this line */
  blockId: string;
  /** Line number (0-based) in the document */
  lineNumber: number;
  /** Content of this line */
  content: string;
  /** Block type */
  blockType: string;
  /** Whether this line is empty */
  isEmpty: boolean;
  /** Hierarchical level */
  level: number;
  /** Parent line (block) ID */
  parentId: string | null;
  /** Whether this line is part of a conceptual unit */
  isPartOfUnit: boolean;
  /** Conceptual unit information if applicable */
  unitInfo?: {
    unitId: string;
    unitType: string;
    positionInUnit: number;
    totalInUnit: number;
  };
}

/**
 * Result of line-based search operations
 */
export interface LineSearchResult {
  /** Found lines matching the criteria */
  matches: LineTarget[];
  /** Total lines searched */
  totalLines: number;
  /** Search criteria used */
  searchCriteria: string;
  /** Whether the search was case sensitive */
  caseSensitive: boolean;
}

/**
 * Relative positioning specification
 */
export interface RelativePosition {
  /** Reference line (block) ID */
  referenceLineId: string;
  /** Direction relative to reference */
  direction: 'before' | 'after' | 'same';
  /** Number of lines offset from reference */
  offset: number;
  /** Whether to respect conceptual unit boundaries */
  respectUnitBoundaries?: boolean;
}

/**
 * Result of relative positioning calculation
 */
export interface RelativePositionResult {
  /** Target line ID found at the relative position */
  targetLineId: string | null;
  /** Actual offset achieved (may differ from requested if boundaries hit) */
  actualOffset: number;
  /** Line target information */
  lineTarget: LineTarget | null;
  /** Warnings about boundary constraints */
  warnings: string[];
}

/**
 * Configuration for line-level operations
 */
export interface LineLevelConfig {
  /** Whether to treat empty blocks as valid lines */
  includeEmptyLines: boolean;
  /** Whether to respect conceptual unit boundaries when navigating */
  respectUnitBoundaries: boolean;
  /** Whether to include blocks without text content (images, tables) */
  includeNonTextBlocks: boolean;
  /** Maximum search distance for relative positioning */
  maxSearchDistance: number;
}

const defaultLineLevelConfig: LineLevelConfig = {
  includeEmptyLines: true,
  respectUnitBoundaries: true,
  includeNonTextBlocks: true,
  maxSearchDistance: 100
};

/**
 * Analyzes the document as a series of lines for precise targeting
 */
export const analyzeDocumentLines = async (
  editor: BlockNoteEditor<any>,
  config: LineLevelConfig = defaultLineLevelConfig
): Promise<{
  lines: LineTarget[];
  conceptualUnits: ConceptualUnitAnalysisResult;
  hierarchy: DocumentHierarchyAnalysis;
  lineMap: Map<string, number>; // blockId -> lineNumber
}> => {
  // Get conceptual units and hierarchy analysis
  const [conceptualUnits, hierarchy] = await Promise.all([
    analyzeConceptualUnits(editor),
    analyzeDocumentHierarchy(editor)
  ]);

  const lines: LineTarget[] = [];
  const lineMap = new Map<string, number>();

  // Process document blocks in order to create line representation
  const processBlocksToLines = (blocks: Block[], level: number = 0, parentId: string | null = null) => {
    for (const block of blocks) {
      const content = Array.isArray(block.content) ? getInlineContentText(block.content) : '';
      const isEmpty = content.trim().length === 0;
      
      // Skip based on configuration
      if (!config.includeEmptyLines && isEmpty) {
        continue;
      }
      if (!config.includeNonTextBlocks && ['image', 'file', 'video', 'audio'].includes(block.type)) {
        continue;
      }

      // Find conceptual unit information
      const unit = findConceptualUnitForBlock(block.id, conceptualUnits);
      const unitInfo = unit ? {
        unitId: unit.unitId,
        unitType: unit.type,
        positionInUnit: unit.blockIds.indexOf(block.id),
        totalInUnit: unit.blockIds.length
      } : undefined;

      const lineNumber = lines.length;
      const lineTarget: LineTarget = {
        blockId: block.id,
        lineNumber,
        content,
        blockType: block.type,
        isEmpty,
        level,
        parentId,
        isPartOfUnit: !!unit,
        unitInfo
      };

      lines.push(lineTarget);
      lineMap.set(block.id, lineNumber);

      // Recursively process children
      if (block.children && block.children.length > 0) {
        processBlocksToLines(block.children, level + 1, block.id);
      }
    }
  };

  processBlocksToLines(editor.document);

  return {
    lines,
    conceptualUnits,
    hierarchy,
    lineMap
  };
};

/**
 * Finds lines by content with precise matching options
 */
export const findLinesByContent = async (
  editor: BlockNoteEditor<any>,
  searchText: string,
  options: {
    caseSensitive?: boolean;
    exactMatch?: boolean;
    includePartialMatches?: boolean;
    maxResults?: number;
  } = {}
): Promise<LineSearchResult> => {
  const {
    caseSensitive = false,
    exactMatch = false,
    includePartialMatches = true,
    maxResults = 50
  } = options;

  const documentAnalysis = await analyzeDocumentLines(editor);
  const matches: LineTarget[] = [];

  const searchCriteria = caseSensitive ? searchText : searchText.toLowerCase();

  for (const line of documentAnalysis.lines) {
    if (matches.length >= maxResults) break;

    const lineContent = caseSensitive ? line.content : line.content.toLowerCase();
    
    let isMatch = false;
    if (exactMatch) {
      isMatch = lineContent === searchCriteria;
    } else if (includePartialMatches) {
      isMatch = lineContent.includes(searchCriteria);
    } else {
      // Word boundary matching
      const regex = new RegExp(`\\b${searchCriteria.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? 'g' : 'gi');
      isMatch = regex.test(lineContent);
    }

    if (isMatch) {
      matches.push(line);
    }
  }

  return {
    matches,
    totalLines: documentAnalysis.lines.length,
    searchCriteria,
    caseSensitive
  };
};

/**
 * Finds a line by its position (line number)
 */
export const findLineByPosition = async (
  editor: BlockNoteEditor<any>,
  lineNumber: number
): Promise<LineTarget | null> => {
  const documentAnalysis = await analyzeDocumentLines(editor);
  
  if (lineNumber < 0 || lineNumber >= documentAnalysis.lines.length) {
    return null;
  }

  return documentAnalysis.lines[lineNumber];
};

/**
 * Finds lines using relative positioning from a reference
 */
export const findLineByRelativePosition = async (
  editor: BlockNoteEditor<any>,
  relativePosition: RelativePosition,
  config: LineLevelConfig = defaultLineLevelConfig
): Promise<RelativePositionResult> => {
  const documentAnalysis = await analyzeDocumentLines(editor, config);
  const warnings: string[] = [];

  // Find the reference line
  const referenceLineNumber = documentAnalysis.lineMap.get(relativePosition.referenceLineId);
  if (referenceLineNumber === undefined) {
    return {
      targetLineId: null,
      actualOffset: 0,
      lineTarget: null,
      warnings: [`Reference line ${relativePosition.referenceLineId} not found`]
    };
  }

  const referenceLine = documentAnalysis.lines[referenceLineNumber];
  
  // Calculate target position
  let targetLineNumber: number;
  switch (relativePosition.direction) {
    case 'same':
      targetLineNumber = referenceLineNumber;
      break;
    case 'before':
      targetLineNumber = referenceLineNumber - relativePosition.offset;
      break;
    case 'after':
      targetLineNumber = referenceLineNumber + relativePosition.offset;
      break;
  }

  // Handle conceptual unit boundary constraints
  if (relativePosition.respectUnitBoundaries && referenceLine.isPartOfUnit) {
    const unit = documentAnalysis.conceptualUnits.units.find(u => u.unitId === referenceLine.unitInfo?.unitId);
    if (unit) {
      const unitLineNumbers = unit.blockIds
        .map(blockId => documentAnalysis.lineMap.get(blockId))
        .filter(lineNum => lineNum !== undefined)
        .sort((a, b) => a! - b!);

      const minUnitLine = unitLineNumbers[0]!;
      const maxUnitLine = unitLineNumbers[unitLineNumbers.length - 1]!;

      if (targetLineNumber < minUnitLine) {
        warnings.push(`Target position would be outside conceptual unit boundary, clamped to unit start`);
        targetLineNumber = minUnitLine;
      } else if (targetLineNumber > maxUnitLine) {
        warnings.push(`Target position would be outside conceptual unit boundary, clamped to unit end`);
        targetLineNumber = maxUnitLine;
      }
    }
  }

  // Handle document boundary constraints
  if (targetLineNumber < 0) {
    warnings.push(`Target position would be before document start, clamped to line 0`);
    targetLineNumber = 0;
  } else if (targetLineNumber >= documentAnalysis.lines.length) {
    warnings.push(`Target position would be after document end, clamped to last line`);
    targetLineNumber = documentAnalysis.lines.length - 1;
  }

  // Handle search distance limits
  const actualOffset = Math.abs(targetLineNumber - referenceLineNumber);
  if (actualOffset > config.maxSearchDistance) {
    warnings.push(`Target position exceeds maximum search distance (${config.maxSearchDistance}), operation limited`);
    const clampedOffset = Math.min(actualOffset, config.maxSearchDistance);
    if (relativePosition.direction === 'before') {
      targetLineNumber = referenceLineNumber - clampedOffset;
    } else if (relativePosition.direction === 'after') {
      targetLineNumber = referenceLineNumber + clampedOffset;
    }
  }

  const targetLine = documentAnalysis.lines[targetLineNumber] || null;

  return {
    targetLineId: targetLine?.blockId || null,
    actualOffset: Math.abs(targetLineNumber - referenceLineNumber),
    lineTarget: targetLine,
    warnings
  };
};

/**
 * Gets lines within a range for batch operations
 */
export const getLinesInRange = async (
  editor: BlockNoteEditor<any>,
  startLineNumber: number,
  endLineNumber: number,
  config: LineLevelConfig = defaultLineLevelConfig
): Promise<{
  lines: LineTarget[];
  affectedUnits: ConceptualUnit[];
  warnings: string[];
}> => {
  const documentAnalysis = await analyzeDocumentLines(editor, config);
  const warnings: string[] = [];
  const affectedUnits: ConceptualUnit[] = [];
  const affectedUnitIds = new Set<string>();

  // Validate and clamp range
  const clampedStart = Math.max(0, Math.min(startLineNumber, documentAnalysis.lines.length - 1));
  const clampedEnd = Math.max(clampedStart, Math.min(endLineNumber, documentAnalysis.lines.length - 1));

  if (clampedStart !== startLineNumber || clampedEnd !== endLineNumber) {
    warnings.push(`Range clamped from [${startLineNumber}, ${endLineNumber}] to [${clampedStart}, ${clampedEnd}]`);
  }

  const lines = documentAnalysis.lines.slice(clampedStart, clampedEnd + 1);

  // Identify affected conceptual units
  for (const line of lines) {
    if (line.isPartOfUnit && line.unitInfo && !affectedUnitIds.has(line.unitInfo.unitId)) {
      affectedUnitIds.add(line.unitInfo.unitId);
      const unit = documentAnalysis.conceptualUnits.units.find(u => u.unitId === line.unitInfo!.unitId);
      if (unit) {
        affectedUnits.push(unit);

        // Check if we're only partially affecting the unit
        const unitLineNumbers = unit.blockIds
          .map(blockId => documentAnalysis.lineMap.get(blockId))
          .filter(lineNum => lineNum !== undefined)
          .sort((a, b) => a! - b!);

        const minUnitLine = unitLineNumbers[0]!;
        const maxUnitLine = unitLineNumbers[unitLineNumbers.length - 1]!;

        if (clampedStart > minUnitLine || clampedEnd < maxUnitLine) {
          warnings.push(
            `Range partially affects ${unit.type} unit "${unit.unitId}" - consider including complete unit (lines ${minUnitLine}-${maxUnitLine})`
          );
        }
      }
    }
  }

  return {
    lines,
    affectedUnits,
    warnings
  };
};

/**
 * Finds the optimal insertion point between two lines
 */
export const findOptimalInsertionPoint = async (
  editor: BlockNoteEditor<any>,
  beforeLineId?: string,
  afterLineId?: string
): Promise<{
  insertionBlockId: string;
  placement: 'before' | 'after';
  warnings: string[];
}> => {
  const documentAnalysis = await analyzeDocumentLines(editor);
  const warnings: string[] = [];

  // If both specified, validate they are adjacent or find midpoint
  if (beforeLineId && afterLineId) {
    const beforeLineNum = documentAnalysis.lineMap.get(beforeLineId);
    const afterLineNum = documentAnalysis.lineMap.get(afterLineId);

    if (beforeLineNum === undefined || afterLineNum === undefined) {
      warnings.push('One or both reference lines not found, using single reference');
      return findOptimalInsertionPoint(editor, beforeLineId || afterLineId);
    }

    if (Math.abs(beforeLineNum - afterLineNum) === 1) {
      // Adjacent lines - insert between them
      const insertAfter = Math.min(beforeLineNum, afterLineNum);
      const targetLine = documentAnalysis.lines[insertAfter];
      return {
        insertionBlockId: targetLine.blockId,
        placement: 'after',
        warnings
      };
    } else {
      warnings.push('Lines are not adjacent, using first reference');
      return findOptimalInsertionPoint(editor, beforeLineId);
    }
  }

  // Single reference point
  const referenceId = beforeLineId || afterLineId;
  if (!referenceId) {
    // No reference - use end of document
    const lastLine = documentAnalysis.lines[documentAnalysis.lines.length - 1];
    return {
      insertionBlockId: lastLine?.blockId || '',
      placement: 'after',
      warnings: documentAnalysis.lines.length === 0 ? ['Document is empty'] : []
    };
  }

  const referenceLine = documentAnalysis.lines.find(line => line.blockId === referenceId);
  if (!referenceLine) {
    warnings.push(`Reference line ${referenceId} not found`);
    const lastLine = documentAnalysis.lines[documentAnalysis.lines.length - 1];
    return {
      insertionBlockId: lastLine?.blockId || '',
      placement: 'after',
      warnings
    };
  }

  // Check if reference is part of a conceptual unit
  if (referenceLine.isPartOfUnit && referenceLine.unitInfo) {
    const unit = documentAnalysis.conceptualUnits.units.find(u => u.unitId === referenceLine.unitInfo!.unitId);
    if (unit) {
      const isFirstInUnit = referenceLine.unitInfo.positionInUnit === 0;
      const isLastInUnit = referenceLine.unitInfo.positionInUnit === referenceLine.unitInfo.totalInUnit - 1;

      if (beforeLineId) {
        // Want to insert before this line
        if (isFirstInUnit) {
          // Insert before unit
          return {
            insertionBlockId: referenceLine.blockId,
            placement: 'before',
            warnings
          };
        } else {
          warnings.push(`Inserting before middle of ${unit.type} unit may disrupt structure`);
          return {
            insertionBlockId: referenceLine.blockId,
            placement: 'before',
            warnings
          };
        }
      } else {
        // Want to insert after this line
        if (isLastInUnit) {
          // Insert after unit
          return {
            insertionBlockId: referenceLine.blockId,
            placement: 'after',
            warnings
          };
        } else {
          warnings.push(`Inserting after middle of ${unit.type} unit may disrupt structure`);
          return {
            insertionBlockId: referenceLine.blockId,
            placement: 'after',
            warnings
          };
        }
      }
    }
  }

  // Default placement
  return {
    insertionBlockId: referenceLine.blockId,
    placement: beforeLineId ? 'before' : 'after',
    warnings
  };
};

/**
 * Targets specific parts of a line while preserving the rest
 */
export const targetPartialLineContent = (
  lineContent: string,
  targetText: string,
  newText: string,
  options: {
    replaceAll?: boolean;
    caseSensitive?: boolean;
    wordBoundary?: boolean;
  } = {}
): {
  modifiedContent: string;
  replacementCount: number;
  positions: Array<{ start: number; end: number }>;
} => {
  const {
    replaceAll = false,
    caseSensitive = false,
    wordBoundary = false
  } = options;

  const positions: Array<{ start: number; end: number }> = [];
  let modifiedContent = lineContent;
  let replacementCount = 0;

  // Escape special regex characters in target text
  const escapedTarget = targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Build regex pattern
  let pattern = escapedTarget;
  if (wordBoundary) {
    pattern = `\\b${pattern}\\b`;
  }
  
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(pattern, replaceAll ? flags : flags.replace('g', ''));

  // Find all matches first to get positions
  let match;
  const allMatches = [];
  const searchRegex = new RegExp(pattern, 'gi'); // Always global for finding positions
  
  while ((match = searchRegex.exec(lineContent)) !== null) {
    allMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      matchText: match[0]
    });
    if (!replaceAll) break;
  }

  // Perform replacements (in reverse order to maintain position accuracy)
  for (let i = allMatches.length - 1; i >= 0; i--) {
    const matchInfo = allMatches[i];
    positions.unshift({ start: matchInfo.start, end: matchInfo.end });
    
    modifiedContent = 
      modifiedContent.substring(0, matchInfo.start) + 
      newText + 
      modifiedContent.substring(matchInfo.end);
    
    replacementCount++;
  }

  return {
    modifiedContent,
    replacementCount,
    positions
  };
};

/**
 * Gets surrounding context lines for a target line
 */
export const getLineContext = async (
  editor: BlockNoteEditor<any>,
  targetLineId: string,
  contextSize: number = 2
): Promise<{
  targetLine: LineTarget;
  beforeLines: LineTarget[];
  afterLines: LineTarget[];
  contextWarnings: string[];
}> => {
  const documentAnalysis = await analyzeDocumentLines(editor);
  const warnings: string[] = [];

  const targetLineNumber = documentAnalysis.lineMap.get(targetLineId);
  if (targetLineNumber === undefined) {
    throw new Error(`Target line ${targetLineId} not found`);
  }

  const targetLine = documentAnalysis.lines[targetLineNumber];
  
  // Get context lines
  const beforeStart = Math.max(0, targetLineNumber - contextSize);
  const afterEnd = Math.min(documentAnalysis.lines.length - 1, targetLineNumber + contextSize);

  const beforeLines = documentAnalysis.lines.slice(beforeStart, targetLineNumber);
  const afterLines = documentAnalysis.lines.slice(targetLineNumber + 1, afterEnd + 1);

  // Check if context was limited by document boundaries
  if (beforeStart > targetLineNumber - contextSize) {
    warnings.push(`Context truncated at document start (requested ${contextSize}, got ${targetLineNumber - beforeStart})`);
  }
  if (afterEnd < targetLineNumber + contextSize) {
    warnings.push(`Context truncated at document end (requested ${contextSize}, got ${afterEnd - targetLineNumber})`);
  }

  return {
    targetLine,
    beforeLines,
    afterLines,
    contextWarnings: warnings
  };
}; 