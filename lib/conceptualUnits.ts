// Conceptual unit awareness utilities for maintaining integrity of document structures
import { Block, PartialBlock, BlockNoteEditor } from '@blocknote/core';
import { getInlineContentText } from '@/lib/editorUtils';

/**
 * Represents a conceptual unit - a group of related blocks that form a logical entity
 */
export interface ConceptualUnit {
  /** Unique identifier for this conceptual unit */
  unitId: string;
  /** Type of conceptual unit */
  type: 'list' | 'checklist' | 'nested-list' | 'table' | 'single-block';
  /** IDs of all blocks that belong to this unit */
  blockIds: string[];
  /** Root block ID (first block in the unit) */
  rootBlockId: string;
  /** Starting level (for hierarchical units) */
  startLevel: number;
  /** Ending level (for hierarchical units) */
  endLevel: number;
  /** Whether this unit has nested children */
  hasNestedChildren: boolean;
  /** Metadata about the unit structure */
  metadata: {
    /** For lists: bullet type ('*', '-', '+') or numbered */
    listType?: 'bullet' | 'numbered' | 'mixed';
    /** For checklists: completion status */
    completionStatus?: { total: number; completed: number };
    /** For tables: dimensions */
    tableDimensions?: { rows: number; cols: number };
    /** Nesting pattern for complex structures */
    nestingPattern?: Array<{ level: number; blockId: string; parentId: string | null }>;
  };
}

/**
 * Result of conceptual unit analysis
 */
export interface ConceptualUnitAnalysisResult {
  /** All identified conceptual units */
  units: ConceptualUnit[];
  /** Blocks that don't belong to any unit */
  standaloneBlocks: string[];
  /** Hierarchical relationships between units */
  unitRelationships: Array<{ parentUnitId: string; childUnitId: string }>;
  /** Warnings about potential structural issues */
  warnings: string[];
}

/**
 * Configuration for conceptual unit detection
 */
export interface ConceptualUnitConfig {
  /** Minimum number of blocks to form a list unit */
  minListSize: number;
  /** Maximum level depth to consider for nesting */
  maxNestingDepth: number;
  /** Whether to detect mixed list types as single units */
  allowMixedListTypes: boolean;
  /** Whether to include single-block items as units */
  includeSingleBlocks: boolean;
}

const defaultConceptualUnitConfig: ConceptualUnitConfig = {
  minListSize: 2,
  maxNestingDepth: 10,
  allowMixedListTypes: false,
  includeSingleBlocks: false
};

/**
 * Analyzes the document structure to identify conceptual units
 * This follows the same pattern as processBlocksRecursive used for AI serialization
 */
export const analyzeConceptualUnits = async (
  editor: BlockNoteEditor<any>,
  config: ConceptualUnitConfig = defaultConceptualUnitConfig
): Promise<ConceptualUnitAnalysisResult> => {
  const document = editor.document;
  const units: ConceptualUnit[] = [];
  const standaloneBlocks: string[] = [];
  const unitRelationships: Array<{ parentUnitId: string; childUnitId: string }> = [];
  const warnings: string[] = [];

  // Process blocks recursively, maintaining hierarchy information like the AI serialization
  const processedBlocks = await processBlocksForConceptualAnalysis(document, 0, null, editor);
  
  // Group consecutive blocks of similar types into conceptual units
  let currentGroup: Array<{ block: ProcessedBlockForAnalysis; index: number }> = [];
  let currentType: string | null = null;
  let currentLevel: number | null = null;
  let unitCounter = 0;

  for (let i = 0; i < processedBlocks.length; i++) {
    const block = processedBlocks[i];
    
    // Determine if this block should start a new conceptual unit
    const shouldStartNewUnit = 
      currentType !== block.type ||
      (currentLevel !== null && block.level < currentLevel) ||
      (block.type === 'paragraph' && currentType !== 'paragraph') ||
      (block.type === 'table'); // Tables are always separate units

    if (shouldStartNewUnit && currentGroup.length > 0) {
      // Process the current group into a conceptual unit
      const unit = createConceptualUnitFromGroup(currentGroup, unitCounter++, config);
      if (unit) {
        units.push(unit);
      } else {
        // Add individual blocks as standalone if they don't form a unit
        currentGroup.forEach(item => standaloneBlocks.push(item.block.id));
      }
      currentGroup = [];
    }

    // Start or continue the current group
    currentGroup.push({ block, index: i });
    currentType = block.type;
    currentLevel = block.level;

    // Handle special cases - tables are always individual units
    if (block.type === 'table') {
      const unit = createConceptualUnitFromGroup(currentGroup, unitCounter++, config);
      if (unit) {
        units.push(unit);
      }
      currentGroup = [];
      currentType = null;
      currentLevel = null;
    }
  }

  // Process any remaining group
  if (currentGroup.length > 0) {
    const unit = createConceptualUnitFromGroup(currentGroup, unitCounter++, config);
    if (unit) {
      units.push(unit);
    } else {
      currentGroup.forEach(item => standaloneBlocks.push(item.block.id));
    }
  }

  // Analyze relationships between units (for nested structures)
  analyzeUnitRelationships(units, unitRelationships, processedBlocks);

  return {
    units,
    standaloneBlocks,
    unitRelationships,
    warnings
  };
};

