export function getSupabaseCredentials() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service key on backend

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase URL or Service Key is missing in environment variables.');
    throw new Error('Server configuration error.');
  }
  
  return { supabaseUrl, supabaseServiceKey };
} 