import type * as Party from "partykit/server";
import type {
  AuthenticatedUser,
  DocumentSession,
  UserPresence,
  CollaborationMessage,
  ServerConfig,
  ServerError
} from './types/index.js';
import { authenticateUser } from './utils/auth.js';
import { loadServerConfig, createCorsHeaders, logConfigStatus } from './utils/config.js';

/**
 * Main PartyKit server for real-time collaborative editing
 */
export default class CollaborationServer implements Party.Server {
  private config: ServerConfig;
  private activeSessions = new Map<string, DocumentSession>();
  private userPresence = new Map<string, UserPresence>();
  private documentState = new Map<string, Uint8Array>(); // Simple document state storage

  constructor(readonly party: Party.Party) {
    try {
      // Load configuration from environment
      this.config = loadServerConfig(party.env);
      logConfigStatus(this.config);
      
      console.log(`CollaborationServer initialized for document: ${party.id}`);
    } catch (error) {
      console.error('Failed to initialize CollaborationServer:', error);
      throw error;
    }
  }

  /**
   * Handle new WebSocket connections
   */
  async onConnect(connection: Party.Connection, ctx: Party.ConnectionContext): Promise<void> {
    try {
      console.log(`New connection attempt for document ${this.party.id} from ${connection.id}`);

      // Authenticate the user
      const authResult = authenticateUser(ctx.request, this.config.jwtSecret);
      
      if ('code' in authResult) {
        console.warn(`Authentication failed for connection ${connection.id}:`, authResult.message);
        connection.close(1008, authResult.message);
        return;
      }

      const user = authResult as AuthenticatedUser;
      console.log(`User ${user.name} (${user.id}) connected to document ${this.party.id}`);

      // Store user session
      const session: DocumentSession = {
        documentId: this.party.id,
        userId: user.id,
        userName: user.name || 'Anonymous',
        userColor: user.color || '#4A5568',
        joinedAt: Date.now(),
        lastActivity: Date.now()
      };

      this.activeSessions.set(connection.id, session);

      // Store user presence
      const presence: UserPresence = {
        user,
        lastActivity: Date.now()
      };

      this.userPresence.set(connection.id, presence);

      // Send initial document state if available
      const documentData = this.documentState.get(this.party.id);
      if (documentData) {
        connection.send(documentData);
      }

      // Notify other users about the new connection
      await this.broadcastUserJoined(user, connection.id);

      // Send current presence information to the new user
      await this.sendPresenceUpdate(connection);

    } catch (error) {
      console.error(`Error handling connection for ${connection.id}:`, error);
      connection.close(1011, 'Internal server error');
    }
  }

  /**
   * Handle incoming messages from clients
   */
  async onMessage(message: string | ArrayBuffer, sender: Party.Connection): Promise<void> {
    try {
      const session = this.activeSessions.get(sender.id);
      if (!session) {
        console.warn(`Message from unregistered connection: ${sender.id}`);
        return;
      }

      // Update last activity
      session.lastActivity = Date.now();
      const presence = this.userPresence.get(sender.id);
      if (presence) {
        presence.lastActivity = Date.now();
      }

      // Handle text messages (JSON)
      if (typeof message === 'string') {
        await this.handleTextMessage(message, sender, session);
      } else {
        // Handle binary messages (Yjs updates)
        await this.handleBinaryMessage(message, sender, session);
      }

    } catch (error) {
      console.error(`Error handling message from ${sender.id}:`, error);
      this.sendError(sender, 'MESSAGE_ERROR', 'Failed to process message');
    }
  }

  /**
   * Handle connection close
   */
  async onClose(connection: Party.Connection): Promise<void> {
    try {
      const session = this.activeSessions.get(connection.id);
      if (session) {
        console.log(`User ${session.userName} disconnected from document ${session.documentId}`);
        
        // Clean up session data
        this.activeSessions.delete(connection.id);
        this.userPresence.delete(connection.id);

        // Notify other users about the disconnection
        await this.broadcastUserLeft(session.userId, connection.id);
      }
    } catch (error) {
      console.error(`Error handling connection close for ${connection.id}:`, error);
    }
  }

