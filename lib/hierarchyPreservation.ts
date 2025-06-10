// Hierarchy preservation mechanisms for maintaining parent-child relationships between blocks
import { Block, PartialBlock, BlockNoteEditor } from '@blocknote/core';
import { getInlineContentText } from '@/lib/editorUtils';
import { 
  ConceptualUnit, 
  ConceptualUnitAnalysisResult, 
  analyzeConceptualUnits,
  findConceptualUnitForBlock 
} from './conceptualUnits';

/**
 * Represents hierarchical information about a block
 */
export interface BlockHierarchyInfo {
  /** Block ID */
  blockId: string;
  /** Block type */
  blockType: string;
  /** Hierarchical level (0 = root) */
  level: number;
  /** Parent block ID (null for root level) */
  parentId: string | null;
  /** Child block IDs */
  childIds: string[];
  /** Sibling block IDs at the same level */
  siblingIds: string[];
  /** Path from root to this block */
  hierarchyPath: string[];
  /** Whether this block is part of a conceptual unit */
  isPartOfUnit: boolean;
  /** Unit ID if part of a conceptual unit */
  unitId?: string;
  /** Position within its conceptual unit (0-based) */
  unitPosition?: number;
}

/**
 * Complete hierarchy analysis of the document
 */
export interface DocumentHierarchyAnalysis {
  /** Hierarchy information for each block */
  blockHierarchy: Map<string, BlockHierarchyInfo>;
  /** Conceptual unit analysis */
  conceptualUnits: ConceptualUnitAnalysisResult;
  /** Root level blocks (no parent) */
  rootBlocks: string[];
  /** Maximum depth in the document */
  maxDepth: number;
  /** Hierarchical structure warnings */
  warnings: string[];
}

/**
 * Operation that preserves hierarchy information
 */
export interface HierarchyPreservedOperation {
  /** Original target block IDs */
  originalTargets: string[];
  /** Adjusted targets to preserve hierarchy */
  adjustedTargets: string[];
  /** Hierarchy preservation actions taken */
  preservationActions: Array<{
    action: 'include_children' | 'include_parent' | 'maintain_siblings' | 'preserve_unit';
    blockIds: string[];
    reason: string;
  }>;
  /** Warnings about hierarchy changes */
  warnings: string[];
  /** Whether the operation maintains document structure integrity */
  maintainsIntegrity: boolean;
}

/**
 * Configuration for hierarchy preservation
 */
export interface HierarchyPreservationConfig {
  /** Whether to automatically include child blocks when operating on parents */
  includeChildrenWithParents: boolean;
  /** Whether to maintain sibling relationships in lists */
  maintainSiblingRelationships: boolean;
  /** Whether to preserve conceptual unit boundaries */
  preserveConceptualUnits: boolean;
  /** Maximum depth to consider for hierarchy operations */
  maxDepthToConsider: number;
  /** Whether to warn when breaking hierarchy */
  warnOnHierarchyBreaks: boolean;
}

const defaultHierarchyConfig: HierarchyPreservationConfig = {
  includeChildrenWithParents: true,
  maintainSiblingRelationships: true,
  preserveConceptualUnits: true,
  maxDepthToConsider: 10,
  warnOnHierarchyBreaks: true
};

/**
 * Analyzes the complete hierarchical structure of the document
 * Following the same pattern as processBlocksRecursive used for AI serialization
 */
