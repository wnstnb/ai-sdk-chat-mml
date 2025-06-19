import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";

// Type definitions for custom messages
interface PermissionUpdateMessage {
  type: 'permissionsUpdated';
  documentId: string;
  timestamp: number;
  triggeredBy: string; // userId
}

interface CommentMessage {
  type: string; // comment:* types
  [key: string]: any;
}

type CustomMessage = PermissionUpdateMessage | CommentMessage;

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onBeforeConnect(request: Party.Request, lobby: Party.Lobby) {
    // Get user ID and client ID from query parameters
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const clientId = url.searchParams.get('clientId');
    
    console.log('[PartyKit] Connection attempt with userId:', userId, 'clientId:', clientId);
    console.log('[PartyKit] Full URL:', request.url);
    
    // Simple user ID validation (clientId is optional for backwards compatibility)
    if (!userId || userId === 'anonymous') {
      console.log('[PartyKit] ❌ No valid user ID provided');
      return new Response('Authentication required', { status: 401 });
    }
    
    // For now, accept any non-anonymous user ID
    // In production, you could validate against your user database
    console.log('[PartyKit] ✅ User authenticated:', userId, 'with client:', clientId || 'legacy');
    
    // Return the request as-is - the userId and clientId will be available in onConnect via the URL
    return request;
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Get user info and client info from the connection URL
    const url = new URL(ctx.request.url);
    const userId = url.searchParams.get('userId');
    const clientId = url.searchParams.get('clientId');
    
    console.log('[PartyKit] User connected with ID:', userId, 'Client ID:', clientId);
    console.log('[PartyKit] Connection URL:', ctx.request.url);
    
    if (!userId) {
      console.log('[PartyKit] ❌ No userId found in connection context');
      conn.close(1008, 'Authentication required');
      return;
    }
    
    // Store user info and client info on the connection for future use
    (conn as any).userId = userId;
    (conn as any).clientId = clientId || `${userId}_legacy_${Date.now()}`;
    
    console.log('[PartyKit] ✅ Successfully connected user:', userId, 'as client:', (conn as any).clientId);
    
    // Call the Y.js connection handler
    return onConnect(conn, this.room);
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    // Log message for debugging
    console.log('[PartyKit] Message from user:', (sender as any).userId, 'client:', (sender as any).clientId);
    
    // Handle string messages (custom events)
    if (typeof message === 'string') {
      try {
        const parsedMessage: CustomMessage = JSON.parse(message);
        
        // Handle permission update events
        if (parsedMessage.type === 'permissionsUpdated') {
          console.log('[PartyKit] Permission update event received from user:', (sender as any).userId);
          
          const permissionMsg = parsedMessage as PermissionUpdateMessage;
          
          // Validate message structure
          if (!permissionMsg.documentId || !permissionMsg.timestamp || !permissionMsg.triggeredBy) {
            console.error('[PartyKit] Invalid permission update message structure:', permissionMsg);
            return;
          }
          
          // Validate that the document ID matches the room ID
          const roomDocumentId = this.room.id;
          if (permissionMsg.documentId !== roomDocumentId) {
            console.error('[PartyKit] Permission update document ID mismatch. Expected:', roomDocumentId, 'Received:', permissionMsg.documentId);
            return;
          }
          
          // Validate that the sender is the one who triggered the update
          const senderUserId = (sender as any).userId;
          if (permissionMsg.triggeredBy !== senderUserId) {
            console.error('[PartyKit] Permission update sender validation failed. Expected:', senderUserId, 'Received:', permissionMsg.triggeredBy);
            return;
          }
          
          // Broadcast permission update to all connected clients EXCEPT the sender
          console.log('[PartyKit] Broadcasting permission update to all clients except sender');
          this.room.broadcast(message, [sender.id]);
          return;
        }
        
        // Handle comment-related events
        if (parsedMessage.type && parsedMessage.type.startsWith('comment:')) {
          console.log('[PartyKit] Comment event:', parsedMessage.type, 'from user:', (sender as any).userId);
          
          // Broadcast comment events to all connected users
          this.room.broadcast(message, [sender.id]);
          return;
        }
        
        // Log unhandled custom message types
        console.log('[PartyKit] Unhandled custom message type:', parsedMessage.type);
        
      } catch (e) {
        // Not JSON, probably Y.js binary data as string
        console.log('[PartyKit] Non-JSON string message, treating as Y.js data');
      }
    }
    
    // Forward to all other connections (Y.js handles this automatically)
    this.room.broadcast(message, [sender.id]);
  }

  async onClose(connection: Party.Connection) {
    console.log('[PartyKit] User disconnected:', (connection as any).userId, 'client:', (connection as any).clientId);
  }
} 