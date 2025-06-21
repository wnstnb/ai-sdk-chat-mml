import * as Y from 'yjs';

/**
 * Helper function to get the Y.js document for threads from existing collaboration system
 * This loads the persisted document state from Supabase and applies all updates
 */
export async function getYjsDocument(documentId: string): Promise<Y.Doc> {
  // Create a new Y.js document and load the persisted state from Supabase
  const doc = new Y.Doc();
  
  try {
    // Load all Y.js updates for this document from the existing API
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/collaboration/yjs-updates?documentId=${encodeURIComponent(documentId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.ok) {
      const result = await response.json();
      const { updates } = result;

      if (updates && updates.length > 0) {
        // Apply all updates in chronological order to restore complete document state
        updates.forEach((updateInfo: any) => {
          try {
            const updateData = new Uint8Array(updateInfo.data);
            Y.applyUpdate(doc, updateData, 'api-load');
          } catch (error) {
            console.error('[Y.js Document Utils] Error applying Y.js update:', error);
          }
        });
        
        console.log('[Y.js Document Utils] Restored Y.js document state from Supabase');
      }
    } else if (response.status !== 404) {
      console.warn('[Y.js Document Utils] Failed to load Y.js document state:', response.status);
    }
  } catch (error) {
    console.warn('[Y.js Document Utils] Error loading Y.js document state:', error);
  }
  
  return doc;
}

/**
 * Helper function to persist Y.js document changes back to Supabase
 * NOTE: This is disabled for server-side calls to avoid authentication issues.
 * Client-side Y.js sync through PartyKit will handle persistence automatically.
 */
export async function persistYjsDocument(doc: Y.Doc, documentId: string): Promise<void> {
  // Skip server-side persistence to avoid authentication issues
  // The client-side PartyKit integration will handle Y.js persistence automatically
  console.log('[Y.js Document Utils] Skipping server-side Y.js persistence - client will handle sync');
  return;
} 