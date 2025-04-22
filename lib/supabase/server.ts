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
   process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role for mutations from server
   {
     cookies: {
       get(name: string) {
         return cookieStore.get(name)?.value
       },
       set(name: string, value: string, options: CookieOptions) {
         try {
           cookieStore.set({ name, value, ...options })
         } catch (error) {
           // The `set` method was called from a Server Component.
           // This can be ignored if you have middleware refreshing
           // user sessions.
         }
       },
       remove(name: string, options: CookieOptions) {
         try {
           cookieStore.set({ name, value: '', ...options })
         } catch (error) {
           // The `delete` method was called from a Server Component.
           // This can be ignored if you have middleware refreshing
           // user sessions.
         }
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