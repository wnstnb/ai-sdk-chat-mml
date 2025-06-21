import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getUserOrError(supabase: ReturnType<typeof createSupabaseServerClient>) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error('Auth User Error:', userError.message);
    return { 
      errorResponse: NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'Failed to get user.' } }, 
        { status: 500 }
      ) 
    };
  }
  if (!user) {
    return { 
      errorResponse: NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'User not authenticated.' } }, 
        { status: 401 }
      ) 
    };
  }
  return { userId: user.id };
} 