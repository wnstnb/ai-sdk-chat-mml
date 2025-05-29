import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

// Initialize Stripe with your secret key from environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10' as any,
  typescript: true,
});

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user from Supabase using the same pattern as preferences API
    const supabase = createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Error getting user or user not found:', authError);
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Find the Stripe customer using the user's email
    const email = user.email;
    if (!email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    // Find the existing Stripe customer
    const existingCustomers = await stripe.customers.list({ 
      email: email, 
      limit: 1 
    });

    let customerId;
    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      // If no customer exists, create one
      const newCustomer = await stripe.customers.create({ 
        email: email,
        metadata: { app_user_id: user.id },
      });
      customerId = newCustomer.id;
    }

    // Create the customer portal session
    const returnUrl = request.nextUrl.origin + '/launch'; // Return to launch page after managing billing
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: portalSession.url });

  } catch (error: any) {
    console.error('Stripe Billing Portal Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to create billing portal session' 
    }, { status: 500 });
  }
} 