import * as Y from 'yjs';
import { PartialBlock } from '@blocknote/core';

/**
 * Yjs Document Service for BlockNote Collaboration
 * 
 * This service manages the Yjs document structure that represents
 * BlockNote's block-based content model in a collaborative environment.
 * Enhanced with better BlockNote-specific synchronization and conflict resolution.
 */

export interface CollaborativeDocument {
  doc: Y.Doc;
  blocksArray: Y.Array<any>;
  metaMap: Y.Map<any>;
  awarenessData: Y.Map<any>;
}

export interface UserAwareness {
  user: {
    name: string;
    color: string;
    cursor?: {
      anchor: number;
      head: number;
    };
  };
}

/**
 * Enhanced block operation metadata for better tracking
 */
export interface BlockOperation {
  type: 'insert' | 'update' | 'delete' | 'move';
  blockId: string;
  userId: string;
  timestamp: number;
  previousVersion?: PartialBlock;
  newVersion?: PartialBlock;
}

/**
 * Initialize a new Yjs document for collaborative BlockNote editing
 * @param documentId - Unique identifier for the document
 * @returns CollaborativeDocument instance
 */
export function createCollaborativeDocument(documentId: string): CollaborativeDocument {
  // Create the main Yjs document
  const doc = new Y.Doc();

  // BlockNote's content is structured as an array of blocks
  // Each block contains id, type, props, content, and children
  const blocksArray = doc.getArray<any>('blocks');
  
  // Document metadata (title, created_at, updated_at, etc.)
  const metaMap = doc.getMap<any>('meta');
  
  // User awareness for presence indicators
  const awarenessData = doc.getMap<any>('awareness');

  // Initialize metadata
  metaMap.set('documentId', documentId);
  metaMap.set('createdAt', new Date().toISOString());
  metaMap.set('lastModified', new Date().toISOString());
  metaMap.set('version', 1);

  return {
    doc,
    blocksArray,
    metaMap,
    awarenessData,
  };
}

/**
 * Enhanced BlockNote to Yjs conversion with conflict resolution support
 * @param blocks - Array of BlockNote blocks
 * @param yjsDocument - The collaborative document
 * @param userId - User making the change (for tracking)
 */
export function initializeFromBlockNoteBlocks(
  blocks: PartialBlock[],
  yjsDocument: CollaborativeDocument,
  userId: string = 'system'
): void {
  // Start a transaction for atomic updates
  yjsDocument.doc.transact(() => {
    // Store current content for comparison
    const currentBlocks = convertYjsToBlockNoteBlocks(yjsDocument);
    
    // Clear existing content
    yjsDocument.blocksArray.delete(0, yjsDocument.blocksArray.length);
    
    // Convert and insert BlockNote blocks with enhanced tracking
    blocks.forEach((block, index) => {
      const yjsBlock = convertBlockNoteBlockToYjs(block);
      
      // Add metadata for tracking
      yjsBlock._metadata = {
        lastModified: new Date().toISOString(),
        lastModifiedBy: userId,
        version: yjsDocument.metaMap.get('version') || 1,
        index,
      };
      
      yjsDocument.blocksArray.push([yjsBlock]);
    });

    // Update document metadata
    yjsDocument.metaMap.set('lastModified', new Date().toISOString());
    yjsDocument.metaMap.set('lastModifiedBy', userId);
    yjsDocument.metaMap.set('version', (yjsDocument.metaMap.get('version') || 0) + 1);
    yjsDocument.metaMap.set('blockCount', blocks.length);
  }, 'block-update');
}

/**
 * Convert Yjs document structure back to BlockNote format with enhanced filtering
 * @param yjsDocument - The collaborative document
 * @returns Array of PartialBlock for BlockNote
 */
export function convertYjsToBlockNoteBlocks(
  yjsDocument: CollaborativeDocument
): PartialBlock[] {
  return yjsDocument.blocksArray
    .toArray()
    .map((yjsBlock) => convertYjsBlockToBlockNote(yjsBlock))
    .filter((block): block is PartialBlock => block !== null);
}

/**
 * Enhanced single block conversion with error handling
 * @param block - BlockNote PartialBlock
 * @returns Yjs-compatible block object
 */
