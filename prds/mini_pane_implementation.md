# PRD: Chat Mini-Pane Implementation

## 1. Overview

This document outlines the implementation details for a "mini-pane" feature for the chat interface. The goal is to allow users to view and interact with the full chat history in a compact, overlayed panel when the main chat sidebar is collapsed, enhancing contextual awareness and workflow efficiency without fully interrupting their primary focus on the document.

!IMPORTANT: 
*   Implementation should NOT Cause loss of EXISTING functionality for users to view messages, interact with message bubbles, add to editor, searching for tagged documents via chat, etc.
*   Implentation should NOT cause loss of functionality for messages to be STORED and RETRIEVED by the app.
*   Implementation should EXTEND functionality of the messages pane, meaning all its current functionality SHOULD WORK in the mini-pane. It is supposed to be a smaller version of it.

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
    *   Ensure it defaults to `'full'` if not provided.
2.  **Update `ChatMessagesList` Component (`components/editor/ChatMessagesList.tsx`):**
    *   Accept the `displayMode` prop.
    *   Pass the `displayMode` prop down to each `ChatMessageItem` component instance.
    *   Conditionally render the "No Messages" placeholder:
        *   If `displayMode` is `'mini'`, render a very compact version (e.g., `<div className="text-center p-2 text-xs text-zinc-500"><p>No messages yet.</p></div>`).
        *   Else, render the existing `motion.div` placeholder.
    *   Conditionally adapt the `isLoadingMessages` indicator:
        *   If `displayMode` is `'mini'`, consider using a smaller spinner or more concise text.
        *   Else, use the existing "Loading messages..." text.
    *   The `isChatLoading` (assistant responding) indicator might be suitable for both modes as is, but review for potential scaling if needed in mini mode.
3.  **Identify/Prepare the Parent Component:**
    *   Locate the React component that currently manages the pinned chat input bar and the logic for the message preview (and its recall button).
    *   In this parent component, introduce a new state variable: `const [isMiniPaneOpen, setIsMiniPaneOpen] = useState(false);`.
4.  **Modify Preview Recall Button Logic:**
    *   Update the event handler for the button (that currently recalls the message preview) to toggle the `isMiniPaneOpen` state (e.g., `setIsMiniPaneOpen(prev => !prev);`).

### Phase 2: `ChatMessageItem` Adaptation for Mini Mode

**Goal:** Implement the compact visual representation for individual messages.

1.  **Modify `ChatMessageItemProps` in `components/editor/ChatMessageItem.tsx`:**
    *   Add an optional prop `displayMode?: 'full' | 'mini';`.
2.  **Update `ChatMessageItem` Component (`components/editor/ChatMessageItem.tsx`):**
    *   Accept the `displayMode` prop.
    *   Based on `displayMode === 'mini'`:
        *   Apply conditional styling (e.g., using `clsx` or utility classes) to reduce font sizes for message text, sender, and timestamps.
        *   Reduce padding and margins within and around the item.
        *   Use smaller avatars for user/bot icons (or make them optional if space is extremely tight).
        *   Re-style action buttons ("Send to Editor," "Add Tagged Document"):
            *   Consider using smaller icon-only buttons.
            *   Alternatively, reveal actions on hover to save static space.
        *   For images or complex data within messages: ensure they scale down gracefully or have a simplified representation in mini mode. The `getTextFromDataUrl` usage might need review if images are handled differently.

### Phase 3: Mini-Pane Container and Display Logic

**Goal:** Render and style the mini-pane overlay.

1.  **In the Parent Component (from Phase 1.3):**
    *   Conditionally render the mini-pane container `div` when `isMiniPaneOpen` is `true`.
    *   **Styling the Container:**
        *   `position: absolute` (or `fixed` depending on the relation to the pinned input bar's positioning).
        *   `z-index` to ensure it overlays other content.
        *   `bottom`: Position it anchored above the pinned input bar.
        *   `left`, `right` or `width`: Define its horizontal span (e.g., match pinned input bar width).
        *   `max-height`: (e.g., `200px` or `250px`).
        *   `overflow-y: auto` for scrollability.
        *   `background-color`, `border`, `border-radius`, `box-shadow` for visual appearance and separation.
    *   Inside this container, render `<ChatMessagesList ... chatMessages={chatMessages} ... displayMode="mini" />`, passing all necessary props.
2.  **Implement "Click-Off" to Close:**
    *   Add a `useEffect` hook in the parent component that listens for clicks outside the mini-pane.
    *   If `isMiniPaneOpen` is true and a click occurs outside the mini-pane container AND outside the toggle button, set `isMiniPaneOpen` to `false`. (Requires careful handling of refs to the pane and button).

### Phase 4: Refinements and Testing

**Goal:** Polish the UX, test thoroughly, and address any visual or functional issues.

1.  **Visual Polish:**
    *   Fine-tune all `mini` mode styles for `ChatMessagesList` and `ChatMessageItem` for clarity, aesthetics, and information density.
    *   Ensure scrollbar styling (`styled-scrollbar`) is applied and looks good in the compact view.
    *   Verify the transition/animation of the mini-pane appearing/disappearing (if any).
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