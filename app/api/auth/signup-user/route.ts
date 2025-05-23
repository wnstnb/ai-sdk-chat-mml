import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseServiceRoleClient } from '../../../../lib/supabase/server'; // Corrected path

export async function POST(request: NextRequest) {
  const { email, password, billingCycle } = await request.json();

  if (!email || !password || !billingCycle) {
    return NextResponse.json({ error: 'Email, password, and billing cycle are required.' }, { status: 400 });
  }

  if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
    return NextResponse.json({ error: 'Invalid billing cycle.' }, { status: 400 });
  }

  // Use the service role client for elevated privileges needed for sign-up and profile update
  const supabase = createSupabaseServiceRoleClient();

  // 1. Sign up the user using the admin client to create a user
  //    Note: supabase.auth.admin.createUser is typically used for this with a service role client.
  //    However, signUp can also be used and it will respect email confirmation settings if enabled.
  //    Let's use signUp for consistency with previous approach and ensure user receives confirmation email if configured.
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // emailRedirectTo: `${request.nextUrl.origin}/auth/callback`, // Optional: if you have email confirmation
      // data: { billing_cycle: billingCycle } // You can pass initial user_metadata here if your trigger doesn't handle it or if you want to ensure it. However, we plan to update 'profiles' table.
    },
  });

  if (signUpError) {
    console.error('Supabase sign up error:', signUpError);
    return NextResponse.json({ error: signUpError.message || 'Failed to sign up user.' }, { status: signUpError.status || 500 });
  }

  if (!authData.user) {
    console.error('Supabase sign up did not return a user.');
    // This case might indicate that email confirmation is pending if enabled for example.
    // Depending on your flow (e.g., if email confirmation is required before login/profile update),
    // you might adjust the response or subsequent logic.
    // For now, if no user object, assume failure to proceed with profile update immediately.
    return NextResponse.json({ error: 'User signup process initiated, but user object not immediately available. If email confirmation is enabled, please check your email.' }, { status: 500 });
  }

  // 2. Update the user's profile with the billing cycle.
  // The handle_new_user trigger should have created a profile entry.
  // We now update it with the billing_cycle using the service role client, which bypasses RLS.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ 
      billing_cycle: billingCycle,
      email: authData.user.email, // Keep email in sync or ensure trigger handles it well
      updated_at: new Date().toISOString() // Manually set updated_at if not auto-updating
    })
    .eq('id', authData.user.id);

  if (profileError) {
    console.error('Supabase profile update error:', profileError);
    // If user auth record was created but profile update failed, this is a critical issue.
    // Consider a cleanup for the auth.users record or a more robust retry/logging mechanism.
    // For example, using supabase.auth.admin.deleteUser(authData.user.id)
    // await supabase.auth.admin.deleteUser(authData.user.id); // Example cleanup
    return NextResponse.json({
      error: `User auth record created, but failed to set billing cycle in profile: ${profileError.message}. Auth User ID: ${authData.user.id}`,
      userId: authData.user.id,
    }, { status: 500 });
  }

  // Return only non-sensitive user information if needed by the client
  // The full authData.user object might contain sensitive tokens if not handled carefully.
  // For a signup response, just confirming success and perhaps the user ID is often enough.
  return NextResponse.json({
    message: 'User signed up and profile updated successfully.',
    userId: authData.user.id,
    email: authData.user.email
  }, { status: 201 });
} 