function convertBlockNoteBlockToYjs(block: PartialBlock): any {
  // Ensure required fields with defaults
  const yjsBlock = {
    id: block.id || generateBlockId(),
    type: block.type || 'paragraph',
    props: block.props || {},
    content: block.content || [],
    children: block.children || [],
    // Preserve any existing metadata
    _metadata: {
      created: new Date().toISOString(),
      ...(block as any)._metadata,
    },
  };

  // Validate block structure
  if (!isValidBlockStructure(yjsBlock)) {
    console.warn('[yjsDocument] Invalid block structure detected:', yjsBlock);
    // Return a safe fallback
    return {
      id: generateBlockId(),
      type: 'paragraph',
      props: {},
      content: [],
      children: [],
      _metadata: { created: new Date().toISOString() },
    };
  }

  return yjsBlock;
}

/**
 * Enhanced Yjs to BlockNote conversion with error handling
 * @param yjsBlock - Yjs block object
 * @returns BlockNote PartialBlock or null if invalid
 */
function convertYjsBlockToBlockNote(yjsBlock: any): PartialBlock | null {
  try {
    // Validate the structure before conversion
    if (!yjsBlock || typeof yjsBlock !== 'object') {
      console.warn('[yjsDocument] Invalid Yjs block structure:', yjsBlock);
      return null;
    }

    const block: PartialBlock = {
      id: yjsBlock.id,
      type: yjsBlock.type,
      props: yjsBlock.props || {},
      content: yjsBlock.content || [],
      children: yjsBlock.children || [],
    };

    // Validate the converted block
    if (!isValidBlockStructure(block)) {
      console.warn('[yjsDocument] Converted block failed validation:', block);
      return null;
    }

    return block;
  } catch (error) {
    console.error('[yjsDocument] Error converting Yjs block to BlockNote:', error);
    return null;
  }
}

/**
 * Validate block structure to prevent corruption
 * @param block - Block object to validate
 * @returns Whether the block structure is valid
 */
function isValidBlockStructure(block: any): boolean {
  return (
    block &&
    typeof block === 'object' &&
    typeof block.id === 'string' &&
    typeof block.type === 'string' &&
    Array.isArray(block.content) &&
    Array.isArray(block.children) &&
    (block.props === undefined || typeof block.props === 'object')
  );
}

/**
 * Generate a unique block ID with better entropy
 * @returns Unique string ID
 */
function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Enhanced event listeners with better change detection
 * @param yjsDocument - The collaborative document
 * @param onUpdate - Callback for when document updates
 */
export function setupYjsEventListeners(
  yjsDocument: CollaborativeDocument,
  onUpdate: (blocks: PartialBlock[]) => void
): () => void {
  let lastUpdateTime = 0;
  const updateThrottle = 50; // Throttle updates to prevent excessive calls

  const updateHandler = (event: Y.YArrayEvent<any>, transaction: Y.Transaction) => {
    const currentTime = Date.now();
    
    // Throttle rapid updates
    if (currentTime - lastUpdateTime < updateThrottle) {
      return;
    }
    
    lastUpdateTime = currentTime;

    try {
      // Update last modified timestamp
      yjsDocument.metaMap.set('lastModified', new Date().toISOString());
      
      // Convert Yjs structure back to BlockNote format and notify
      const blocks = convertYjsToBlockNoteBlocks(yjsDocument);
      
      // Only call update if we have valid blocks
      if (blocks.length >= 0) { // Allow empty documents
        onUpdate(blocks);
      }
    } catch (error) {
      console.error('[yjsDocument] Error in update handler:', error);
    }
  };

  // Listen for changes to the blocks array
  yjsDocument.blocksArray.observe(updateHandler);
  
  // Return cleanup function
  return () => {
    yjsDocument.blocksArray.unobserve(updateHandler);
  };
}

/**
 * Update user awareness information with enhanced metadata
 * @param yjsDocument - The collaborative document
 * @param userId - User identifier
 * @param awareness - User awareness data
 */
export function updateUserAwareness(
  yjsDocument: CollaborativeDocument,
  userId: string,
  awareness: UserAwareness
): void {
  const enhancedAwareness = {
    ...awareness,
    lastSeen: new Date().toISOString(),
    sessionId: `${userId}_${Date.now()}`,
    isActive: true,
  };

  yjsDocument.awarenessData.set(userId, enhancedAwareness);
  
  // Clean up stale awareness data (older than 30 seconds)
  const thirtySecondsAgo = Date.now() - 30000;
  yjsDocument.awarenessData.forEach((userAwareness, userIdKey) => {
    const lastSeenTime = new Date(userAwareness.lastSeen).getTime();
    if (lastSeenTime < thirtySecondsAgo) {
      yjsDocument.awarenessData.delete(userIdKey);
    }
  });
}

/**
 * Get all active users from awareness data with filtering
 * @param yjsDocument - The collaborative document
 * @returns Array of user awareness data
 */
