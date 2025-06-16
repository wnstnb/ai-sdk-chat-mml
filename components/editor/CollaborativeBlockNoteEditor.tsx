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
import {
  BlockNoteViewEditor,
  ThreadsSidebar,
  FloatingComposerController,
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
}>();

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

  // Get comment functionality from CollaborationContext
  const { threadStore, resolveUsers } = useCollaborationContext();

  // Create BlockNote editor with collaboration and comments
  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
    collaboration: provider ? {
      // The Yjs Provider responsible for transporting updates
      provider,
      // Where to store BlockNote data in the Y.Doc - use document-specific fragment
      fragment: doc.getXmlFragment(`document-store-${documentId}`),
      // Information (name and color) for this user - include session info for unique identification
      user: {
        name: sessionId ? `${userName || 'Anonymous'} (${sessionId.split('_')[2]?.substr(0, 4) || 'A'})` : (userName || 'Anonymous'),
        color: userColor || getRandomColor(),
      },
    } : undefined,
    // Add comment support when enabled and threadStore is available
    comments: enableComments && threadStore ? {
      threadStore,
    } : undefined,
    // Add resolveUsers function for comment user resolution
    resolveUsers: enableComments ? resolveUsers : undefined,
  }, [provider, initialContent, sessionId, userName, userColor, documentId, enableComments, threadStore, resolveUsers]);

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

  // Debug comment interactions
  useEffect(() => {
    if (!editor || !enableComments || !threadStore) return;

    console.log('[CollaborativeEditor] Setting up comment interaction debugging');
    
    // Try to listen for comment-related events
    const handleSelectionChange = () => {
      try {
        const selection = editor.getTextCursorPosition();
        console.log('[CollaborativeEditor] Selection changed:', selection);
        
        // Check if there are any comments at the current position
        if (typeof threadStore.getThreads === 'function') {
          const threads = threadStore.getThreads();
          console.log('[CollaborativeEditor] Current threads:', {
            threadsCount: threads instanceof Map ? threads.size : 0,
            threads: threads instanceof Map ? Array.from(threads.entries()) : threads
          });
        }
      } catch (error) {
        console.error('[CollaborativeEditor] Error in selection change handler:', error);
      }
    };

    // Listen for selection changes
    editor.onSelectionChange(handleSelectionChange);
    
    return () => {
      // Cleanup if needed
    };
  }, [editor, enableComments, threadStore]);

  // Expose editor to parent via ref
  useEffect(() => {
    if (editorRef && editor) {
      (editorRef as any).current = editor;
    }
  }, [editorRef, editor]);

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
      <div className="collaboration-status text-xs text-gray-500 mb-2 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          !provider 
            ? 'bg-yellow-500' 
            : !!provider 
              ? 'bg-green-500' 
              : 'bg-red-500'
        }`} />
        <span>
          {!provider 
            ? useCollaboration 
              ? 'Waiting for authentication...' 
              : 'Working offline - changes saved locally'
            : !!provider 
              ? 'Connected - real-time collaboration active'
              : 'Connecting to collaboration server...'}
        </span>
      </div>

      {/* Follow BlockNote documentation pattern for comments with sidebar */}
      {enableComments && threadStore ? (
        <BlockNoteView
          editor={editor}
          renderEditor={false}
          comments={false}
          theme={theme}
          className="block-note-view"
        >
          <div className="editor-layout-wrapper flex">
            <div className="editor-section flex-1">
              <BlockNoteViewEditor />
              <FloatingComposerController />
            </div>
            
            <div className="threads-sidebar-section w-80 bg-gray-50 border-l border-gray-200 dark:bg-gray-800 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Comments</h3>
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
      ) : (
        <BlockNoteView
          editor={editor}
          renderEditor={false}
          comments={false}
          theme={theme}
          className="block-note-view"
        >
          <div className="editor-layout-wrapper flex">
            <div className="editor-section flex-1">
              <BlockNoteViewEditor />
            </div>
          </div>
        </BlockNoteView>
      )}
    </div>
  );
};

// Custom comparison function for React.memo to prevent unnecessary re-renders
const arePropsEqual = (prevProps: CollaborativeBlockNoteEditorProps, nextProps: CollaborativeBlockNoteEditorProps) => {
  // Compare all props except onEditorContentChange (which is often recreated)
  const propsToCompare: (keyof CollaborativeBlockNoteEditorProps)[] = [
    'documentId', 'initialContent', 'theme', 'userId', 'userName', 
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