import type { AuthenticatedUser, CollaborationMessage } from '../types/index.js';

/**
 * Connection states for PartySocket
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

/**
 * Enhanced PartySocket connection options
 */
export interface PartySocketOptions {
  host: string;
  room: string;
  party?: string;
  protocol?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * Message queue item for buffering during disconnection
 */
interface QueuedMessage {
  data: string | ArrayBuffer;
  timestamp: number;
  retries: number;
}

/**
 * Enhanced PartySocket wrapper with reconnection and queuing
 */
export class EnhancedPartySocket {
  private socket: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private messageQueue: QueuedMessage[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;

  // Event handlers
  private onStateChangeCallback: ((state: ConnectionState) => void) | null = null;
  private onMessageCallback: ((data: string | ArrayBuffer) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(private options: PartySocketOptions) {}

  /**
   * Connect to the PartyKit server
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
      return;
    }

    this.setState(ConnectionState.CONNECTING);

    try {
      const url = this.buildWebSocketUrl();
      console.log(`Connecting to PartyKit: ${url}`);

      this.socket = new WebSocket(url);
      this.setupSocketEventHandlers();
      
      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.state === ConnectionState.CONNECTING) {
          this.handleConnectionTimeout();
        }
      }, 10000);

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.clearTimers();
    
    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }
    
    this.setState(ConnectionState.DISCONNECTED);
    this.messageQueue = [];
    this.reconnectAttempts = 0;
  }

  /**
   * Send message to the server
   */
  send(data: string | ArrayBuffer): void {
    if (this.state === ConnectionState.CONNECTED && this.socket) {
      try {
        this.socket.send(data);
      } catch (error) {
        console.error('Failed to send message:', error);
        this.queueMessage(data);
      }
    } else {
      this.queueMessage(data);
    }
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Set state change callback
   */
  onStateChange(callback: (state: ConnectionState) => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Set message callback
   */
  onMessage(callback: (data: string | ArrayBuffer) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * Set error callback
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Build WebSocket URL from options
   */
  private buildWebSocketUrl(): string {
    const protocol = this.options.protocol || (typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:');
    const party = this.options.party || 'main';
    
    let url = `${protocol}//${this.options.host}/parties/${party}/${this.options.room}`;
    
    // Add query parameters
    if (this.options.query) {
      const params = new URLSearchParams(this.options.query);
      url += `?${params.toString()}`;
    }
    
    return url;
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupSocketEventHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log('PartySocket connected');
      this.clearTimers();
      this.setState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.processMessageQueue();
      this.startHeartbeat();
    };

    this.socket.onmessage = (event) => {
      this.onMessageCallback?.(event.data);
    };

    this.socket.onclose = (event) => {
      console.log(`PartySocket closed: ${event.code} ${event.reason}`);
      this.clearTimers();
      
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      } else {
        this.setState(ConnectionState.DISCONNECTED);
      }
    };

    this.socket.onerror = (event) => {
      console.error('PartySocket error:', event);
      this.handleConnectionError(new Error('WebSocket error'));
    };
  }

  /**
   * Handle connection timeout
   */
  private handleConnectionTimeout(): void {
    console.warn('Connection timeout');
    this.socket?.close();
    this.handleConnectionError(new Error('Connection timeout'));
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: Error): void {
    this.setState(ConnectionState.ERROR);
    this.onErrorCallback?.(error);
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.setState(ConnectionState.RECONNECTING);
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Queue message for later sending
   */
  private queueMessage(data: string | ArrayBuffer): void {
    this.messageQueue.push({
      data,
      timestamp: Date.now(),
      retries: 0
    });
    
    // Limit queue size
    if (this.messageQueue.length > 100) {
      this.messageQueue.shift();
    }
  }

  /**
   * Process queued messages after reconnection
   */
  private processMessageQueue(): void {
    const now = Date.now();
    const maxAge = 60000; // 1 minute
    
    // Filter out old messages
    this.messageQueue = this.messageQueue.filter(msg => now - msg.timestamp < maxAge);
    
    // Send remaining messages
    const toSend = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const message of toSend) {
      this.send(message.data);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.state === ConnectionState.CONNECTED && this.socket) {
        try {
          this.socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch (error) {
          console.warn('Heartbeat failed:', error);
        }
      }
    }, 30000); // 30 seconds
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  /**
   * Set connection state and notify callback
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.onStateChangeCallback?.(state);
    }
  }
}

/**
 * Create PartySocket instance with authentication
 */
export function createPartySocket(
  host: string,
  room: string,
  token?: string,
  party = 'collaboration'
): EnhancedPartySocket {
  const options: PartySocketOptions = {
    host,
    room,
    party,
    protocol: host.includes('localhost') ? 'ws:' : 'wss:'
  };

  // Add authentication token
  if (token) {
    options.query = { token };
  }

  return new EnhancedPartySocket(options);
}

/**
 * Utility for sending awareness updates
 */
export function createAwarenessMessage(
  user: AuthenticatedUser,
  cursor?: { anchor: number; head: number },
  selection?: any
): CollaborationMessage {
  return {
    type: 'awareness',
    payload: {
      type: 'awareness_update',
      user,
      cursor,
      selection,
      timestamp: Date.now()
    },
    userId: user.id,
    timestamp: Date.now()
  };
}

/**
 * Utility for creating sync messages
 */
export function createSyncMessage(step: number, data: Uint8Array): CollaborationMessage {
  return {
    type: 'sync',
    payload: {
      step,
      data: Array.from(data)
    },
    timestamp: Date.now()
  };
} 