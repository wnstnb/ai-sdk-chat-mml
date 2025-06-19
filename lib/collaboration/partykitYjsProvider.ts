import * as Y from 'yjs';
import { createClient } from '@supabase/supabase-js';
import { CollaborativeSaveCoordinator, SaveCoordinatorOptions } from './collaborativeSaveCoordinator';

/**
 * PartyKit + Supabase Yjs Provider
 * 
 * This provider combines PartyKit for real-time collaboration with Supabase for persistence.
 * It handles both live synchronization via PartyKit and document persistence via our Supabase API.
 * Enhanced with JWT authentication, robust error handling, and connection recovery.
 */

export interface PartykitYjsProviderOptions {
  documentId: string;
  userId?: string;
  userName?: string;
  userColor?: string;
  partykitHost?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  authToken?: string; // JWT token for authentication
  onSynced?: () => void;
  onConnectionStatusChange?: (connected: boolean) => void;
  onAwarenessChange?: (awareness: any) => void;
  onAuthError?: (error: Error) => void;
  onConnectionError?: (error: Error) => void;
  onPermissionUpdate?: () => void; // Callback for when permissions are updated
  WebSocketPolyfill?: typeof WebSocket; // For Node.js environments
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface ConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  lastError?: Error;
  connectionStartTime?: number;
}

export class PartykitYjsProvider {
  private doc: Y.Doc;
  private documentId: string;
  private userId: string;
  private userName: string;
  private userColor: string;
  private partykitHost: string;
  private websocket: WebSocket | null = null;
  private connectionState: ConnectionState = {
    isConnected: false,
    isReconnecting: false,
    reconnectAttempts: 0,
  };
  private supabase: any;
  private awareness: Map<string, any> = new Map();
  private options: PartykitYjsProviderOptions;
  private saveCoordinator: CollaborativeSaveCoordinator | null = null;

  // Authentication and connection management
  private authToken?: string;
  private WebSocketClass: typeof WebSocket;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private tokenRefreshInterval: NodeJS.Timeout | null = null;
  private lastUpdateTime?: number;

  // Event callbacks
  private onSynced?: () => void;
  private onConnectionStatusChange?: (connected: boolean) => void;
  private onAwarenessChange?: (awareness: any) => void;
  private onAuthError?: (error: Error) => void;
  private onConnectionError?: (error: Error) => void;
  private onPermissionUpdate?: () => void;

  constructor(doc: Y.Doc, options: PartykitYjsProviderOptions) {
    this.doc = doc;
    this.documentId = options.documentId;
    this.userId = options.userId || 'anonymous';
    this.userName = options.userName || 'Anonymous User';
    this.userColor = options.userColor || '#3b82f6';
    this.partykitHost = options.partykitHost || process.env.NEXT_PUBLIC_PARTYKIT_HOST || 'localhost:1999';
    this.authToken = options.authToken;
    this.options = options;

    // Configuration
    this.WebSocketClass = options.WebSocketPolyfill || WebSocket;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectDelay = options.reconnectDelay || 1000;

    // Set up event callbacks
    this.onSynced = options.onSynced;
    this.onConnectionStatusChange = options.onConnectionStatusChange;
    this.onAwarenessChange = options.onAwarenessChange;
    this.onAuthError = options.onAuthError;
    this.onConnectionError = options.onConnectionError;
    this.onPermissionUpdate = options.onPermissionUpdate;

    // Initialize Supabase client for persistence and auth
    if (options.supabaseUrl && options.supabaseAnonKey) {
      this.supabase = createClient(options.supabaseUrl, options.supabaseAnonKey);
    }

    // Initialize collaborative save coordinator
    this.initializeSaveCoordinator();

    this.initialize();
  }

  private initializeSaveCoordinator(): void {
    if (!this.options.supabaseUrl || !this.options.supabaseAnonKey) {
      console.warn('[PartykitYjsProvider] Save coordinator disabled - missing Supabase configuration');
      return;
    }

    this.saveCoordinator = new CollaborativeSaveCoordinator({
      documentId: this.documentId,
      userId: this.userId,
      supabaseUrl: this.options.supabaseUrl,
      supabaseAnonKey: this.options.supabaseAnonKey,
      authToken: this.authToken,
      saveDeduplicationWindow: 2000, // 2 seconds
      maxRetries: 3,
      onSaveCoordinated: (operation) => {
        console.log('[PartykitYjsProvider] Save coordinated successfully:', operation.saveType);
      },
      onSaveSkipped: (operation, reason) => {
        console.log('[PartykitYjsProvider] Save skipped:', reason);
      },
      onSaveError: (error, operation) => {
        console.error('[PartykitYjsProvider] Coordinated save error:', error.message);
      }
    });

    console.log('[PartykitYjsProvider] Collaborative save coordinator initialized');
  }