export const analyzeDocumentHierarchy = async (
  editor: BlockNoteEditor<any>
): Promise<DocumentHierarchyAnalysis> => {
  const document = editor.document;
  const blockHierarchy = new Map<string, BlockHierarchyInfo>();
  const rootBlocks: string[] = [];
  const warnings: string[] = [];
  let maxDepth = 0;

  // First, get conceptual unit analysis
  const conceptualUnits = await analyzeConceptualUnits(editor);

  // Process blocks recursively to build hierarchy information
  const processedBlocks = await processBlocksForHierarchy(document, 0, null, [], editor);

  // Build hierarchy map
  for (const block of processedBlocks) {
    const childIds = processedBlocks
      .filter(b => b.parentId === block.id)
      .map(b => b.id);

    const siblingIds = processedBlocks
      .filter(b => b.parentId === block.parentId && b.id !== block.id)
      .map(b => b.id);

    // Check if block is part of a conceptual unit
    const unit = findConceptualUnitForBlock(block.id, conceptualUnits);
    const unitPosition = unit ? unit.blockIds.indexOf(block.id) : undefined;

    blockHierarchy.set(block.id, {
      blockId: block.id,
      blockType: block.type,
      level: block.level,
      parentId: block.parentId,
      childIds,
      siblingIds,
      hierarchyPath: block.hierarchyPath,
      isPartOfUnit: !!unit,
      unitId: unit?.unitId,
      unitPosition
    });

    if (block.level === 0) {
      rootBlocks.push(block.id);
    }

    maxDepth = Math.max(maxDepth, block.level);
  }

  return {
    blockHierarchy,
    conceptualUnits,
    rootBlocks,
    maxDepth,
    warnings
  };
};

/**
 * Extended ProcessedBlock interface for hierarchy analysis
 */
interface ProcessedBlockForHierarchy {
  id: string;
  type: string;
  contentSnippet: string;
  level: number;
  parentId: string | null;
  hierarchyPath: string[];
  originalBlock: Block;
}

/**
 * Process blocks recursively for hierarchy analysis
 * This mirrors the processBlocksRecursive function used for AI serialization
 */
const processBlocksForHierarchy = async (
  blocks: Block[],
  currentLevel: number,
  currentParentId: string | null,
  hierarchyPath: string[],
  editor: BlockNoteEditor<any>
): Promise<ProcessedBlockForHierarchy[]> => {
  let processedBlocks: ProcessedBlockForHierarchy[] = [];

  for (const b of blocks) {
    let snippet = '';

    // Process content based on block type (following existing pattern)
    if (b.type === 'table') {
      try {
        snippet = await editor.blocksToMarkdownLossy([b]);
      } catch (mdError) {
        console.error(`Failed to convert table block ${b.id} to Markdown:`, mdError);
        snippet = `[table - Error generating Markdown snippet]`;
      }
    } else if (b.type === 'checkListItem') {
      const isChecked = b.props?.checked === true;
      const prefix = isChecked ? "[x] " : "[ ] ";
      const itemText = Array.isArray(b.content) ? getInlineContentText(b.content) : '';
      snippet = prefix + itemText;
    } else {
      snippet = (Array.isArray(b.content) ? getInlineContentText(b.content) : '') || `[${b.type}]`;
    }

    const blockPath = [...hierarchyPath, b.id];

    processedBlocks.push({
      id: b.id,
      type: b.type,
      contentSnippet: snippet,
      level: currentLevel,
      parentId: currentParentId,
      hierarchyPath: blockPath,
      originalBlock: b
    });

    // Recursively process children (following existing pattern)
    if (b.children && b.children.length > 0) {
      const childBlocks = await processBlocksForHierarchy(
        b.children,
        currentLevel + 1,
        b.id,
        blockPath,
        editor
      );
      processedBlocks = processedBlocks.concat(childBlocks);
    }
  }

  return processedBlocks;
};

/**
 * Creates a hierarchy-preserving operation plan
 */
