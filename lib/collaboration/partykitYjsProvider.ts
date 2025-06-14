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
    if (!this.supabase) return;

    try {
      console.log('[PartykitYjsProvider] Loading document state from Supabase...');
      
      // Build the request with auth headers if available
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }
      
      // Fetch Yjs updates from our Supabase API
      const response = await fetch(`/api/collaboration/yjs-updates?documentId=${this.documentId}`, {
        headers,
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed - invalid or expired token');
        }
        throw new Error(`Failed to load document state: ${response.statusText}`);
      }

      const { updates } = await response.json();
      
      if (updates && updates.length > 0) {
        console.log(`[PartykitYjsProvider] Applying ${updates.length} updates from Supabase`);
        
        // Apply updates to restore document state
        updates.forEach((update: any) => {
          const updateArray = new Uint8Array(update.data);
          Y.applyUpdate(this.doc, updateArray, 'supabase-load');
        });
      }

      console.log('[PartykitYjsProvider] Document state loaded successfully');
    } catch (error) {
      console.error('[PartykitYjsProvider] Error loading document state:', error);
      
      if (error instanceof Error && error.message.includes('Authentication failed')) {
        this.onAuthError?.(error);
      }
      
      // Don't throw - allow provider to work without persistence
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
      // Build WebSocket URL with authentication parameters
      const wsUrl = new URL(`ws://${this.partykitHost}/parties/yjs/${this.documentId}`);
      
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

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handlePartyKitMessage(data);
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

  private setupDocumentListeners() {
    // Listen for document updates and broadcast to PartyKit
    this.doc.on('updateV2', (update: Uint8Array, origin: any) => {
      // Don't broadcast updates that came from PartyKit to avoid loops
      if (origin === 'partykit-sync' || origin === 'partykit-update' || origin === 'supabase-load') {
        return;
      }

      console.log('[PartykitYjsProvider] Document updated, broadcasting to PartyKit');
      
      // Broadcast to PartyKit for real-time sync
      if (this.connectionState.isConnected) {
        this.sendMessage({
          type: 'update',
          update: Array.from(update),
          userId: this.userId,
        });
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
    if (!this.supabase) return;

    try {
      console.log('[PartykitYjsProvider] Persisting update to Supabase...');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }
      
      const response = await fetch('/api/collaboration/yjs-updates', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          documentId: this.documentId,
          updateData: Array.from(update),
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn('[PartykitYjsProvider] Auth token expired during persistence, refreshing...');
          await this.ensureValidAuthToken();
          // Retry once with new token
          return this.persistUpdate(update);
        }
        throw new Error(`Failed to persist update: ${response.statusText}`);
      }

      console.log('[PartykitYjsProvider] Update persisted successfully');
    } catch (error) {
      console.error('[PartykitYjsProvider] Error persisting update:', error);
      
      if (error instanceof Error && error.message.includes('Authentication')) {
        this.onAuthError?.(error);
      }
    }
  }

  // Update user awareness/presence
  public updateAwareness(awareness: any) {
    this.broadcastAwareness();
    
    // Also update session activity
    this.updateSessionActivity();
  }

  private async updateSessionActivity() {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }
      
      await fetch('/api/collaboration/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          documentId: this.documentId,
          sessionData: {
            userName: this.userName,
            userColor: this.userColor,
            lastActivity: new Date().toISOString(),
          },
        }),
      });
    } catch (error) {
      console.error('[PartykitYjsProvider] Error updating session activity:', error);
    }
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
    try {
      const headers: Record<string, string> = {};
      
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }
      
      await fetch(`/api/collaboration/sessions?documentId=${this.documentId}`, {
        method: 'DELETE',
        headers,
      });
    } catch (error) {
      console.error('[PartykitYjsProvider] Error ending session:', error);
    }
  }
} 