# Fix BlockNote Drag and Drop Nesting Bug

## Problem Statement

**Current Behavior:**
- User logs in and interacts with the BlockNote editor
- User clicks and holds on the side handle (drag handle) for a block inside the BlockNote editor
- User attempts to drag and drop the block, with visual line showing where block will be dropped
- User releases button on position where no nesting should exist, but the dragged block becomes nested (incorrect behavior)

**Expected Behavior:**
- Nesting for dragged blocks should occur only where nesting is contextually appropriate
- This behavior does not exist in the official BlockNote demos or examples, indicating this is a custom implementation issue

## Investigation Findings

### 1. BlockNote Configuration Analysis

**Current Implementation (`components/BlockNoteEditorComponent.tsx`):**
```typescript
const editor = useCreateBlockNote({ initialContent });

return (
  <BlockNoteView 
    editor={editor} 
    theme={theme} 
    onChange={() => onEditorContentChange?.(editor)}
    formattingToolbar={false}
  >
    // Custom formatting toolbar implementation
  </BlockNoteView>
);
```

**Key Issues Identified:**

1. **Event Handler Interference**: Page-level drag handlers are calling `preventDefault()` on all drag events, which interferes with BlockNote's default drag behavior.

2. **CSS Positioning Interference**: Custom styles might be affecting BlockNote's internal positioning calculations for drag and drop.

**Root Problem:** Something in our implementation is actively breaking BlockNote's correct default behavior, rather than BlockNote itself being misconfigured.

### 2. System Independence Analysis

**File Manager DnD System:**
- Uses `@dnd-kit/core` with `DndContext`, `handleDragStart`, `handleDragEnd`
- Located in `/app/launch/page.tsx` (launch page only)
- Manages folders and documents in the file browser
- Completely separate from the editor page

**BlockNote DnD System:**
- Uses internal ProseMirror drag and drop
- Located in `/app/editor/[documentId]/page.tsx` (editor page only)
- Manages block positioning and nesting within documents
- Completely separate from the file manager

**Key Finding:** The file manager and BlockNote editor are used on **completely different pages** and have **zero shared functionality**:
- File manager: Only used on `/app/launch/page.tsx` 
- BlockNote editor: Only used on `/app/editor/[documentId]/page.tsx`

**Conclusion:** The file manager's `DndContext` cannot be interfering with BlockNote because they never exist in the same DOM tree.

### 3. Page-Level Drag Handlers

**In `app/editor/[documentId]/page.tsx`:**
```typescript
const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
  event.preventDefault();
  if (event.dataTransfer.types.includes('Files')) {
    setIsDragging(true);
  }
};

const handleDrop = (event: DragEvent<HTMLDivElement>) => {
  event.preventDefault();
  setIsDragging(false);
  if (event.dataTransfer.types.includes('Files')) {
    handleFileDropEvent(event);
  }
};

// Applied to main container
<div className="flex flex-row w-full h-full bg-[--bg-color] overflow-hidden" 
     onDragOver={handleDragOver} 
     onDragLeave={handleDragLeave} 
     onDrop={handleDrop}>
```

**Issue:** These handlers call `event.preventDefault()` on all drag events, which could interfere with BlockNote's internal drag and drop mechanism.

### 4. CSS Styling Conflicts

**Custom BlockNote Styles in `app/globals.css`:**
```css
.bn-container {
  min-width: 100%;
  overflow-x: auto !important;
  max-width: 100% !important;
  height: 100%;
  padding-left: 0;
  padding-right: 0;
}

.bn-block {
  margin-left: 0;
  margin-right: 0;
}
```

**Potential Issue:** The custom styling might be affecting BlockNote's internal positioning calculations for drag and drop.

### 5. Missing BlockNote Configuration Options

**Available Options Not Used:**
- `sideMenuDetection`: Could be set to `"editor"` to limit side menu to editor bounds
- `dropCursor`: Could be customized to control drop behavior
- `animations`: Could be disabled to simplify debugging

## Root Cause Analysis

**The core issue is interference with BlockNote's correct default behavior:**

1. **Event Interference (Primary Suspect)**: Page-level drag handlers calling `preventDefault()` on all drag events
2. **CSS Interference**: Custom styles affecting BlockNote's internal positioning calculations

**Key Insight:** BlockNote's default behavior is correct (as seen in official demos). Our implementation is actively breaking it.

## Proposed Solutions

### Solution 1: Remove Event Handler Interference (High Priority)

**Problem:** Current handlers prevent ALL drag events
**Fix:** Only prevent default for file drops, let BlockNote handle its own drags

```typescript
const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
  // ONLY prevent default for file drops, not BlockNote internal drags
  if (event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
    setIsDragging(true);
  }
  // Remove the blanket preventDefault() that was breaking BlockNote
};

const handleDrop = (event: DragEvent<HTMLDivElement>) => {
  // ONLY handle file drops, let BlockNote handle its own drops
  if (event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
    setIsDragging(false);
    handleFileDropEvent(event);
  }
  // Remove the blanket preventDefault() that was breaking BlockNote
};
```

### Solution 2: Remove CSS Interference (Medium Priority)

