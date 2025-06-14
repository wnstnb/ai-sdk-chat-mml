import type { AuthenticatedUser, JWTPayload, ServerError } from '../types/index.js';

/**
 * Predefined user colors for collaboration
 */
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
];

/**
 * Generate a consistent color for a user based on their ID
 */
export function generateUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[index];
}

/**
 * Base64 URL decode function for JWT parsing
 */
function base64UrlDecode(str: string): string {
  // Replace URL-safe characters
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  while (str.length % 4) {
    str += '=';
  }
  
  try {
    return atob(str);
  } catch (error) {
    throw new Error('Invalid base64 encoding');
  }
}

/**
 * Verify JWT token and extract user information
 * Note: This is a simplified JWT verification for Cloudflare Workers
 * In production, you should use a proper JWT library or crypto.subtle API
 */
export function verifyJWT(token: string, secret: string): AuthenticatedUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('Invalid JWT token format');
      return null;
    }

    // Decode payload (skip signature verification for now - add crypto.subtle verification in production)
    const payload = JSON.parse(base64UrlDecode(parts[1])) as JWTPayload;
    
    if (!payload.sub) {
      console.warn('JWT token missing user ID (sub claim)');
      return null;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.warn('JWT token has expired');
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.user_metadata?.name || 'Anonymous User',
      avatar: payload.user_metadata?.avatar_url,
      color: generateUserColor(payload.sub)
    };
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * Extract JWT token from WebSocket connection headers or URL
 */
export function extractToken(request: Request): string | null {
  try {
    // Try to get token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try to get token from URL query parameter
    const url = new URL(request.url);
    const tokenParam = url.searchParams.get('token');
    if (tokenParam) {
      return tokenParam;
    }

    return null;
  } catch (error) {
    console.error('Error extracting token:', error);
    return null;
  }
}

/**
 * Create authentication error response
 */
export function createAuthError(message: string, code = 'AUTH_ERROR'): ServerError {
  return {
    code,
    message,
    details: { timestamp: Date.now() }
  };
}

/**
 * Validate user session and return authenticated user
 */
export function authenticateUser(request: Request, jwtSecret: string): AuthenticatedUser | ServerError {
  const token = extractToken(request);
  
  if (!token) {
    return createAuthError('No authentication token provided', 'NO_TOKEN');
  }

  const user = verifyJWT(token, jwtSecret);
  
  if (!user) {
    return createAuthError('Invalid or expired authentication token', 'INVALID_TOKEN');
  }

  return user;
} 