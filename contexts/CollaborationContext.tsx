'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PartialBlock } from '@blocknote/core';
import { YjsThreadStore, DefaultThreadStoreAuth, ThreadStore, RESTYjsThreadStore } from '@blocknote/core/comments';
import * as Y from 'yjs';
import { UserAwareness } from '@/lib/collaboration/yjsDocument';
import { ConnectionState } from '@/lib/collaboration/partykitYjsProvider';
import { useCollaborativeDocument, UseCollaborativeDocumentReturn } from '@/lib/hooks/editor/useCollaborativeDocument';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/hooks/useUserProfile';

export interface CollaborationUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  color: string;
  isActive: boolean;
  lastSeen: string;
}

export interface CollaborationSession {
  id: string;
  documentId: string;
  userId: string;
  sessionData: Record<string, any>;
  isActive: boolean;
  lastSeen: string;
  createdAt: string;
}

interface CollaborationContextType {
  // Document collaboration state
  documentId: string | null;
  isCollaborationEnabled: boolean;
  isCollaborationReady: boolean;
  
  // Connection state
  isConnected: boolean;
  connectionState: ConnectionState | null;
  connectionError: string | null;
  
  // Users and presence
  activeUsers: CollaborationUser[];
  currentUser: CollaborationUser | null;
  userPresence: Map<string, UserAwareness>;
  
  // Document content
  collaborativeBlocks: PartialBlock[];
  
  // Session management
  activeSessions: CollaborationSession[];
  currentSession: CollaborationSession | null;
  
  // Comment threading
  threadStore: ThreadStore | null;
  resolveUsers: (userIds: string[]) => Promise<Array<{ id: string; username: string; avatarUrl: string }>>;
  refreshThreads: () => Promise<void>;
  
  // Actions
  initializeCollaboration: (documentId: string, userId?: string, userName?: string, userColor?: string) => void;
  updateContent: (blocks: PartialBlock[]) => void;
  updateUserPresence: (awareness: UserAwareness) => void;
  joinSession: (sessionData?: Record<string, any>) => Promise<void>;
  leaveSession: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  cleanup: () => void;
  
  // Enhanced block operations
  updateSingleBlock: (blockId: string, updates: Partial<PartialBlock>) => boolean;
  insertSingleBlock: (block: PartialBlock, position?: number) => boolean;
  deleteSingleBlock: (blockId: string) => boolean;
  
  // Permission notifications
  sendPermissionUpdateNotification: () => void;
  
  // Event handlers
  onContentChange?: (blocks: PartialBlock[]) => void;
  onUsersChange?: (users: CollaborationUser[]) => void;
  onConnectionError?: (error: Error) => void;
  onAuthError?: (error: Error) => void;
}

const CollaborationContext = createContext<CollaborationContextType | null>(null);

export interface CollaborationProviderProps {
  children: React.ReactNode;
  onContentChange?: (blocks: PartialBlock[]) => void;
  onUsersChange?: (users: CollaborationUser[]) => void;
  onConnectionError?: (error: Error) => void;
  onAuthError?: (error: Error) => void;
}

