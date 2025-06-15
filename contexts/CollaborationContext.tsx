'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PartialBlock } from '@blocknote/core';
import { YjsThreadStore, DefaultThreadStoreAuth } from '@blocknote/core/comments';
import { UserAwareness } from '@/lib/collaboration/yjsDocument';
import { ConnectionState } from '@/lib/collaboration/partykitYjsProvider';
import { useCollaborativeDocument, UseCollaborativeDocumentReturn } from '@/lib/hooks/editor/useCollaborativeDocument';
import { createClient } from '@/lib/supabase/client';
import { SupabaseThreadStoreAuth } from '@/lib/comments/supabaseThreadStoreAuth';

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
  threadStore: YjsThreadStore | null;
  resolveUsers: (userIds: string[]) => Promise<Array<{ id: string; username: string; avatarUrl: string }>>;
  
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
  // State management
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [isCollaborationEnabled, setIsCollaborationEnabled] = useState(false);
  const [currentUser, setCurrentUser] = useState<CollaborationUser | null>(null);
  const [activeUsers, setActiveUsers] = useState<CollaborationUser[]>([]);
  const [userPresence, setUserPresence] = useState<Map<string, UserAwareness>>(new Map());
  const [activeSessions, setActiveSessions] = useState<CollaborationSession[]>([]);
  const [currentSession, setCurrentSession] = useState<CollaborationSession | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Refs for cleanup
  const collaborationRef = useRef<UseCollaborativeDocumentReturn | null>(null);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const supabase = createClient();

  // Comment threading - resolveUsers function
  const resolveUsers = useCallback(async (userIds: string[]) => {
    try {
      const { data: users, error } = await supabase
        .from('profiles') // Assuming you have a profiles table
        .select('id, username, avatar_url')
        .in('id', userIds);

      if (error) {
        console.error('[CollaborationContext] Error resolving users:', error);
        // Return fallback user data
        return userIds.map(id => ({
          id,
          username: 'Unknown User',
          avatarUrl: '', // Ensure avatarUrl is always a string
        }));
      }

      // Map to BlockNote's expected format
      return users?.map(user => ({
        id: user.id,
        username: user.username || 'Unknown User',
        avatarUrl: user.avatar_url || '', // Ensure avatarUrl is always a string
      })) || [];
    } catch (error) {
      console.error('[CollaborationContext] Error in resolveUsers:', error);
      // Return fallback user data
      return userIds.map(id => ({
        id,
        username: 'Unknown User',
        avatarUrl: '', // Ensure avatarUrl is always a string
      }));
    }
  }, [supabase]);

  // Initialize collaborative document when needed
  const collaboration = useCollaborativeDocument({
    documentId: documentId || '',
    initialContent: [],
    userId: currentUser?.id,
    userName: currentUser?.name,
    userColor: currentUser?.color,
    onContentChange: (blocks) => {
      console.log('[CollaborationContext] Content changed:', blocks.length, 'blocks');
      onContentChange?.(blocks);
    },
    onUsersChange: (users) => {
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
    },
    onConnectionError: (error) => {
      console.error('[CollaborationContext] Connection error:', error);
      setConnectionError(error.message);
      onConnectionError?.(error);
    },
    onAuthError: (error) => {
      console.error('[CollaborationContext] Auth error:', error);
      onAuthError?.(error);
    },
  });

  // Create thread store when collaboration is ready
  const threadStore = useMemo(() => {
    if (!collaboration.yjsDocument || !currentUser) {
      return null;
    }

    try {
      // Get the threads Y.Map from the Yjs document
      const threadsMap = collaboration.yjsDocument.doc.getMap('threads');
      
      // Use DefaultThreadStoreAuth for now - simpler approach
      // We can enhance with custom auth later
      const threadStoreAuth = new DefaultThreadStoreAuth(
        currentUser.id,
        'editor' // Default role - can be made dynamic later
      );

      // Create and return YjsThreadStore
      return new YjsThreadStore(
        currentUser.id,
        threadsMap,
        threadStoreAuth
      );
    } catch (error) {
      console.error('[CollaborationContext] Error creating thread store:', error);
      return null;
    }
  }, [collaboration.yjsDocument, currentUser]);

  // Update collaboration ref
  useEffect(() => {
    collaborationRef.current = collaboration;
  }, [collaboration]);

  // Monitor authentication state for user updates
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const user: CollaborationUser = {
          id: session.user.id,
          name: session.user.user_metadata?.name || session.user.email || 'Anonymous User',
          email: session.user.email,
          avatar: session.user.user_metadata?.avatar_url,
          color: generateUserColor(session.user.id),
          isActive: true,
          lastSeen: new Date().toISOString(),
        };
        setCurrentUser(user);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        await leaveSession();
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase]);

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

  // Initialize collaboration for a document
  const initializeCollaboration = useCallback((
    docId: string, 
    userId?: string, 
    userName?: string, 
    userColor?: string
  ) => {
    console.log('[CollaborationContext] Initializing collaboration for document:', docId);
    
    setDocumentId(docId);
    setIsCollaborationEnabled(true);
    
    if (userId && userName) {
      const user: CollaborationUser = {
        id: userId,
        name: userName,
        color: userColor || generateUserColor(userId),
        isActive: true,
        lastSeen: new Date().toISOString(),
      };
      setCurrentUser(user);
    }
  }, [generateUserColor]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Clear connection error when connection is restored
  useEffect(() => {
    if (collaboration.isConnected) {
      setConnectionError(null);
    }
  }, [collaboration.isConnected]);

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