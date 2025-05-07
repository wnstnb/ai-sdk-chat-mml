import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const defaultPreferences = {
  theme: 'light',
  default_model: 'gemini-2.0-flash',
  editorFontSize: 1,
  chatFontSize: 1,
};

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user or user not found:', userError);
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = user.id;

    // Fetch preferences for the user
    const { data, error } = await supabase
      .from('preferences')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle(); // Use maybeSingle() to return null if no row found

    if (error) {
      console.error('Error fetching preferences:', error);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    // If preferences exist, return them; otherwise, return defaults
    const userPreferences = data?.preferences || defaultPreferences;

    return NextResponse.json(userPreferences);

  } catch (error) {
    console.error('Unexpected error fetching preferences:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

// Placeholder for PUT handler
export async function PUT(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user or user not found:', userError);
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = user.id;

    // Parse the request body
    let preferencesToUpdate;
    try {
      preferencesToUpdate = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Optional: Add validation for preferencesToUpdate structure/values here
    // e.g., check if theme is 'light' or 'dark'
    // e.g., check if default_model is one of the allowed values
    if (!preferencesToUpdate || typeof preferencesToUpdate !== 'object') {
         return NextResponse.json({ error: 'Invalid preferences format' }, { status: 400 });
    }

    // Upsert the preferences
    const { data, error } = await supabase
      .from('preferences')
      .upsert({ 
          user_id: userId, 
          preferences: preferencesToUpdate 
      }, { 
          onConflict: 'user_id' // Specify the conflict target
      })
      .select('preferences') // Select the updated/inserted preferences
      .single(); // Expecting a single row back

    if (error) {
      console.error('Error upserting preferences:', error);
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }

    return NextResponse.json(data?.preferences || {}); // Return the updated preferences

  } catch (error) {
    console.error('Unexpected error updating preferences:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
