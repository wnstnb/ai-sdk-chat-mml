import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";

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
    
    // Handle string messages (could be comment events)
    if (typeof message === 'string') {
      try {
        const parsedMessage = JSON.parse(message);
        
        // Handle comment-related events
        if (parsedMessage.type && parsedMessage.type.startsWith('comment:')) {
          console.log('[PartyKit] Comment event:', parsedMessage.type, 'from user:', (sender as any).userId);
          
          // Broadcast comment events to all connected users
          this.room.broadcast(message, [sender.id]);
          return;
        }
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