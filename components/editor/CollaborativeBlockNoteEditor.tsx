'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  useCreateBlockNote,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import * as Y from 'yjs';
import YPartyKitProvider from 'y-partykit/provider';
import { useCollaborationContext } from '@/contexts/CollaborationContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useDocumentPermissions } from '@/hooks/useDocumentPermissions';

import {
  BlockNoteViewEditor,
  // COMMENTED OUT: Comment UI imports temporarily disabled - see comment-system-challenges-prd.md
  // ThreadsSidebar,
  // FloatingComposerController,
} from '@blocknote/react';

// Mobile breakpoint query constant
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)';

// Simple useMediaQuery hook implementation
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mediaQueryList.matches);
    mediaQueryList.addEventListener('change', listener);

    return () => mediaQueryList.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

interface CollaborativeBlockNoteEditorProps {
  documentId: string;
  editorRef?: React.MutableRefObject<any>;
  initialContent?: any[];
  onEditorContentChange?: (editor: any) => void;
  theme?: 'light' | 'dark';
  userId?: string;
  userName?: string;
  userColor?: string;
  onUsersChange?: (users: any[]) => void;
  enableComments?: boolean;
  useCollaboration?: boolean;
}

// User awareness state interface
interface UserAwarenessState {
  user?: {
    id: string;
    name: string;
    color: string;
  };
}

// Color palette for user cursors
const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)];

// Global singleton to ensure only one editor instance exists at a time
let globalEditorInstance: {
  documentId: string;
  doc: Y.Doc;
  provider: YPartyKitProvider;
  sessionId: string;
  componentId: string;
} | null = null;

// Global map to track document instances (keep existing for compatibility)
const documentInstances = new Map<string, {
  doc: Y.Doc;
  provider: YPartyKitProvider;
  sessionId: string;
  editor?: any; // Add editor to the instance tracking
}>();

// Make document instances globally accessible for thread store
if (typeof globalThis !== 'undefined') {
  (globalThis as any).__blockNoteDocumentInstances = documentInstances;
}

