'use client';

import React, { RefObject, useEffect, useCallback, useState, useRef } from 'react';
import { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import type { BlockNoteEditor as BlockNoteEditorType } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  useBlockNoteEditor,
  useComponentsContext,
  BlockTypeSelect,
  BasicTextStyleButton,
  TextAlignButton,
  ColorStyleButton,
  CreateLinkButton,
  NestBlockButton,
  UnnestBlockButton,
} from '@blocknote/react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { useFollowUpStore } from '@/lib/stores/followUpStore';
import { useCollaborativeDocument } from '@/lib/hooks/editor/useCollaborativeDocument';
import { Quote } from 'lucide-react';

interface CollaborativeBlockNoteEditorProps {
  documentId: string;
  initialContent?: PartialBlock[];
  editorRef: RefObject<BlockNoteEditor | null>;
  onEditorContentChange?: (editor: BlockNoteEditorType) => void;
  theme?: 'light' | 'dark';
  userId?: string;
  userName?: string;
  userColor?: string;
  onCollaborativeChange?: (blocks: PartialBlock[]) => void;
  onUsersChange?: (users: any[]) => void;
}

function AddFollowUpButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const setFollowUpContext = useFollowUpStore((state) => state.setFollowUpContext);

  const handleAddForFollowUp = () => {
    console.log("[FollowUp Button] Clicked!");
    if (!editor) {
      console.error("[FollowUp Button] Editor instance not found.");
      return;
    }
    const selectedText = editor.getSelectedText();
    console.log("[FollowUp Button] Selected Text:", selectedText);

    if (selectedText) {
      console.log("[FollowUp Button] Calling setFollowUpContext with:", selectedText);
      setFollowUpContext(selectedText);
    } else {
      console.log("[FollowUp Button] No text selected, not setting context.");
    }
  };

  return (
    <Components.FormattingToolbar.Button
      mainTooltip="Add selection for follow-up"
      onClick={handleAddForFollowUp}
      className="p-1"
    >
      <Quote size={18} className="block min-w-[18px] min-h-[18px]" />
    </Components.FormattingToolbar.Button>
  );
}