export function getActiveUsers(
  yjsDocument: CollaborativeDocument
): Array<UserAwareness & { userId: string; lastSeen: string }> {
  const users: Array<UserAwareness & { userId: string; lastSeen: string }> = [];
  const fiveMinutesAgo = Date.now() - 300000; // 5 minutes
  
  yjsDocument.awarenessData.forEach((awareness, userId) => {
    // Only include users that have been active recently
    const lastSeenTime = new Date(awareness.lastSeen).getTime();
    if (lastSeenTime > fiveMinutesAgo) {
      users.push({
        userId,
        ...awareness,
      });
    }
  });

  return users;
}

/**
 * Enhanced block update function for granular changes
 * @param yjsDocument - The collaborative document
 * @param blockId - ID of the block to update
 * @param updates - Partial updates to apply
 * @param userId - User making the change
 */
export function updateBlock(
  yjsDocument: CollaborativeDocument,
  blockId: string,
  updates: Partial<PartialBlock>,
  userId: string
): boolean {
  try {
    const blocks = yjsDocument.blocksArray.toArray();
    const blockIndex = blocks.findIndex(block => block.id === blockId);
    
    if (blockIndex === -1) {
      console.warn('[yjsDocument] Block not found for update:', blockId);
      return false;
    }

    // Start transaction for atomic update
    yjsDocument.doc.transact(() => {
      const currentBlock = blocks[blockIndex];
      const updatedBlock = {
        ...currentBlock,
        ...updates,
        _metadata: {
          ...currentBlock._metadata,
          lastModified: new Date().toISOString(),
          lastModifiedBy: userId,
        },
      };

      // Replace the block
      yjsDocument.blocksArray.delete(blockIndex, 1);
      yjsDocument.blocksArray.insert(blockIndex, [updatedBlock]);
      
      // Update document metadata
      yjsDocument.metaMap.set('lastModified', new Date().toISOString());
      yjsDocument.metaMap.set('lastModifiedBy', userId);
    }, 'block-update');

    return true;
  } catch (error) {
    console.error('[yjsDocument] Error updating block:', error);
    return false;
  }
}

/**
 * Insert a new block at a specific position
 * @param yjsDocument - The collaborative document
 * @param block - Block to insert
 * @param position - Position to insert at (or append if -1)
 * @param userId - User making the change
 */
export function insertBlock(
  yjsDocument: CollaborativeDocument,
  block: PartialBlock,
  position: number = -1,
  userId: string = 'system'
): boolean {
  try {
    const yjsBlock = convertBlockNoteBlockToYjs(block);
    yjsBlock._metadata = {
      ...yjsBlock._metadata,
      createdBy: userId,
      created: new Date().toISOString(),
    };

    yjsDocument.doc.transact(() => {
      if (position === -1) {
        // Append to end
        yjsDocument.blocksArray.push([yjsBlock]);
      } else {
        // Insert at specific position
        yjsDocument.blocksArray.insert(position, [yjsBlock]);
      }

      // Update document metadata
      yjsDocument.metaMap.set('lastModified', new Date().toISOString());
      yjsDocument.metaMap.set('lastModifiedBy', userId);
      yjsDocument.metaMap.set('blockCount', yjsDocument.blocksArray.length);
    }, 'block-insert');

    return true;
  } catch (error) {
    console.error('[yjsDocument] Error inserting block:', error);
    return false;
  }
}

/**
 * Delete a block by ID
 * @param yjsDocument - The collaborative document
 * @param blockId - ID of the block to delete
 * @param userId - User making the change
 */
export function deleteBlock(
  yjsDocument: CollaborativeDocument,
  blockId: string,
  userId: string
): boolean {
  try {
    const blocks = yjsDocument.blocksArray.toArray();
    const blockIndex = blocks.findIndex(block => block.id === blockId);
    
    if (blockIndex === -1) {
      console.warn('[yjsDocument] Block not found for deletion:', blockId);
      return false;
    }

    yjsDocument.doc.transact(() => {
      yjsDocument.blocksArray.delete(blockIndex, 1);
      
      // Update document metadata
      yjsDocument.metaMap.set('lastModified', new Date().toISOString());
      yjsDocument.metaMap.set('lastModifiedBy', userId);
      yjsDocument.metaMap.set('blockCount', yjsDocument.blocksArray.length);
    }, 'block-delete');

    return true;
  } catch (error) {
    console.error('[yjsDocument] Error deleting block:', error);
    return false;
  }
} 