/**
 * Extended ProcessedBlock interface for conceptual analysis
 */
interface ProcessedBlockForAnalysis {
  id: string;
  type: string;
  contentSnippet: string;
  level: number;
  parentId: string | null;
  // Additional properties for conceptual analysis
  listLevel?: number;
  isChecked?: boolean;
  originalBlock: Block;
}

/**
 * Process blocks recursively for conceptual analysis
 * This mirrors the processBlocksRecursive function used for AI serialization
 */
const processBlocksForConceptualAnalysis = async (
  blocks: Block[],
  currentLevel: number,
  currentParentId: string | null,
  editor: BlockNoteEditor<any>
): Promise<ProcessedBlockForAnalysis[]> => {
  let processedBlocks: ProcessedBlockForAnalysis[] = [];

  for (const b of blocks) {
    let snippet = '';
    let isChecked = false;
    let listLevel = 0;

    // Process content based on block type (following existing pattern)
    if (b.type === 'table') {
      try {
        snippet = await editor.blocksToMarkdownLossy([b]);
      } catch (mdError) {
        console.error(`Failed to convert table block ${b.id} to Markdown:`, mdError);
        snippet = `[table - Error generating Markdown snippet]`;
      }
    } else if (b.type === 'checkListItem') {
      isChecked = b.props?.checked === true;
      const prefix = isChecked ? "[x] " : "[ ] ";
      const itemText = Array.isArray(b.content) ? getInlineContentText(b.content) : '';
      snippet = prefix + itemText;
    } else if (b.type === 'bulletListItem' || b.type === 'numberedListItem') {
      // Extract list level from props
      listLevel = parseInt((b.props as any)?.level as string) || 0;
      const itemText = Array.isArray(b.content) ? getInlineContentText(b.content) : '';
      snippet = itemText;
    } else {
      snippet = (Array.isArray(b.content) ? getInlineContentText(b.content) : '') || `[${b.type}]`;
    }

    processedBlocks.push({
      id: b.id,
      type: b.type,
      contentSnippet: snippet,
      level: currentLevel,
      parentId: currentParentId,
      listLevel,
      isChecked,
      originalBlock: b
    });

    // Recursively process children (following existing pattern)
    if (b.children && b.children.length > 0) {
      const childBlocks = await processBlocksForConceptualAnalysis(
        b.children,
        currentLevel + 1,
        b.id,
        editor
      );
      processedBlocks = processedBlocks.concat(childBlocks);
    }
  }

  return processedBlocks;
};

/**
 * Creates a conceptual unit from a group of related blocks
 */
