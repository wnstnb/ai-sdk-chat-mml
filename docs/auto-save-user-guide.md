# Smart Auto-Save User Guide

## Overview

The smart auto-save system automatically saves your work while you're editing documents, providing crash protection and maintaining a clean version history. The system intelligently adapts its behavior based on what you're doing - whether you're typing, using AI tools, or navigating away from the editor.

## Auto-Save Behaviors

### 🤖 AI Tools Auto-Save

When you're using AI tools (like content generation, modification, or analysis), the system:

- **Batches multiple AI operations** together to avoid creating spam in your version history
- **Shows "AI Editing"** status with a count of changes being made
- **Waits longer** (8 seconds) during active AI processing to group related changes
- **Saves quickly** (2 seconds) after AI tools finish to preserve your work

**What you'll see:**
- Status indicator shows "AI Editing (3)" with the number of changes
- Single version entry for the entire AI operation sequence
- Clean version history without multiple rapid saves

### ✏️ User Typing Auto-Save

When you're typing or editing content, the system analyzes your changes:

#### Significant Changes (Server Save)
Creates a new version entry when you make:
- Large content additions (200+ characters)
- Substantial text (50+ words)
- Structural changes (new paragraphs, headers, lists)
- After 10+ minutes since last save
- After accumulating 5+ small changes

**What you'll see:**
- Status shows "Saved" in green
- New entry appears in version history
- Full crash protection and sync across devices

#### Small Changes (Local Save)
Provides instant crash protection for:
- Typo corrections
- Minor word changes
- Small additions within existing content

**What you'll see:**
- Status shows "Local Saved" in blue
- No new version history entry (keeps history clean)
- Still protected against crashes and accidental navigation

## Status Indicators

The auto-save status appears in the top-right corner of the editor:

| Status | Color | Meaning |
|--------|-------|---------|
| **Saving...** | Gray | Currently saving to server |
| **Saved** | Green | Successfully saved to server (new version) |
| **Local Saved** | Blue | Saved locally for crash protection |
| **AI Editing (3)** | Orange | AI tools are making changes (count shown) |
| **Error** | Red | Save failed - your work is at risk |

## Automatic Save Triggers

Your work is automatically saved when:

- **Navigating away** from the editor (always promotes local saves to server)
- **Closing the browser tab** (emergency save using background sync)
- **Switching to another document**
- **After the appropriate delay** based on your editing activity
- **When AI tools complete** their operations

## Manual Save

You can force an immediate server save at any time:
- **Keyboard shortcut:** `Ctrl+S` (Windows) or `Cmd+S` (Mac)
- **Menu option:** File → Save (if available)

Manual saves always create a new version entry regardless of change size.

## Version History

The smart auto-save system keeps your version history clean by:

- **Grouping AI tool changes** into single meaningful versions
- **Only creating versions for significant user changes**
- **Preserving all manual saves** as separate versions
- **Maintaining chronological order** of all saves

## Crash Protection

Your work is protected against:
- **Browser crashes** - recent changes saved locally
- **Accidental navigation** - automatic save triggered before leaving
- **Network issues** - local saves provide backup until connection restored
- **Power outages** - recent edits preserved in browser storage

## Best Practices

### For Clean Version History
- Let the system automatically determine when to create versions
- Use AI tools freely - they won't spam your history
- Make substantial edits in focused sessions for logical version points

### For Maximum Protection
- Keep your browser updated for reliable background sync
- Don't disable JavaScript or local storage
- Save manually before major changes if you want specific version markers

## Troubleshooting

### If Auto-Save Seems Stuck
1. Check your internet connection
2. Try a manual save (`Ctrl+S` / `Cmd+S`)
3. Refresh the page (recent changes should be recovered)

### If You Can't Find a Recent Change
1. Check the version history panel
2. Look for local saves that may not have been promoted yet
3. Try navigating away and back to trigger a save promotion

### If Status Shows Error
1. Check your internet connection
2. Try manual save to retry
3. Copy your work as backup before refreshing
4. Contact support if errors persist

## Privacy & Data

- **Local saves** are stored only in your browser's local storage
- **Server saves** are encrypted and stored securely in the cloud
- **Auto-save frequency** adapts to minimize server load while ensuring protection
- **No content is analyzed** for anything other than determining save significance

---

*For technical details about how the auto-save system works, see the [Technical Documentation](auto-save-technical-guide.md).* 