export const createHierarchyPreservedOperation = (
  targetBlockIds: string[],
  operation: 'modify' | 'delete' | 'move',
  hierarchyAnalysis: DocumentHierarchyAnalysis,
  config: HierarchyPreservationConfig = defaultHierarchyConfig
): HierarchyPreservedOperation => {
  const adjustedTargets = new Set(targetBlockIds);
  const preservationActions: HierarchyPreservedOperation['preservationActions'] = [];
  const warnings: string[] = [];

  // Check each target block for hierarchy implications
  for (const targetId of targetBlockIds) {
    const hierarchyInfo = hierarchyAnalysis.blockHierarchy.get(targetId);
    if (!hierarchyInfo) {
      warnings.push(`Block ${targetId} not found in hierarchy analysis`);
      continue;
    }

    // Include children if configured and operation affects parent
    if (config.includeChildrenWithParents && hierarchyInfo.childIds.length > 0) {
      if (operation === 'delete' || operation === 'move') {
        const childrenToInclude = hierarchyInfo.childIds.filter(id => !adjustedTargets.has(id));
        if (childrenToInclude.length > 0) {
          childrenToInclude.forEach(id => adjustedTargets.add(id));
          preservationActions.push({
            action: 'include_children',
            blockIds: childrenToInclude,
            reason: `Including ${childrenToInclude.length} child blocks to maintain hierarchy when ${operation}ing parent`
          });
        }
      }
    }

    // Handle conceptual unit preservation
    if (config.preserveConceptualUnits && hierarchyInfo.isPartOfUnit) {
      const unit = hierarchyAnalysis.conceptualUnits.units.find(u => u.unitId === hierarchyInfo.unitId);
      if (unit) {
        const missingUnitBlocks = unit.blockIds.filter(id => !adjustedTargets.has(id));
        if (missingUnitBlocks.length > 0) {
          missingUnitBlocks.forEach(id => adjustedTargets.add(id));
          preservationActions.push({
            action: 'preserve_unit',
            blockIds: missingUnitBlocks,
            reason: `Including ${missingUnitBlocks.length} blocks to preserve ${unit.type} conceptual unit integrity`
          });
        }
      }
    }

    // Handle sibling relationships for list items
    if (config.maintainSiblingRelationships && 
        (hierarchyInfo.blockType.includes('ListItem') || hierarchyInfo.blockType === 'checkListItem')) {
      
      // For delete operations, warn about breaking list continuity
      if (operation === 'delete' && hierarchyInfo.siblingIds.length > 0) {
        const remainingSiblings = hierarchyInfo.siblingIds.filter(id => !targetBlockIds.includes(id));
        if (remainingSiblings.length > 0 && targetBlockIds.length < hierarchyInfo.siblingIds.length + 1) {
          warnings.push(
            `Deleting item from list may break continuity. Consider deleting the entire list or maintaining list structure.`
          );
        }
      }
    }
  }

  // Check for hierarchy breaks
  const maintainsIntegrity = validateHierarchyIntegrity(
    Array.from(adjustedTargets),
    operation,
    hierarchyAnalysis,
    warnings
  );

  return {
    originalTargets: targetBlockIds,
    adjustedTargets: Array.from(adjustedTargets),
    preservationActions,
    warnings,
    maintainsIntegrity
  };
};

/**
 * Validates that an operation maintains hierarchy integrity
 */
const validateHierarchyIntegrity = (
  targetBlockIds: string[],
  operation: 'modify' | 'delete' | 'move',
  hierarchyAnalysis: DocumentHierarchyAnalysis,
  warnings: string[]
): boolean => {
  let maintainsIntegrity = true;

  // Check for orphaned children
  for (const targetId of targetBlockIds) {
    const hierarchyInfo = hierarchyAnalysis.blockHierarchy.get(targetId);
    if (!hierarchyInfo) continue;

    if (operation === 'delete' && hierarchyInfo.childIds.length > 0) {
      const orphanedChildren = hierarchyInfo.childIds.filter(childId => !targetBlockIds.includes(childId));
      if (orphanedChildren.length > 0) {
        warnings.push(
          `Deleting block ${targetId} would orphan ${orphanedChildren.length} child blocks. Consider including children in the operation.`
        );
        maintainsIntegrity = false;
      }
    }
  }

  // Check for breaking conceptual units
  const affectedUnits = new Set<string>();
  for (const targetId of targetBlockIds) {
    const hierarchyInfo = hierarchyAnalysis.blockHierarchy.get(targetId);
    if (hierarchyInfo?.isPartOfUnit && hierarchyInfo.unitId) {
      affectedUnits.add(hierarchyInfo.unitId);
    }
  }

  for (const unitId of affectedUnits) {
    const unit = hierarchyAnalysis.conceptualUnits.units.find(u => u.unitId === unitId);
    if (unit) {
      const targetedBlocksInUnit = targetBlockIds.filter(id => unit.blockIds.includes(id));
      const isPartialOperation = targetedBlocksInUnit.length < unit.blockIds.length;
      
      if (isPartialOperation && operation === 'delete') {
        warnings.push(
          `Partially deleting ${unit.type} unit may break its conceptual integrity. Consider operating on the complete unit.`
        );
        maintainsIntegrity = false;
      }
    }
  }

  return maintainsIntegrity;
};

