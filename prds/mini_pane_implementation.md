# PRD: Chat Mini-Pane Implementation

## 1. Overview

This document outlines the implementation details for a "mini-pane" feature for the chat interface. The goal is to allow users to view and interact with the full chat history in a compact, overlayed panel when the main chat sidebar is collapsed, enhancing contextual awareness and workflow efficiency without fully interrupting their primary focus on the document.

!IMPORTANT: 
*   Implementation should NOT Cause loss of EXISTING functionality for users to view messages, interact with message bubbles, add to editor, searching for tagged documents via chat, etc.
*   Implentation should NOT cause loss of functionality for messages to be STORED and RETRIEVED by the app.
*   Implementation should EXTEND functionality of the messages pane, meaning all its current functionality SHOULD WORK in the mini-pane. It is supposed to be a smaller version of it.
*  To reiterate: ALL EXISTING FUNCTIONALITY OF THE MESSAGES WORKS 100% TODAY. **ANY LOSS OF EXISTING FUNCTIONALITY (tool calls, links, formatting, etc.) FROM IMPLEMENTING IS NOT ACCEPTABLE.** If changes are required: existing functionality/format MUST be restored after change is done.

## 2. User Experience and Interaction Flow

### 2.1. Default Collapsed State

*   The main chat sidebar is collapsed by the user.
*   The pinned chat input remains visible at the bottom (or designated area) of the screen.
*   A preview of the most recent message will appear near the pinned chat input, as per the current system.
*   After a brief period, this live preview will fade out.
*   A button (e.g., "Show Chat" or an icon button) will be persistently visible on or near the pinned chat input bar. This button was previously used to recall the faded preview.

### 2.2. Accessing the Mini-Pane

*   The user clicks the "Show Chat" button on the pinned chat input bar.
*   This action triggers the opening of the mini-pane.

### 2.3. Mini-Pane Active State

*   **Appearance:**
    *   The mini-pane appears as an overlay on top of the main document content. It should not push or reflow the document.
    *   It is anchored to the pinned chat input bar (e.g., appearing directly above it).
    *   It will have a defined `max-height` (e.g., 200-250px, TBD) and a `width` (e.g., same width as the pinned input bar, or slightly wider, TBD).
    *   The content within the mini-pane will be scrollable vertically if the message history exceeds the `max-height`.
*   **Content:**
    *   The mini-pane displays a list of all messages from the current chat session.
    *   This list is a compact version of the existing `ChatMessagesList` component.
*   **Functionality:**
    *   Users can scroll through the entire message history.
    *   All existing message item functionalities, such as "Send to Editor" and "Add Tagged Document," remain available for each message, adapted for the compact view.
    *   Loading indicators for new messages or initial history loading will be present in a compact form.
    *   The "No messages yet" placeholder will also be adapted for the smaller space.

### 2.4. Closing the Mini-Pane

The mini-pane can be closed through one of the following actions:
*   **Button Toggle:** Clicking the same "Show Chat" button (which opened the mini-pane) will now toggle it closed. The button's visual state (e.g., icon or label) may change to indicate it will close the pane if clicked.
*   **Click-Off:** Clicking anywhere outside the bounds of the mini-pane and the "Show Chat" button will dismiss the mini-pane.

## 3. Component Implementation Strategy

### 3.1. Parent Component (Managing Pinned Input and Mini-Pane)

*   A parent component (likely the one currently managing the pinned chat input and the message preview logic) will be responsible for the mini-pane's state.
*   It will maintain a state variable, e.g., `isMiniPaneOpen: boolean`.
*   The "Show Chat" button will toggle this state.
*   This component will conditionally render the mini-pane container based on `isMiniPaneOpen`.
*   The mini-pane container will be a `div` styled with appropriate `position: absolute` (or `fixed`), `z-index`, `max-height`, `width`, `overflow-y: auto`, `background`, `border`, `box-shadow`, etc., to achieve the overlay effect.

### 3.2. `ChatMessagesList.tsx` Adaptation

*   The existing `ChatMessagesList` component will be made more versatile by introducing a new optional prop, e.g., `displayMode: 'full' | 'mini'`.
    *   If `displayMode` is not provided, it defaults to `'full'` to maintain current behavior in the main chat sidebar.
    *   When used in the mini-pane, `displayMode="mini"` will be passed.
*   This `displayMode` prop will be passed down to `ChatMessageItem` components.
*   **Internal Adaptations:**
    *   **Loading Indicators:** The `isLoadingMessages` (initial load) and `isChatLoading` (assistant response) indicators will render in a more compact form when `displayMode` is `'mini'`. For instance, "Loading messages..." text might become a smaller spinner.
    *   **"No Messages" Placeholder:** The placeholder shown when there are no messages will be significantly smaller and more concise in `'mini'` mode.

### 3.3. `ChatMessageItem.tsx` Adaptation (Assumed Component)

