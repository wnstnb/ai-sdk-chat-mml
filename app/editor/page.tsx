/* eslint-disable @next/next/no-img-element */
"use client";

import {
  AttachmentIcon,
  BotIcon,
  UserIcon,
  VercelIcon,
  SendIcon,
} from "@/components/icons";
import { useChat } from "ai/react";
import { DragEvent, useEffect, useRef, useState, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { ModelSelector } from "@/components/ModelSelector";
import { Block, BlockNoteEditor, PartialBlock, InlineContent, BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from "@blocknote/core";
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Wrench, SendToBack } from 'lucide-react';
import { DocumentPlusIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { webSearch } from "@/lib/tools/exa-search"; // Import the webSearch tool

// Define the schema used by the editor (assuming default for now)
const schema = BlockNoteSchema.create();

// --- CONSTANTS ---
const INITIAL_MESSAGE_COUNT = 20;
const MESSAGE_LOAD_BATCH_SIZE = 20;
const INITIAL_CHAT_PANE_WIDTH_PERCENT = 35; // Initial width as a percentage
const MIN_CHAT_PANE_WIDTH_PX = 250;        // Minimum pixel width
const MAX_CHAT_PANE_WIDTH_PERCENT = 70;     // Maximum width as a percentage

// Helper function to extract text from BlockNote InlineContent[]
const getInlineContentText = (content: InlineContent<typeof schema.inlineContentSchema, typeof schema.styleSchema>[]): string => {
  let text = "";
  for (const item of content) {
    if (item.type === "text") {
      text += item.text;
    } else if (item.type === "link") {
      // Recursively get text from link's content
      text += getInlineContentText(item.content);
    } // Add other inline content types if needed (e.g., mentions)
  }
  return text;
};

// --- NEW HELPER FUNCTIONS for Inline Content Manipulation ---

/**
 * Replaces the first occurrence of targetText with replacementText within InlineContent[].
 * Note: This is a simplified version. It finds the first text node containing the target
 * and replaces it. It doesn't handle cases where the target spans multiple nodes
 * or preserves complex styling perfectly across the replacement boundary.
 */
const replaceTextInInlineContent = (
  content: InlineContent<typeof schema.inlineContentSchema, typeof schema.styleSchema>[],
  targetText: string,
  replacementText: string
): InlineContent<typeof schema.inlineContentSchema, typeof schema.styleSchema>[] | null => {
  const newContent: InlineContent<typeof schema.inlineContentSchema, typeof schema.styleSchema>[] = [];
  let replaced = false;

  for (const item of content) {
    if (!replaced && item.type === "text" && item.text.includes(targetText)) {
      // Found the text node containing the target
      const parts = item.text.split(targetText);
      const before = parts.shift() || ""; // Text before the target
      const after = parts.join(targetText); // Text after (rejoin if target appeared multiple times)

      if (before) {
        newContent.push({ ...item, text: before });
      }
      // Insert the replacement text (as a new text node, potentially splitting styles)
      newContent.push({ type: "text", text: replacementText, styles: item.styles || {} }); // Basic style preservation
      if (after) {
        newContent.push({ ...item, text: after });
      }
      replaced = true;
    } 
    else {
      // Keep other items or text nodes that don't contain the target (if not replaced yet)
      newContent.push(item);
    }
  }

  return replaced ? newContent : null; // Return null if targetText wasn't found
};

/**
 * Deletes the first occurrence of targetText within InlineContent[].
 * Note: Similar simplification caveats as replaceTextInInlineContent.
 */
const deleteTextInInlineContent = (
  content: InlineContent<typeof schema.inlineContentSchema, typeof schema.styleSchema>[],
  targetText: string
): InlineContent<typeof schema.inlineContentSchema, typeof schema.styleSchema>[] | null => {
  // Similar logic to replace, but we insert nothing for the replacement
  const newContent: InlineContent<typeof schema.inlineContentSchema, typeof schema.styleSchema>[] = [];
  let deleted = false;

  for (const item of content) {
    if (!deleted && item.type === "text" && item.text.includes(targetText)) {
      const parts = item.text.split(targetText);
      const before = parts.shift() || "";
      const after = parts.join(targetText);

      if (before) {
        newContent.push({ ...item, text: before });
      }
      // Omit the target text
      if (after) {
        newContent.push({ ...item, text: after });
      }
      deleted = true;
    } 
    else {
      newContent.push(item);
    }
  }
  return deleted ? newContent : null;
};

// --- END NEW HELPER FUNCTIONS ---

// Dynamically import BlockNoteEditorComponent with SSR disabled
const BlockNoteEditorComponent = dynamic(
  () => import('@/components/BlockNoteEditorComponent'), 
  { 
    ssr: false, // Disable server-side rendering
    // Optional: Add a loading component while the editor loads
    loading: () => <p>Loading Editor...</p>, 
  }
);

const getTextFromDataUrl = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1];
  return window.atob(base64);
};

function TextFilePreview({ file }: { file: File }) {
  const [content, setContent] = useState<string>("");

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      setContent(typeof text === "string" ? text.slice(0, 100) : "");
    };
    reader.readAsText(file);
  }, [file]);

  return (
    <div>
      {content}
      {content.length >= 100 && "..."}
    </div>
  );
}