export const CollaborationProvider: React.FC<CollaborationProviderProps> = ({
  children,
  onContentChange,
  onUsersChange,
  onConnectionError,
  onAuthError,
}) => {
  console.log('[CollaborationProvider] Initializing provider');
  
  // State management
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CollaborationUser | null>(null);
  const [isCollaborationEnabled, setIsCollaborationEnabled] = useState(false);
  const [activeUsers, setActiveUsers] = useState<CollaborationUser[]>([]);
  const [userPresence, setUserPresence] = useState<Map<string, UserAwareness>>(new Map());
  const [activeSessions, setActiveSessions] = useState<CollaborationSession[]>([]);
  const [currentSession, setCurrentSession] = useState<CollaborationSession | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Refs for cleanup
  const collaborationRef = useRef<UseCollaborativeDocumentReturn | null>(null);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const supabase = createClient();
  
  // Get user profile data including username
  const { profile } = useUserProfile();

  // Create thread store when collaboration is ready - state declaration
  const [threadStore, setThreadStore] = useState<any>(null);

  // Comment threading - resolveUsers function
  const resolveUsers = useCallback(async (userIds: string[]) => {
    try {
      console.log('[CollaborationContext] Resolving users:', userIds);
      
      const { data: users, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      if (error) {
        console.error('[CollaborationContext] Error resolving users:', error);
        // Return fallback user data
        return userIds.map(id => ({
          id,
          username: 'Unknown User',
          avatarUrl: '',
        }));
      }

      // Map to BlockNote's expected format
      const resolvedUsers = users?.map(user => ({
        id: user.id,
        username: user.username || 'Unknown User',
        avatarUrl: user.avatar_url || '',
      })) || [];
      
      console.log('[CollaborationContext] Resolved users:', resolvedUsers);
      return resolvedUsers;
    } catch (error) {
      console.error('[CollaborationContext] Error in resolveUsers:', error);
      // Return fallback user data
      return userIds.map(id => ({
        id,
        username: 'Unknown User',
        avatarUrl: '',
      }));
    }
  }, [supabase]);

  // Memoize callback functions to prevent useCollaborativeDocument from re-initializing
  const handleContentChange = useCallback((blocks: PartialBlock[]) => {
      console.log('[CollaborationContext] Content changed:', blocks.length, 'blocks');
      onContentChange?.(blocks);
  }, [onContentChange]);

  const handleUsersChange = useCallback((users: Array<UserAwareness & { userId: string; lastSeen: string }>) => {
      console.log('[CollaborationContext] Users changed:', users.length, 'users');
      // Convert users to CollaborationUser format
      const collaborationUsers: CollaborationUser[] = users.map(user => ({
        id: user.userId,
        name: user.user?.name || 'Anonymous User',
        color: user.user?.color || '#3b82f6',
        isActive: true,
        lastSeen: user.lastSeen,
      }));
      setActiveUsers(collaborationUsers);
      onUsersChange?.(collaborationUsers);
  }, [onUsersChange]);

  const handleConnectionError = useCallback((error: Error) => {
      console.error('[CollaborationContext] Connection error:', error);
      setConnectionError(error.message);
      onConnectionError?.(error);
  }, [onConnectionError]);

  const handleAuthError = useCallback((error: Error) => {
      console.error('[CollaborationContext] Auth error:', error);
      onAuthError?.(error);
  }, [onAuthError]);



  // Initialize collaborative document when needed
  const collaboration = useCollaborativeDocument({
    documentId: documentId || '',
    initialContent: [],
    userId: currentUser?.id,
    userName: currentUser?.name,
    userColor: currentUser?.color,
    onContentChange: handleContentChange,
    onUsersChange: handleUsersChange,
    onConnectionError: handleConnectionError,
    onAuthError: handleAuthError,
  });

  // Update collaboration ref
  useEffect(() => {
    collaborationRef.current = collaboration;
  }, [collaboration]);

  // COMMENTED OUT: Thread store creation temporarily disabled - see comment-system-challenges-prd.md
  // Create thread store when collaboration is ready
  useEffect(() => {
    // Disable thread store creation - comments are temporarily disabled
    setThreadStore(null);
    return;
    
    // console.log('[CollaborationContext] Thread store creation debug:', {
    //   hasYjsDocument: !!collaboration.yjsDocument,
    //   hasCurrentUser: !!currentUser,
    //   hasDocumentId: !!documentId,
    //   currentUserId: currentUser?.id,
    //   documentId,
    //   isCollaborationReady: collaboration.isReady
    // });

    // // Ensure all required dependencies are available AND collaboration is ready
    // if (!currentUser || !documentId || !collaboration.isReady) {
    //   console.log('[CollaborationContext] Thread store creation skipped - missing requirements or collaboration not ready');
    //   setThreadStore(null);
    //   return;
    // }

    // // Create thread store with proper auth
    // const createThreadStore = async () => {
    //   try {
    //     // Get the editor's Y.js document from the global documentInstances
    //     // This ensures we use the same Y.js document that BlockNote editor is using
    //     const globalInstances = (globalThis as any).__blockNoteDocumentInstances;
    //     const editorInstance = globalInstances?.get(documentId);
        
    //     if (!editorInstance?.doc) {
    //       console.log('[CollaborationContext] Editor Y.js document not ready yet, retrying...');
    //       // Retry after a short delay to allow editor to initialize
    //       setTimeout(() => createThreadStore(), 100);
    //       return;
    //     }

    //     console.log('[CollaborationContext] Using editor Y.js document for thread store');

    //     // Get the threads Y.Map from the editor's Yjs document for real-time reads
    //     const threadsMap = editorInstance.doc.getMap('threads') as Y.Map<Y.Map<any>>;

    //     // Get current auth session for API calls
    //     const { data: { session } } = await supabase.auth.getSession();
        
    //     if (!session?.access_token) {
    //       throw new Error('No authentication token available');
    //     }

    //     // Create auth token for API calls (simpler format like demo)
    //     const authToken = session.access_token;
        
    //     console.log('[CollaborationContext] Auth token prepared for RESTYjsThreadStore');

    //     // Create the REST + Y.js thread store with proper auth (matching demo format)
    //     const threadStoreAuth = new DefaultThreadStoreAuth(
    //       currentUser.id,
    //       'editor' // Default role - can be made dynamic based on document permissions
    //     );

    //     // Use RESTYjsThreadStore with simpler configuration (matching demo pattern)
    //     const baseStore = new RESTYjsThreadStore(
    //       `${window.location.origin}/api/documents/${documentId}/threads`, // Full URL like demo
    //       {
    //         'Authorization': `Bearer ${authToken}` // Simple auth header like demo
    //       },
    //       threadsMap, // Y.Map for real-time reads
    //       threadStoreAuth // Authorization rules
    //     );

    //     // RESTYjsThreadStore handles REST writes and Y.js reads automatically
    //     // No manual refresh needed - the store handles synchronization
    //     setThreadStore(baseStore);
    //     console.log('[CollaborationContext] Thread store created successfully');

    //   } catch (error) {
    //     console.error('[CollaborationContext] Error creating thread store:', error);
    //     setThreadStore(null);
    //   }
    // };

    // createThreadStore();
  }, [collaboration.isReady, currentUser, documentId, supabase]);

  // Generate consistent user color based on user ID
  const generateUserColor = useCallback((userId: string): string => {
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
      '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
    ];
    
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return colors[Math.abs(hash) % colors.length];
  }, []);

  // Monitor profile changes and authentication state for user updates
  useEffect(() => {
    if (profile) {
      const user: CollaborationUser = {
        id: profile.id,
        name: profile.username,
        email: profile.email,
        avatar: profile.avatar_url,
        color: generateUserColor(profile.id),
        isActive: true,
        lastSeen: new Date().toISOString(),
      };
      setCurrentUser(user);
      console.log('[CollaborationContext] Updated current user with profile data:', user);
    } else {
      setCurrentUser(null);
    }
  }, [profile, generateUserColor]);

  // Monitor authentication state for cleanup on sign out
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        // Call cleanup directly to avoid dependency loops
        if (cleanupRef.current) {
          cleanupRef.current();
        }
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]); // Remove documentId and currentUser dependencies

  // Initialize collaboration for a document
  const initializeCollaboration = useCallback((
    docId: string, 
    userId?: string, 
    userName?: string, 
    userColor?: string
  ) => {
    console.log('[CollaborationContext] initializeCollaboration called with:', {
      docId,
      userId,
      userName,
      userColor,
      timestamp: new Date().toISOString()
    });
    
    setDocumentId(docId);
    setIsCollaborationEnabled(true);
    
    console.log('[CollaborationContext] Set documentId to:', docId);
    
    if (userId && userName) {
      const user: CollaborationUser = {
        id: userId,
        name: userName,
        color: userColor || generateUserColor(userId),
        isActive: true,
        lastSeen: new Date().toISOString(),
      };
      setCurrentUser(user);
      console.log('[CollaborationContext] Set currentUser to:', user);
    }
  }, [generateUserColor]); // Remove documentId dependency

  // Session management
  const joinSession = useCallback(async (sessionData: Record<string, any> = {}) => {
    if (!documentId || !currentUser) {
      console.warn('[CollaborationContext] Cannot join session: missing document ID or user');
      return;
    }

    try {
      console.log('[CollaborationContext] Joining collaboration session...');
      
      const response = await fetch('/api/collaboration/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          sessionData,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to join session: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[CollaborationContext] Session joined successfully:', result);

      // Create session object
      const session: CollaborationSession = {
        id: `${documentId}_${currentUser.id}`,
        documentId,
        userId: currentUser.id,
        sessionData,
        isActive: true,
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      
      setCurrentSession(session);

      // Set up periodic session refresh
      const sessionInterval = setInterval(async () => {
        try {
          await fetch('/api/collaboration/sessions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              documentId,
              sessionData: {},
            }),
          });
        } catch (error) {
          console.error('[CollaborationContext] Error refreshing session:', error);
        }
      }, 30000); // Refresh every 30 seconds

      sessionCleanupRef.current = () => {
        clearInterval(sessionInterval);
      };

    } catch (error) {
      console.error('[CollaborationContext] Error joining session:', error);
      onConnectionError?.(error as Error);
    }
  }, [documentId, currentUser, onConnectionError]);

  const leaveSession = useCallback(async () => {
    if (!documentId || !currentUser) return;

    try {
      console.log('[CollaborationContext] Leaving collaboration session...');
      
      // Clean up session refresh interval
      if (sessionCleanupRef.current) {
        sessionCleanupRef.current();
        sessionCleanupRef.current = null;
      }

      // Notify server about session end
      await fetch(`/api/collaboration/sessions?documentId=${documentId}`, {
        method: 'DELETE',
      });

      // Remove presence data
      await fetch(`/api/collaboration/presence?documentId=${documentId}`, {
        method: 'DELETE',
      });

      setCurrentSession(null);
      console.log('[CollaborationContext] Session ended successfully');

    } catch (error) {
      console.error('[CollaborationContext] Error leaving session:', error);
    }
  }, [documentId, currentUser]);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[CollaborationContext] Cleaning up collaboration...');
    
    if (collaborationRef.current) {
      collaborationRef.current.cleanup();
    }
    
    if (sessionCleanupRef.current) {
      sessionCleanupRef.current();
      sessionCleanupRef.current = null;
    }
    
    leaveSession();
    
    setDocumentId(null);
    setIsCollaborationEnabled(false);
    setActiveUsers([]);
    setUserPresence(new Map());
    setActiveSessions([]);
    setCurrentSession(null);
    setConnectionError(null);
  }, [leaveSession]);

  // Store cleanup function in ref for unmount
  useEffect(() => {
    cleanupRef.current = cleanup;
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Clear connection error when connection is restored
  useEffect(() => {
    if (collaboration.isConnected) {
      setConnectionError(null);
    }
  }, [collaboration.isConnected]);

  // Add refresh function to context value
  const refreshThreads = useCallback(async () => {
    if (!collaboration.yjsDocument || !documentId) return;

    try {
      console.log('[CollaborationContext] Manual thread refresh requested...');
      
      // Get fresh Y.js updates from Supabase
      const response = await fetch(`/api/collaboration/yjs-updates?documentId=${encodeURIComponent(documentId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.updates && Array.isArray(data.updates)) {
          // Apply fresh updates to current Y.js document
          for (const updateData of data.updates) {
            if (updateData.update_data) {
              const update = new Uint8Array(updateData.update_data);
              Y.applyUpdate(collaboration.yjsDocument.doc, update);
            }
          }
          console.log('[CollaborationContext] Manual thread refresh completed successfully');
        }
      } else {
        console.warn('[CollaborationContext] Failed to refresh threads:', response.status);
      }
    } catch (error) {
      console.error('[CollaborationContext] Error in manual thread refresh:', error);
    }
  }, [collaboration.yjsDocument, documentId, supabase]);

  const contextValue: CollaborationContextType = {
    // State
    documentId,
    isCollaborationEnabled: isCollaborationEnabled && !!documentId,
    isCollaborationReady: collaboration.isReady && isCollaborationEnabled,
    isConnected: collaboration.isConnected,
    connectionState: collaboration.connectionState,
    connectionError,
    activeUsers,
    currentUser,
    userPresence,
    collaborativeBlocks: collaboration.blocks,
    activeSessions,
    currentSession,
    
    // Comment threading
    threadStore,
    resolveUsers,
    refreshThreads,
    
    // Actions
    initializeCollaboration,
    updateContent: collaboration.updateContent,
    updateUserPresence: collaboration.updateUserPresence,
    joinSession,
    leaveSession,
    refreshConnection: collaboration.refreshConnection,
    cleanup,
    
    // Enhanced operations
    updateSingleBlock: collaboration.updateSingleBlock,
    insertSingleBlock: collaboration.insertSingleBlock,
    deleteSingleBlock: collaboration.deleteSingleBlock,
    
    // Permission notifications
    sendPermissionUpdateNotification: collaboration.sendPermissionUpdateNotification,
    
    // Event handlers
    onContentChange,
    onUsersChange,
    onConnectionError,
    onAuthError,
  };

  return (
    <CollaborationContext.Provider value={contextValue}>
      {children}
    </CollaborationContext.Provider>
  );
};

export const useCollaborationContext = () => {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaborationContext must be used within a CollaborationProvider');
  }
  return context;
};

export default CollaborationContext; 