import type { ServerConfig } from '../types/index.js';

/**
 * Default CORS origins for development
 */
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://localhost:3000',
  'https://localhost:3001'
];

/**
 * Load server configuration from environment variables
 */
export function loadServerConfig(env: any): ServerConfig {
  const config: ServerConfig = {
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    jwtSecret: env.SUPABASE_JWT_SECRET || '',
    corsOrigins: DEFAULT_CORS_ORIGINS
  };

  // Add production origins if specified
  if (env.CORS_ORIGINS) {
    const prodOrigins = env.CORS_ORIGINS.split(',').map((origin: string) => origin.trim());
    config.corsOrigins = [...config.corsOrigins, ...prodOrigins];
  }

  // Validate required configuration
  const requiredFields = ['supabaseUrl', 'supabaseServiceKey', 'jwtSecret'];
  const missingFields = requiredFields.filter(field => !config[field as keyof ServerConfig]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required environment variables: ${missingFields.join(', ')}`);
  }

  return config;
}

/**
 * Check if origin is allowed for CORS
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  
  return allowedOrigins.some(allowed => {
    // Exact match
    if (allowed === origin) return true;
    
    // Wildcard match for development
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(origin);
    }
    
    return false;
  });
}

/**
 * Create CORS headers for WebSocket upgrade
 */
export function createCorsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  
  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With';
  }
  
  return headers;
}

/**
 * Log configuration status (without sensitive data)
 */
export function logConfigStatus(config: ServerConfig): void {
  console.log('PartyKit Server Configuration:');
  console.log(`- Supabase URL: ${config.supabaseUrl ? 'configured' : 'missing'}`);
  console.log(`- Supabase Service Key: ${config.supabaseServiceKey ? 'configured' : 'missing'}`);
  console.log(`- JWT Secret: ${config.jwtSecret ? 'configured' : 'missing'}`);
  console.log(`- CORS Origins: ${config.corsOrigins.length} configured`);
  
  if (config.corsOrigins.length > 0) {
    console.log('  Allowed origins:', config.corsOrigins.join(', '));
  }
} 