// lib/supabase/server.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Used in Server Components, Route Handlers, and Server Actions
// Needs cookies() from next/headers
export function createSupabaseServerClientReadOnly() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

// Used in Route Handlers and Server Actions for mutating data
// Needs cookies() from next/headers
export function createSupabaseServerClient() {
 const cookieStore = cookies()

 return createServerClient(
   process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role key for admin-like operations
   {
     cookies: {
       get(name: string) {
         return cookieStore.get(name)?.value
       },
       set(name: string, value: string, options: CookieOptions) {
         cookieStore.set({ name, value, ...options })
       },
       remove(name: string, options: CookieOptions) {
         cookieStore.delete({ name, ...options })
       },
     },
   }
 )
}

// Used in Server Actions and Route Handlers that need the service role key
// Does NOT need cookies()
export function createSupabaseAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return undefined;
        },
        set(name: string, value: string, options: CookieOptions) {},
        remove(name: string, options: CookieOptions) {},
      },
      auth: {
        // prevent client from trying to use session cookies
        persistSession: false,
        // Required to bypass RLS in some cases
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }
    }
  );
}

// This client is specifically for operations requiring elevated privileges (service_role)
// and should be used in server-side route handlers or server components where appropriate.
export function createSupabaseServiceRoleClient() {
    // Ensure these environment variables are set
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase URL or Service Role Key is not defined in environment variables.');
    }
  
    // Create a new client instance for service role. 
    // Note: createServerClient is generally for user context. For direct service role, 
    // you might typically use the core `createClient` from `@supabase/supabase-js` 
    // if not operating within a Next.js request/response cookie context for RLS bypass.
    // However, createServerClient can also work with a service key if RLS policies are not an issue
    // or if you are just using it for its helper functions with the service key directly.
    // For simplicity and consistency within Next.js SSR context, we use it here, but it's important
    // to understand that the service key bypasses RLS.
    return createServerClient(supabaseUrl, supabaseServiceKey, {
        cookies: { 
            // Service role client typically does not manage user session cookies directly
            // but needs the cookie handling structure if used with createServerClient.
            // These can be minimal if you are sure this client is ONLY for service operations.
            get: () => undefined, 
            set: () => {}, 
            remove: () => {}
        }
    });
  } 