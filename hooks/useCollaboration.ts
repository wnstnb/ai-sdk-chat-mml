import { useState, useEffect, useCallback, useRef } from 'react';
import { PartialBlock } from '@blocknote/core';
import { useCollaborationContext, CollaborationUser } from '@/contexts/CollaborationContext';
import { UserAwareness } from '@/lib/collaboration/yjsDocument';
import { ConnectionState } from '@/lib/collaboration/partykitYjsProvider';

export interface UseCollaborationOptions {
  documentId?: string;
  initialContent?: PartialBlock[];
  autoJoinSession?: boolean;
  sessionData?: Record<string, any>;
  onContentChange?: (blocks: PartialBlock[]) => void;
  onUsersChange?: (users: CollaborationUser[]) => void;
  onConnectionStateChange?: (isConnected: boolean, state: ConnectionState | null) => void;
  onError?: (error: Error) => void;
}

export interface UseCollaborationReturn {
  // State
  isReady: boolean;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Document content
  blocks: PartialBlock[];
  
  // Users and presence
  activeUsers: CollaborationUser[];
  currentUser: CollaborationUser | null;
  userCount: number;
  
  // Connection status
  connectionState: ConnectionState | null;
  
  // Actions
  start: (documentId: string) => Promise<void>;
  stop: () => Promise<void>;
  updateContent: (blocks: PartialBlock[]) => void;
  updatePresence: (awareness: UserAwareness) => void;
  refreshConnection: () => Promise<void>;
  
  // Block operations
  updateBlock: (blockId: string, updates: Partial<PartialBlock>) => boolean;
  insertBlock: (block: PartialBlock, position?: number) => boolean;
  deleteBlock: (blockId: string) => boolean;
  
  // Session management
  joinSession: (sessionData?: Record<string, any>) => Promise<void>;
  leaveSession: () => Promise<void>;
}

/**
 * Simplified collaboration hook for easy integration with components
 * 
 * @example
 * ```tsx
 * const {
 *   isReady,
 *   isConnected,
 *   blocks,
 *   activeUsers,
 *   start,
 *   updateContent
 * } = useCollaboration({
 *   onContentChange: (blocks) => console.log('Content changed:', blocks),
 *   onUsersChange: (users) => console.log('Users changed:', users),
 * });
 * 
 * // Initialize collaboration for a document
 * useEffect(() => {
 *   start(documentId);
 * }, [documentId]);
 * ```
 */
