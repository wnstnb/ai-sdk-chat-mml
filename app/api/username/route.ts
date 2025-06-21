import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Username validation function (client-side version of the database function)
function isValidUsername(username: string): boolean {
  if (!username) return false;
  
  // Check length constraints
  if (username.length < 3 || username.length > 30) return false;
  
  // Check character constraints (alphanumeric, underscore, hyphen only)
  const validCharacterPattern = /^[a-zA-Z0-9_-]+$/;
  return validCharacterPattern.test(username);
}

/**
 * GET /api/username - Get current user's username
 */
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

    // Fetch the user's profile to get the username
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username, email')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json({ 
        error: 'Failed to fetch username',
        details: profileError.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      username: profile.username,
      email: profile.email
    });

  } catch (error) {
    console.error('Unexpected error fetching username:', error);
    return NextResponse.json({ 
      error: 'An unexpected error occurred' 
    }, { status: 500 });
  }
}

/**
 * PUT /api/username - Update current user's username
 */
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
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { username } = body;

    // Validate username
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ 
        error: 'Username is required and must be a string' 
      }, { status: 400 });
    }

    if (!isValidUsername(username)) {
      return NextResponse.json({ 
        error: 'Invalid username format. Username must be 3-30 characters long and contain only letters, numbers, underscores, and hyphens.' 
      }, { status: 400 });
    }

    // Check if username is already taken by another user
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking username availability:', checkError);
      return NextResponse.json({ 
        error: 'Failed to check username availability',
        details: checkError.message 
      }, { status: 500 });
    }

    if (existingUser) {
      return NextResponse.json({ 
        error: 'Username is already taken' 
      }, { status: 409 });
    }

    // Update the username
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ 
        username: username,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('username, email')
      .single();

    if (updateError) {
      console.error('Error updating username:', updateError);
      
      // Handle specific database constraint errors
      if (updateError.code === '23505') { // Unique constraint violation
        return NextResponse.json({ 
          error: 'Username is already taken' 
        }, { status: 409 });
      }
      
      if (updateError.code === '23514') { // Check constraint violation
        return NextResponse.json({ 
          error: 'Username does not meet requirements' 
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to update username',
        details: updateError.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Username updated successfully',
      username: updatedProfile.username,
      email: updatedProfile.email
    });

  } catch (error) {
    console.error('Unexpected error updating username:', error);
    return NextResponse.json({ 
      error: 'An unexpected error occurred' 
    }, { status: 500 });
  }
}

/**
 * POST /api/username - Check if a username is available (without updating)
 */
export async function POST(request: NextRequest) {
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
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { username } = body;

    // Validate username
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ 
        error: 'Username is required and must be a string' 
      }, { status: 400 });
    }

    if (!isValidUsername(username)) {
      return NextResponse.json({ 
        available: false,
        error: 'Invalid username format. Username must be 3-30 characters long and contain only letters, numbers, underscores, and hyphens.' 
      }, { status: 200 });
    }

    // Check if username is already taken by another user
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking username availability:', checkError);
      return NextResponse.json({ 
        available: false,
        error: 'Failed to check username availability' 
      }, { status: 500 });
    }

    return NextResponse.json({
      available: !existingUser,
      username: username
    });

  } catch (error) {
    console.error('Unexpected error checking username availability:', error);
    return NextResponse.json({ 
      available: false,
      error: 'An unexpected error occurred' 
    }, { status: 500 });
  }
} 