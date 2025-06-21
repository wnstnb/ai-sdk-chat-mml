import type { User } from '@supabase/supabase-js';

/**
 * User authentication and session types
 */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  color?: string;
}

export interface JWTPayload {
  sub: string; // user ID
  email?: string;
  user_metadata?: {
    name?: string;
    avatar_url?: string;
  };
  iat: number;
  exp: number;
}

/**
 * Document and collaboration types
 */
export interface DocumentSession {
  documentId: string;
  userId: string;
  userName: string;
  userColor: string;
  joinedAt: number;
  lastActivity: number;
}

export interface UserPresence {
  user: AuthenticatedUser;
  cursor?: {
    anchor: number;
    head: number;
  };
  lastActivity: number;
}

export interface CollaborationMessage {
  type: 'sync' | 'awareness' | 'auth' | 'error';
  payload: any;
  userId?: string;
  timestamp: number;
}

/**
 * Server configuration types
 */
export interface ServerConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  jwtSecret: string;
  corsOrigins: string[];
}

/**
 * Error types
 */
export interface ServerError {
  code: string;
  message: string;
  details?: any;
}

/**
 * Yjs document persistence types
 */
export interface YjsUpdate {
  documentId: string;
  updateData: Uint8Array;
  userId: string;
  timestamp: number;
}

export interface DocumentState {
  documentId: string;
  lastModified: number;
  lastModifiedBy: string;
  version: number;
} 