// --- Chat Input UI Component (JSX only) ---
interface ChatInputUIProps {
  files: FileList | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  input: string;
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (event: React.ClipboardEvent) => void;
  model: string;
  setModel: React.Dispatch<React.SetStateAction<string>>;
  handleUploadClick: () => void;
  isLoading: boolean;
}

const ChatInputUI: React.FC<ChatInputUIProps> = ({
  files,
  fileInputRef,
  handleFileChange,
  inputRef,
  input,
  handleInputChange,
  handleKeyDown,
  handlePaste,
  model,
  setModel,
  handleUploadClick,
  isLoading,
}) => {
  return (
    <>
      <AnimatePresence>
        {files && files.length > 0 && (
          <div className="flex flex-row gap-2 px-4 w-full md:px-0 mb-2 overflow-x-auto">
            {Array.from(files).map((file) =>
              file.type.startsWith("image") ? (
                <div key={file.name} className="flex-shrink-0 relative">
                  <motion.img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="rounded-md w-16 h-16 object-cover"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  />
                </div>
              ) : file.type.startsWith("text") ? (
                <motion.div
                  key={file.name}
                  className="flex-shrink-0 text-[8px] leading-1 w-20 h-16 overflow-hidden text-zinc-500 border p-1 rounded-lg bg-[--message-bg] border-[--border-color] text-[--text-color]"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <TextFilePreview file={file} />
                </motion.div>
              ) : null
            )}
          </div>
        )}
      </AnimatePresence>

      <input
        type="file"
        multiple
        accept="image/*,text/*"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col w-full bg-[--input-bg] rounded-lg p-2 border border-[--border-color] shadow-sm">
        <div className="flex-grow w-full mb-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="bg-transparent w-full outline-none text-[--text-color] placeholder-[--muted-text-color] resize-none overflow-y-auto max-h-40 align-bottom"
            placeholder="What do you want to focus on?"
            value={input}
            onChange={(e) => {
              handleInputChange(e);
              if (inputRef.current) {
                inputRef.current.style.height = 'auto';
                inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
              }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />
        </div>

        <div className="flex items-center justify-between w-full">
          <div className="pl-1 pr-2">
            <ModelSelector model={model} setModel={setModel} />
          </div>

          <div className="flex items-center space-x-2 ml-auto">
            <button
              type="button"
              onClick={handleUploadClick}
              className="p-1 rounded-md text-[--muted-text-color] hover:bg-[--hover-bg] hover:text-[--text-color] focus:outline-none"
              aria-label="Upload Files"
            >
              <span className="w-5 h-5 block">
                <AttachmentIcon aria-hidden="true" />
              </span>
            </button>
            <button
              type="submit"
              disabled={isLoading || (!input && !files)}
              className="p-1 rounded-md text-[--muted-text-color] disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:bg-[--hover-bg] enabled:hover:text-[--text-color] focus:outline-none"
              aria-label="Send message"
            >
              <span className="w-5 h-5 block">
                <SendIcon aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default function Home() {
  // Model selector state
  const [model, setModel] = useState("gemini-2.0-flash");
  const editorRef = useRef<BlockNoteEditor>(null);
  // Keep track of processed tool call IDs
  const [processedToolCallIds, setProcessedToolCallIds] = useState<Set<string>>(new Set());
  // State for controlling displayed messages
  const [displayedMessagesCount, setDisplayedMessagesCount] = useState(INITIAL_MESSAGE_COUNT);
  // State to indicate if the next submission should include full editor content
  const [includeEditorContent, setIncludeEditorContent] = useState(false);

  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  // --- NEW: State for resizable chat pane width ---
  const [chatPaneWidth, setChatPaneWidth] = useState<number | null>(null); // Start null to calculate initial based on percentage
  const [isResizing, setIsResizing] = useState(false); // Track if resizing is active
  // --- END NEW ---

  const [files, setFiles] = useState<FileList | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, input, handleSubmit, handleInputChange, isLoading, reload, stop } =
    useChat({
      api: "/api/chat",
      onError: () =>
        toast.error("You've been rate limited, please try again later!"),
      body: {
        id: model,
      },
    });

  // --- Tool Execution Logic ---

  // --- NEW: Function to get editor content as Markdown ---
  const getEditorMarkdownContent = async (): Promise<string | null> => {
    const editor = editorRef.current;
    if (!editor) {
      toast.error("Editor instance not available.");
      return null;
    }
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      console.log("Retrieved editor content as Markdown:", markdown.slice(0, 100) + "..."); // Log snippet
      return markdown;
    } catch (error) {
      console.error("Failed to get editor content as Markdown:", error);
      toast.error("Error retrieving editor content.");
      return null;
    }
  };
  // --- END NEW ---

  const executeAddContent = async (args: any) => {
    const editor = editorRef.current;
    if (!editor) {
      toast.error("Editor not available to add content.");
      return;
    }
    console.log("Executing addContent with args:", args);
    try {
      const { markdownContent, targetBlockId } = args;

      // Parse the Markdown to blocks
      const blocksToInsert = await editor.tryParseMarkdownToBlocks(markdownContent);

      if (blocksToInsert.length === 0) {
        toast.info("AI suggested adding content, but it was empty after processing.");
        return;
      }

      // Determine insertion point
      let referenceBlock = targetBlockId
        ? editor.document.find((b) => b.id === targetBlockId)
        : editor.getTextCursorPosition().block;
      
      let placement: 'before' | 'after' = 'after';
      
      // If no targetBlockId and no cursor position, insert at the end
      if (!targetBlockId && !referenceBlock) {
        referenceBlock = editor.document[editor.document.length - 1];
        placement = 'after'; // Add after the last block
      } else if (targetBlockId && !referenceBlock) {
        // Target ID was specified but not found
        console.warn(`addContent: Could not find reference block ID ${targetBlockId}, will insert at end.`);
        referenceBlock = undefined; // Ensure we fall into the insertion-at-end logic
        placement = 'after';
      }
      // If referenceBlock is still undefined (e.g., empty doc), insert at the start
      if (!referenceBlock) { // Insert at the end if no valid reference point
          console.log(`Inserting ${blocksToInsert.length} blocks at the end of the document`);
          const lastBlock = editor.document[editor.document.length - 1];
          if (lastBlock) {
            editor.insertBlocks(blocksToInsert, lastBlock.id, 'after');
          } else {
            // Document is empty, insert as the first blocks
            // BlockNote expects a valid reference ID or block for the second arg.
            // Let's try replacing the entire document content.
            editor.replaceBlocks(editor.document, blocksToInsert);
          }
      } else {
        console.log(`Inserting ${blocksToInsert.length} blocks`, placement, referenceBlock.id);
        editor.insertBlocks(blocksToInsert, referenceBlock.id, placement);
      }

      toast.success("Content added from AI.");
    } catch (error: any) {
      console.error("Failed to execute addContent:", error);
      toast.error(`Error adding content: ${error.message}`);
    }
  };

  const executeModifyContent = async (args: any) => {
    const editor = editorRef.current;
    if (!editor) {
      toast.error("Editor not available to modify content.");
      return;
    }
    console.log("Executing modifyContent with args:", args);
    try {
      const { targetBlockId, targetText, newMarkdownContent } = args;

      if (!targetBlockId) {
        toast.error("Modification failed: Missing target block ID.");
        return;
      }

      // Use editor.getBlock() which might be more robust than find()
      const targetBlock = editor.getBlock(targetBlockId);
      if (!targetBlock) {
        toast.error(`Modification failed: Block ID ${targetBlockId} not found.`);
        return;
      }

      if (targetText) {
        // --- TODO: Implement Inline Content Modification ---
        console.warn("Inline text modification requested, but not yet fully implemented.", { targetBlockId, targetText });
        toast.info("Modifying specific text within a block is not yet fully supported.");
        // Placeholder: Replace entire block for now
        const blocksToReplaceWith = await editor.tryParseMarkdownToBlocks(newMarkdownContent);
        // Ensure the block still exists before replacing
        if (editor.getBlock(targetBlock.id)) {
          editor.replaceBlocks([targetBlock.id], blocksToReplaceWith);
          toast.warning("Modified entire block (inline modification pending).");
        } else {
          toast.error(`Modification failed: Target block ${targetBlock.id} disappeared before replacement.`);
        }
        // --- IMPLEMENTATION for Inline Content Modification ---
        console.log(`Attempting to modify text "${targetText}" in block ${targetBlock.id}`);
        if (!targetBlock.content || !Array.isArray(targetBlock.content)) {
            toast.error(`Modification failed: Block ${targetBlock.id} has no modifiable content.`);
            return;
        }

        // Treat newMarkdownContent as plain text for replacement
        const updatedContent = replaceTextInInlineContent(
          targetBlock.content,
          targetText,
          newMarkdownContent // Assuming this is plain text for inline replacement
        );

        if (updatedContent) {
          // Ensure the block still exists before updating
          if (editor.getBlock(targetBlock.id)) {
            editor.updateBlock(targetBlock.id, { content: updatedContent });
            toast.success(`Text "${targetText}" modified in block.`);
          } else {
             toast.error(`Modification failed: Target block ${targetBlock.id} disappeared before update.`);
          }
        } else {
          toast.warning(`Could not find text "${targetText}" to modify in block ${targetBlock.id}.`);
        }
        // --- END IMPLEMENTATION ---

      } else {
        // Replace entire block content OR the entire list it belongs to
        const blocksToReplaceWith = await editor.tryParseMarkdownToBlocks(newMarkdownContent);

        const listBlockTypes = ['bulletListItem', 'numberedListItem', 'checkListItem'];
        let blockIdsToReplace = [targetBlock.id]; // Start with the target block

        // --- NEW LOGIC for finding related list items --- 
        if (listBlockTypes.includes(targetBlock.type)) {
          console.log(`Target block ${targetBlock.id} is a list item. Finding related list blocks.`);
          // Get all blocks in the document
          const allBlocks = editor.document;
          const targetIndex = allBlocks.findIndex(b => b.id === targetBlock.id);
          const targetLevel = (targetBlock.props as any).level ?? 0;

          if (targetIndex !== -1) {
            // Clear the initial ID, we will rebuild the list
            blockIdsToReplace = []; 
            
            // Find the actual start of this list (go backwards)
            let startIndex = targetIndex;
            while (
              startIndex > 0 &&
              allBlocks[startIndex - 1].type === targetBlock.type &&
              ((allBlocks[startIndex - 1].props as any).level ?? 0) === targetLevel
            ) {
              startIndex--;
            }
            console.log(`Deduced list start index: ${startIndex}`);

            // Find the end of this list (go forwards from start)
            let currentIndex = startIndex;
            while (
              currentIndex < allBlocks.length &&
              allBlocks[currentIndex].type === targetBlock.type &&
              ((allBlocks[currentIndex].props as any).level ?? 0) === targetLevel
            ) {
              blockIdsToReplace.push(allBlocks[currentIndex].id);
              currentIndex++;
            }
             console.log(`Found ${blockIdsToReplace.length} list items to replace starting from index ${startIndex}:`, blockIdsToReplace);
          } else {
             console.warn(`Could not find index for target block ${targetBlock.id}, replacing only the target block.`);
             blockIdsToReplace = [targetBlock.id]; // Fallback to original behavior
          }
        } else {
           console.log(`Target block ${targetBlock.id} is not a list item. Replacing only the target block.`);
           blockIdsToReplace = [targetBlock.id]; // Ensure it's just this block if not a list item
        }
        // --- END NEW LOGIC ---

        console.log(`Attempting to replace block(s) [${blockIdsToReplace.join(", ")}] with ${blocksToReplaceWith.length} new blocks.`);
        
        // Check if blocks still exist before replacing
        const existingBlockIds = blockIdsToReplace.filter(id => editor.getBlock(id));
        if (existingBlockIds.length !== blockIdsToReplace.length) {
            console.warn("Some blocks to be replaced were not found:", blockIdsToReplace.filter(id => !editor.getBlock(id)));
            if (existingBlockIds.length === 0) {
                toast.error("Modification failed: All target blocks disappeared before replacement.");
                return;
            }
            toast.warning("Some target blocks were missing, replacing the ones found.");
        }

        if (existingBlockIds.length > 0) {
          editor.replaceBlocks(existingBlockIds, blocksToReplaceWith);
          toast.success("Block content modified by AI.");
        } else {
           // This case should theoretically be caught above, but just in case.
           toast.error("Modification failed: No valid blocks found to replace.");
        }
      }
    } catch (error: any) {
      console.error("Failed to execute modifyContent:", error);
      toast.error(`Error modifying content: ${error.message}`);
    }
  };

  const executeDeleteContent = async (args: any) => {
    const editor = editorRef.current;
    if (!editor) {
      toast.error("Editor not available to delete content.");
      return;
    }
    console.log("Executing deleteContent with args:", args);
    try {
      const { targetBlockId, targetText } = args;

      if (!targetBlockId) {
        toast.error("Deletion failed: Missing target block ID(s).");
        return;
      }

      const blockIdsToDelete = Array.isArray(targetBlockId) ? targetBlockId : [targetBlockId];

      if (targetText && blockIdsToDelete.length === 1) {
        // --- TODO: Implement Inline Content Deletion ---
        const targetBlock = editor.document.find((b) => b.id === blockIdsToDelete[0]);
        if (!targetBlock) {
             toast.error(`Deletion failed: Block ID ${blockIdsToDelete[0]} not found.`);
             return;
        }
        console.warn("Inline text deletion requested, but not yet fully implemented.", { targetBlockId, targetText });
        toast.info("Deleting specific text within a block is not yet fully supported.");
        // Placeholder: Do nothing for now for inline deletion to avoid deleting whole block
        // --- IMPLEMENTATION for Inline Content Deletion ---
        console.log(`Attempting to delete text "${targetText}" in block ${targetBlock.id}`);
        if (!targetBlock.content || !Array.isArray(targetBlock.content)) {
            toast.error(`Deletion failed: Block ${targetBlock.id} has no deletable content.`);
            return;
        }

        const updatedContent = deleteTextInInlineContent(targetBlock.content, targetText);

        if (updatedContent) {
          // Ensure the block still exists before updating
          if (editor.getBlock(targetBlock.id)) {
            // Check if content became empty after deletion
            const newText = getInlineContentText(updatedContent);
            if (!newText.trim()) {
               console.log(`Content became empty after deleting "${targetText}", removing block ${targetBlock.id}`);
               editor.removeBlocks([targetBlock.id]);
               toast.success(`Removed block ${targetBlock.id} after deleting its content.`);
            } else {
               editor.updateBlock(targetBlock.id, { content: updatedContent });
               toast.success(`Text "${targetText}" deleted from block.`);
            }
          } else {
            toast.error(`Deletion failed: Target block ${targetBlock.id} disappeared before update.`);
          }
        } else {
          toast.warning(`Could not find text "${targetText}" to delete in block ${targetBlock.id}.`);
        }
        // --- END IMPLEMENTATION ---

      } else if (targetText && blockIdsToDelete.length > 1) {
        toast.warning("Cannot delete specific text across multiple blocks. Ignoring text target.");
        // Fall through to delete the blocks themselves
        console.log(`Removing blocks: ${blockIdsToDelete.join(", ")}`);
        editor.removeBlocks(blockIdsToDelete);
        toast.success("Block(s) removed by AI.");
      } else {
        // Delete entire block(s)
        console.log(`Removing blocks: ${blockIdsToDelete.join(", ")}`);
        editor.removeBlocks(blockIdsToDelete);
        toast.success("Block(s) removed by AI.");
      }

    } catch (error: any) {
      console.error("Failed to execute deleteContent:", error);
      toast.error(`Error deleting content: ${error.message}`);
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;

    if (items) {
      const files = Array.from(items)
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (files.length > 0) {
        const validFiles = files.filter(
          (file) =>
            file.type.startsWith("image/") || file.type.startsWith("text/")
        );

        if (validFiles.length === files.length) {
          const dataTransfer = new DataTransfer();
          validFiles.forEach((file) => dataTransfer.items.add(file));
          setFiles(dataTransfer.files);
        } else {
          toast.error("Only image and text files are allowed");
        }
      }
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFiles = event.dataTransfer.files;
    const droppedFilesArray = Array.from(droppedFiles);
    if (droppedFilesArray.length > 0) {
      const validFiles = droppedFilesArray.filter(
        (file) =>
          file.type.startsWith("image/") || file.type.startsWith("text/")
      );

      if (validFiles.length === droppedFilesArray.length) {
        const dataTransfer = new DataTransfer();
        validFiles.forEach((file) => dataTransfer.items.add(file));
        setFiles(dataTransfer.files);
      } else {
        toast.error("Only image and text files are allowed!");
      }

      setFiles(droppedFiles);
    }
    setIsDragging(false);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFiles(event.target.files);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  // --- Submit Handler with Editor Context ---
  const handleSubmitWithContext = async (event: React.FormEvent<HTMLFormElement> | null, // Allow null event for programmatic trigger
                                         options?: { data?: Record<string, any> } // Allow passing extra data
                                        ) => {
    if(event) event.preventDefault(); // Prevent default only if triggered by form event

    const editor = editorRef.current;
    let editorContextData = options?.data ?? {}; // Start with any pre-provided data

    // --- MODIFIED: Include full Markdown content if requested ---
    if (includeEditorContent && editor) {
      const markdownContent = await getEditorMarkdownContent();
      if (markdownContent !== null) {
         editorContextData = {
           ...editorContextData,
           editorMarkdownContent: markdownContent, // Add full markdown content
         };
         console.log("Including full editor Markdown content in submission.");
      }
       // Reset the flag after attempting to include the content
      setIncludeEditorContent(false);
    }
    // --- END MODIFICATION ---
    // Include block context snippets only if full markdown isn't being sent
    else if (editor && !editorContextData.editorMarkdownContent) {
      try {
        // Get editor blocks and create structured context (snippets)
        const currentBlocks = editor.document;
        const editorBlocksContext = currentBlocks.map((block: Block) => {
          const inlineContent = Array.isArray(block.content) ? block.content : [];
          const textContent = getInlineContentText(inlineContent);
          const snippet = textContent.slice(0, 100) + (textContent.length > 100 ? "..." : "");
          return {
            id: block.id,
            contentSnippet: snippet || `[${block.type || 'block'}]`,
          };
        });

        editorContextData = {
          editorBlocksContext: editorBlocksContext,
        };
        console.log("Sending editor context:", editorContextData);
      } catch (error) {
        console.error("Failed to create editor context:", error);
        toast.error("⚠️ Could not read editor content. Sending message without context.");
      }
    }

    // Call the original useChat handleSubmit
    handleSubmit(event || undefined, {
      ...(files ? { experimental_attachments: files } : {}),
      data: {
        id: model, // Ensure model ID is included
        ...editorContextData
      }
    });

    // Clear files and input after submission
    setFiles(null);
    if (inputRef.current) {
      inputRef.current.value = ''; // Clear the textarea value directly
      inputRef.current.style.height = 'auto'; // Reset height
    }
    // Clear the file input visually although the state is cleared
    if (fileInputRef.current) {
       fileInputRef.current.value = '';
    }
  };

  // --- Side Effects ---
   // Effect to process tool calls from messages
   useEffect(() => {
     const lastMessage = messages[messages.length - 1];

     if (lastMessage?.role === "assistant" && lastMessage.toolInvocations) {
       console.log("--- Processing Tool Invocations ---"); // Added log
       for (const toolCall of lastMessage.toolInvocations) {
         // Check if this tool call ID has already been processed
         if (processedToolCallIds.has(toolCall.toolCallId)) {
           console.log(`Skipping already processed tool call ID: ${toolCall.toolCallId}`);
           continue; // Skip already processed tool calls
         }

         const { toolName, args } = toolCall;
         // --- DETAILED LOGGING ADDED ---
         console.log(
           `[Tool Call Received] ID: ${toolCall.toolCallId}, Name: ${toolName}, Args:`,
           JSON.stringify(args, null, 2) // Log full arguments
         );
         // --- END DETAILED LOGGING ---

         // Execute the corresponding function based on toolName
         let executed = false;
         switch (toolName) {
           case "addContent":
             executeAddContent(args);
             executed = true;
             break;
           case "modifyContent":
             executeModifyContent(args);
             executed = true;
             break;
           case "deleteContent":
             executeDeleteContent(args);
             executed = true;
             break;
           case "webSearch":
             // Acknowledge webSearch, but no client-side execution needed.
             // The results will be streamed back by the backend.
             console.log("Acknowledging webSearch tool call (handled by backend).");
             executed = true; // Mark as handled to prevent unknown tool error
             break;
           // --- NEW: Handle request for editor content --- 
           case "request_editor_content":
             console.log("AI requested editor content. Flagging for next submission.");
             toast.info("AI requested editor context. It will be included in the next message.");
             setIncludeEditorContent(true);
             // Note: We don't trigger submission here. Content will be included
             // when the user sends their *next* message, or if we decide
             // to programmatically trigger a follow-up later.
             executed = true; // Mark as handled
             break;
           // --- END NEW ---
           default:
             console.error(`Unknown tool called: ${toolName}`);
             toast.error(`AI tried to use an unknown tool: ${toolName}`);
         }

         // Mark tool call as processed only if it was recognized/handled
         if (executed) {
            console.log(`[Tool Call Processed] ID: ${toolCall.toolCallId}, Name: ${toolName}`); // Added log
            setProcessedToolCallIds(prev => new Set(prev).add(toolCall.toolCallId));
         } else {
            console.warn(`[Tool Call Unhandled] ID: ${toolCall.toolCallId}, Name: ${toolName}`); // Added log for unhandled
         }
       }
       console.log("--- Finished Processing Tool Invocations ---"); // Added log
     }
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [messages, processedToolCallIds]); // Add processedToolCallIds dependency

   // Reset displayed count when messages change significantly (e.g., new chat)
   // Note: This might need refinement depending on how chats are cleared/reloaded
   useEffect(() => {
     setDisplayedMessagesCount(INITIAL_MESSAGE_COUNT);
   }, [messages.length > 0 && messages[0]?.id]); // Reset if first message id changes

   // --- NEW: Effect to calculate initial and handle window resize ---
   useEffect(() => {
     const calculateWidth = () => {
       const windowWidth = window.innerWidth;
       const initialWidth = Math.max(
         MIN_CHAT_PANE_WIDTH_PX,
         (windowWidth * INITIAL_CHAT_PANE_WIDTH_PERCENT) / 100
       );
       const potentialMaxWidth = (windowWidth * MAX_CHAT_PANE_WIDTH_PERCENT) / 100;
       // Ensure maxWidth is never less than minWidth
       const effectiveMaxWidth = Math.max(potentialMaxWidth, MIN_CHAT_PANE_WIDTH_PX);

       // Only update if not currently resizing
       if (!isResizing) {
         // If width is not set, or current width is outside the new bounds, recalculate
         if (chatPaneWidth === null || chatPaneWidth > effectiveMaxWidth || chatPaneWidth < MIN_CHAT_PANE_WIDTH_PX) {
           // Clamp the initial calculation between min and effective max
           const newWidth = Math.max(MIN_CHAT_PANE_WIDTH_PX, Math.min(initialWidth, effectiveMaxWidth));
           setChatPaneWidth(newWidth);
         }
       }
       // No need for the separate 'else if' ensuring minimum, as the clamping above handles it.
     };

     calculateWidth(); // Calculate on initial mount

     window.addEventListener('resize', calculateWidth);
     return () => window.removeEventListener('resize', calculateWidth);
   }, [isResizing, chatPaneWidth]); // Re-run if resizing stops or width is null
   // --- END NEW ---

   // --- NEW: Drag Handlers for Resizing ---
   const dragHandleRef = useRef<HTMLDivElement>(null);
   const startWidthRef = useRef<number>(0);
   const startXRef = useRef<number>(0);

   const handleMouseDownResize = (e: React.MouseEvent<HTMLDivElement>) => {
     if (!chatPaneWidth) return; // Should not happen if initialized correctly

     setIsResizing(true);
     startXRef.current = e.clientX;
     startWidthRef.current = chatPaneWidth;

     // Add listeners to window
     window.addEventListener('mousemove', handleMouseMoveResize);
     window.addEventListener('mouseup', handleMouseUpResize);
     // Add user-select none globally to prevent text selection during drag
     document.body.style.userSelect = 'none';
     document.body.style.cursor = 'col-resize'; // Optional: Set cursor globally
   };

   const handleMouseMoveResize = (e: MouseEvent) => {
     requestAnimationFrame(() => {
       const currentX = e.clientX;
       const deltaX = currentX - startXRef.current;
       const newWidth = startWidthRef.current - deltaX; // Subtract delta because we drag left handle of right pane

       const windowWidth = window.innerWidth;
       const maxWidth = (windowWidth * MAX_CHAT_PANE_WIDTH_PERCENT) / 100;

       // Clamp width between min and max
       const clampedWidth = Math.max(MIN_CHAT_PANE_WIDTH_PX, Math.min(newWidth, maxWidth));

       setChatPaneWidth(clampedWidth);
     });
   };

   const handleMouseUpResize = () => {
     setIsResizing(false);
     // Remove listeners from window
     window.removeEventListener('mousemove', handleMouseMoveResize);
     window.removeEventListener('mouseup', handleMouseUpResize);
     // Restore user-select and cursor
     document.body.style.userSelect = '';
     document.body.style.cursor = '';
   };

   // Cleanup effect for window listeners
   useEffect(() => {
     // If the component unmounts while resizing, remove listeners
     return () => {
       if (isResizing) {
         window.removeEventListener('mousemove', handleMouseMoveResize);
         window.removeEventListener('mouseup', handleMouseUpResize);
         document.body.style.userSelect = '';
         document.body.style.cursor = '';
       }
     };
   }, [isResizing]);
   // --- END NEW ---

  const handleSendToEditor = async (content: string) => {
    const editor = editorRef.current;
    if (!editor) {
      toast.error("Editor not available.");
      return;
    }
    if (!content || content.trim() === '') {
        toast.info("Cannot send empty message content to editor.");
        return;
    }

    try {
      console.log("Parsing message content for editor:", content);
      const blocksToInsert = await editor.tryParseMarkdownToBlocks(content);

      if (blocksToInsert.length === 0) {
        toast.info("Message content resulted in empty blocks after parsing.");
        return;
      }

      // Determine insertion point: after current cursor block or end of document
      const { block: currentBlock } = editor.getTextCursorPosition();
      let referenceBlockId: string | undefined = undefined;
      let placement: 'before' | 'after' = 'after';

      if (currentBlock) {
        referenceBlockId = currentBlock.id;
        placement = 'after';
        console.log(`Inserting ${blocksToInsert.length} blocks after current block: ${referenceBlockId}`);
      } else {
        // No cursor or selection, insert at the end
        const lastBlock = editor.document[editor.document.length - 1];
        if (lastBlock) {
            referenceBlockId = lastBlock.id;
            placement = 'after';
             console.log(`Inserting ${blocksToInsert.length} blocks after last block: ${referenceBlockId}`);
        } else {
          // Document is empty, replace content
          console.log(`Document empty, replacing with ${blocksToInsert.length} blocks.`);
          editor.replaceBlocks(editor.document, blocksToInsert);
          toast.success("Message content sent to editor.");
          return; // Exit early as replaceBlocks was used
        }
      }

      editor.insertBlocks(blocksToInsert, referenceBlockId, placement);
      toast.success("Message content sent to editor.");

    } catch (error: any) {
      console.error("Failed to send message content to editor:", error);
      toast.error(`Error sending content to editor: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="flex flex-row w-full h-full bg-[--bg-color]">
      
      <div className="flex-1 flex flex-col p-4 border-r border-[--border-color] relative">
        {/* Editor Title Bar - Modified */}
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-[--text-color]">Editor</h2>
          <div className="flex items-center space-x-2">
            {/* New Button */}
            <button
              // onClick={() => console.log('New clicked')} // Placeholder functionality
              className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded"
              aria-label="New File"
              title="New File" // Tooltip
            >
              <DocumentPlusIcon className="h-5 w-5" />
            </button>
            {/* Save Button */}
            <button
              // onClick={() => console.log('Save clicked')} // Placeholder functionality
              className="p-1 text-[--text-color] hover:bg-[--hover-bg] rounded"
              aria-label="Save File"
              title="Save File" // Tooltip
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* End Editor Title Bar */}
        
        <div className="flex-1 flex flex-col relative border rounded-lg bg-[--editor-bg] border-[--border-color] shadow-sm">
           <div className="flex-1 overflow-y-auto p-4">
             <BlockNoteEditorComponent editorRef={editorRef} />
           </div>
           {isChatCollapsed && (
             <div className="absolute bottom-0 left-0 right-0 p-4 pt-2 bg-[--editor-bg] border-t border-[--border-color] z-10">
               <form
                 ref={formRef}
                 onSubmit={handleSubmitWithContext}
                 className="w-full flex flex-col items-center"
               >
                 <ChatInputUI
                   files={files}
                   fileInputRef={fileInputRef}
                   handleFileChange={handleFileChange}
                   inputRef={inputRef}
                   input={input}
                   handleInputChange={handleInputChange}
                   handleKeyDown={handleKeyDown}
                   handlePaste={handlePaste}
                   model={model}
                   setModel={setModel}
                   handleUploadClick={handleUploadClick}
                   isLoading={isLoading}
                 />
               </form>
             </div>
           )}
        </div>

        <button
          onClick={() => setIsChatCollapsed(!isChatCollapsed)}
          className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 z-20 p-1 bg-[--toggle-button-bg] border border-[--border-color] rounded-full text-[--text-color] hover:bg-[--hover-bg] focus:outline-none"
          aria-label={isChatCollapsed ? 'Expand chat' : 'Collapse chat'}
        >
          {isChatCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      <motion.div
        className="flex flex-col bg-[--bg-secondary] h-full relative border-l border-[--border-color]"
        initial={false}
        animate={{
          width: isChatCollapsed ? 0 : chatPaneWidth ?? `${INITIAL_CHAT_PANE_WIDTH_PERCENT}%`,
          minWidth: isChatCollapsed ? 0 : MIN_CHAT_PANE_WIDTH_PX,
          opacity: isChatCollapsed ? 0 : 1,
          paddingLeft: isChatCollapsed ? 0 : '1rem',
          paddingRight: isChatCollapsed ? 0 : '1rem',
        }}
        transition={{ type: 'tween', duration: 0.3 }}
      >
        {/* --- NEW: Drag Handle --- */}
        {!isChatCollapsed && (
          <div
            ref={dragHandleRef}
            onMouseDown={handleMouseDownResize}
            className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize bg-gray-300/50 dark:bg-gray-600/50 hover:bg-blue-400 dark:hover:bg-blue-600 transition-colors duration-150 z-30"
            style={{ transform: 'translateX(-50%)' }} // Center handle visually on the border
          />
        )}
        {/* --- END NEW --- */}

        {!isChatCollapsed && (
          <>
            <div className="flex-1 flex flex-col gap-2 w-full items-center overflow-y-auto pr-2 pt-4 mb-4">
              {/* --- Load More Button --- */}
              {messages.length > displayedMessagesCount && (
                <button
                  onClick={() => setDisplayedMessagesCount(prevCount => Math.min(prevCount + MESSAGE_LOAD_BATCH_SIZE, messages.length))}
                  className="text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 py-2 focus:outline-none mb-2"
                >
                  Load More Messages ({messages.length - displayedMessagesCount} older)
                </button>
              )}
              {/* --- End Load More Button --- */}

              {messages.length > 0 ? (
                messages.slice(-displayedMessagesCount).map((message, index) => (
                  <motion.div
                    key={message.id}
                    className={`flex flex-row gap-2 w-full md:px-0 ${
                      index === 0 ? "pt-4" : ""
                    }`}
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                  >
                    <div className="size-[24px] flex flex-col justify-center items-center flex-shrink-0 text-zinc-400">
                      {message.role === "assistant" ? <BotIcon /> : <UserIcon />}
                    </div>
                    <div className="flex flex-col gap-1 flex-grow break-words overflow-hidden">
                      <div className="text-zinc-800 dark:text-zinc-300 flex flex-col gap-4">
                        <Markdown>{message.content}</Markdown>
                      </div>

                      {/* --- NEW: Send to Editor Button --- */}
                      {message.content && message.content.trim() !== '' && (
                        <div className="mt-1 flex justify-end">
                          <button
                            onClick={() => handleSendToEditor(message.content)}
                            className="p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                            title="Send to Editor"
                            aria-label="Send message content to editor"
                          >
                            <SendToBack size={14} />
                          </button>
                        </div>
                      )}
                      {/* --- END NEW --- */}

                      {/* Display Tool Invocations */}
                      {message.role === "assistant" && message.toolInvocations && message.toolInvocations.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-700 pt-2">
                          {message.toolInvocations.map((toolCall) => (
                            <div key={toolCall.toolCallId} className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                              <Wrench size={12} className="flex-shrink-0" />
                              <span>Using tool: <strong>{toolCall.toolName}</strong></span>
                              {/* Optionally display args: <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(toolCall.args, null, 2)}</pre> */}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* End Display Tool Invocations */}
                      <div className="flex flex-row gap-2 flex-wrap">
                        {message.experimental_attachments?.map((attachment) =>
                          attachment.contentType?.startsWith("image") ? (
                            <img
                              className="rounded-md w-32 mb-2"
                              key={attachment.name}
                              src={attachment.url}
                              alt={attachment.name}
                            />
                          ) : attachment.contentType?.startsWith("text") ? (
                            <div className="text-xs w-32 h-20 overflow-hidden text-zinc-400 border p-1 rounded-md dark:bg-zinc-800 dark:border-zinc-700 mb-2">
                              {getTextFromDataUrl(attachment.url)}
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <motion.div className="h-auto w-full pt-16">
                  <div className="border rounded-lg p-4 flex flex-col gap-3 text-zinc-500 text-sm dark:text-zinc-400 dark:border-zinc-700">
                    <p className="flex flex-row justify-center gap-2 items-center text-zinc-900 dark:text-zinc-50">
                      <VercelIcon />
                      <span>+</span>
                      <AttachmentIcon />
                    </p>
                    <p>
                      The useChat hook supports sending attachments along with
                      messages.
                    </p>
                    <p>
                      {" "}
                      Learn more about the{" "}
                      <Link
                        className="text-blue-500 dark:text-blue-400"
                        href="https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#attachments-experimental"
                        target="_blank"
                      >
                        useChat{" "}
                      </Link>
                      hook.
                    </p>
                  </div>
                </motion.div>
              )}

              {isLoading &&
                messages.length > 0 &&
                messages[messages.length - 1].role !== "assistant" && (
                  <div className="flex flex-row gap-2 w-full md:px-0">
                    <div className="size-[24px] flex flex-col justify-center items-center flex-shrink-0 text-zinc-400">
                      <BotIcon />
                    </div>
                    <div className="flex items-center gap-1 text-zinc-400">
                      {/* Animated pulsing dots */}
                      <span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                      <span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
                      <span className="h-2 w-2 bg-zinc-400 rounded-full animate-pulse"></span>
                    </div>
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>

            <div className="w-full px-4 pb-4 border-t border-[--border-color] pt-4">
              <form
                ref={formRef}
                onSubmit={handleSubmitWithContext}
                className="w-full flex flex-col items-center"
              >
                <ChatInputUI
                  files={files}
                  fileInputRef={fileInputRef}
                  handleFileChange={handleFileChange}
                  inputRef={inputRef}
                  input={input}
                  handleInputChange={handleInputChange}
                  handleKeyDown={handleKeyDown}
                  handlePaste={handlePaste}
                  model={model}
                  setModel={setModel}
                  handleUploadClick={handleUploadClick}
                  isLoading={isLoading}
                />
              </form>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}