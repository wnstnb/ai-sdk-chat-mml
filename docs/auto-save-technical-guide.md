# Smart Auto-Save Technical Documentation

## Architecture Overview

The smart auto-save system is built around intelligent context-aware delays and batching strategies to optimize both user experience and server efficiency. The system differentiates between AI tool operations and user typing, applying different save strategies for each.

## Core Components

### 1. Auto-Save Hook (`useAutoSave`)

Located in: `app/editor/[documentId]/page.tsx`

**Key State Variables:**
```typescript
// Batch context for AI tools operations
const [autosaveBatchContext, setAutosaveBatchContext] = useState({
  type: null as 'ai-tools' | null,
  startTime: null as number | null,
  changeCount: 0,
  isActive: false
});

// Tracks last server save for diff analysis
const lastServerSaveRef = useRef({
  content: '',
  timestamp: Date.now()
});

// Local save status for UI
const [localSaveStatus, setLocalSaveStatus] = useState<'none' | 'saved' | 'promoted'>('none');
```

### 2. Save Strategy Decision Engine

The `handleEditorChange` function implements context-aware timing:

```typescript
const getAutoSaveDelay = (context: AutoSaveBatchContext) => {
  if (context.type === 'ai-tools') {
    return context.isActive ? 8000 : 2000; // 8s during AI, 2s after completion
  }
  return 3000; // Standard delay for user typing
};
```

### 3. Content Diff Analysis

The `analyzeContentDiff` function determines save significance:

```typescript
interface DiffAnalysis {
  isSignificant: boolean;
  charDiff: number;
  wordDiff: number;
  hasStructuralChanges: boolean;
  timeSinceLastSave: number;
  reasoning: string;
}
```

**Significance Criteria:**
- Character difference > 200
- Word difference > 50  
- Structural changes (paragraphs, headers, lists)
- Time since last save > 10 minutes
- Accumulated local saves ≥ 5

## AI Tools Batching System

### Batch Lifecycle

1. **Start Batch**: Called when AI tool begins execution
```typescript
const startAIToolsBatch = useCallback(() => {
  setAutosaveBatchContext({
    type: 'ai-tools',
    startTime: Date.now(),
    changeCount: 0,
    isActive: true
  });
}, []);
```

2. **Track Changes**: Each editor change increments the counter
3. **End Batch**: Triggered when `isProcessingClientTools` and `isAiLoading` both become false
4. **Final Save**: Quick save (2s delay) after batch completion

### AI Tool Integration Points

All AI tool execution functions call `startAIToolsBatch()`:
- `executeAddContent`
- `executeModifyContent` 
- `executeAskQuestion`
- `executeGenerateFromSelection`
- `executeGenerateTitle`
- `executeGenerateNotes`
- `executeGenerateSummary`

## User Typing Strategy

### Local vs Server Save Decision

```typescript
const shouldSaveToServer = (diffAnalysis: DiffAnalysis): boolean => {
  return diffAnalysis.isSignificant;
};
```

### Local Save Implementation

```typescript
const saveToLocalStorage = useCallback((content: string) => {
  try {
    const saveData = {
      content,
      timestamp: Date.now(),
      documentId: params.documentId,
      version: Date.now().toString()
    };
    
    localStorage.setItem(`autosave_${params.documentId}`, JSON.stringify(saveData));
    setLocalSaveStatus('saved');
    
    // Clear status after 3 seconds
    setTimeout(() => setLocalSaveStatus('none'), 3000);
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}, [params.documentId]);
```

### Save Promotion

Local saves are promoted to server saves during navigation:

```typescript
const promoteLocalSaveToServer = useCallback(async () => {
  if (localSaveStatus === 'saved') {
    await handleSave(true); // Force server save
    setLocalSaveStatus('promoted');
  }
}, [localSaveStatus, handleSave]);
```

## Navigation Safety

### Enhanced beforeunload Handler

```typescript
const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
  const currentContent = editorRef.current?.getMarkdown() || '';
  
  if (hasUnsavedChanges(currentContent)) {
    // Promote local save if exists
    if (localSaveStatus === 'saved') {
      promoteLocalSaveToServer();
    }
    
    // Emergency save using sendBeacon
    const formData = new FormData();
    formData.append('content', currentContent);
    navigator.sendBeacon(`/api/documents/${params.documentId}/emergency-save`, formData);
    
    e.preventDefault();
    e.returnValue = '';
  }
}, [localSaveStatus, promoteLocalSaveToServer]);
```

### Route Change Handler

```typescript
useEffect(() => {
  const handleRouteChange = () => {
    promoteLocalSaveToServer();
  };
  
  router.events.on('routeChangeStart', handleRouteChange);
  return () => router.events.off('routeChangeStart', handleRouteChange);
}, [promoteLocalSaveToServer]);
```

## UI Status Indicators

### AutosaveStatusIndicator Component

Located in: `components/ui/AutosaveStatusIndicator.tsx`

