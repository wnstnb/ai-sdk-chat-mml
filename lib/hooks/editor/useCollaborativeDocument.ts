import { useState, useEffect, useCallback, useRef } from 'react';
import { PartialBlock } from '@blocknote/core';
import {
  createCollaborativeDocument,
  CollaborativeDocument,
  initializeFromBlockNoteBlocks,
  convertYjsToBlockNoteBlocks,
  setupYjsEventListeners,
  updateUserAwareness,
  getActiveUsers,
  UserAwareness,
  updateBlock,
  insertBlock,
  deleteBlock,
} from '@/lib/collaboration/yjsDocument';
import { PartykitYjsProvider, ConnectionState } from '@/lib/collaboration/partykitYjsProvider';
import { createClient } from '@/lib/supabase/client';

export interface UseCollaborativeDocumentOptions {
  documentId: string;
  initialContent?: PartialBlock[];
  userId?: string;
  userName?: string;
  userColor?: string;
  onContentChange?: (blocks: PartialBlock[]) => void;
  onUsersChange?: (users: Array<UserAwareness & { userId: string; lastSeen: string }>) => void;
  onConnectionError?: (error: Error) => void;
  onAuthError?: (error: Error) => void;
}

export interface UseCollaborativeDocumentReturn {
  yjsDocument: CollaborativeDocument | null;
  blocks: PartialBlock[];
  activeUsers: Array<UserAwareness & { userId: string; lastSeen: string }>;
  isReady: boolean;
  isConnected: boolean;
  connectionState: ConnectionState | null;
  updateContent: (blocks: PartialBlock[]) => void;
  updateUserPresence: (awareness: UserAwareness) => void;
  refreshConnection: () => Promise<void>;
  cleanup: () => void;
  // Enhanced block operations
  updateSingleBlock: (blockId: string, updates: Partial<PartialBlock>) => boolean;
  insertSingleBlock: (block: PartialBlock, position?: number) => boolean;
  deleteSingleBlock: (blockId: string) => boolean;
}

/**
 * Enhanced React hook for managing collaborative BlockNote document with Yjs
 * 
 * This hook initializes and manages a Yjs document that synchronizes
 * with BlockNote's content structure and provides real-time collaboration
 * features including user presence awareness. Enhanced with JWT authentication,
 * robust error handling, and granular block operations.
 */