const createConceptualUnitFromGroup = (
  group: Array<{ block: ProcessedBlockForAnalysis; index: number }>,
  unitId: number,
  config: ConceptualUnitConfig
): ConceptualUnit | null => {
  if (group.length === 0) return null;

  const firstBlock = group[0].block;
  const blockIds = group.map(item => item.block.id);
  const blocks = group.map(item => item.block);

  // Determine unit type
  let unitType: ConceptualUnit['type'] = 'single-block';
  let listType: 'bullet' | 'numbered' | 'mixed' | undefined;
  let completionStatus: { total: number; completed: number } | undefined;
  let tableDimensions: { rows: number; cols: number } | undefined;

  if (firstBlock.type === 'table') {
    unitType = 'table';
    // Extract table dimensions if possible
    tableDimensions = { rows: 1, cols: 1 }; // Placeholder - would need table content analysis
  } else if (firstBlock.type === 'checkListItem') {
    unitType = 'checklist';
    const completed = blocks.filter(b => b.isChecked).length;
    completionStatus = { total: blocks.length, completed };
  } else if (firstBlock.type === 'bulletListItem' || firstBlock.type === 'numberedListItem') {
    // Determine if it's a simple list or nested list
    const hasNesting = blocks.some(b => b.listLevel && b.listLevel > 0);
    unitType = hasNesting ? 'nested-list' : 'list';
    
    // Determine list type consistency
    const bulletItems = blocks.filter(b => b.type === 'bulletListItem').length;
    const numberedItems = blocks.filter(b => b.type === 'numberedListItem').length;
    
    if (bulletItems > 0 && numberedItems > 0) {
      listType = 'mixed';
    } else if (bulletItems > 0) {
      listType = 'bullet';
    } else {
      listType = 'numbered';
    }
  } else if (group.length >= config.minListSize && blocks.every(b => b.type === firstBlock.type)) {
    // Group of similar blocks (like multiple paragraphs)
    unitType = 'list';
  } else if (group.length === 1 && config.includeSingleBlocks) {
    unitType = 'single-block';
  } else if (group.length < config.minListSize) {
    // Group too small to be considered a unit
    return null;
  }

  // Calculate nesting pattern for complex structures
  const nestingPattern = blocks.map(block => ({
    level: block.level,
    blockId: block.id,
    parentId: block.parentId
  }));

  // Calculate levels
  const levels = blocks.map(b => b.level);
  const startLevel = Math.min(...levels);
  const endLevel = Math.max(...levels);
  const hasNestedChildren = endLevel > startLevel;

  return {
    unitId: `unit-${unitId}`,
    type: unitType,
    blockIds,
    rootBlockId: firstBlock.id,
    startLevel,
    endLevel,
    hasNestedChildren,
    metadata: {
      listType,
      completionStatus,
      tableDimensions,
      nestingPattern
    }
  };
};

/**
 * Analyzes relationships between conceptual units
 */
const analyzeUnitRelationships = (
  units: ConceptualUnit[],
  relationships: Array<{ parentUnitId: string; childUnitId: string }>,
  processedBlocks: ProcessedBlockForAnalysis[]
): void => {
  // For now, implement basic parent-child detection based on block hierarchy
  // This could be expanded to detect more complex relationships
  
  for (let i = 0; i < units.length - 1; i++) {
    const currentUnit = units[i];
    const nextUnit = units[i + 1];
    
    // If the next unit starts at a higher level than the current unit ends,
    // it might be a child relationship
    if (nextUnit.startLevel > currentUnit.endLevel) {
      relationships.push({
        parentUnitId: currentUnit.unitId,
        childUnitId: nextUnit.unitId
      });
    }
  }
};

/**
 * Finds the conceptual unit that contains a specific block ID
 */
export const findConceptualUnitForBlock = (
  blockId: string,
  analysisResult: ConceptualUnitAnalysisResult
): ConceptualUnit | null => {
  return analysisResult.units.find(unit => unit.blockIds.includes(blockId)) || null;
};

/**
 * Gets all blocks that belong to the same conceptual unit as the given block
 */
export const getConceptualUnitBlocks = (
  blockId: string,
  analysisResult: ConceptualUnitAnalysisResult
): string[] => {
  const unit = findConceptualUnitForBlock(blockId, analysisResult);
  return unit ? unit.blockIds : [blockId];
};

/**
 * Validates that an operation maintains conceptual unit integrity
 */