  /**
   * Handle HTTP requests (for health checks, etc.)
   */
  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const origin = req.headers.get('Origin');
      const corsHeaders = createCorsHeaders(origin, this.config.corsOrigins);
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'healthy', 
        timestamp: Date.now(),
        activeSessions: this.activeSessions.size,
        documentId: this.party.id
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle text-based messages (JSON)
   */
  private async handleTextMessage(
    message: string, 
    sender: Party.Connection, 
    session: DocumentSession
  ): Promise<void> {
    try {
      const parsed: CollaborationMessage = JSON.parse(message);
      
      switch (parsed.type) {
        case 'awareness':
          await this.handleAwarenessUpdate(parsed, sender, session);
          break;
        
        case 'sync':
          // Handle document sync requests
          await this.handleSyncMessage(parsed, sender, session);
          break;
          
        default:
          console.warn(`Unknown message type: ${parsed.type}`);
      }
    } catch (error) {
      console.error('Failed to parse text message:', error);
      this.sendError(sender, 'PARSE_ERROR', 'Invalid message format');
    }
  }

  /**
   * Handle binary messages (Yjs updates)
   */
  private async handleBinaryMessage(
    message: ArrayBuffer, 
    sender: Party.Connection, 
    session: DocumentSession
  ): Promise<void> {
    try {
      // Store the document update
      this.documentState.set(this.party.id, new Uint8Array(message));
      
      // Broadcast the update to all other connections
      await this.broadcastBinaryToOthers(message, sender.id);
      
      console.log(`Document update received from ${session.userName} for document ${this.party.id}`);
    } catch (error) {
      console.error('Failed to handle binary message:', error);
    }
  }

  /**
   * Handle document sync messages
   */
  private async handleSyncMessage(
    message: CollaborationMessage, 
    sender: Party.Connection, 
    session: DocumentSession
  ): Promise<void> {
    // Send current document state to requesting client
    const documentData = this.documentState.get(this.party.id);
    if (documentData) {
      sender.send(documentData);
    }
  }

  /**
   * Handle awareness/presence updates
   */
  private async handleAwarenessUpdate(
    message: CollaborationMessage, 
    sender: Party.Connection, 
    session: DocumentSession
  ): Promise<void> {
    const presence = this.userPresence.get(sender.id);
    if (!presence) return;

    // Update cursor position if provided
    if (message.payload?.cursor) {
      presence.cursor = message.payload.cursor;
    }

    // Broadcast awareness update to other users
    await this.broadcastPresenceUpdate(sender.id);
  }

  /**
   * Broadcast that a user joined
   */
  private async broadcastUserJoined(user: AuthenticatedUser, connectionId: string): Promise<void> {
    const message: CollaborationMessage = {
      type: 'awareness',
      payload: {
        type: 'user_joined',
        user,
        timestamp: Date.now()
      },
      userId: user.id,
      timestamp: Date.now()
    };

    await this.broadcastToOthers(JSON.stringify(message), connectionId);
  }

  /**
   * Broadcast that a user left
   */
  private async broadcastUserLeft(userId: string, connectionId: string): Promise<void> {
    const message: CollaborationMessage = {
      type: 'awareness',
      payload: {
        type: 'user_left',
        userId,
        timestamp: Date.now()
      },
      userId,
      timestamp: Date.now()
    };

    await this.broadcastToOthers(JSON.stringify(message), connectionId);
  }

  /**
   * Broadcast presence update to other users
   */
  private async broadcastPresenceUpdate(excludeConnectionId: string): Promise<void> {
    const presenceData = Array.from(this.userPresence.entries())
      .filter(([connId]) => connId !== excludeConnectionId)
      .map(([_, presence]) => presence);

    const message: CollaborationMessage = {
      type: 'awareness',
      payload: {
        type: 'presence_update',
        users: presenceData,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };

    await this.broadcastToOthers(JSON.stringify(message), excludeConnectionId);
  }

  /**
   * Send current presence info to a specific connection
   */
  private async sendPresenceUpdate(connection: Party.Connection): Promise<void> {
    const allPresence = Array.from(this.userPresence.values());
    
    const message: CollaborationMessage = {
      type: 'awareness',
      payload: {
        type: 'initial_presence',
        users: allPresence,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };

    connection.send(JSON.stringify(message));
  }

  /**
   * Send error message to a connection
   */
  private sendError(connection: Party.Connection, code: string, message: string): void {
    const errorMessage: CollaborationMessage = {
      type: 'error',
      payload: {
        code,
        message,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };

    connection.send(JSON.stringify(errorMessage));
  }

  /**
   * Broadcast text message to all connections except one
   */
  private async broadcastToOthers(message: string, excludeConnectionId: string): Promise<void> {
    this.party.broadcast(message, [excludeConnectionId]);
  }

  /**
   * Broadcast binary message to all connections except one
   */
  private async broadcastBinaryToOthers(message: ArrayBuffer, excludeConnectionId: string): Promise<void> {
    this.party.broadcast(message, [excludeConnectionId]);
  }
} 