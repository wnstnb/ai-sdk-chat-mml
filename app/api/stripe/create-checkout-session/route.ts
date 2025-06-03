import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';

// Initialize Stripe with your secret key from environment variables
// Ensure STRIPE_SECRET_KEY is set in your .env.local or environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10' as any, // Use the latest API version, cast to any to bypass strict type check
  typescript: true,
});

export async function POST(request: NextRequest) {
  const { priceId, email, userId, isSocialSignup } = await request.json();

  if (!priceId) {
    return NextResponse.json({ error: 'Price ID is required.' }, { status: 400 });
  }
  if (!email && !userId) {
    return NextResponse.json({ error: 'Email or User ID is required to associate with Stripe customer.' }, { status: 400 });
  }

  // Construct absolute URLs for success and cancel
  const baseUrl = request.nextUrl.origin;
  // Default success URL for social signups or if type is not specified
  let successUrl = new URL('/signup/success', baseUrl).toString(); 
  
  // If it's an email/password signup (indicated by presence of userId in the initial request payload)
  // and isSocialSignup is not explicitly true, then redirect to confirm email page.
  if (userId && !isSocialSignup) { 
    successUrl = new URL('/signup/confirm-email', baseUrl).toString();
  }
  
  const cancelUrl = new URL('/signup', baseUrl).toString(); // Redirect back to signup page on cancellation

  try {
    let customerId;

    // 1. Find or Create a Stripe Customer
    if (email) {
      const existingCustomers = await stripe.customers.list({ email: email, limit: 1 });
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({ 
          email: email,
          // You can add metadata here if needed, like your internal userId
          metadata: userId ? { app_user_id: userId } : undefined,
         });
        customerId = newCustomer.id;
      }
    } else if (userId) {
        // If only userId is provided, you might have a lookup mechanism for Stripe customer ID
        // or create a customer with userId in metadata. For simplicity, we'll assume email is preferred.
        // This part might need adjustment based on how you map your users to Stripe customers if email isn't always available.
        const newCustomer = await stripe.customers.create({
            metadata: { app_user_id: userId },
        });
        customerId = newCustomer.id;
    }

    if (!customerId) {
        return NextResponse.json({ error: 'Could not create or find Stripe customer.' }, { status: 500 });
    }


    // 2. Create a Stripe Checkout Session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 7, // Explicitly set 7-day trial as per PRD
        metadata: userId ? { app_user_id: userId } : undefined, // Pass userId to subscription metadata
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: customerId, // Associate session with the customer
      // client_reference_id is useful for webhooks to map back to your internal user
      // especially if the customer object was newly created and you don't have the Stripe customer ID in your DB yet.
      client_reference_id: userId || undefined, 
    };
    
    // If the price object in Stripe already has a trial configured, 
    // setting trial_period_days here might override it or cause an error depending on Stripe version/settings.
    // It's generally best to have the trial configured on the Price object in Stripe dashboard for consistency.
    // However, the PRD asks for it, so we include `trial_period_days`.

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'Could not create Stripe checkout session.' }, { status: 500 });
    }

    return NextResponse.json({ sessionId: checkoutSession.id, checkoutUrl: checkoutSession.url });

  } catch (error: any) {
    console.error('Stripe Checkout Session Error:', error);
    return NextResponse.json({ error: error.message || 'An unknown error occurred with Stripe.' }, { status: 500 });
  }
} 