/**
 * Gets safe insertion point that preserves hierarchy
 */
export const getSafeInsertionPoint = (
  referenceBlockId: string | null,
  hierarchyAnalysis: DocumentHierarchyAnalysis,
  placement: 'before' | 'after' = 'after'
): {
  safeReferenceId: string;
  safePlacement: 'before' | 'after';
  hierarchyWarnings: string[];
} => {
  const warnings: string[] = [];

  if (!referenceBlockId) {
    // No reference - use document end
    const lastRootBlock = hierarchyAnalysis.rootBlocks[hierarchyAnalysis.rootBlocks.length - 1];
    return {
      safeReferenceId: lastRootBlock || '',
      safePlacement: 'after',
      hierarchyWarnings: lastRootBlock ? [] : ['Document is empty, insertion point may not be valid']
    };
  }

  const hierarchyInfo = hierarchyAnalysis.blockHierarchy.get(referenceBlockId);
  if (!hierarchyInfo) {
    warnings.push(`Reference block ${referenceBlockId} not found in hierarchy`);
    return {
      safeReferenceId: referenceBlockId,
      safePlacement: placement,
      hierarchyWarnings: warnings
    };
  }

  // If reference is part of a conceptual unit, consider unit boundaries
  if (hierarchyInfo.isPartOfUnit) {
    const unit = hierarchyAnalysis.conceptualUnits.units.find(u => u.unitId === hierarchyInfo.unitId);
    if (unit) {
      const isFirstInUnit = unit.blockIds[0] === referenceBlockId;
      const isLastInUnit = unit.blockIds[unit.blockIds.length - 1] === referenceBlockId;

      if (placement === 'before' && !isFirstInUnit) {
        warnings.push(`Inserting before middle of ${unit.type} unit may break its structure`);
      } else if (placement === 'after' && !isLastInUnit) {
        warnings.push(`Inserting after middle of ${unit.type} unit may break its structure`);
      }

      // For list items, suggest inserting at unit boundaries
      if (unit.type === 'list' || unit.type === 'checklist' || unit.type === 'nested-list') {
        if (placement === 'before' && !isFirstInUnit) {
          const firstBlockId = unit.blockIds[0];
          return {
            safeReferenceId: firstBlockId,
            safePlacement: 'before',
            hierarchyWarnings: [`Adjusted insertion to before start of ${unit.type} unit to preserve structure`]
          };
        } else if (placement === 'after' && !isLastInUnit) {
          const lastBlockId = unit.blockIds[unit.blockIds.length - 1];
          return {
            safeReferenceId: lastBlockId,
            safePlacement: 'after',
            hierarchyWarnings: [`Adjusted insertion to after end of ${unit.type} unit to preserve structure`]
          };
        }
      }
    }
  }

  return {
    safeReferenceId: referenceBlockId,
    safePlacement: placement,
    hierarchyWarnings: warnings
  };
};

/**
 * Validates that a move operation preserves hierarchy structure
 */
