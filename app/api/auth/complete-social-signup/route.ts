import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Stripe from 'stripe';

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  // apiVersion: '2024-04-10', // Temporarily removed to resolve type issue
});

// Constants for Stripe Price IDs (should match frontend or be centrally managed)
// TODO: Ensure these are the correct and live Price IDs for your Stripe products
const STRIPE_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY || 'price_1RQXg5P5ZTVXN3kSlh5Pk9CJ', // Example, replace with actual env var or ID
  annual: process.env.STRIPE_PRICE_ID_ANNUAL || 'price_1RQXh2P5ZTVXN3kSicpHUmdd',    // Example, replace with actual env var or ID
};

export async function POST(request: Request) {
  try {
    const { billingCycle } = await request.json(); // 'monthly' or 'annual'
    const cookieStore = cookies(); // Get cookie store

    if (!billingCycle || !(billingCycle in STRIPE_PRICE_IDS)) {
      return NextResponse.json({ error: 'Invalid billing cycle provided.' }, { status: 400 });
    }

    // Create Supabase client using createServerClient from @supabase/ssr
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    // 1. Identify User from Session
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error or no user:', authError);
      return NextResponse.json({ error: 'Unauthorized: No active user session.' }, { status: 401 });
    }

    if (!user.email) {
      // This should ideally not happen if the user has a session
      console.error('User session exists but email is missing.', { userId: user.id });
      return NextResponse.json({ error: 'User email is missing from session. Cannot proceed.' }, { status: 400 });
    }
    
    const userId = user.id;
    const userEmail = user.email;

    // 2. Update Profile in Supabase
    // The PRD mentions using service_role client if needed, but let's try with user's client first
    // if it has RLS policies allowing profile updates.
    // The `handle_new_user` trigger should have already created the profile.
    // We are updating billing_cycle and updated_at. Email should match.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        billing_cycle: billingCycle,
        // email: userEmail, // Email is likely already set by handle_new_user trigger and is immutable or PK part
        updated_at: new Date().toISOString() 
      })
      .eq('id', userId);

    if (profileError) {
      console.error(`Failed to update profile for user ${userId}:`, profileError);
      // If this fails, we might not want to proceed to Stripe, or handle it differently
      return NextResponse.json({ error: `Failed to update profile: ${profileError.message}` }, { status: 500 });
    }

    // 3. Create Stripe Checkout Session
    const priceId = STRIPE_PRICE_IDS[billingCycle as keyof typeof STRIPE_PRICE_IDS];
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'; // Fallback for local dev

    const stripeSession = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      client_reference_id: userId, // Crucial for webhook mapping
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 3,
        // metadata can be used to pass additional info if needed by webhooks, e.g., userId
        // metadata: { supabase_user_id: userId } // client_reference_id is usually preferred for this
      },
      success_url: `${siteUrl}/signup/success?session_id={CHECKOUT_SESSION_ID}`, // Changed to /signup/success
      cancel_url: `${siteUrl}/signup?stripe_cancel=true`,
    });

    if (!stripeSession.id) {
      console.error('Stripe session ID missing after creation');
      return NextResponse.json({ error: 'Could not create Stripe checkout session.' }, { status: 500 });
    }

    return NextResponse.json({ sessionId: stripeSession.id });

  } catch (error: any) {
    console.error('Error in /api/auth/complete-social-signup:', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error instanceof Stripe.errors.StripeError) {
        errorMessage = `Stripe error: ${error.message}`;
    } else if (error.message) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 