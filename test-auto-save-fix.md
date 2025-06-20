# Testing Auto-Save Permissions Fix - Task 41

## Test Setup

### Prerequisites
1. Two users: Document Owner and Invited Editor
2. A document with editor permissions granted to the second user
3. Browser developer tools open to monitor console logs

### Test Scenario: Invited Editor with Owner Offline

## Step 1: Set Up Document with Editor Permissions

1. **As Document Owner:**
   - Create a new document
   - Share it with another user as "Editor"
   - Note the document ID

2. **As Invited Editor:**
   - Access the shared document
   - Verify you can edit the document
   - Leave the document open

3. **As Document Owner:**
   - Sign out or close the browser (simulating offline)

## Step 2: Test Auto-Save Functionality

### Expected Console Output (Success)
When the invited editor makes changes, you should see:

```
[PartykitYjsProvider] Attempting coordinated save with auth token: {
  hasAuthToken: true,
  userId: "editor-user-id",
  documentId: "document-id",
  updateSize: xxx
}

[CollaborativeSaveCoordinator] Coordinating save operation: {
  contentHash: "abcd1234...",
  saveType: "yjs",
  userId: "editor-user-id",
  documentId: "document-id",
  hasAuthToken: true
}

[DEBUG] Permission check: {
  userId: "editor-user-id",
  documentId: "document-id",
  requiredLevel: "write",
  timestamp: "2024-01-xx..."
}

[DEBUG] Permission query result: {
  permissionFound: true,
  permissionLevel: "editor",
  permissionError: undefined
}

[DEBUG] Write access granted via explicit permission: editor

[PartykitYjsProvider] Successfully persisted Y.js update: {
  updateId: "xxx",
  createdAt: "2024-01-xx...",
  retryAttempt: 1
}
```

### Error Scenarios to Test

#### Test 1: Authentication Token Missing
**Trigger:** Clear localStorage/sessionStorage to simulate missing auth
**Expected Output:**
```
[PartykitYjsProvider] No auth token available for coordinated save, refreshing...
[PartykitYjsProvider] No auth token available, obtaining token...
```

#### Test 2: Authentication Token Expired
**Trigger:** Manually expire the JWT token
**Expected Output:**
```
[PartykitYjsProvider] Authentication failed, refreshing token and retrying...
[PartykitYjsProvider] Successfully persisted Y.js update: {
  retryAttempt: 2
}
```

#### Test 3: Insufficient Permissions
**Trigger:** Change user permission to "viewer" in database
**Expected Output:**
```
[DEBUG] Write access denied - insufficient permission level: viewer
[PartykitYjsProvider] Error persisting Y.js update after retries: Failed to persist Y.js update: 403 Forbidden - Insufficient permissions to edit document. Editor access required.
```

## Step 3: Manual Testing Steps

### Test Auto-Save with Invited Editor

1. **As Invited Editor (Owner Offline):**
   - Open browser developer console
   - Make text changes to the document
   - Wait 1-2 seconds for auto-save to trigger
   - Check console for success logs

2. **Verify Persistence:**
   - Refresh the page
   - Verify changes are preserved
   - Check that no error messages appear

3. **Test Real-Time Sync:**
   - Open the same document in another browser/tab
   - Verify changes appear in real-time
   - Confirm no permission errors

### Test Token Refresh

1. **As Invited Editor:**
   - Leave document open for 45+ minutes
   - Make changes after token refresh time
   - Verify auto-save continues working
   - Check for token refresh logs

## Step 4: Troubleshooting

### Common Issues

#### Issue: "No auth token available"
**Solution:** Check authentication state:
```javascript
// In browser console:
supabase.auth.getSession().then(console.log)
```

#### Issue: "Insufficient permissions"
**Solution:** Verify database permissions:
```sql
SELECT * FROM document_permissions 
WHERE document_id = 'your-document-id' 
AND user_id = 'editor-user-id';
```

#### Issue: Save coordinator not initialized
**Solution:** Check initialization logs:
```
[PartykitYjsProvider] Collaborative save coordinator initialized
```

### Debug Commands

```javascript
// Check provider state
window.providerDebug = {
  authToken: !!provider.authToken,
  connectionState: provider.getConnectionState(),
  saveCoordinator: !!provider.saveCoordinator
};
```

## Success Criteria

- ✅ Invited editors can auto-save when document owner is offline
- ✅ Authentication tokens are properly initialized and refreshed
- ✅ Save coordination works without errors
- ✅ Permission checks correctly identify editor access
- ✅ Failed saves are automatically retried
- ✅ Real-time collaboration continues functioning

## Regression Testing

Verify that existing functionality still works:

1. **Document Owner Auto-Save:** Owner can still auto-save their own documents
2. **Real-Time Sync:** Changes appear immediately for all connected users
3. **Anonymous Users:** Anonymous users without permissions get proper error messages
4. **Network Failures:** Temporary network issues don't break the save system

## Clean Up

After testing, remove debug logging in production:

1. Remove `[DEBUG]` console.log statements from `checkDocumentAccess`
2. Consider reducing verbosity of other logging
3. Monitor production logs for any issues

## Notes

- The fix addresses race conditions in authentication token initialization
- Retry logic handles temporary network and authentication failures
- Enhanced error logging helps with debugging permission issues
- The CollaborativeSaveCoordinator now validates authentication before coordinating saves