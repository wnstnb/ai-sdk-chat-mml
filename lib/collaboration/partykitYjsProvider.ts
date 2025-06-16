import * as Y from 'yjs';
import { createClient } from '@supabase/supabase-js';

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

  // Authentication and connection management
  private authToken?: string;
  private WebSocketClass: typeof WebSocket;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private tokenRefreshInterval: NodeJS.Timeout | null = null;

  // Event callbacks
  private onSynced?: () => void;
  private onConnectionStatusChange?: (connected: boolean) => void;
  private onAwarenessChange?: (awareness: any) => void;
  private onAuthError?: (error: Error) => void;
  private onConnectionError?: (error: Error) => void;

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

    // Initialize Supabase client for persistence and auth
    if (options.supabaseUrl && options.supabaseAnonKey) {
      this.supabase = createClient(options.supabaseUrl, options.supabaseAnonKey);
    }

    this.initialize();
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
        console.log('[PartykitYjsProvider] JWT token obtained successfully');
      } else {
        console.warn('[PartykitYjsProvider] No valid session found - proceeding without authentication');
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
    // Document state will be loaded via WebSocket sync with PartyKit server
    // No need for API calls - the PartyKit server handles all persistence
    console.log('[PartykitYjsProvider] Document state will be synced via WebSocket connection');
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
    // Send ping every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.connectionState.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'ping', userId: this.userId });
      }
    }, 30000);
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
        // Heartbeat response
        console.log('[PartykitYjsProvider] Received heartbeat pong');
        break;
        
      case 'auth-error':
        // Authentication error from server
        const authError = new Error(`Authentication error: ${data.message || 'Unknown error'}`);
        console.error('[PartykitYjsProvider] Auth error from server:', authError.message);
        this.onAuthError?.(authError);
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

      console.log('[PartykitYjsProvider] Document updated, broadcasting to Y-PartyServer');
      
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
    });
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
      await this.persistUpdate(update);
    }, 1000); // Debounce for 1 second
  }

  private async persistUpdate(update: Uint8Array): Promise<void> {
    // Persistence is handled by the PartyKit server automatically
    // No need for API calls - the server manages all document persistence
    console.log('[PartykitYjsProvider] Update will be persisted by PartyKit server');
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

  public destroy() {
    console.log('[PartykitYjsProvider] Destroying provider...');
    
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