import { createBrowserClient } from '@supabase/ssr';

// Define a function to create the client instance
// This prevents the client from being created prematurely on the server
// See https://supabase.com/docs/guides/auth/server-side/nextjs
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Export a singleton instance of the client
// Note: This may be better handled with React Context in larger apps
export const supabase = createClient(); 