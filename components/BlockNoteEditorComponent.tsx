'use client';

import React, { RefObject } from 'react';
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
} from '@blocknote/react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { useFollowUpStore } from '@/lib/stores/followUpStore';

import { Quote, Bold, Italic, Underline, Strikethrough, Code, Link, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

interface BlockNoteEditorComponentProps {
  initialContent?: PartialBlock[];
  editorRef: RefObject<BlockNoteEditor | null>;
  onEditorContentChange?: (editor: BlockNoteEditorType) => void;
  theme?: 'light' | 'dark';
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
    >
      <Quote size={18} />
    </Components.FormattingToolbar.Button>
  );
}

const BlockNoteEditorComponent: React.FC<BlockNoteEditorComponentProps> = ({
  initialContent,
  editorRef,
  onEditorContentChange,
  theme = 'light',
}) => {
  const editor = useCreateBlockNote({ initialContent });

  React.useImperativeHandle(
    editorRef,
    () => editor,
    [editor]
  );

  return (
    <BlockNoteView 
      editor={editor} 
      theme={theme} 
      onChange={() => onEditorContentChange?.(editor)}
      formattingToolbar={false}
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
          </FormattingToolbar>
        )}
      />
    </BlockNoteView>
  );
};

export default BlockNoteEditorComponent;