const CollaborativeBlockNoteEditor = ({
  documentId,
  editorRef,
  initialContent = [],
  onEditorContentChange,
  theme = 'light',
  userId,
  userName,
  userColor,
  onUsersChange,
  enableComments = false,
  useCollaboration = true
}: CollaborativeBlockNoteEditorProps) => {
  // Fetch document permissions to determine edit capabilities
  const {
    userPermission,
    canEdit,
    canComment,
    canView,
    isLoading: permissionsLoading,
    error: permissionsError,
    refreshPermissions
  } = useDocumentPermissions(documentId);
  
  // Get user profile data to use the most up-to-date username
  const { profile } = useUserProfile();
  
  // Use profile username if available, otherwise fall back to prop
  const effectiveUserName = profile?.username || userName || 'Anonymous User';
  
  // Only add session info for anonymous/fallback users, not for real usernames
  const hasRealUsername = !!profile?.username;
  
      console.log('[CollaborativeBlockNoteEditor] Component rendering with props:', {
      documentId,
      enableComments,
      hasUserId: !!userId,
      userName,
      profileUsername: profile?.username,
      effectiveUserName,
      hasRealUsername,
      useCollaboration,
      initialContentLength: initialContent?.length || 0
    });

  const componentId = useRef(`editor-${Math.random().toString(36).substr(2, 9)}`);
  const isMobileViewport = useMediaQuery(MOBILE_BREAKPOINT_QUERY);

  // DIRECT CALL: Bypass useMemo to fix collaboration issue
  const createCollaborationInstance = () => {
    // CRITICAL: If there's already a global instance for a different document, destroy it
    if (globalEditorInstance && globalEditorInstance.documentId !== documentId) {
      try {
        if (globalEditorInstance.provider) {
          globalEditorInstance.provider.destroy();
        }
        globalEditorInstance.doc.destroy();
      } catch (error) {
        console.error('[CollaborativeEditor] Error during cleanup:', error);
      }
      documentInstances.delete(globalEditorInstance.documentId);
      globalEditorInstance = null;
    }

    // REUSE: If there's already a global instance for this document, check if it matches our collaboration needs
    if (globalEditorInstance && globalEditorInstance.documentId === documentId) {
      const needsCollaboration = useCollaboration && userId && userId !== 'anonymous';
      const hasProvider = !!globalEditorInstance.provider;
      
      // If collaboration needs match, reuse the instance
      if (needsCollaboration === hasProvider) {
        return {
          doc: globalEditorInstance.doc,
          provider: globalEditorInstance.provider,
          sessionId: globalEditorInstance.sessionId
        };
      } else {
        // Collaboration needs don't match - destroy and recreate
        try {
          if (globalEditorInstance.provider) {
            globalEditorInstance.provider.destroy();
          }
          globalEditorInstance.doc.destroy();
        } catch (error) {
          console.error('[CollaborativeEditor] Error during cleanup:', error);
        }
        documentInstances.delete(globalEditorInstance.documentId);
        globalEditorInstance = null;
      }
    }

    // Create new instance
    if (!useCollaboration || !userId || userId === 'anonymous') {
      const localDoc = new Y.Doc();
      const localSessionId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      
      globalEditorInstance = {
        documentId,
        doc: localDoc,
        provider: null as any, // No provider for local-only
        sessionId: localSessionId,
        componentId: componentId.current
      };
      
      return {
        doc: localDoc,
        provider: null as any,
        sessionId: localSessionId
      };
    }

    // Create Y.js document and PartyKit provider
    const doc = new Y.Doc();
    const sessionId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    
    const provider = new YPartyKitProvider(
      process.env.NEXT_PUBLIC_PARTYKIT_HOST!,
      `document-${documentId}`,
      doc,
      {
        params: {
          sessionId,
          userId: userId || 'anonymous'
        }
      }
    );

    // Store in global singleton
    globalEditorInstance = {
      documentId,
      doc,
      provider,
      sessionId,
      componentId: componentId.current
    };

    // Also store in documentInstances for compatibility
    documentInstances.set(documentId, { doc, provider, sessionId });

    return { doc, provider, sessionId };
  };
  
  const { doc, provider, sessionId } = createCollaborationInstance();

  // COMMENTED OUT: Comment functionality temporarily disabled - see comment-system-challenges-prd.md
  // Get comment functionality from CollaborationContext
  const { threadStore, resolveUsers } = useCollaborationContext();

  // Debug comment setup
  // useEffect(() => {
  //   console.log('[CollaborativeEditor] Comment setup debug:', {
  //     enableComments,
  //     hasThreadStore: !!threadStore,
  //     hasResolveUsers: !!resolveUsers,
  //     userId,
  //     userName,
  //     documentId
  //   });
  // }, [enableComments, threadStore, resolveUsers, userId, userName, documentId]);

  // Create BlockNote editor with collaboration and comments
  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
    collaboration: provider ? {
      // The Yjs Provider responsible for transporting updates
      provider,
      // Where to store BlockNote data in the Y.Doc - use document-specific fragment
      fragment: doc.getXmlFragment(`document-store-${documentId}`),
      // Information (name and color) for this user - include session info only for anonymous/fallback users
      user: {
        name: hasRealUsername 
          ? effectiveUserName 
          : sessionId 
            ? `${effectiveUserName} (${sessionId.split('_')[2]?.substr(0, 4) || 'A'})` 
            : effectiveUserName,
        color: userColor || getRandomColor(),
      },
    } : undefined,
    // COMMENTED OUT: Comment support temporarily disabled - see comment-system-challenges-prd.md
    // Add comment support when enabled and threadStore is available
    // comments: enableComments && threadStore ? {
    //   threadStore,
    // } : undefined,
    // Add resolveUsers function for comment user resolution
    // resolveUsers: enableComments ? resolveUsers : undefined,
  }, [provider, initialContent, sessionId, effectiveUserName, userColor, documentId, enableComments, threadStore, resolveUsers]);

  // Debug editor creation
  useEffect(() => {
    if (editor) {
      // COMMENTED OUT: Comment debug logging temporarily disabled - see comment-system-challenges-prd.md
      // console.log('[CollaborativeEditor] Editor created with config:', {
      //   hasEditor: !!editor,
      //   hasComments: enableComments && !!threadStore,
      //   commentsConfig: enableComments && threadStore ? { threadStore: !!threadStore } : undefined,
      //   hasResolveUsers: !!resolveUsers,
      //   editorType: editor.constructor.name
      // });
      
      // Update the documentInstances with the editor instance
      const existingInstance = documentInstances.get(documentId);
      if (existingInstance) {
        documentInstances.set(documentId, {
          ...existingInstance,
          editor: editor
        });
        console.log('[CollaborativeEditor] Updated documentInstances with editor for:', documentId);
      }
    }
  }, [editor, enableComments, threadStore, resolveUsers, documentId]);

  // Initialize Y.js document with database content if it's empty
  useEffect(() => {
    if (!editor || !provider || !initialContent || initialContent.length === 0) return;
    
    // Wait for the provider to connect and sync
    const initializeContent = () => {
      try {
        const currentBlocks = editor.document;
        console.log('[CollaborativeEditor] Checking if Y.js document needs initialization:', {
          currentBlocksLength: currentBlocks.length,
          hasInitialContent: initialContent.length > 0,
          firstBlockType: currentBlocks[0]?.type,
          firstBlockContentType: typeof currentBlocks[0]?.content
        });

        // Only initialize if the collaborative document is empty and we have initial content
        const isEmptyDocument = currentBlocks.length === 0 || 
          (currentBlocks.length === 1 && (
            !currentBlocks[0].content || 
            (Array.isArray(currentBlocks[0].content) && currentBlocks[0].content.length === 0)
          ));

        if (isEmptyDocument && initialContent.length > 0) {
          console.log('[CollaborativeEditor] Initializing Y.js document with database content:', initialContent);
          editor.replaceBlocks(editor.document, initialContent);
          console.log('[CollaborativeEditor] Successfully initialized Y.js document with database content');
        } else {
          console.log('[CollaborativeEditor] Y.js document already has content or no initial content to set');
        }
      } catch (error) {
        console.error('[CollaborativeEditor] Error initializing Y.js document with database content:', error);
      }
    };

    if (provider.wsconnected) {
      // Provider is already connected, initialize immediately
      initializeContent();
    } else {
      // Wait for provider to connect
      const handleConnection = () => {
        console.log('[CollaborativeEditor] Provider connected, initializing content');
        setTimeout(initializeContent, 100); // Small delay to ensure sync is complete
        provider.off('status', handleConnection);
      };
      provider.on('status', ({ status }: { status: string }) => {
        if (status === 'connected') {
          handleConnection();
        }
      });
    }
  }, [editor, provider, initialContent, documentId]);

  // Handle editor content changes
  useEffect(() => {
    if (!editor) return;

    const handleChange = () => {
      if (onEditorContentChange) {
        onEditorContentChange(editor);
      }
    };

    editor.onChange(handleChange);
  }, [editor, onEditorContentChange]);

  // COMMENTED OUT: Comment interaction debugging temporarily disabled - see comment-system-challenges-prd.md
  // Debug comment interactions
  // useEffect(() => {
  //   if (!editor || !enableComments || !threadStore) return;

  //   console.log('[CollaborativeEditor] Setting up comment interaction debugging');
    
  //   // Try to listen for comment-related events
  //   const handleSelectionChange = () => {
  //     try {
  //       const selection = editor.getTextCursorPosition();
  //       console.log('[CollaborativeEditor] Selection changed:', selection);
        
  //       // Also check for text selection
  //       const textSelection = editor.getSelection();
  //       console.log('[CollaborativeEditor] Text selection:', textSelection);
        
  //       // Check if there are any comments at the current position
  //       if (typeof threadStore.getThreads === 'function') {
  //         const threads = threadStore.getThreads();
  //         console.log('[CollaborativeEditor] Current threads:', {
  //           threadsCount: threads instanceof Map ? threads.size : 0,
  //           threads: threads instanceof Map ? Array.from(threads.entries()) : threads
  //         });
  //       }
  //     } catch (error) {
  //       console.error('[CollaborativeEditor] Error in selection change handler:', error);
  //     }
  //   };

  //   // Listen for selection changes
  //   editor.onSelectionChange(handleSelectionChange);
    
  //   // Additional debugging for BlockNote events
  //   editor.onChange(() => {
  //     console.log('[CollaborativeEditor] Editor content changed');
  //   });
    
  //   return () => {
  //     // Cleanup if needed
  //   };
  // }, [editor, enableComments, threadStore]);

  // Expose editor to parent via ref
  useEffect(() => {
    if (editorRef && editor) {
      (editorRef as any).current = editor;
      
      // Also update the global instance for thread store access
      const existingInstance = documentInstances.get(documentId);
      if (existingInstance) {
        documentInstances.set(documentId, {
          ...existingInstance,
          editor: editor
        });
      }
    }
  }, [editorRef, editor, documentId]);

  // CRITICAL: Cleanup when component unmounts or document changes
  useEffect(() => {
    return () => {
      if (globalEditorInstance && globalEditorInstance.componentId === componentId.current) {
        try {
          if (globalEditorInstance.provider) {
            globalEditorInstance.provider.destroy();
          }
          globalEditorInstance.doc.destroy();
        } catch (error) {
          console.error('[CollaborativeEditor] Error during cleanup:', error);
        }
        
        // Clean up from documentInstances map
        documentInstances.delete(documentId);
        globalEditorInstance = null;
      }
    };
  }, [documentId]);

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Loading editor...</p>
        </div>
      </div>
    );
  }

  // Render standard collaborative editor
  return (
    <div className="collaborative-editor">

      {/* 
      COMMENTED OUT: Comment UI temporarily disabled - see comment-system-challenges-prd.md
      Follow BlockNote documentation pattern for comments with sidebar 
      */}
      {/* {enableComments && threadStore ? (
        <BlockNoteView
          editor={editor}
          renderEditor={false}
          comments={false}
          theme={theme}
          className="block-note-view"
        >
          <div className="editor-layout-wrapper flex">
            <div className="editor-section flex-1">
              {/* Clear corrupted threads button
              <div className="mb-2 p-2 bg-red-100 border border-red-300 rounded">
                <button 
                  onClick={() => {
                    console.log('[Clear] Clearing corrupted threads map...');
                    
                    if (doc) {
                      try {
                        const threadsMap = doc.getMap('threads');
                        console.log('[Clear] Before clearing - threads map size:', threadsMap.size);
                        console.log('[Clear] Before clearing - entries:', Array.from(threadsMap.entries()));
                        
                        // Clear all entries from the threads map
                        threadsMap.clear();
                        
                        console.log('[Clear] After clearing - threads map size:', threadsMap.size);
                        console.log('[Clear] Threads map cleared successfully');
                        
                        // Force a page refresh to restart with clean state
                        setTimeout(() => {
                          window.location.reload();
                        }, 500);
                        
                      } catch (error) {
                        console.error('[Clear] Error clearing threads map:', error);
                      }
                    } else {
                      console.error('[Clear] Y.js document not available');
                    }
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm mr-2"
                >
                  Clear Corrupted Threads & Refresh
                </button>
                <span className="ml-2 text-xs text-gray-600">
                  Use this to fix Y.js thread corruption errors
                </span>
              </div>
              
              <BlockNoteViewEditor />
              <FloatingComposerController />
            </div>
            
            <div className="threads-sidebar-section w-80 bg-gray-50 border-l border-gray-200 dark:bg-gray-800 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Comments</h3>
                {/* Debug thread store state
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  <div>Thread store: {threadStore ? 'Connected' : 'Not connected'}</div>
                  {threadStore && (
                    <div>
                      Has getThreads: {typeof threadStore.getThreads === 'function' ? 'Yes' : 'No'}
                    </div>
                  )}
                  {/* Add real-time thread count
                  {threadStore && typeof threadStore.getThreads === 'function' && (
                    <div>
                      Thread count: {(() => {
                        try {
                          const threads = threadStore.getThreads();
                          if (threads instanceof Map) {
                            return threads.size;
                          } else if (Array.isArray(threads)) {
                            return (threads as any[]).length;
                          } else if (threads && typeof threads === 'object') {
                            return Object.keys(threads).length;
                          }
                          return 'Unknown';
                        } catch (e) {
                          return 'Error';
                        }
                      })()}
                    </div>
                  )}
                </div>
              </div>
              <ThreadsSidebar 
                key={`threads-${documentId}-${componentId.current}`}
                filter="open"
                sort="position"
                maxCommentsBeforeCollapse={5}
              />
            </div>
          </div>
        </BlockNoteView>
      ) : ( */}
        <BlockNoteView
          editor={editor}
          renderEditor={false}
          comments={false}
          theme={theme}
          // PERMISSION ENFORCEMENT: Set editor to readonly mode for viewers
          editable={canEdit}
          // PERMISSION ENFORCEMENT: Hide UI features for non-editors
          formattingToolbar={canEdit}
          slashMenu={canEdit}
          sideMenu={canEdit}
          className="block-note-view"
        >
          <div className="editor-layout-wrapper flex">
            <div className="editor-section flex-1">
              <BlockNoteViewEditor />
            </div>
          </div>
        </BlockNoteView>
      {/* )} */}
    </div>
  );
};

// Custom comparison function for React.memo to prevent unnecessary re-renders
const arePropsEqual = (prevProps: CollaborativeBlockNoteEditorProps, nextProps: CollaborativeBlockNoteEditorProps) => {
  // Compare all props except onEditorContentChange (which is often recreated)
  const propsToCompare: (keyof CollaborativeBlockNoteEditorProps)[] = [
    'documentId', 'initialContent', 'theme', 'userId', 
    'userColor', 'enableComments', 'useCollaboration'
  ];
  
  for (const prop of propsToCompare) {
    if (prevProps[prop] !== nextProps[prop]) {
      return false;
    }
  }
  
  // Special handling for initialContent array comparison
  if (Array.isArray(prevProps.initialContent) && Array.isArray(nextProps.initialContent)) {
    if (prevProps.initialContent.length !== nextProps.initialContent.length) {
      return false;
    }
  }
  
  return true;
};

CollaborativeBlockNoteEditor.displayName = 'CollaborativeBlockNoteEditor';

export default React.memo(CollaborativeBlockNoteEditor, arePropsEqual); 