*   The `ChatMessageItem` component will need to be modified to render differently based on the `displayMode` prop received from `ChatMessagesList`.
*   **Stylistic Changes for `'mini'` mode:**
    *   Reduced font sizes for message content, sender names, and timestamps.
    *   Tighter padding and margins around and within message items.
    *   Smaller avatars/icons for user/bot.
    *   Action buttons ("Send to Editor," "Add Tagged Document") might be smaller, use icons only, or appear on hover to save space.
    *   Longer messages might be truncated with a "read more" affordance within the item, or rely on the pane's scrolling.

## 4. Styling and Visuals

*   The mini-pane should have a clean, unobtrusive design that feels like a natural extension of the pinned chat input.
*   It should visually separate from the document content beneath it (e.g., using a subtle border and/or box shadow).
*   Scrollbars within the mini-pane should be styled to be minimal yet functional (e.g., `styled-scrollbar` class if already in use).

## 5. Future Considerations (Optional)

*   Keyboard navigation within the mini-pane.
*   Resizing the mini-pane (if deemed necessary).
*   Remembering the open/closed state of the mini-pane across sessions or page reloads (might be overly complex for initial version).

This outlines the core requirements and implementation approach for the chat mini-pane feature. 

## 6. Implementation Phases and Steps

This section details the phased approach to implementing the mini-pane feature.

### Phase 1: Core Logic and `ChatMessagesList` Adaptation

**Goal:** Enable `ChatMessagesList` to support a compact display mode and prepare the foundational state management.

1.  **Modify `ChatMessagesListProps` in `components/editor/ChatMessagesList.tsx`:**
    *   Add an optional prop `displayMode?: 'full' | 'mini';`.
    *   Set the default value in the component's destructuring: `displayMode = 'full'`.
2.  **Update `ChatMessagesList` Component (`components/editor/ChatMessagesList.tsx`):**
    *   Accept the `displayMode` prop.
    *   Pass the `displayMode` prop down to each `ChatMessageItem` component instance.
    *   Conditionally render the "No Messages" placeholder:
        *   If `displayMode` is `'mini'`, render a very compact version (e.g., `<div className="text-center p-2 text-xs text-zinc-500"><p>No messages.</p></div>`).
        *   Else, render the existing `motion.div` placeholder.
    *   Conditionally adapt the `isLoadingMessages` (initial history load) indicator:
        *   If `displayMode` is `'mini'`, use more concise text like "Loading..." or a small, unobtrusive spinner icon. The existing three-dot animation used for `isChatLoading` (assistant responding) is already suitable for mini mode if reused or adapted.
        *   Else, use the existing "Loading messages..." text.
3.  **Identify/Prepare the Parent Component (`app/editor/[documentId]/page.tsx`):**
    *   This component already manages chat visibility (`isChatCollapsed`, `mobileVisiblePane`) and the toggle button.
    *   In this parent component, introduce a new state variable: `const [isMiniPaneOpen, setIsMiniPaneOpen] = useState(false);`.