**Status Mapping:**
```typescript
const getStatusDisplay = (
  isSaving: boolean,
  saveError: string | null,
  batchContext: AutoSaveBatchContext,
  localSaveStatus: LocalSaveStatus
) => {
  if (isSaving) return { text: 'Saving...', color: 'text-gray-500' };
  if (saveError) return { text: 'Error', color: 'text-red-500' };
  
  if (batchContext.type === 'ai-tools' && batchContext.isActive) {
    return {
      text: `AI Editing (${batchContext.changeCount})`,
      color: 'text-orange-500'
    };
  }
  
  if (localSaveStatus === 'saved') {
    return { text: 'Local Saved', color: 'text-blue-500' };
  }
  
  return { text: 'Saved', color: 'text-green-500' };
};
```

## Performance Optimizations

### Debounced Save Execution

```typescript
const debouncedSave = useMemo(
  () => debounce((content: string, forceServerSave = false) => {
    if (forceServerSave) {
      handleSave(true);
      return;
    }
    
    const diffAnalysis = analyzeContentDiff(content, lastServerSaveRef.current);
    
    if (shouldSaveToServer(diffAnalysis)) {
      handleSave(true);
      lastServerSaveRef.current = { content, timestamp: Date.now() };
    } else {
      saveToLocalStorage(content);
    }
  }, getAutoSaveDelay(autosaveBatchContext)),
  [autosaveBatchContext, handleSave, saveToLocalStorage]
);
```

### Memory Management

- Uses `useRef` for content tracking to avoid re-renders
- Implements cleanup for timeouts and event listeners
- Debounces save operations to prevent excessive calls

## Error Handling

### Save Failure Recovery

```typescript
const handleSaveError = useCallback((error: Error) => {
  console.error('Save failed:', error);
  setSaveError(error.message);
  
  // Fallback to local save
  const currentContent = editorRef.current?.getMarkdown() || '';
  saveToLocalStorage(currentContent);
  
  // Retry after delay
  setTimeout(() => {
    setSaveError(null);
    debouncedSave(currentContent, true);
  }, 5000);
}, [saveToLocalStorage, debouncedSave]);
```

### Network Disconnection

- Local saves continue working offline
- Server saves retry automatically when connection restored
- UI indicates save status clearly to user

## Configuration

### Timing Constants

```typescript
const TIMING_CONFIG = {
  AI_TOOLS_ACTIVE_DELAY: 8000,    // 8 seconds during AI processing
  AI_TOOLS_COMPLETED_DELAY: 2000, // 2 seconds after AI completion
  USER_TYPING_DELAY: 3000,        // 3 seconds for regular typing
  MANUAL_SAVE_DELAY: 1000,        // 1 second for manual saves
  LOCAL_SAVE_DISPLAY_TIME: 3000   // 3 seconds to show local save status
};
```

### Diff Analysis Thresholds

```typescript
const DIFF_THRESHOLDS = {
  SIGNIFICANT_CHARS: 200,
  SIGNIFICANT_WORDS: 50,
  TIME_THRESHOLD: 10 * 60 * 1000,  // 10 minutes
  MAX_LOCAL_SAVES: 5
};
```

## Testing Considerations

### Unit Tests Should Cover

1. **Batch Context Management**
   - Batch start/end lifecycle
   - Change count tracking
   - Timing calculations

2. **Diff Analysis**
   - Character/word counting
   - Structural change detection
   - Time-based decisions

3. **Save Strategy Selection**
   - Local vs server save decisions
   - Promotion logic
   - Error handling

### Integration Tests Should Cover

1. **AI Tool Workflows**
   - Batch creation during AI operations
   - Single save after multiple AI changes
   - Status indicator updates

2. **User Typing Workflows**
   - Small change → local save
   - Large change → server save
   - Navigation → promotion

3. **Edge Cases**
   - Network failures
   - Rapid successive operations
   - Browser tab closing

## Migration and Rollback

### Feature Flags

The system can be controlled via feature flags:

```typescript
const FEATURE_FLAGS = {
  SMART_AUTOSAVE_ENABLED: true,
  AI_BATCHING_ENABLED: true,
  DIFF_BASED_SAVES_ENABLED: true
};
```

### Fallback Strategy

If smart auto-save fails, the system falls back to the original 3-second delay for all operations.

### Data Migration

No data migration required - the system is additive and backward compatible with existing save mechanisms.

## Monitoring and Metrics

### Key Metrics to Track

1. **Save Frequency**
   - Server saves per session
   - Local saves per session
   - Save promotion rate

2. **User Experience**
   - Time between changes and saves
   - Version history spam reduction
   - Save failure rates

3. **Performance**
   - Save operation duration
   - Local storage usage
   - Network bandwidth usage

### Logging

```typescript
const logSaveOperation = (type: 'server' | 'local', context: string, duration: number) => {
  console.log(`[AutoSave] ${type} save completed in ${duration}ms (${context})`);
  
  // Send to analytics if configured
  analytics?.track('autosave_operation', {
    type,
    context,
    duration,
    documentId: params.documentId
  });
};
```

## Security Considerations

### Local Storage

- Content stored temporarily in localStorage for crash protection
- Automatically cleaned up after promotion to server
- No sensitive metadata stored locally

### Network Requests

- All server saves use authenticated API endpoints
- Content encrypted in transit via HTTPS
- Emergency saves use POST with CSRF protection

### Data Validation

- Content sanitized before saving
- Maximum content size limits enforced
- Rate limiting on save endpoints

---

*For user-facing information about this feature, see the [User Guide](auto-save-user-guide.md).* 