  private async initialize() {
    try {
      console.log('[PartykitYjsProvider] Initializing provider with authentication...');
      
      // Get or refresh authentication token
      await this.ensureValidAuthToken();
      
      // First, load document state from Supabase
      await this.loadDocumentState();
      
      // Then connect to PartyKit for real-time sync
      await this.connectToPartyKit();
      
      // Set up document change listeners for persistence
      this.setupDocumentListeners();
      
      // Set up token refresh interval
      this.setupTokenRefresh();
      
      console.log('[PartykitYjsProvider] Initialization completed successfully');
      
    } catch (error) {
      console.error('[PartykitYjsProvider] Initialization error:', error);
      this.handleConnectionError(error as Error);
    }
  }

  private async ensureValidAuthToken(): Promise<void> {
    if (!this.supabase) {
      console.warn('[PartykitYjsProvider] No Supabase client available for authentication');
      return;
    }

    try {
      // Get current session to extract JWT token
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        throw new Error(`Failed to get auth session: ${error.message}`);
      }

      if (session?.access_token) {
        this.authToken = session.access_token;
        // Update save coordinator with new token
        this.saveCoordinator?.updateAuthToken(this.authToken);
        console.log('[PartykitYjsProvider] JWT token obtained successfully');
      } else {
        console.warn('[PartykitYjsProvider] No valid session found - proceeding without authentication');
        this.saveCoordinator?.updateAuthToken(undefined);
        // Proceed without auth for anonymous users
      }
    } catch (error) {
      console.error('[PartykitYjsProvider] Error obtaining auth token:', error);
      this.onAuthError?.(error as Error);
      // Don't throw - allow anonymous connections
    }
  }

  private setupTokenRefresh(): void {
    if (!this.supabase) return;

    // Refresh token every 45 minutes (tokens expire after 1 hour)
    this.tokenRefreshInterval = setInterval(async () => {
      try {
        await this.ensureValidAuthToken();
        console.log('[PartykitYjsProvider] Auth token refreshed');
      } catch (error) {
        console.error('[PartykitYjsProvider] Failed to refresh auth token:', error);
        this.onAuthError?.(error as Error);
      }
    }, 45 * 60 * 1000); // 45 minutes
  }

  private async loadDocumentState() {
    if (!this.supabase || !this.documentId) {
      console.warn('[PartykitYjsProvider] Cannot load document state - missing Supabase client or document ID');
      return;
    }

    try {
      console.log('[PartykitYjsProvider] Loading Y.js document state from Supabase for document:', this.documentId);

      // Fetch all Y.js updates for this document
      const response = await fetch(`/api/collaboration/yjs-updates?documentId=${encodeURIComponent(this.documentId)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Include auth header if we have a token
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[PartykitYjsProvider] No existing document state found - starting with empty document');
          return;
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to load Y.js updates: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
      const { updates, count } = result;

      if (!updates || updates.length === 0) {
        console.log('[PartykitYjsProvider] No Y.js updates found - document will start empty');
        return;
      }

      console.log('[PartykitYjsProvider] Applying', count, 'Y.js updates to restore document state');

      // Apply all updates in chronological order to restore complete document state
      // This includes both document content AND comment threads
      updates.forEach((updateInfo: any, index: number) => {
        try {
          const updateData = new Uint8Array(updateInfo.data);
          
          // Apply the update with a special origin to prevent persistence loops
          Y.applyUpdate(this.doc, updateData, 'supabase-load');
          
          console.log(`[PartykitYjsProvider] Applied update ${index + 1}/${count} from ${updateInfo.createdAt}`);
        } catch (error) {
          console.error(`[PartykitYjsProvider] Error applying update ${index + 1}:`, error);
        }
      });

      console.log('[PartykitYjsProvider] Successfully restored document state from Supabase');
      
      // Log what was restored
      const threadsMap = this.doc.getMap('threads');
      const blocksArray = this.doc.getArray('blocks');
      
      console.log('[PartykitYjsProvider] Restored state summary:', {
        threadsCount: threadsMap.size,
        blocksCount: blocksArray.length,
        hasCommentThreads: threadsMap.size > 0
      });

    } catch (error) {
      console.error('[PartykitYjsProvider] Error loading Y.js document state from Supabase:', error);
      
      // Don't throw - the document should still work without persisted state
      // New content will be created and persisted going forward
      console.log('[PartykitYjsProvider] Continuing with empty document state due to load error');
    }
  }

  private async connectToPartyKit() {
    if (this.connectionState.isReconnecting && 
        this.connectionState.reconnectAttempts >= this.maxReconnectAttempts) {
      const error = new Error(`Max reconnection attempts (${this.maxReconnectAttempts}) exceeded`);
      console.error('[PartykitYjsProvider]', error.message);
      this.onConnectionError?.(error);
      return;
    }

    try {
      // Build WebSocket URL for our enhanced Y-PartyServer
      const protocol = this.partykitHost.includes('localhost') ? 'ws:' : 'wss:';
      const wsUrl = new URL(`${protocol}//${this.partykitHost}/parties/collaboration/${this.documentId}`);
      
      // Add authentication token as query parameter if available
      if (this.authToken) {
        wsUrl.searchParams.set('token', this.authToken);
      }
      
      // Add user identification
      wsUrl.searchParams.set('userId', this.userId);
      wsUrl.searchParams.set('userName', encodeURIComponent(this.userName));
      
      console.log(`[PartykitYjsProvider] Connecting to PartyKit: ${wsUrl.toString()}`);
      
      this.connectionState.connectionStartTime = Date.now();
      this.websocket = new this.WebSocketClass(wsUrl.toString());

      this.websocket.onopen = () => {
        console.log('[PartykitYjsProvider] Connected to PartyKit successfully');
        
        this.connectionState.isConnected = true;
        this.connectionState.isReconnecting = false;
        this.connectionState.reconnectAttempts = 0;
        this.connectionState.lastError = undefined;
        
        this.onConnectionStatusChange?.(true);
        
        // Send initial user awareness
        this.broadcastAwareness();
        
        // Send current document state to sync with other clients
        const stateVector = Y.encodeStateVector(this.doc);
        this.sendMessage({
          type: 'sync-step-1',
          stateVector: Array.from(stateVector),
          userId: this.userId,
        });

        // Set up heartbeat to detect connection issues
        this.setupHeartbeat();
        
        // Call synced callback
        this.onSynced?.();
      };

      this.websocket.onmessage = async (event) => {
        try {
          // Handle different message data types properly
          if (event.data instanceof ArrayBuffer || event.data instanceof Uint8Array) {
            // Direct binary data
            this.handleYjsBinaryMessage(new Uint8Array(event.data));
          } else if (event.data instanceof Blob) {
            // Blob data needs to be converted to ArrayBuffer first
            const arrayBuffer = await event.data.arrayBuffer();
            this.handleYjsBinaryMessage(new Uint8Array(arrayBuffer));
          } else {
            // Text/JSON data
            const data = JSON.parse(event.data);
            this.handleYPartyServerMessage(data);
          }
        } catch (error) {
          console.error('[PartykitYjsProvider] Error parsing message:', error);
        }
      };

      this.websocket.onclose = (event) => {
        console.log(`[PartykitYjsProvider] Disconnected from PartyKit (code: ${event.code}, reason: ${event.reason})`);
        
        this.connectionState.isConnected = false;
        this.onConnectionStatusChange?.(false);
        
        // Clear heartbeat
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        
        // Attempt to reconnect if not intentionally closed
        if (event.code !== 1000 && event.code !== 1001) {
          this.scheduleReconnect();
        }
      };

      this.websocket.onerror = (error) => {
        console.error('[PartykitYjsProvider] PartyKit connection error:', error);
        
        const connectionError = new Error(`WebSocket connection failed: ${error}`);
        this.connectionState.lastError = connectionError;
        this.onConnectionError?.(connectionError);
      };

    } catch (error) {
      console.error('[PartykitYjsProvider] Error creating WebSocket connection:', error);
      this.handleConnectionError(error as Error);
    }
  }

  private setupHeartbeat(): void {
    // Clear any existing heartbeat interval first
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Send ping every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.connectionState.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
        console.log('[PartykitYjsProvider] Sending heartbeat ping');
        this.sendMessage({ type: 'ping', userId: this.userId });
      }
    }, 30000); // 30 seconds
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.connectionState.reconnectAttempts >= this.maxReconnectAttempts) {
      const error = new Error(`Max reconnection attempts exceeded`);
      console.error('[PartykitYjsProvider]', error.message);
      this.onConnectionError?.(error);
      return;
    }

    this.connectionState.isReconnecting = true;
    this.connectionState.reconnectAttempts++;

    // Exponential backoff with jitter
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.connectionState.reconnectAttempts - 1),
      30000 // Max 30 seconds
    ) + Math.random() * 1000; // Add jitter

    console.log(
      `[PartykitYjsProvider] Scheduling reconnect attempt ${this.connectionState.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay)}ms`
    );

    this.reconnectTimeout = setTimeout(async () => {
      try {
        // Refresh auth token before reconnecting
        await this.ensureValidAuthToken();
        await this.connectToPartyKit();
      } catch (error) {
        console.error('[PartykitYjsProvider] Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  private handleConnectionError(error: Error): void {
    this.connectionState.lastError = error;
    this.onConnectionError?.(error);
    
    if (!this.connectionState.isReconnecting) {
      this.scheduleReconnect();
    }
  }

  private handlePartyKitMessage(data: any) {
    switch (data.type) {
      case 'sync-step-1':
        // Another client is requesting sync
        const stateVector = new Uint8Array(data.stateVector);
        const update = Y.encodeStateAsUpdate(this.doc, stateVector);
        
        this.sendMessage({
          type: 'sync-step-2',
          update: Array.from(update),
          userId: this.userId,
        });
        break;

      case 'sync-step-2':
        // Receiving document update from another client
        const updateArray = new Uint8Array(data.update);
        Y.applyUpdate(this.doc, updateArray, 'partykit-sync');
        break;

      case 'update':
        // Real-time document update
        const docUpdate = new Uint8Array(data.update);
        Y.applyUpdate(this.doc, docUpdate, 'partykit-update');
        break;

      case 'awareness':
        // User awareness update
        this.awareness.set(data.userId, data.awareness);
        this.onAwarenessChange?.(Array.from(this.awareness.values()));
        break;

      case 'user-left':
        // User disconnected
        this.awareness.delete(data.userId);
        this.onAwarenessChange?.(Array.from(this.awareness.values()));
        break;

      case 'pong':
        // Heartbeat response - reduce log verbosity
        // console.log('[PartykitYjsProvider] Received heartbeat pong');
        break;
        
      case 'auth-error':
        // Authentication error from server
        const authError = new Error(`Authentication error: ${data.message || 'Unknown error'}`);
        console.error('[PartykitYjsProvider] Auth error from server:', authError.message);
        this.onAuthError?.(authError);
        break;
        
      case 'permissionsUpdated':
        // Permission update notification from another client
        console.log('[PartykitYjsProvider] Received permission update notification:', data);
        this.onPermissionUpdate?.();
        break;
        
      default:
        console.log('[PartykitYjsProvider] Unknown message type:', data.type);
    }
  }

  /**
   * Handle binary Yjs updates from Y-PartyServer
   */
  private handleYjsBinaryMessage(update: Uint8Array): void {
    try {
      // Apply Yjs update directly from binary message
      Y.applyUpdate(this.doc, update, 'y-partyserver');
      console.log('[PartykitYjsProvider] Applied Y-PartyServer binary update');
    } catch (error) {
      console.error('[PartykitYjsProvider] Error applying Y-PartyServer update:', error);
    }
  }

  /**
   * Handle enhanced Y-PartyServer messages
   */
  private handleYPartyServerMessage(data: any): void {
    switch (data.type) {
      case 'sync':
        this.handleSyncMessage(data);
        break;

      case 'awareness':
        this.handleAwarenessMessage(data);
        break;

      case 'error':
        console.error('[PartykitYjsProvider] Y-PartyServer error:', data.payload);
        if (data.payload?.code === 'AUTH_ERROR') {
          this.onAuthError?.(new Error(data.payload.message));
        } else {
          this.onConnectionError?.(new Error(data.payload.message));
        }
        break;

      case 'ping':
        // Respond to server ping with pong
        this.sendMessage({ type: 'pong', timestamp: Date.now() });
        break;

      default:
        // Fallback to existing handler for compatibility
        this.handlePartyKitMessage(data);
    }
  }

  /**
   * Handle sync protocol messages from Y-PartyServer
   */
  private handleSyncMessage(data: any): void {
    const { step, data: syncData } = data.payload;
    
    switch (step) {
      case 1: // Sync step 1: state vector received
        const stateVector = new Uint8Array(syncData);
        const update = Y.encodeStateAsUpdate(this.doc, stateVector);
        if (update.length > 0) {
          this.sendMessage({
            type: 'sync',
            payload: { step: 2, data: Array.from(update) },
            timestamp: Date.now()
          });
        }
        break;
        
      case 2: // Sync step 2: update received
        const updateData = new Uint8Array(syncData);
        Y.applyUpdate(this.doc, updateData, 'y-partyserver-sync');
        break;
    }
  }

  /**
   * Handle awareness messages from Y-PartyServer
   */
  private handleAwarenessMessage(data: any): void {
    const { type: awarenessType, user, users, states } = data.payload;
    
    switch (awarenessType) {
      case 'user_joined':
        if (user) {
          this.awareness.set(user.id, user);
          this.onAwarenessChange?.(Array.from(this.awareness.values()));
        }
        break;
        
      case 'user_left':
        if (data.payload.userId) {
          this.awareness.delete(data.payload.userId);
          this.onAwarenessChange?.(Array.from(this.awareness.values()));
        }
        break;
        
      case 'initial_awareness':
      case 'awareness_update':
        if (states) {
          // Update awareness with all user states
          states.forEach((state: any) => {
            if (state.user) {
              this.awareness.set(state.user.id, state);
            }
          });
          this.onAwarenessChange?.(Array.from(this.awareness.values()));
        }
        break;
    }
  }

  private setupDocumentListeners() {
    // Listen for document updates and broadcast to Y-PartyServer
    this.doc.on('updateV2', (update: Uint8Array, origin: any) => {
      // Don't broadcast updates that came from Y-PartyServer to avoid loops
      if (origin === 'y-partyserver' || origin === 'y-partyserver-sync' || origin === 'partykit-sync' || origin === 'partykit-update' || origin === 'supabase-load') {
        return;
      }

      // Log details about what type of update this is to debug frequent updates
      console.log('[PartykitYjsProvider] Document updated:', {
        origin: origin,
        updateSize: update.length,
        timestamp: new Date().toISOString(),
        userId: this.userId
      });
      
      // Check if this is a content update or just awareness update
      // We should only persist actual document content changes, not awareness changes
      if (this.isContentUpdate(update)) {
        console.log('[PartykitYjsProvider] Content update detected - broadcasting and persisting');
      
      // Broadcast binary update directly to Y-PartyServer for real-time sync
      if (this.connectionState.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
        try {
          // Send binary update directly for optimal performance
          this.websocket.send(update);
        } catch (error) {
          console.error('[PartykitYjsProvider] Error sending binary update:', error);
          // Fallback to JSON message
          this.sendMessage({
            type: 'update',
            update: Array.from(update),
            userId: this.userId,
          });
        }
      }

      // Persist to Supabase (debounced to avoid too many requests)
      this.debouncedPersist(update);
      } else {
        console.log('[PartykitYjsProvider] Awareness-only update detected - broadcasting but not persisting');
        
        // Still broadcast for real-time awareness, but don't persist to database
        if (this.connectionState.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
          try {
            this.websocket.send(update);
          } catch (error) {
            console.error('[PartykitYjsProvider] Error sending awareness update:', error);
          }
        }
      }
    });
  }

  /**
   * Check if a Y.js update contains actual document content changes
   * vs just awareness/presence updates
   */
  private isContentUpdate(update: Uint8Array): boolean {
    try {
      // Heuristic approach: awareness updates are typically small and frequent
      // Content updates are typically larger and less frequent
      
      // Very small updates (< 30 bytes) are almost certainly awareness-only
      if (update.length < 30) {
        return false;
      }
      
      // Medium-sized updates (30-100 bytes) need more analysis
      if (update.length < 100) {
        // Check if this looks like an awareness-only update by examining frequency
        // If we're getting many small updates in quick succession, they're likely awareness
        const now = Date.now();
        if (!this.lastUpdateTime) {
          this.lastUpdateTime = now;
          return true; // First update, assume content
        }
        
        const timeSinceLastUpdate = now - this.lastUpdateTime;
        this.lastUpdateTime = now;
        
        // If we got an update within 1 second of the last one and it's small, likely awareness
        if (timeSinceLastUpdate < 1000 && update.length < 80) {
          return false;
        }
      }
      
      // Larger updates or well-spaced updates are likely content changes
      return true;
    } catch (error) {
      console.warn('[PartykitYjsProvider] Error checking update type, assuming content update:', error);
      return true; // If we can't determine, err on the side of caution and persist
    }
  }

  private sendMessage(message: any) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      try {
        this.websocket.send(JSON.stringify(message));
      } catch (error) {
        console.error('[PartykitYjsProvider] Error sending message:', error);
        this.handleConnectionError(error as Error);
      }
    } else {
      console.warn('[PartykitYjsProvider] Cannot send message - WebSocket not connected');
    }
  }

  private broadcastAwareness() {
    if (!this.connectionState.isConnected) return;

    const awareness = {
      user: {
        name: this.userName,
        color: this.userColor,
      },
      cursor: null, // TODO: Add cursor position tracking
      lastSeen: new Date().toISOString(),
    };

    this.sendMessage({
      type: 'awareness',
      userId: this.userId,
      awareness,
    });
  }

  // Debounced persistence to Supabase
  private persistTimeout: NodeJS.Timeout | null = null;
  private debouncedPersist(update: Uint8Array) {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
    }

    this.persistTimeout = setTimeout(async () => {
      await this.persistUpdate(update, origin);
    }, 1000); // Debounce for 1 second
  }

  private async persistUpdate(update: Uint8Array, origin: any) {
    if (!this.documentId || !this.userId) {
      console.warn('[PartykitYjsProvider] Missing documentId or userId for persistence');
      return;
    }

    // Use collaborative save coordinator if available
    if (this.saveCoordinator) {
      return this.coordinatedPersistUpdate(update);
    }

    // Fallback to direct persistence
    return this.directPersistUpdate(update);
  }

  private async coordinatedPersistUpdate(update: Uint8Array): Promise<void> {
    if (!this.saveCoordinator) {
      return this.directPersistUpdate(update);
    }

    try {
      // Convert update to content for hashing
      const updateArray = Array.from(update);
      
      await this.saveCoordinator.coordinateSave(
        updateArray,
        'yjs',
        () => this.directPersistUpdate(update)
      );
    } catch (error) {
      console.error('[PartykitYjsProvider] Coordinated save failed, falling back to direct persistence:', error);
      await this.directPersistUpdate(update);
    }
  }

  private async directPersistUpdate(update: Uint8Array): Promise<void> {
    try {
      // Convert update to array for persistence
      let updateData: number[];
      
      // Log detailed type information for debugging
      console.log('[PartykitYjsProvider] Persisting Y.js document update to Supabase:', {
        documentId: this.documentId,
        updateSize: update.length,
        userId: this.userId,
        updateDataType: typeof update,
        isArray: Array.isArray(update),
        isUint8Array: update instanceof Uint8Array,
        isBuffer: Buffer.isBuffer(update),
        constructor: update.constructor.name
      });

      // Handle different data types properly
      if (Buffer.isBuffer(update)) {
        // Convert Buffer to array of bytes
        updateData = Array.from(update);
        console.log('[PartykitYjsProvider] Converted Buffer to array, first 10 bytes:', updateData.slice(0, 10));
      } else if (update instanceof Uint8Array) {
        // Convert Uint8Array to array of bytes
        updateData = Array.from(update);
        console.log('[PartykitYjsProvider] Converted Uint8Array to array, first 10 bytes:', updateData.slice(0, 10));
      } else if (Array.isArray(update)) {
        // Already an array
        updateData = update;
        console.log('[PartykitYjsProvider] Using existing array, first 10 bytes:', updateData.slice(0, 10));
      } else {
        // Fallback: try to convert to array
        console.warn('[PartykitYjsProvider] Unknown update data type, attempting conversion:', typeof update);
        updateData = Array.from(update as any);
        console.log('[PartykitYjsProvider] Fallback conversion result, first 10 bytes:', updateData.slice(0, 10));
      }
      
      console.log('[PartykitYjsProvider] Persisting Y.js document update to Supabase:', {
        documentId: this.documentId,
        updateSize: updateData.length,
        userId: this.userId,
        updateDataType: typeof updateData,
        isArray: Array.isArray(updateData),
        isBuffer: Buffer.isBuffer(updateData),
        updateConstructor: updateData.constructor.name,
        firstFewBytes: updateData.slice(0, 20),
        originalUpdateType: typeof update,
        originalUpdateConstructor: update.constructor.name
      });

      // Ensure updateData is a plain array for JSON serialization
      const updateArray = Array.isArray(updateData) ? updateData : Array.from(updateData);

      // Call the existing Y.js updates API
      const response = await fetch('/api/collaboration/yjs-updates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Include auth header if we have a token
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        },
        body: JSON.stringify({
          documentId: this.documentId,
          updateData: updateArray
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to persist Y.js update: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('[PartykitYjsProvider] Successfully persisted Y.js update:', {
        updateId: result.updateId,
        createdAt: result.createdAt
      });

    } catch (error) {
      console.error('[PartykitYjsProvider] Error persisting Y.js update to Supabase:', error);
      
      // If it's a network error, we might want to retry
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.log('[PartykitYjsProvider] Network error detected, will retry on next update');
      }
      
      // Don't throw - persistence failures shouldn't break real-time collaboration
      // The update is still broadcasted via PartyKit for real-time sync
    }
  }

  // Update user awareness/presence
  public updateAwareness(awareness: any) {
    this.broadcastAwareness();
    
    // Also update session activity
    this.updateSessionActivity();
  }

  private async updateSessionActivity() {
    // Session activity is managed by the PartyKit server through WebSocket heartbeat
    // No need for API calls - the server tracks all session activity automatically
    console.log('[PartykitYjsProvider] Session activity tracked by PartyKit server');
  }

  // Public methods
  public isConnectedToPartyKit(): boolean {
    return this.connectionState.isConnected;
  }

  public getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  public getAwareness(): any[] {
    return Array.from(this.awareness.values());
  }

  public async refreshAuthToken(): Promise<void> {
    await this.ensureValidAuthToken();
  }

  /**
   * Send a permission update notification to all connected clients
   * This triggers other clients to re-fetch their permissions from the server
   */
  public sendPermissionUpdateNotification(): void {
    if (!this.connectionState.isConnected) {
      console.warn('[PartykitYjsProvider] Cannot send permission update - not connected to PartyKit');
      return;
    }

    if (!this.documentId || !this.userId) {
      console.error('[PartykitYjsProvider] Cannot send permission update - missing documentId or userId');
      return;
    }

    const permissionUpdateMessage = {
      type: 'permissionsUpdated',
      documentId: this.documentId,
      timestamp: Date.now(),
      triggeredBy: this.userId
    };

    console.log('[PartykitYjsProvider] Sending permission update notification:', permissionUpdateMessage);
    this.sendMessage(permissionUpdateMessage);
  }

  public destroy() {
    console.log('[PartykitYjsProvider] Destroying provider...');
    
    // Destroy save coordinator
    if (this.saveCoordinator) {
      this.saveCoordinator.destroy();
      this.saveCoordinator = null;
    }
    
    // Clear all timeouts and intervals
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
      this.persistTimeout = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }

    // Close PartyKit connection gracefully
    if (this.websocket) {
      this.websocket.close(1000, 'Provider destroyed');
      this.websocket = null;
    }

    // End collaborative session
    this.endSession();

    // Reset connection state
    this.connectionState = {
      isConnected: false,
      isReconnecting: false,
      reconnectAttempts: 0,
    };
  }

  private async endSession() {
    // Session cleanup is handled by the PartyKit server when WebSocket disconnects
    // No need for API calls - the server manages all session lifecycle automatically
    console.log('[PartykitYjsProvider] Session cleanup handled by PartyKit server');
  }
} 