export function useCollaborativeDocument(
  options: UseCollaborativeDocumentOptions
): UseCollaborativeDocumentReturn {
  const {
    documentId,
    initialContent = [],
    userId = 'anonymous',
    userName = 'Anonymous User',
    userColor = '#3b82f6',
    onContentChange,
    onUsersChange,
    onConnectionError,
    onAuthError,
  } = options;

  const [yjsDocument, setYjsDocument] = useState<CollaborativeDocument | null>(null);
  const [blocks, setBlocks] = useState<PartialBlock[]>(initialContent);
  const [activeUsers, setActiveUsers] = useState<Array<UserAwareness & { userId: string; lastSeen: string }>>([]);
  const [isReady, setIsReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  
  const cleanupRef = useRef<(() => void) | null>(null);
  const providerRef = useRef<PartykitYjsProvider | null>(null);
  const isInitialized = useRef(false);
  const supabase = createClient();

  // Enhanced initialization with authentication
  useEffect(() => {
    if (!documentId || isInitialized.current) return;

    const initializeProvider = async () => {
      console.log('[useCollaborativeDocument] Initializing enhanced Yjs document with PartyKit for:', documentId);
      
      try {
        // Get authentication token from Supabase session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.warn('[useCollaborativeDocument] Session error:', sessionError.message);
          onAuthError?.(sessionError);
        }

        const doc = createCollaborativeDocument(documentId);
        
        // Initialize with initial content if provided
        if (initialContent.length > 0) {
          initializeFromBlockNoteBlocks(initialContent, doc, userId);
        }
        
        // Initialize PartyKit provider with enhanced options
        const provider = new PartykitYjsProvider(doc.doc, {
          documentId,
          userId,
          userName,
          userColor,
          authToken: session?.access_token, // Pass JWT token for authentication
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          maxReconnectAttempts: 10,
          reconnectDelay: 1000,
          WebSocketPolyfill: typeof window !== 'undefined' ? window.WebSocket : undefined,
          onSynced: () => {
            console.log('[useCollaborativeDocument] Document synced with PartyKit');
            setIsReady(true);
          },
          onConnectionStatusChange: (connected) => {
            console.log('[useCollaborativeDocument] PartyKit connection status:', connected);
            setIsConnected(connected);
            setConnectionState(provider.getConnectionState());
          },
          onAwarenessChange: (awareness) => {
            console.log('[useCollaborativeDocument] Awareness changed via PartyKit:', awareness.length);
            const users = awareness.map((a: any, index: number) => ({
              ...a,
              userId: a.userId || `user-${index}`,
              lastSeen: new Date().toISOString(),
            }));
            setActiveUsers(users);
            onUsersChange?.(users);
          },
          onAuthError: (error) => {
            console.error('[useCollaborativeDocument] Authentication error:', error.message);
            onAuthError?.(error);
          },
          onConnectionError: (error) => {
            console.error('[useCollaborativeDocument] Connection error:', error.message);
            setConnectionState(provider.getConnectionState());
            onConnectionError?.(error);
          },
        });

        providerRef.current = provider;
        
        // Set up event listeners for document changes with enhanced handling
        const cleanup = setupYjsEventListeners(doc, (updatedBlocks) => {
          console.log('[useCollaborativeDocument] Blocks updated via Yjs:', updatedBlocks.length);
          setBlocks(updatedBlocks);
          onContentChange?.(updatedBlocks);
        });

        cleanupRef.current = cleanup;
        setYjsDocument(doc);
        isInitialized.current = true;

        console.log('[useCollaborativeDocument] Enhanced Yjs document with PartyKit provider ready');

      } catch (error) {
        console.error('[useCollaborativeDocument] Provider initialization error:', error);
        onConnectionError?.(error as Error);
      }
    };

    initializeProvider();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      isInitialized.current = false;
      setIsReady(false);
    };
  }, [documentId, userId, userName, userColor, supabase]);

  // Monitor authentication state changes
  useEffect(() => {
    if (!providerRef.current) return;

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[useCollaborativeDocument] Auth state changed:', event);
      
      if (event === 'TOKEN_REFRESHED' && session?.access_token) {
        console.log('[useCollaborativeDocument] Token refreshed, updating provider...');
        try {
          await providerRef.current?.refreshAuthToken();
        } catch (error) {
          console.error('[useCollaborativeDocument] Error refreshing provider token:', error);
          onAuthError?.(error as Error);
        }
      }
      
      if (event === 'SIGNED_OUT') {
        console.log('[useCollaborativeDocument] User signed out, provider will handle anonymous mode');
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]);

  // Enhanced user awareness updates with cleanup
  useEffect(() => {
    if (!yjsDocument || !userId) return;

    const userAwareness: UserAwareness = {
      user: {
        name: userName,
        color: userColor,
      },
    };

    // Update user presence
    updateUserAwareness(yjsDocument, userId, userAwareness);

    // Set up periodic awareness refresh with enhanced user management
    const awarenessInterval = setInterval(() => {
      updateUserAwareness(yjsDocument, userId, userAwareness);
      
      // Update active users list with automatic cleanup
      const users = getActiveUsers(yjsDocument);
      setActiveUsers(users);
      onUsersChange?.(users);
      
      // Update connection state
      if (providerRef.current) {
        setConnectionState(providerRef.current.getConnectionState());
      }
    }, 30000); // Update every 30 seconds instead of 5 to reduce frequency

    // Initial users update
    const users = getActiveUsers(yjsDocument);
    setActiveUsers(users);
    onUsersChange?.(users);

    return () => {
      clearInterval(awarenessInterval);
    };
  }, [yjsDocument, userId, userName, userColor]);

  // Enhanced content update with better transaction handling
  const updateContent = useCallback((newBlocks: PartialBlock[]) => {
    if (!yjsDocument) return;

    console.log('[useCollaborativeDocument] Updating content with', newBlocks.length, 'blocks');
    initializeFromBlockNoteBlocks(newBlocks, yjsDocument, userId);
  }, [yjsDocument, userId]);

  // Enhanced user presence information with cursor support
  const updateUserPresence = useCallback((awareness: UserAwareness) => {
    if (!providerRef.current || !yjsDocument) return;

    // Update local awareness data
    updateUserAwareness(yjsDocument, userId, awareness);
    
    // Update awareness via PartyKit provider
    providerRef.current.updateAwareness(awareness);
  }, [yjsDocument, userId]);

  // Refresh connection (useful for manual retry)
  const refreshConnection = useCallback(async () => {
    if (!providerRef.current) return;

    try {
      console.log('[useCollaborativeDocument] Refreshing connection...');
      await providerRef.current.refreshAuthToken();
      setConnectionState(providerRef.current.getConnectionState());
    } catch (error) {
      console.error('[useCollaborativeDocument] Error refreshing connection:', error);
      onConnectionError?.(error as Error);
    }
  }, []);

  // Enhanced block operations for granular updates
  const updateSingleBlock = useCallback((blockId: string, updates: Partial<PartialBlock>) => {
    if (!yjsDocument) return false;
    return updateBlock(yjsDocument, blockId, updates, userId);
  }, [yjsDocument, userId]);

  const insertSingleBlock = useCallback((block: PartialBlock, position: number = -1) => {
    if (!yjsDocument) return false;
    return insertBlock(yjsDocument, block, position, userId);
  }, [yjsDocument, userId]);

  const deleteSingleBlock = useCallback((blockId: string) => {
    if (!yjsDocument) return false;
    return deleteBlock(yjsDocument, blockId, userId);
  }, [yjsDocument, userId]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    isInitialized.current = false;
    setIsReady(false);
    setIsConnected(false);
    setConnectionState(null);
  }, []);

  return {
    yjsDocument,
    blocks,
    activeUsers,
    isReady,
    isConnected,
    connectionState,
    updateContent,
    updateUserPresence,
    refreshConnection,
    cleanup,
    // Enhanced block operations
    updateSingleBlock,
    insertSingleBlock,
    deleteSingleBlock,
  };
} 