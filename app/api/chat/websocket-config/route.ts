import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('WebSocket Config: Auth error or user not found:', authError);
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const websocketUrl = process.env.WEBSOCKET_URL;
    const websocketAuthToken = process.env.WEBSOCKET_AUTH_TOKEN;

    if (!websocketUrl || !websocketAuthToken) {
      console.error('WebSocket Config: Missing WEBSOCKET_URL or WEBSOCKET_AUTH_TOKEN in environment variables.');
      return NextResponse.json({ error: 'WebSocket configuration missing on server.' }, { status: 500 });
    }

    return NextResponse.json({ websocketUrl, websocketAuthToken });

  } catch (error: any) {
    console.error('WebSocket Config: Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Failed to retrieve WebSocket configuration' }, { status: 500 });
  }
} 