export const validateMoveOperation = (
  sourceBlockIds: string[],
  targetPosition: { referenceBlockId: string; placement: 'before' | 'after' },
  hierarchyAnalysis: DocumentHierarchyAnalysis
): {
  isValid: boolean;
  warnings: string[];
  suggestedAlternatives?: Array<{
    referenceBlockId: string;
    placement: 'before' | 'after';
    reason: string;
  }>;
} => {
  const warnings: string[] = [];
  const suggestedAlternatives: Array<{
    referenceBlockId: string;
    placement: 'before' | 'after';
    reason: string;
  }> = [];

  // Check if any source blocks are ancestors of the target
  const targetHierarchy = hierarchyAnalysis.blockHierarchy.get(targetPosition.referenceBlockId);
  if (targetHierarchy) {
    for (const sourceId of sourceBlockIds) {
      if (targetHierarchy.hierarchyPath.includes(sourceId)) {
        warnings.push(`Cannot move block ${sourceId} to a position inside itself (would create circular hierarchy)`);
        return { isValid: false, warnings };
      }
    }
  }

  // Check conceptual unit implications
  for (const sourceId of sourceBlockIds) {
    const sourceHierarchy = hierarchyAnalysis.blockHierarchy.get(sourceId);
    if (sourceHierarchy?.isPartOfUnit) {
      const unit = hierarchyAnalysis.conceptualUnits.units.find(u => u.unitId === sourceHierarchy.unitId);
      if (unit && sourceBlockIds.length < unit.blockIds.length) {
        warnings.push(
          `Moving block ${sourceId} would break ${unit.type} unit. Consider moving the complete unit.`
        );
        
        // Suggest moving the complete unit
        const unitFirstBlock = unit.blockIds[0];
        const unitLastBlock = unit.blockIds[unit.blockIds.length - 1];
        suggestedAlternatives.push({
          referenceBlockId: targetPosition.referenceBlockId,
          placement: targetPosition.placement,
          reason: `Move complete ${unit.type} unit (blocks ${unitFirstBlock} to ${unitLastBlock})`
        });
      }
    }
  }

  const isValid = warnings.length === 0 || warnings.every(w => !w.includes('Cannot'));

  return {
    isValid,
    warnings,
    suggestedAlternatives: suggestedAlternatives.length > 0 ? suggestedAlternatives : undefined
  };
};

/**
 * Gets the hierarchical context for a block (useful for AI operations)
 */
export const getBlockHierarchicalContext = (
  blockId: string,
  hierarchyAnalysis: DocumentHierarchyAnalysis,
  includeDepth: number = 2
): {
  block: BlockHierarchyInfo;
  parents: BlockHierarchyInfo[];
  children: BlockHierarchyInfo[];
  siblings: BlockHierarchyInfo[];
  contextualDescription: string;
} => {
  const block = hierarchyAnalysis.blockHierarchy.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found in hierarchy analysis`);
  }

  const parents: BlockHierarchyInfo[] = [];
  const children: BlockHierarchyInfo[] = [];
  const siblings: BlockHierarchyInfo[] = [];

  // Get parents (up to includeDepth levels)
  let currentParentId = block.parentId;
  let depth = 0;
  while (currentParentId && depth < includeDepth) {
    const parentInfo = hierarchyAnalysis.blockHierarchy.get(currentParentId);
    if (parentInfo) {
      parents.unshift(parentInfo); // Add to beginning to maintain hierarchy order
      currentParentId = parentInfo.parentId;
    } else {
      break;
    }
    depth++;
  }

  // Get children (up to includeDepth levels deep)
  const getChildrenRecursive = (parentId: string, currentDepth: number) => {
    if (currentDepth >= includeDepth) return;
    
    const childIds = hierarchyAnalysis.blockHierarchy.get(parentId)?.childIds || [];
    for (const childId of childIds) {
      const childInfo = hierarchyAnalysis.blockHierarchy.get(childId);
      if (childInfo) {
        children.push(childInfo);
        getChildrenRecursive(childId, currentDepth + 1);
      }
    }
  };
  getChildrenRecursive(blockId, 0);

  // Get siblings
  for (const siblingId of block.siblingIds) {
    const siblingInfo = hierarchyAnalysis.blockHierarchy.get(siblingId);
    if (siblingInfo) {
      siblings.push(siblingInfo);
    }
  }

  // Create contextual description
  let description = `Block ${blockId} (${block.blockType}) at level ${block.level}`;
  if (block.isPartOfUnit) {
    description += `, part of ${block.unitId} unit`;
    if (block.unitPosition !== undefined) {
      description += ` (position ${block.unitPosition})`;
    }
  }
  if (parents.length > 0) {
    description += `, child of ${parents[parents.length - 1].blockId}`;
  }
  if (children.length > 0) {
    description += `, parent to ${children.length} blocks`;
  }
  if (siblings.length > 0) {
    description += `, ${siblings.length} siblings`;
  }

  return {
    block,
    parents,
    children,
    siblings,
    contextualDescription: description
  };
}; 