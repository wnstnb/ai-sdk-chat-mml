'use client';

import React, { RefObject } from 'react';
import { Block, BlockNoteEditor, PartialBlock } from '@blocknote/core';
import type { BlockNoteEditor as BlockNoteEditorType } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

// Type for the editor update operations, mirroring the PRD
export type EditorUpdateOperation = {
  operation:
    | 'insertBlocks'
    | 'updateBlock'
    | 'removeBlocks'
    | 'replaceBlocks'
    | 'insertInlineContent'
    | 'addStyles'
    | 'removeStyles'
    | 'toggleStyles'
    | 'createLink';
  args: any[];
};

interface BlockNoteEditorComponentProps {
  initialContent?: PartialBlock[];
  editorRef: RefObject<BlockNoteEditor | null>; // To expose editor instance
  onEditorContentChange?: (editor: BlockNoteEditorType) => void; // Changed signature to pass editor instance
}

const BlockNoteEditorComponent: React.FC<BlockNoteEditorComponentProps> = ({
  initialContent,
  editorRef,
  onEditorContentChange, // Destructure the new prop
}) => {
  // Creates a new editor instance.
  const editor = useCreateBlockNote({ initialContent });

  // Expose editor instance via ref
  React.useImperativeHandle(
    editorRef,
    () => editor,
    [editor]
  );

  // Renders the editor instance using a React component.
  return <BlockNoteView editor={editor} theme="light" onChange={onEditorContentChange} />;
};

export default BlockNoteEditorComponent; 