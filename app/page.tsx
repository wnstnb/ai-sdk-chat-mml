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
import { ChevronLeft, ChevronRight, Wrench } from 'lucide-react';

// Define the schema used by the editor (assuming default for now)
const schema = BlockNoteSchema.create();

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
                  className="flex-shrink-0 text-[8px] leading-1 w-20 h-16 overflow-hidden text-zinc-500 border p-1 rounded-lg bg-white dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400"
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

      <div className="flex flex-col w-full bg-zinc-100 dark:bg-zinc-700 rounded-lg p-2 border border-zinc-200 dark:border-zinc-600 shadow-sm">
        <div className="flex-grow w-full mb-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="bg-transparent w-full outline-none text-zinc-800 dark:text-zinc-300 placeholder-zinc-400 resize-none overflow-y-auto max-h-40 align-bottom"
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

          <div className="flex items-center space-x-2 pl-2">
            <button
              type="button"
              onClick={handleUploadClick}
              className="text-zinc-500 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-100 focus:outline-none p-1 rounded-md"
              aria-label="Upload Files"
            >
              <span className="w-5 h-5 block">
                <AttachmentIcon aria-hidden="true" />
              </span>
            </button>

            <button
              type="submit"
              disabled={!input.trim() && !files || isLoading}
              className="text-zinc-500 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none p-1 rounded-md"
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

  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
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

      const targetBlock = editor.document.find((b) => b.id === targetBlockId);
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
        editor.replaceBlocks([targetBlock.id], blocksToReplaceWith);
        toast.warning("Modified entire block (inline modification pending).");
      } else {
        // Replace entire block content OR contiguous list blocks
        const blocksToReplaceWith = await editor.tryParseMarkdownToBlocks(newMarkdownContent);

        const listBlockTypes = ['bulletListItem', 'numberedListItem', 'checkListItem'];
        let blockIdsToReplace = [targetBlock.id]; // Start with the target block

        // If it's a list item, try to find contiguous items of the same type and level
        if (listBlockTypes.includes(targetBlock.type)) {
          // Safely access level, default to 0 if not present (though list items should have it)
          const targetLevel = (targetBlock.props as any).level ?? 0;
          let currentIndex = editor.document.findIndex(b => b.id === targetBlock.id);

          if (currentIndex !== -1) {
            currentIndex++; // Start checking from the next block
            while (
              currentIndex < editor.document.length &&
              editor.document[currentIndex].type === targetBlock.type &&
              ((editor.document[currentIndex].props as any).level ?? 0) === targetLevel
            ) {
              blockIdsToReplace.push(editor.document[currentIndex].id);
              currentIndex++;
            }
          }
        }

        console.log(`Replacing block(s) ${blockIdsToReplace.join(", ")} with ${blocksToReplaceWith.length} new blocks.`);
        editor.replaceBlocks(blockIdsToReplace, blocksToReplaceWith);

        toast.success("Block content modified by AI.");
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

  // Effect to process tool calls from messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === "assistant" && lastMessage.toolInvocations) {
      for (const toolCall of lastMessage.toolInvocations) {
        if (processedToolCallIds.has(toolCall.toolCallId)) {
          continue; // Skip already processed tool calls
        }

        const { toolName, args } = toolCall;
        console.log("Received tool call:", toolName, args);

        // Execute the corresponding function based on toolName
        switch (toolName) {
          case "addContent":
            executeAddContent(args);
            break;
          case "modifyContent":
            executeModifyContent(args);
            break;
          case "deleteContent":
            executeDeleteContent(args);
            break;
          default:
            console.error(`Unknown tool called: ${toolName}`);
            toast.error(`AI tried to use an unknown tool: ${toolName}`);
        }

        // Mark tool call as processed
        setProcessedToolCallIds(prev => new Set(prev).add(toolCall.toolCallId));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]); // Re-run when messages array changes

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
  const handleSubmitWithContext = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default regardless

    const editor = editorRef.current;
    let editorContextData = {};

    if (editor) {
      try {
        // Get editor blocks and create structured context
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
    handleSubmit(event, {
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

  return (
    <div className="flex flex-row h-dvh bg-white dark:bg-zinc-900 overflow-hidden">
      
      <div className="flex-1 flex flex-col p-4 border-r border-zinc-200 dark:border-zinc-700 relative">
        <h2 className="text-lg font-semibold mb-2 text-zinc-800 dark:text-zinc-200">Editor</h2>
        <div className="flex-1 flex flex-col relative border rounded-lg bg-white dark:bg-zinc-800 dark:border-zinc-700 shadow-sm overflow-hidden">
           <div className="flex-1 overflow-y-auto p-4">
             <BlockNoteEditorComponent editorRef={editorRef} />
           </div>
           {isChatCollapsed && (
             <div className="absolute bottom-0 left-0 right-0 p-4 pt-2 bg-white dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 z-10">
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
          className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 z-20 p-1 bg-zinc-200 dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 focus:outline-none"
          aria-label={isChatCollapsed ? 'Expand chat' : 'Collapse chat'}
        >
          {isChatCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      <motion.div
        className="flex flex-col bg-white dark:bg-zinc-900 h-full overflow-hidden"
        initial={false}
        animate={{
          width: isChatCollapsed ? 0 : '40%',
          minWidth: isChatCollapsed ? 0 : '300px',
          opacity: isChatCollapsed ? 0 : 1,
          paddingLeft: isChatCollapsed ? 0 : '1rem',
          paddingRight: isChatCollapsed ? 0 : '1rem',
          borderLeftWidth: isChatCollapsed ? '0px' : '1px',
        }}
        transition={{ type: 'tween', duration: 0.3 }}
        style={{ borderColor: 'inherit' }}
      >
        {!isChatCollapsed && (
          <div className="flex flex-col justify-between h-full w-full items-center pt-4">
            <div className="flex flex-col gap-2 h-full w-full items-center overflow-y-auto pr-2 mb-4">
              {messages.length > 0 ? (
                messages.map((message, index) => (
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
                    <div className="flex flex-col gap-1 text-zinc-400">
                      <div>hmm...</div>
                    </div>
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>

            <div className="w-full px-4 pb-4">
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
          </div>
        )}
      </motion.div>
    </div>
  );
}