**Problem:** Custom styles might be affecting BlockNote's positioning
**Fix:** Temporarily remove custom BlockNote styles to test if they're causing issues

```css
/* Temporarily comment out or remove these to test: */
/*
.bn-container {
  min-width: 100%;
  overflow-x: auto !important;
  max-width: 100% !important;
  height: 100%;
  padding-left: 0;
  padding-right: 0;
}

.bn-block {
  margin-left: 0;
  margin-right: 0;
}
*/
```

### Solution 3: Keep BlockNote Configuration Minimal (Low Priority)

**Approach:** Use BlockNote with minimal configuration to avoid any unintended side effects
```typescript
// Keep it simple - let BlockNote use its correct defaults
const editor = useCreateBlockNote({ initialContent });

return (
  <BlockNoteView 
    editor={editor} 
    theme={theme} 
    onChange={() => onEditorContentChange?.(editor)}
    formattingToolbar={false}
  >
    // Keep custom toolbar but don't override side menu behavior
  </BlockNoteView>
);
```

## Testing Strategy

1. **Reproduce the Issue**: Create a minimal test case to consistently reproduce the unwanted nesting
2. **Incremental Fixes**: Apply solutions one at a time to identify the root cause
3. **Compare with Official Examples**: Test against official BlockNote examples to ensure behavior matches
4. **Cross-browser Testing**: Verify fix works across different browsers

## Implementation Priority

1. **High**: Remove event handler interference (Solution 1)
2. **Medium**: Remove CSS interference (Solution 2)
3. **Low**: Keep BlockNote configuration minimal (Solution 3)

## Success Criteria

- Blocks only nest when dropped in appropriate nesting zones
- Drag and drop behavior matches official BlockNote examples
- No interference between file manager DnD and BlockNote DnD
- Consistent behavior across different browsers and devices 

## Attempt 2 Implementation — Disable DnD-Based Nesting (but keep Tab/AI nesting)

The goal of this attempt is **not** to remove nesting altogether, but to ensure that **drag-and-drop only re-orders blocks; it must never change a block's nesting depth**.  Keyboard shortcuts (Tab / Shift-Tab) and programmatic calls (`nestBlock`, `unnestBlock`) will continue to work as usual.

### Step-by-Step

1. **Create a guard hook** `useDragNestingGuard`
   1. File `lib/hooks/editor/useDragNestingGuard.ts` (≈40 LoC).
   2. Inside the hook:
      1. Accept the `BlockNoteEditor` instance as a parameter.
      2. Keep two React refs:
         * `dragInfoRef` → `{ id: string; originalDepth: number } | null`.
         * `handlerCleanupRef` → function used for removing DOM listeners when the hook unmounts.
      3. **`dragstart` handler**
         * Identify the block being dragged via `event.target` → closest `[data-id]` → block `id`.
         * Compute its current depth:
           ```ts
           function getDepth(blockId: string): number {
             let depth = 0;
             let parent = editor.getParentBlock(blockId);
             while (parent) { depth++; parent = editor.getParentBlock(parent); }
             return depth;
           }
           ```
         * Store `{ id, originalDepth }` in `dragInfoRef`.
      4. **`dragend` handler**
         * Read `dragInfoRef.current`; if null → return.
         * Get the block again (`editor.getBlock(id)`); if missing → done.
         * Re-compute depth via `getDepth`.
         * If `newDepth !== originalDepth` ⇒ **undo the unwanted depth change**:
           ```ts
           editor.transact(() => {
             while (getDepth(id) > originalDepth && editor.canUnnestBlock()) {
               editor.unnestBlock();
             }
             while (getDepth(id) < originalDepth && editor.canNestBlock()) {
               editor.nestBlock();
             }
           });
           ```
         * Clear `dragInfoRef`.
      5. Attach the handlers to `editor.view.dom` and save a cleanup function that removes them.
      6. In the hook's cleanup (`useEffect` return) call the stored remover.

2. **Mount the hook** in `components/BlockNoteEditorComponent.tsx`
   1. Import it: `import { useDragNestingGuard } from '@/lib/hooks/editor/useDragNestingGuard';`
   2. After creating the editor (`const editor = useCreateBlockNote({...})`) call `useDragNestingGuard(editor);`  (It runs client-side only.)

3. **No other code paths are touched**
   * Tab / Shift-Tab, AI tools, and slash-menu commands still use `nestBlock()` / `unnestBlock()` directly and will continue to work.

4. **Testing checklist**
   1. Drag a paragraph up/down → it moves but never indents.
   2. Press Tab on a paragraph below another → it nests correctly.
   3. AI tool that calls `nestBlock()` still nests.
   4. Undo (`Ctrl+Z`) works as expected after drags.

5. **Fallback / Rollback**
   * The guard is fully encapsulated in one hook; comment out the `useDragNestingGuard(editor);` line to revert to default behaviour.
   * No schema or state migrations required.

6. **Performance impact**
   * Listeners are lightweight; they run only on drag operations.
   * All corrections are wrapped in a single `transact`, so they result in one undo step per drag.

---
Please review these steps; once approved we'll implement the hook and wire-up.  