export const validateConceptualUnitIntegrity = (
  targetBlockIds: string[],
  operation: 'modify' | 'delete' | 'move',
  analysisResult: ConceptualUnitAnalysisResult
): {
  isValid: boolean;
  warnings: string[];
  affectedUnits: ConceptualUnit[];
  suggestedAction?: string;
} => {
  const warnings: string[] = [];
  const affectedUnits: ConceptualUnit[] = [];
  
  // Find all units affected by the target blocks
  const uniqueUnits = new Set<string>();
  for (const blockId of targetBlockIds) {
    const unit = findConceptualUnitForBlock(blockId, analysisResult);
    if (unit && !uniqueUnits.has(unit.unitId)) {
      uniqueUnits.add(unit.unitId);
      affectedUnits.push(unit);
    }
  }

  // Check for partial unit operations (affecting only some blocks in a unit)
  for (const unit of affectedUnits) {
    const targetBlocksInUnit = targetBlockIds.filter(id => unit.blockIds.includes(id));
    const isPartialOperation = targetBlocksInUnit.length < unit.blockIds.length;
    
    if (isPartialOperation) {
      if (operation === 'delete') {
        warnings.push(
          `Deleting ${targetBlocksInUnit.length} out of ${unit.blockIds.length} blocks in ${unit.type} unit "${unit.unitId}" - this may break the conceptual structure`
        );
      } else if (operation === 'modify') {
        warnings.push(
          `Modifying ${targetBlocksInUnit.length} out of ${unit.blockIds.length} blocks in ${unit.type} unit "${unit.unitId}" - ensure consistency is maintained`
        );
      }
    }
  }

  // Special validation for different unit types
  for (const unit of affectedUnits) {
    if (unit.type === 'checklist' && operation === 'modify') {
      warnings.push(`Modifying checklist unit "${unit.unitId}" - ensure checklist format is preserved`);
    } else if (unit.type === 'nested-list' && operation === 'delete') {
      warnings.push(`Deleting from nested list unit "${unit.unitId}" - this may affect the hierarchical structure`);
    } else if (unit.type === 'table' && operation !== 'modify') {
      warnings.push(`Performing ${operation} on table unit "${unit.unitId}" - tables should typically be modified rather than deleted or moved`);
    }
  }

  const isValid = warnings.length === 0 || warnings.every(w => !w.includes('may break'));
  
  return {
    isValid,
    warnings,
    affectedUnits,
    suggestedAction: !isValid ? 'Consider operating on complete conceptual units rather than partial blocks' : undefined
  };
};

/**
 * Gets the complete conceptual unit(s) that should be included in an operation
 * to maintain structural integrity
 */
export const expandSelectionToCompleteUnits = (
  targetBlockIds: string[],
  analysisResult: ConceptualUnitAnalysisResult,
  options: {
    /** Whether to include related units (e.g., child units) */
    includeRelatedUnits?: boolean;
    /** Whether to warn about the expansion */
    warnOnExpansion?: boolean;
  } = {}
): {
  expandedBlockIds: string[];
  addedBlockIds: string[];
  unitsIncluded: ConceptualUnit[];
  expansionWarnings: string[];
} => {
  const expandedSet = new Set(targetBlockIds);
  const addedBlockIds: string[] = [];
  const unitsIncluded: ConceptualUnit[] = [];
  const expansionWarnings: string[] = [];

  // Find all affected units and include their complete block sets
  for (const blockId of targetBlockIds) {
    const unit = findConceptualUnitForBlock(blockId, analysisResult);
    if (unit) {
      let wasExpanded = false;
      for (const unitBlockId of unit.blockIds) {
        if (!expandedSet.has(unitBlockId)) {
          expandedSet.add(unitBlockId);
          addedBlockIds.push(unitBlockId);
          wasExpanded = true;
        }
      }
      
      if (wasExpanded && options.warnOnExpansion) {
        expansionWarnings.push(
          `Expanded selection to include complete ${unit.type} unit (${unit.blockIds.length} blocks total)`
        );
      }
      
      if (!unitsIncluded.find(u => u.unitId === unit.unitId)) {
        unitsIncluded.push(unit);
      }
    }
  }

  // Optionally include related units
  if (options.includeRelatedUnits) {
    for (const unit of unitsIncluded) {
      // Find child units
      const childRelations = analysisResult.unitRelationships.filter(r => r.parentUnitId === unit.unitId);
      for (const relation of childRelations) {
        const childUnit = analysisResult.units.find(u => u.unitId === relation.childUnitId);
        if (childUnit) {
          let wasExpanded = false;
          for (const childBlockId of childUnit.blockIds) {
            if (!expandedSet.has(childBlockId)) {
              expandedSet.add(childBlockId);
              addedBlockIds.push(childBlockId);
              wasExpanded = true;
            }
          }
          
          if (wasExpanded && options.warnOnExpansion) {
            expansionWarnings.push(`Included related child unit: ${childUnit.type}`);
          }
          
          if (!unitsIncluded.find(u => u.unitId === childUnit.unitId)) {
            unitsIncluded.push(childUnit);
          }
        }
      }
    }
  }

  return {
    expandedBlockIds: Array.from(expandedSet),
    addedBlockIds,
    unitsIncluded,
    expansionWarnings
  };
}; 