const CollaborativeBlockNoteEditor: React.FC<CollaborativeBlockNoteEditorProps> = ({
  documentId,
  initialContent = [],
  editorRef,
  onEditorContentChange,
  theme = 'light',
  userId = 'anonymous',
  userName = 'Anonymous User',
  userColor = '#3b82f6',
  onCollaborativeChange,
  onUsersChange,
}) => {
  const [isCollaborativeReady, setIsCollaborativeReady] = useState(false);
  const [editorBlocks, setEditorBlocks] = useState<PartialBlock[]>(initialContent);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Track if we're in the middle of applying external changes to prevent loops
  const isApplyingExternalChanges = useRef(false);
  const lastEditorUpdateTime = useRef<number>(0);
  const updateThrottleTimeout = useRef<NodeJS.Timeout | null>(null);

  // Initialize collaborative document with enhanced error handling
  const {
    yjsDocument,
    blocks: collaborativeBlocks,
    activeUsers,
    isReady: isYjsReady,
    isConnected,
    connectionState,
    updateContent,
    updateUserPresence,
    refreshConnection,
    cleanup,
  } = useCollaborativeDocument({
    documentId,
    initialContent,
    userId,
    userName,
    userColor,
    onContentChange: (blocks) => {
      console.log('[CollaborativeEditor] Yjs content changed:', blocks.length, 'blocks');
      
      // Only update if we're not currently applying external changes
      if (!isApplyingExternalChanges.current) {
        setEditorBlocks(blocks);
        onCollaborativeChange?.(blocks);
      }
    },
    onUsersChange: (users) => {
      console.log('[CollaborativeEditor] Active users changed:', users.length);
      onUsersChange?.(users);
    },
    onConnectionError: (error) => {
      console.error('[CollaborativeEditor] Connection error:', error.message);
      setConnectionError(error.message);
    },
    onAuthError: (error) => {
      console.error('[CollaborativeEditor] Authentication error:', error.message);
      setAuthError(error.message);
    },
  });

  // Create BlockNote editor with enhanced configuration
  const editor = useCreateBlockNote({ 
    initialContent: editorBlocks.length > 0 ? editorBlocks : initialContent
    // Note: BlockNote collaboration would be configured here if using their built-in Yjs provider
    // For now, we handle collaboration through our custom Yjs integration
  });

  // Set up editor ref
  React.useImperativeHandle(
    editorRef,
    () => editor,
    [editor]
  );

  // Enhanced editor content change handler with throttling and conflict prevention
  const handleEditorChange = useCallback(() => {
    if (!editor || !isYjsReady || isApplyingExternalChanges.current) {
      return;
    }

    // Throttle updates to prevent excessive network traffic
    if (updateThrottleTimeout.current) {
      clearTimeout(updateThrottleTimeout.current);
    }

    updateThrottleTimeout.current = setTimeout(() => {
      const currentBlocks = editor.document;
      const currentTime = Date.now();
      
      // Only update if enough time has passed since last update
      if (currentTime - lastEditorUpdateTime.current > 100) {
        console.log('[CollaborativeEditor] Editor content changed:', currentBlocks.length, 'blocks');
        
        setIsSyncing(true);
        
        // Update Yjs document with new content
        updateContent(currentBlocks);
        
        lastEditorUpdateTime.current = currentTime;
        
        // Call the original change handler
        onEditorContentChange?.(editor);
        
        // Clear syncing state after a short delay
        setTimeout(() => setIsSyncing(false), 300);
      }
    }, 50); // Debounce rapid changes
  }, [editor, isYjsReady, updateContent, onEditorContentChange]);

  // Enhanced bidirectional sync with conflict resolution
  useEffect(() => {
    if (!editor || !isYjsReady || collaborativeBlocks.length === 0) return;

    // Prevent applying changes if we're already in the middle of an update
    if (isApplyingExternalChanges.current) return;

    const editorContent = editor.document;
    const collaborativeContent = collaborativeBlocks;

    // More sophisticated content comparison
    const editorJson = JSON.stringify(editorContent);
    const collaborativeJson = JSON.stringify(collaborativeContent);

    if (editorJson !== collaborativeJson) {
      console.log('[CollaborativeEditor] Syncing collaborative content to editor');
      
      // Mark that we're applying external changes
      isApplyingExternalChanges.current = true;
      setIsSyncing(true);
      
      try {
        // Use BlockNote's built-in method to replace content smoothly
        editor.replaceBlocks(editor.document, collaborativeContent);
      } catch (error) {
        console.error('[CollaborativeEditor] Error applying collaborative changes:', error);
      } finally {
        // Always reset the flag
        setTimeout(() => {
          isApplyingExternalChanges.current = false;
          setIsSyncing(false);
        }, 100);
      }
    }
  }, [editor, collaborativeBlocks, isYjsReady]);

  // Enhanced user presence tracking with cursor positions
  useEffect(() => {
    if (!editor || !isYjsReady) return;

    const updatePresenceWithCursor = () => {
      try {
        // Get cursor position if available
        const selection = editor.getTextCursorPosition();
        
        updateUserPresence({
          user: {
            name: userName,
            color: userColor,
            cursor: {
              anchor: 0, // For now, use simple positioning
              head: 0,   // BlockNote's TextCursorPosition doesn't have anchor/head
            },
          },
        });
      } catch (error) {
        // Fallback to basic presence without cursor
        updateUserPresence({
          user: {
            name: userName,
            color: userColor,
          },
        });
      }
    };

    // More comprehensive event listeners
    const events = ['focus', 'blur', 'click', 'keyup', 'selectionchange'];
    const domElement = editor.domElement;

    if (domElement) {
      events.forEach(event => {
        domElement.addEventListener(event, updatePresenceWithCursor);
      });

      // Initial presence update
      updatePresenceWithCursor();

      return () => {
        events.forEach(event => {
          domElement.removeEventListener(event, updatePresenceWithCursor);
        });
      };
    }
  }, [editor, isYjsReady, updateUserPresence, userName, userColor]);

  // Set collaborative ready state
  useEffect(() => {
    setIsCollaborativeReady(isYjsReady && !!editor);
  }, [isYjsReady, editor]);

  // Clear errors when connection is restored
  useEffect(() => {
    if (isConnected) {
      setConnectionError(null);
      setAuthError(null);
    }
  }, [isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateThrottleTimeout.current) {
        clearTimeout(updateThrottleTimeout.current);
      }
      cleanup();
    };
  }, [cleanup]);

  // Handle connection retry
  const handleRetryConnection = useCallback(async () => {
    try {
      await refreshConnection();
      setConnectionError(null);
      setAuthError(null);
    } catch (error) {
      console.error('[CollaborativeEditor] Retry failed:', error);
    }
  }, [refreshConnection]);

  // User avatars component for showing active collaborators
  const renderActiveUsers = () => {
    if (!isConnected || activeUsers.length === 0) return null;

    return (
      <div className="flex items-center gap-1 ml-2">
        {activeUsers.slice(0, 5).map((user, index) => (
          <div
            key={user.userId || index}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white"
            style={{ backgroundColor: user.user?.color || '#3b82f6' }}
            title={user.user?.name || 'Anonymous User'}
          >
            {(user.user?.name || 'A').charAt(0).toUpperCase()}
          </div>
        ))}
        {activeUsers.length > 5 && (
          <div className="text-xs text-gray-500 ml-1">
            +{activeUsers.length - 5} more
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="collaborative-editor">
      {/* Enhanced collaboration status indicator */}
      <div className="collaboration-status text-xs text-gray-500 mb-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div 
            className={`w-2 h-2 rounded-full transition-colors duration-200 ${
              isCollaborativeReady && isConnected ? 'bg-green-500' : 
              connectionState?.isReconnecting ? 'bg-yellow-500' : 
              'bg-red-500'
            }`}
          />
          <span>
            {isCollaborativeReady && isConnected 
              ? 'Collaborative editing active' 
              : connectionState?.isReconnecting 
                ? `Reconnecting... (${connectionState.reconnectAttempts}/10)`
                : 'Connecting to collaboration server...'}
          </span>
          
          {isSyncing && isConnected && (
            <span className="text-blue-600 animate-pulse">Syncing...</span>
          )}
        </div>

        {activeUsers.length > 0 && isConnected && (
          <span>({activeUsers.length} user{activeUsers.length > 1 ? 's' : ''} online)</span>
        )}

        {renderActiveUsers()}

        {/* Connection error display */}
        {connectionError && (
          <div className="flex items-center gap-2 text-red-600">
            <span className="text-xs">Connection issue: {connectionError}</span>
            <button
              onClick={handleRetryConnection}
              className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Auth error display */}
        {authError && (
          <div className="text-red-600 text-xs">
            Auth error: {authError}
          </div>
        )}
      </div>

      <BlockNoteView 
        editor={editor} 
        theme={theme} 
        onChange={handleEditorChange}
        formattingToolbar={false}
        className={`collaborative-blocknote-editor ${isSyncing ? 'syncing' : ''}`}
      >
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              <AddFollowUpButton key={"addFollowUpButton"} />
              <BlockTypeSelect key={"blockTypeSelect"} />
              <BasicTextStyleButton basicTextStyle={"bold"} key={"boldStyleButton"} />
              <BasicTextStyleButton basicTextStyle={"italic"} key={"italicStyleButton"} />
              <BasicTextStyleButton basicTextStyle={"underline"} key={"underlineStyleButton"} />
              <BasicTextStyleButton basicTextStyle={"strike"} key={"strikeStyleButton"} />
              <BasicTextStyleButton basicTextStyle={"code"} key={"codeStyleButton"} />
              <TextAlignButton textAlignment={"left"} key={"textAlignLeftButton"} />
              <TextAlignButton textAlignment={"center"} key={"textAlignCenterButton"} />
              <TextAlignButton textAlignment={"right"} key={"textAlignRightButton"} />
              <CreateLinkButton key={"createLinkButton"} />
              <NestBlockButton key={"nestBlockButton"} />
              <UnnestBlockButton key={"unnestBlockButton"} />
            </FormattingToolbar>
          )}
        />
      </BlockNoteView>
      
      {/* Add some custom CSS for the syncing state */}
      <style jsx>{`
        .collaborative-blocknote-editor.syncing {
          opacity: 0.95;
          transition: opacity 0.2s ease;
        }
      `}</style>
    </div>
  );
};

export default CollaborativeBlockNoteEditor; 