# PartyKit Collaboration Server

This directory contains the PartyKit server for real-time collaborative editing. The server provides WebSocket-based collaboration using Yjs for document synchronization and user presence awareness.

## Architecture

- **`src/server.ts`** - Main PartyKit server implementation
- **`src/types/`** - TypeScript type definitions
- **`src/utils/`** - Utility modules for authentication and configuration
- **`partykit.json`** - PartyKit deployment configuration
- **`package.json`** - Node.js dependencies and scripts

## Features

- ✅ JWT authentication with Supabase
- ✅ Real-time document synchronization
- ✅ User presence and awareness
- ✅ Connection state management
- ✅ CORS support for multiple origins
- ✅ Health check endpoint
- ✅ Binary message handling for Yjs updates

## Prerequisites

1. **Cloudflare Account** - PartyKit deploys to Cloudflare Workers
2. **PartyKit CLI** - Install globally: `npm install -g partykit`
3. **Supabase Project** - For authentication and database

## Environment Variables

Copy `env.example` to `.env` and configure:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_JWT_SECRET=your-jwt-secret-here

# CORS Configuration (comma-separated origins for production)
CORS_ORIGINS=https://your-app.com,https://your-staging.com

# Environment
NODE_ENV=production
```

## Development

1. **Install dependencies:**
   ```bash
   cd party
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Type checking:**
   ```bash
   npm run type-check
   ```

## Deployment

### ✅ Successfully Deployed

**Production URL:** `https://ai-chat-collaboration.wnstnb.partykit.dev`

### Environment Variables Setup

✅ **Configured Environment Variables:**
- `SUPABASE_URL`: https://ikbmdbgxdprtcgasdijz.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY`: ✅ Set
- `SUPABASE_JWT_SECRET`: ⚠️ Placeholder (update from Supabase dashboard)
- `CORS_ORIGINS`: ✅ Set for localhost development

### Deployment Commands

1. **Deploy to Cloudflare:**
   ```bash
   npm run deploy
   ```

2. **Verify deployment:**
   ```bash
   ./verify-deployment.sh
   ```

3. **Monitor logs:**
   ```bash
   npx partykit tail
   ```

4. **Manage environment variables:**
   ```bash
   npx partykit env list
   npx partykit env add KEY_NAME
   ```

### Important Notes

1. **JWT Secret**: Update `SUPABASE_JWT_SECRET` with the actual JWT secret from your Supabase project settings
2. **CORS Origins**: Add your production domain to `CORS_ORIGINS` when deploying to production
3. **Domain Provisioning**: New domains can take up to 2 minutes to provision

## API Endpoints

### WebSocket Connection
- **URL**: `wss://ai-chat-collaboration.wnstnb.partykit.dev/parties/collaboration/{documentId}`
- **Auth**: JWT token via `?token={token}` query parameter

### HTTP Endpoints
- **Health Check**: `GET /health` - Returns server status and metrics

## Client Integration

The client should connect using the updated PartyKit provider:

```typescript
import { usePartyKitProvider } from './path-to-collaboration-provider';

// In your component
const { provider, status, error } = usePartyKitProvider({
  documentId: 'doc-123',
  token: supabaseSession?.access_token,
  partyKitHost: process.env.NEXT_PUBLIC_PARTYKIT_HOST
});
```

## Message Protocol

### Text Messages (JSON)
```typescript
interface CollaborationMessage {
  type: 'sync' | 'awareness' | 'auth' | 'error';
  payload: any;
  userId?: string;
  timestamp: number;
}
```

### Binary Messages
- Yjs document updates are sent as binary ArrayBuffer messages
- Server stores and broadcasts updates to all connected clients

## Error Handling

The server includes comprehensive error handling:
- Authentication failures (1008 close code)
- Internal server errors (1011 close code)
- Message parsing errors (sent as error messages)
- Connection state cleanup on disconnect

## Monitoring

- Connection logs include user identification and document context
- Health endpoint provides active session counts
- Error logging for debugging production issues

## Security Notes

- JWT verification currently uses simplified parsing (production should implement proper signature verification)
- CORS is configured for specified origins only
- Service role key should be kept secure in environment variables
- All user inputs are validated and sanitized

## Next Steps

1. Complete PartyServer implementation with Y-PartyServer integration
2. Add proper JWT signature verification using crypto.subtle API
3. Implement Supabase persistence for document storage
4. Add CI/CD pipeline for automated deployments
5. Configure custom domain and SSL certificates 