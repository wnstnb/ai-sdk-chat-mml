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

  console.log('[CollaborativeEditor] COMPONENT MOUNTED - Initial render', {
    componentId: componentId.current,
    documentId,
    userId,
    userName,
    viewport: isMobileViewport ? 'mobile' : 'desktop'
  });

  console.log('[CollaborativeEditor] Rendering for document:', documentId, {
    isMobileViewport,
    userId,
    userName,
    hasInitialContent: initialContent.length > 0
  });

  // DIRECT CALL: Bypass useMemo to fix collaboration issue
  const createCollaborationInstance = () => {
    console.log('[CollaborativeEditor] Creating collaboration instance for:', {
      documentId,
      userId,
      useCollaboration,
      partyKitHost: process.env.NEXT_PUBLIC_PARTYKIT_HOST
    });

    // CRITICAL: If there's already a global instance for a different document, destroy it
    if (globalEditorInstance && globalEditorInstance.documentId !== documentId) {
      console.log('[CollaborativeEditor] DESTROYING EXISTING GLOBAL INSTANCE for different document:', {
        existingDocId: globalEditorInstance.documentId,
        newDocId: documentId
      });
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
      
      console.log('[CollaborativeEditor] CHECKING EXISTING GLOBAL INSTANCE for document:', documentId, {
        hasProvider,
        hasDoc: !!globalEditorInstance.doc,
        needsCollaboration,
        collaborationMatch: needsCollaboration === hasProvider
      });
      
      // If collaboration needs match, reuse the instance
      if (needsCollaboration === hasProvider) {
        console.log('[CollaborativeEditor] REUSING EXISTING GLOBAL INSTANCE - collaboration needs match');
        return {
          doc: globalEditorInstance.doc,
          provider: globalEditorInstance.provider,
          sessionId: globalEditorInstance.sessionId
        };
      } else {
        // Collaboration needs don't match - destroy and recreate
        console.log('[CollaborativeEditor] DESTROYING EXISTING GLOBAL INSTANCE - collaboration needs changed:', {
          needsCollaboration,
          hasProvider
        });
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
    console.log('[CollaborativeEditor] CREATING NEW GLOBAL INSTANCE for document:', documentId);

    if (!useCollaboration || !userId || userId === 'anonymous') {
      console.log('[CollaborativeEditor] Collaboration disabled or no user - creating local-only document');
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
    
    console.log('[CollaborativeEditor] Creating PartyKit provider with:', {
      documentId,
      sessionId,
      userId,
      partyKitHost: process.env.NEXT_PUBLIC_PARTYKIT_HOST
    });

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

    console.log('[CollaborativeEditor] Created new document instance:', {
      documentId,
      sessionId,
      hasProvider: !!provider,
      componentId: componentId.current
    });

    return { doc, provider, sessionId };
  };
  
  const { doc, provider, sessionId } = createCollaborationInstance();

  // Get comment functionality from CollaborationContext
  const { threadStore, resolveUsers } = useCollaborationContext();

  // Check provider connection state - YPartyKitProvider doesn't expose 'connected' property
  // but we know it's working when provider exists
  const isConnected = !!provider;

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

  console.log('[CollaborativeEditor] Editor created with config:', {
    hasInitialContent: initialContent.length > 0,
    hasCollaboration: !!provider,
    enableComments: false
  });

  // Handle editor content changes
  useEffect(() => {
    if (!editor) return;

    const handleChange = () => {
      console.log('[CollaborativeEditor] Editor content changed');
      if (onEditorContentChange) {
        onEditorContentChange(editor);
      }
    };

    editor.onChange(handleChange);
  }, [editor, onEditorContentChange]);

  // Expose editor to parent via ref
  useEffect(() => {
    if (editorRef && editor) {
      (editorRef as any).current = editor;
    }
  }, [editorRef, editor]);

  // CRITICAL: Cleanup when component unmounts or document changes
  useEffect(() => {
    return () => {
      console.log('[CollaborativeEditor] Component unmounting or document changing, cleaning up global instance for:', {
        componentId: componentId.current,
        documentId,
        isGlobalInstance: globalEditorInstance?.componentId === componentId.current
      });
      
      // Only clean up if this component created the global instance
      if (globalEditorInstance && globalEditorInstance.componentId === componentId.current) {
        console.log('[CollaborativeEditor] Destroying global instance created by this component');
        
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
      } else {
        console.log('[CollaborativeEditor] Not cleaning up - global instance belongs to different component');
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
  console.log('[CollaborativeEditor] RENDERING COLLABORATIVE EDITOR', { 
    componentId: componentId.current,
    hasProvider: !!provider,
    isConnected
  });

  return (
    <div className="collaborative-editor">
      <div className="collaboration-status text-xs text-gray-500 mb-2 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          !provider 
            ? 'bg-yellow-500' 
            : isConnected 
              ? 'bg-green-500' 
              : 'bg-red-500'
        }`} />
        <span>
          {!provider 
            ? useCollaboration 
              ? 'Waiting for authentication...' 
              : 'Working offline - changes saved locally'
            : isConnected 
              ? 'Connected - real-time collaboration active'
              : 'Connecting to collaboration server...'
          }
        </span>
      </div>

      <BlockNoteView 
        editor={editor} 
        theme={theme}
        formattingToolbar={true}
        linkToolbar={true}
        sideMenu={true}
        slashMenu={true}
        filePanel={true}
        tableHandles={true}
      />
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
      console.log('[CollaborativeEditor] Prop changed, re-rendering:', prop, {
        prev: prevProps[prop],
        next: nextProps[prop]
      });
      return false;
    }
  }
  
  // Special handling for initialContent array comparison
  if (Array.isArray(prevProps.initialContent) && Array.isArray(nextProps.initialContent)) {
    if (prevProps.initialContent.length !== nextProps.initialContent.length) {
      console.log('[CollaborativeEditor] initialContent length changed, re-rendering');
      return false;
    }
  }
  
  console.log('[CollaborativeEditor] Props are equal, preventing re-render');
  return true;
};

CollaborativeBlockNoteEditor.displayName = 'CollaborativeBlockNoteEditor';

export default React.memo(CollaborativeBlockNoteEditor, arePropsEqual); 