4.  **Integrate Mini-Pane Toggle Logic:**
    *   **State Management in `app/editor/[documentId]/page.tsx`:**
        *   Confirm the state `const [isMiniPaneOpen, setIsMiniPaneOpen] = useState(false);` is present.
        *   Define the callback: `const handleToggleMiniPane = () => setIsMiniPaneOpen(prev => !prev);`.
    *   **Prop Drilling from `app/editor/[documentId]/page.tsx` down to `components/editor/ChatInputArea.tsx` (potentially through `EditorPaneWrapper.tsx`):**
        *   Pass `isMiniPaneOpen` (Boolean, for the button's visual state if it changes, e.g., tooltip text).
        *   Pass `onToggleMiniPane` (the function defined above).
        *   Pass `isMainChatCollapsed` (Boolean, derived from `isChatCollapsed` or `mobileVisiblePane !== 'chat'` in `page.tsx`). This determines the new button's visibility.
    *   **New Mini-Pane Toggle Button in `components/editor/ChatInputArea.tsx`:**
        *   Receive `isMainChatCollapsed`, `isMiniPaneOpen`, and `onToggleMiniPane` as props.
        *   Conditionally render a *new, distinct button* if `isMainChatCollapsed` is `true`. This button is specifically for the mini-pane and is separate from the existing main chat pane toggle.
            *   **Placement:** Position this button appropriately within the `ChatInputArea` layout, near the input field.
            *   **Styling:** Style to be clear and accessible, fitting with the existing UI controls.
            *   **Icon:** Use a suitable icon (e.g., chat history, stacked messages icon).
            *   **Action:** Its `onClick` handler must call the received `onToggleMiniPane` function.
            *   **Tooltip/Aria-label:** Dynamically set based on `isMiniPaneOpen` (e.g., "Show Chat History" / "Hide Chat History").
    *   **Ensure Existing Main Chat Toggle in `app/editor/[documentId]/page.tsx` Closes Mini-Pane:**
        *   Modify the `handleToggleChat` function (or the logic that toggles the main chat pane visibility).
        *   When this function is invoked to *open* the main chat pane (i.e., `isChatCollapsed` becomes `false`, or on mobile, `mobileVisiblePane` becomes `'chat'`), it must also ensure the mini-pane is closed by calling `setIsMiniPaneOpen(false)`.

### Phase 2: `ChatMessageItem` Adaptation for Mini Mode

**Goal:** Implement the compact visual representation for individual messages.

1.  **Modify `ChatMessageItemProps` in `components/editor/ChatMessageItem.tsx`:**
    *   Add an optional prop `displayMode?: 'full' | 'mini';` (defaulting to `'full'` if not passed, e.g., `displayMode = 'full'` in destructuring).
2.  **Update `ChatMessageItem` Component (`components/editor/ChatMessageItem.tsx`):**
    *   Accept the `displayMode` prop.
    *   Based on `displayMode === 'mini'`:
        *   Apply conditional styling (e.g., using `clsx` or utility classes) to reduce font sizes for message text, sender, and timestamps.
        *   Reduce padding and margins within and around the item.
        *   Use smaller avatars for user/bot icons.
        *   Re-style action buttons ("Send to Editor," "Add Tagged Document"):
            *   Use smaller icon-only buttons.
            *   Alternatively, reveal actions on hover.
        *   For images or complex data within messages (e.g., previews from `TextFilePreview` if used, or image parts): ensure they scale down gracefully. The `getTextFromDataUrl` function seems primarily for `TextFilePreview` and might not directly impact standard message rendering unless data URLs are embedded in message content for text extraction, which is unlikely for main display. Focus on visual scaling of image parts if they appear in messages.

### Phase 3: Mini-Pane Container and Display Logic

**Goal:** Render and style the mini-pane overlay.

1.  **In `app/editor/[documentId]/page.tsx` (Parent Component):**
    *   Conditionally render the mini-pane container `div` when `isMiniPaneOpen` is `true` AND the main chat pane is collapsed (`isChatCollapsed` is true, or on mobile, `mobileVisiblePane` is not `'chat'`).
    *   **Styling the Container:**
        *   `position: fixed` (or `absolute` relative to a full-viewport wrapper if available) to overlay the document.
        *   `bottom`: Position it anchored above/near the pinned chat input area. The exact value will depend on the pinned input's height and desired spacing.
        *   `left`, `right` or `width`: Define its horizontal span. E.g., `width: 'clamp(300px, 40%, 500px)'` centered, or aligned to one side spanning a portion of the screen. Values TBD, subject to design.
        *   `max-height`: e.g., `'250px'` or `'30vh'`.
        *   `z-index`: A high value (e.g., `1050` if other overlays like modals are `1000`).
        *   `overflow-y: auto` for scrollability.
        *   `background-color`, `border`, `border-radius`, `box-shadow` for visual appearance. E.g., `bg-[--input-bg]`, `border border-[--border-color]`, `rounded-md`, `shadow-lg`.
        *   Implement a subtle fade-in animation (e.g., using `framer-motion` if already in use, or simple CSS transitions).
    *   Inside this container, render `<ChatMessagesList ... chatMessages={chatMessages} ... displayMode="mini" />`, passing all necessary props.
2.  **Implement "Click-Off" to Close in `app/editor/[documentId]/page.tsx`:**
    *   Add a `useEffect` hook that listens for clicks on `document`.
    *   If `isMiniPaneOpen` is true and a click occurs outside the mini-pane container (use a ref for the container) AND outside the mini-pane toggle button (if that button is separate and also needs a ref), set `isMiniPaneOpen` to `false`. (Requires careful `ref.current.contains(event.target)` checks).

### Phase 4: Refinements and Testing

**Goal:** Polish the UX, test thoroughly, and address any visual or functional issues.

1.  **Visual Polish:**
    *   Fine-tune all `mini` mode styles for `ChatMessagesList` and `ChatMessageItem` for clarity, aesthetics, and information density.
    *   Ensure scrollbar styling (`styled-scrollbar`) is applied and looks good in the compact view.
    *   Verify the subtle fade-in animation for the mini-pane.
2.  **Functional Testing:**
    *   Test all message types (text, with data, tool calls if applicable) in mini mode.
    *   Verify all actions ("Send to Editor," "Add Tagged Document") work correctly from the mini-pane.
    *   Test scrolling behavior with many messages.
    *   Test loading states.
    *   Test the "No messages" placeholder.
    *   Confirm the toggle button and click-off mechanisms for opening/closing work reliably across different scenarios.
    *   **Data Integrity Check:** Verify that messages appearing in the mini-pane are identical to those in the full chat view (if both can be made visible for comparison, or by checking against the underlying data source). Ensure that any new messages sent or received are correctly stored and consistently reflected in both the mini-pane (when opened/reopened) and the main chat view, confirming no data divergence or loss due to the mini-pane's presence.
3.  **Cross-Browser/Responsive Testing (if applicable):**
    *   Ensure the mini-pane looks and works consistently if the application supports various browsers or screen sizes where this feature would be active.

This phased approach should allow for incremental development and testing of the mini-pane feature. 