export function useCollaboration(options: UseCollaborationOptions = {}): UseCollaborationReturn {
  const {
    initialContent = [],
    autoJoinSession = true,
    sessionData = {},
    onContentChange,
    onUsersChange,
    onConnectionStateChange,
    onError,
  } = options;

  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  
  // Refs for tracking callbacks
  const onContentChangeRef = useRef(onContentChange);
  const onUsersChangeRef = useRef(onUsersChange);
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  useEffect(() => {
    onUsersChangeRef.current = onUsersChange;
  }, [onUsersChange]);

  useEffect(() => {
    onConnectionStateChangeRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Access collaboration context
  const collaboration = useCollaborationContext();

  // Start collaboration for a document
  const start = useCallback(async (documentId: string) => {
    if (!documentId) {
      const error = new Error('Document ID is required to start collaboration');
      setError(error.message);
      onErrorRef.current?.(error);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      console.log('[useCollaboration] Starting collaboration for document:', documentId);
      
      // Initialize collaboration
      collaboration.initializeCollaboration(documentId);
      
      // Auto-join session if enabled
      if (autoJoinSession) {
        await collaboration.joinSession(sessionData);
      }
      
      setHasStarted(true);
      console.log('[useCollaboration] Collaboration started successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start collaboration';
      console.error('[useCollaboration] Error starting collaboration:', error);
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [collaboration, autoJoinSession, sessionData]);

  // Stop collaboration
  const stop = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('[useCollaboration] Stopping collaboration...');
      
      await collaboration.leaveSession();
      collaboration.cleanup();
      
      setHasStarted(false);
      setError(null);
      console.log('[useCollaboration] Collaboration stopped successfully');
      
    } catch (error) {
      console.error('[useCollaboration] Error stopping collaboration:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop collaboration';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [collaboration]);

  // Enhanced update content with error handling
  const updateContent = useCallback((blocks: PartialBlock[]) => {
    try {
      collaboration.updateContent(blocks);
    } catch (error) {
      console.error('[useCollaboration] Error updating content:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update content';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
    }
  }, [collaboration]);

  // Enhanced update presence with error handling
  const updatePresence = useCallback((awareness: UserAwareness) => {
    try {
      collaboration.updateUserPresence(awareness);
    } catch (error) {
      console.error('[useCollaboration] Error updating presence:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update presence';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
    }
  }, [collaboration]);

  // Enhanced refresh connection with error handling
  const refreshConnection = useCallback(async () => {
    try {
      setError(null);
      await collaboration.refreshConnection();
      console.log('[useCollaboration] Connection refreshed successfully');
    } catch (error) {
      console.error('[useCollaboration] Error refreshing connection:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh connection';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
    }
  }, [collaboration]);

  // Enhanced block operations with error handling
  const updateBlock = useCallback((blockId: string, updates: Partial<PartialBlock>): boolean => {
    try {
      return collaboration.updateSingleBlock(blockId, updates);
    } catch (error) {
      console.error('[useCollaboration] Error updating block:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update block';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
      return false;
    }
  }, [collaboration]);

  const insertBlock = useCallback((block: PartialBlock, position?: number): boolean => {
    try {
      return collaboration.insertSingleBlock(block, position);
    } catch (error) {
      console.error('[useCollaboration] Error inserting block:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to insert block';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
      return false;
    }
  }, [collaboration]);

  const deleteBlock = useCallback((blockId: string): boolean => {
    try {
      return collaboration.deleteSingleBlock(blockId);
    } catch (error) {
      console.error('[useCollaboration] Error deleting block:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete block';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
      return false;
    }
  }, [collaboration]);

  // Session management with error handling
  const joinSession = useCallback(async (sessionData: Record<string, any> = {}) => {
    try {
      setError(null);
      await collaboration.joinSession(sessionData);
      console.log('[useCollaboration] Session joined successfully');
    } catch (error) {
      console.error('[useCollaboration] Error joining session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to join session';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
    }
  }, [collaboration]);

  const leaveSession = useCallback(async () => {
    try {
      await collaboration.leaveSession();
      console.log('[useCollaboration] Session left successfully');
    } catch (error) {
      console.error('[useCollaboration] Error leaving session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to leave session';
      setError(errorMessage);
      onErrorRef.current?.(error as Error);
    }
  }, [collaboration]);

  // Monitor collaboration state changes
  useEffect(() => {
    if (hasStarted && onContentChangeRef.current) {
      onContentChangeRef.current(collaboration.collaborativeBlocks);
    }
  }, [collaboration.collaborativeBlocks, hasStarted]);

  useEffect(() => {
    if (hasStarted && onUsersChangeRef.current) {
      onUsersChangeRef.current(collaboration.activeUsers);
    }
  }, [collaboration.activeUsers, hasStarted]);

  useEffect(() => {
    if (hasStarted && onConnectionStateChangeRef.current) {
      onConnectionStateChangeRef.current(collaboration.isConnected, collaboration.connectionState);
    }
  }, [collaboration.isConnected, collaboration.connectionState, hasStarted]);

  // Monitor connection errors
  useEffect(() => {
    if (collaboration.connectionError) {
      setError(collaboration.connectionError);
      onErrorRef.current?.(new Error(collaboration.connectionError));
    }
  }, [collaboration.connectionError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasStarted) {
        stop();
      }
    };
  }, []);

  return {
    // State
    isReady: collaboration.isCollaborationReady && hasStarted,
    isConnected: collaboration.isConnected,
    isLoading,
    error,
    
    // Document content
    blocks: collaboration.collaborativeBlocks,
    
    // Users and presence
    activeUsers: collaboration.activeUsers,
    currentUser: collaboration.currentUser,
    userCount: collaboration.activeUsers.length,
    
    // Connection status
    connectionState: collaboration.connectionState,
    
    // Actions
    start,
    stop,
    updateContent,
    updatePresence,
    refreshConnection,
    
    // Block operations
    updateBlock,
    insertBlock,
    deleteBlock,
    
    // Session management
    joinSession,
    leaveSession,
  };
} 