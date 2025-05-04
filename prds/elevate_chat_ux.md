# Message Bubble for Pinned Chat Input in /editor
- When the chat pane collapsed and chat input is pinned to the bottom of the editor, the user loses sight of messages and may need to see what the AI has responded with despite working directly in the document. 
- **Proposal: have a shadcn bubble that shows the first 2 lines of the most recent message.**
    - This means to follow the style that we have for the Follow Up Context bubble, apologies if this isn't the case.
- This bubble should be positioned above the chat input the same way Follow Up context is presented. User can stay in flow with working on the document without needing to click back and forth.
- Message bubble truncates the message to show only the first 2 lines. **Hovering over the message bubble** should show the full message like a tool tip.
- This bubble will have the same button to "Add to Editor" as is used in the regular chat pane.
- Only show 1 bubble at a time (aka only the most recent message):
    - By default, **when chat pane is collapsed and pinned chat input is visible**, the most recent message bubble should be displayed and follow light/dark mode CSS.
        - The user will have the ability to **collapse** the message bubble and expand it again. The collapsed bubble should manifest as another icon in the pinned chat input, preferrably on the same row as the text input, all the the way to the right side (aka directly above the submit button)
        - **Hovering over the collapsed bubble** should show the full message as well.
    - If Follow Up context is added: we show the Follow Up Context in favor of the last message bubble. Message Bubble gets collapsed and cannot expand to replace the Follow Up context. 
    - If Follow Up context gets removed: Most recent bubble gets displayed again and can be collapsed/expanded as usual.
- To reiterate: 
    - Don't reinvent the wheel for style. Use what we already have and just style it differently.
    - This is specific to the pinned chat in /editor (**_when chat pane is collapsed and pinned chat input is visible_**). This should not affect the chat input in the chat pane nor the chat input in /launch.

## Technical Implementation Plan

- **State Management (`app/editor/[documentId]/page.tsx`):**
    - This component manages `isChatCollapsed`, `chatMessages`, and `followUpContext`.
    - Pass the last assistant message from `chatMessages` down to `EditorPaneWrapper`.
    - Pass `handleSendToEditor` down to `EditorPaneWrapper`.

- **Pinned Input Container (`components/editor/EditorPaneWrapper.tsx`):**
    - Receives `lastMessage` and `handleSendToEditor` props.
    - Introduce local state `isMessageBubbleCollapsed` (default: `false`).
    - **Conditional Rendering:**
        - If `isChatCollapsed && !followUpContext && !isMessageBubbleCollapsed`: Render `<PinnedMessageBubble />`.
        - If `isChatCollapsed && !followUpContext && isMessageBubbleCollapsed`: Render a "show message" icon button within the `ChatInputUI` area (passed as a prop).
        - If `isChatCollapsed && followUpContext`: Render the existing Follow Up context bubble (and ensure `isMessageBubbleCollapsed` is set/remains `true`).
    - Pass necessary props (`messageContent`, `onSendToEditor`, `onCollapse`) to `PinnedMessageBubble`.
    - Pass the icon button element with its `onClick` handler (to set `isMessageBubbleCollapsed = false`) and tooltip down to `ChatInputUI`.

- **New Component (`components/editor/PinnedMessageBubble.tsx`):**
    - Create this component.
    - Props: `messageContent: string`, `onSendToEditor: (content: string) => void`, `onCollapse: () => void`.
    - UI: Use shadcn `Card`, `CardContent`, `Button`, `Tooltip`. Style similarly to the follow-up bubble.
    - Content: Display `messageContent` with `line-clamp-2` CSS. Wrap in `Tooltip` for full view on hover.
    - Buttons:
        - "Add to Editor" (`SendToBack` icon): Calls `onSendToEditor(messageContent)`.
        - "Collapse" (`X` or minimize icon): Calls `onCollapse()`.

- **Chat Input UI (`components/editor/ChatInputUI.tsx`):**
    - Add optional prop `renderCollapsedMessageToggle?: React.ReactNode`.
    - Render this prop's content on the right side, near other action buttons.

- **Styling (`globals.css`):**
    - Create `.pinned-message-bubble` class.
    - Apply base styles similar to `.follow-up-text-container`:
        - `position: absolute; bottom: 100%; left: 0; right: 0;`
        - `margin-bottom: 4px;`
        - `z-index: 10;`
        - `padding: 6px 10px;` /* Slightly more padding than follow-up */
        - `border-radius: var(--radius);` /* Use theme radius */
        - `font-size: 0.875rem;` /* Slightly larger font */
        - `display: flex; align-items: center; justify-content: space-between; gap: 8px;`
        - `background-color: var(--info-bg);`
        - `border: 1px solid var(--info-border);`
        - `color: var(--info-text);`
    - Apply `.line-clamp-2` class (or utility) to the message content `div`/`p` inside the bubble for truncation.
        ```css
        .line-clamp-2 {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        ```
    - Style the internal buttons (e.g., using shadcn `Button` variants like `ghost` and size `icon` or `sm`).
    - Style the collapsed icon button (passed via `renderCollapsedMessageToggle`) to fit appropriately within the `ChatInputUI` actions area (e.g., align it with other icons).

