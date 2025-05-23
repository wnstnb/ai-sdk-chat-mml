import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { Readable } from 'stream';
import { createSupabaseServiceRoleClient } from '../../../../lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10' as any,
  typescript: true,
});

// Get the webhook secret from environment variables
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// Helper function to buffer the request stream
async function buffer(readable: Readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Helper function to update user profile in Supabase
async function updateUserProfile(supabase: SupabaseClient, userId: string, dataToUpdate: Record<string, any>) {
  // Add or update the updated_at timestamp
  const dataWithTimestamp = { ...dataToUpdate, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('profiles')
    .update(dataWithTimestamp)
    .eq('id', userId);
  if (error) {
    console.error(`Supabase profile update error for user ${userId}:`, error, 'Data attempted:', dataWithTimestamp);
  }
  return error;
}

// Helper to get User ID from Stripe Customer ID
async function getUserIdByStripeCustomerId(supabase: SupabaseClient, stripeCustomerId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', stripeCustomerId)
        .single();
    if (error || !data) {
        console.error(`Error fetching user by stripe_customer_id ${stripeCustomerId}:`, error);
        return null;
    }
    return data.id;
}

// Helper to get User ID from Stripe Subscription ID
async function getUserIdByStripeSubscriptionId(supabase: SupabaseClient, stripeSubscriptionId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .single();
    if (error || !data) {
        console.error(`Error fetching user by stripe_subscription_id ${stripeSubscriptionId}:`, error);
        return null;
    }
    return data.id;
}

export async function POST(request: NextRequest) {
  if (!request.body) {
    return NextResponse.json({ error: 'No request body' }, { status: 400 });
  }
  const buf = await buffer(request.body as unknown as Readable);
  const sig = request.headers.get('stripe-signature');

  let event: Stripe.Event;

  try {
    if (!sig || !webhookSecret) {
      console.error('Webhook error: Missing signature or webhook secret.');
      return NextResponse.json({ error: 'Webhook signature or secret not configured.' }, { status: 400 });
    }
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  // Initialize Supabase admin client for database operations
  const supabase = createSupabaseServiceRoleClient();
  let userId: string | null = null;
  let dbError;

  console.log(`Webhook received: ${event.type}, Event ID: ${event.id}`); // Log every event received

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`Webhook: checkout.session.completed: ${session.id}, Full session object:`, JSON.stringify(session, null, 2));
      userId = session.client_reference_id; // Passed during checkout session creation

      if (!userId) {
        console.error('Webhook Error (checkout.session.completed): Missing client_reference_id (userId).');
        return NextResponse.json({ received: true, error: 'Missing client_reference_id' }, { status: 200 }); // Ack to Stripe
      }

      const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const stripeSubscriptionIdFromSession = typeof session.subscription === 'string' ? session.subscription : (session.subscription as Stripe.Subscription)?.id;
      
      if (!stripeCustomerId) {
        console.error(`Webhook Error (checkout.session.completed) for user ${userId}: Missing Stripe Customer ID on session.`);
        return NextResponse.json({ received: true, error: 'Missing Stripe Customer ID on session' }, { status: 200 });
      }
      if (!stripeSubscriptionIdFromSession) {
        console.error(`Webhook Error (checkout.session.completed) for user ${userId}: Missing Stripe Subscription ID on session.`);
        // It can happen that the subscription ID is not on the session if payment is async.
        // However, for a successful checkout leading to a subscription, it is usually expected.
        // We will try to retrieve subscription via customer if session.subscription is null
        console.log(`Attempting to find subscription via customer ${stripeCustomerId} as session.subscription was null/undefined.`);
      }

      try {
        // If stripeSubscriptionIdFromSession is null, it might be because the subscription is created slightly async
        // or not directly embedded. Let's try to fetch it via the customer if needed.
        let finalStripeSubscriptionId = stripeSubscriptionIdFromSession;
        if (!finalStripeSubscriptionId) {
            const subscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId, limit: 1 });
            if (subscriptions.data.length > 0) {
                const mostRecentSubscription = subscriptions.data[0];
                // Add a check to see if this subscription was created recently, e.g., within last few minutes
                // This is to avoid picking up an old subscription if session.subscription was unexpectedly null.
                const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (5 * 60);
                if (mostRecentSubscription.created >= fiveMinutesAgo) {
                    finalStripeSubscriptionId = mostRecentSubscription.id;
                    console.log(`Webhook (checkout.session.completed) for user ${userId}: Found subscription ${finalStripeSubscriptionId} via customer ${stripeCustomerId}.`);
                } else {
                    console.error(`Webhook Error (checkout.session.completed) for user ${userId}: Found subscription ${mostRecentSubscription.id} for customer ${stripeCustomerId}, but it's older than 5 minutes and session.subscription was null. Skipping update for this field for safety.`);
                }
            } else {
                 console.error(`Webhook Error (checkout.session.completed) for user ${userId}: No subscriptions found for customer ${stripeCustomerId} when session.subscription was null.`);
            }
        }

        if (!finalStripeSubscriptionId) {
            console.error(`Webhook Error (checkout.session.completed) for user ${userId}: Could not determine Stripe Subscription ID.`);
            // Still update customer ID if possible, but subscription details will be missing.
            dbError = await updateUserProfile(supabase, userId, { stripe_customer_id: stripeCustomerId });
            if (dbError) return NextResponse.json({ received: true, error: 'Database update failed (customer ID only) after checkout.' }, { status: 500 });
            return NextResponse.json({ received: true, error: 'Could not determine Stripe Subscription ID to fetch details.' }, { status: 200 });
        }

        const subscription = await stripe.subscriptions.retrieve(finalStripeSubscriptionId);
        console.log(`Webhook (checkout.session.completed) for user ${userId}: Retrieved subscription ${subscription.id} details:`, JSON.stringify(subscription, null, 2));
        
        const profileData = {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscription.id, // Use ID from retrieved subscription object
          stripe_subscription_status: subscription.status,
          trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
          subscription_ends_at: (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : null,
        };
        dbError = await updateUserProfile(supabase, userId, profileData);
        if (dbError) return NextResponse.json({ received: true, error: 'Database update failed after checkout.' }, { status: 500 });
        console.log(`Profile for user ${userId} updated successfully after checkout with data:`, JSON.stringify(profileData));

      } catch (error: any) {
        console.error(`Webhook Error (checkout.session.completed) for user ${userId}: Error processing subscription details - ${error.message}`, error);
        // Attempt to at least save the customer ID if we have it.
        if (stripeCustomerId) {
            await updateUserProfile(supabase, userId, { stripe_customer_id: stripeCustomerId });
        }
        return NextResponse.json({ received: true, error: `Error processing subscription details: ${error.message}` }, { status: 500 });
      }
      break;

    case 'customer.subscription.updated':
      const subUpdated = event.data.object as Stripe.Subscription;
      console.log(`Webhook: customer.subscription.updated: ${subUpdated.id}, Status: ${subUpdated.status}, Full object:`, JSON.stringify(subUpdated, null, 2));
      userId = subUpdated.metadata.app_user_id || null;
      if (!userId) {
         userId = await getUserIdByStripeSubscriptionId(supabase, subUpdated.id);
      }
      if (!userId && subUpdated.customer) {
        const custId = typeof subUpdated.customer === 'string' ? subUpdated.customer : (subUpdated.customer as Stripe.Customer)?.id;
        if (custId) userId = await getUserIdByStripeCustomerId(supabase, custId);
      }

      if (!userId) {
        console.error('Webhook Error (customer.subscription.updated): Could not determine user ID.');
        return NextResponse.json({ received: true, error: 'Could not determine user ID for subscription update.' }, { status: 200 });
      }
      
      const profileUpdateDataSubUpdated = {
        stripe_subscription_status: subUpdated.status,
        trial_ends_at: subUpdated.trial_end ? new Date(subUpdated.trial_end * 1000).toISOString() : null,
        subscription_ends_at: (subUpdated as any).current_period_end ? new Date((subUpdated as any).current_period_end * 1000).toISOString() : null,
        // If canceled, canceled_at might be relevant too, or simply rely on status.
        // billing_cycle: could be derived from subUpdated.items.data[0].price.recurring.interval if needed
      };
      dbError = await updateUserProfile(supabase, userId, profileUpdateDataSubUpdated);
      if (dbError) return NextResponse.json({ received: true, error: 'DB update failed for subscription.updated.' }, { status: 500 });
      console.log(`Profile for user ${userId} updated by customer.subscription.updated with data:`, JSON.stringify(profileUpdateDataSubUpdated));
      break;

    case 'customer.subscription.deleted':
      const subDeleted = event.data.object as Stripe.Subscription;
      console.log(`Webhook: customer.subscription.deleted: ${subDeleted.id}, Full object:`, JSON.stringify(subDeleted, null, 2));
      userId = subDeleted.metadata.app_user_id || null;
      if (!userId) {
        userId = await getUserIdByStripeSubscriptionId(supabase, subDeleted.id);
      }
       if (!userId && subDeleted.customer) {
        const custId = typeof subDeleted.customer === 'string' ? subDeleted.customer : (subDeleted.customer as Stripe.Customer)?.id;
        if (custId) userId = await getUserIdByStripeCustomerId(supabase, custId);
      }

      if (!userId) {
        console.error('Webhook Error (customer.subscription.deleted): Could not determine user ID.');
        return NextResponse.json({ received: true, error: 'Could not determine user ID for subscription deletion.' }, { status: 200 });
      }

      const profileUpdateDataSubDeleted = {
        stripe_subscription_status: 'canceled',
        subscription_ends_at: subDeleted.ended_at ? new Date(subDeleted.ended_at * 1000).toISOString() : (subDeleted.canceled_at ? new Date(subDeleted.canceled_at * 1000).toISOString() : new Date().toISOString()),
        // Consider clearing trial_ends_at or other fields if appropriate
      };
      dbError = await updateUserProfile(supabase, userId, profileUpdateDataSubDeleted);
      if (dbError) return NextResponse.json({ received: true, error: 'DB update failed for subscription.deleted.' }, { status: 500 });
      console.log(`Profile for user ${userId} updated by customer.subscription.deleted with data:`, JSON.stringify(profileUpdateDataSubDeleted));
      break;

    case 'invoice.payment_succeeded':
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`Webhook: invoice.payment_succeeded: ${invoice.id}, Full object:`, JSON.stringify(invoice, null, 2));
      const invoiceSubscriptionId = (invoice as any).subscription as string | null;
      if (invoiceSubscriptionId && (invoice.billing_reason === 'subscription_cycle' || invoice.billing_reason === 'subscription_create')) {
        try {
          const subscriptionInvoiceSucceeded = await stripe.subscriptions.retrieve(invoiceSubscriptionId);
          console.log(`Webhook (invoice.payment_succeeded) for invoice ${invoice.id}: Retrieved subscription ${subscriptionInvoiceSucceeded.id} details:`, JSON.stringify(subscriptionInvoiceSucceeded, null, 2));
          userId = subscriptionInvoiceSucceeded.metadata.app_user_id || null;
          if (!userId) {
            userId = await getUserIdByStripeSubscriptionId(supabase, invoiceSubscriptionId);
          }
          if (!userId && subscriptionInvoiceSucceeded.customer) {
             const custId = typeof subscriptionInvoiceSucceeded.customer === 'string' ? subscriptionInvoiceSucceeded.customer : (subscriptionInvoiceSucceeded.customer as Stripe.Customer)?.id;
             if (custId) userId = await getUserIdByStripeCustomerId(supabase, custId);
          }

          if (!userId) {
            console.error('Webhook Error (invoice.payment_succeeded): Could not determine user ID.');
            return NextResponse.json({ received: true, error: 'Could not determine user ID for invoice payment.' }, { status: 200 });
          }

          const profileUpdateDataInvoiceSucceeded = {
            stripe_subscription_status: subscriptionInvoiceSucceeded.status,
            subscription_ends_at: (subscriptionInvoiceSucceeded as any).current_period_end ? new Date((subscriptionInvoiceSucceeded as any).current_period_end * 1000).toISOString() : null,
            trial_ends_at: subscriptionInvoiceSucceeded.trial_end ? new Date(subscriptionInvoiceSucceeded.trial_end * 1000).toISOString() : null,
          };
          dbError = await updateUserProfile(supabase, userId, profileUpdateDataInvoiceSucceeded);
          if (dbError) return NextResponse.json({ received: true, error: 'DB update failed for invoice.payment_succeeded.' }, { status: 500 });
          console.log(`Profile for user ${userId} updated by invoice.payment_succeeded with data:`, JSON.stringify(profileUpdateDataInvoiceSucceeded));
        } catch (subError: any) {
          console.error(`Webhook Error (invoice.payment_succeeded): Failed to retrieve subscription ${invoiceSubscriptionId}: ${subError.message}`);
          return NextResponse.json({ received: true, error: 'Failed to retrieve subscription for invoice.' }, { status: 500 });
        }
      } else {
        console.log(`Webhook: invoice.payment_succeeded ${invoice.id} - not a subscription cycle or creation. Billing reason: ${invoice.billing_reason}, Sub ID: ${invoiceSubscriptionId}`);
      }
      break;
      
    case 'invoice.payment_failed':
      const failedInvoice = event.data.object as Stripe.Invoice;
      console.log(`Webhook: invoice.payment_failed: ${failedInvoice.id}, Full object:`, JSON.stringify(failedInvoice, null, 2));
      const failedInvoiceSubscriptionId = (failedInvoice as any).subscription as string | null;
      if (failedInvoiceSubscriptionId) {
        try {
          const subscriptionInvoiceFailed = await stripe.subscriptions.retrieve(failedInvoiceSubscriptionId);
           console.log(`Webhook (invoice.payment_failed) for invoice ${failedInvoice.id}: Retrieved subscription ${subscriptionInvoiceFailed.id} details:`, JSON.stringify(subscriptionInvoiceFailed, null, 2));
          userId = subscriptionInvoiceFailed.metadata.app_user_id || null;
           if (!userId) {
            userId = await getUserIdByStripeSubscriptionId(supabase, failedInvoiceSubscriptionId);
          }
          if (!userId && subscriptionInvoiceFailed.customer) {
             const custId = typeof subscriptionInvoiceFailed.customer === 'string' ? subscriptionInvoiceFailed.customer : (subscriptionInvoiceFailed.customer as Stripe.Customer)?.id;
             if (custId) userId = await getUserIdByStripeCustomerId(supabase, custId);
          }

          if (!userId) {
            console.error('Webhook Error (invoice.payment_failed): Could not determine user ID.');
            return NextResponse.json({ received: true, error: 'Could not determine user ID for failed invoice payment.' }, { status: 200 });
          }

          const profileUpdateDataInvoiceFailed = {
            stripe_subscription_status: subscriptionInvoiceFailed.status,
          };
          dbError = await updateUserProfile(supabase, userId, profileUpdateDataInvoiceFailed);
          if (dbError) return NextResponse.json({ received: true, error: 'DB update failed for invoice.payment_failed.' }, { status: 500 });
          console.log(`Profile for user ${userId} updated by invoice.payment_failed. Status: ${subscriptionInvoiceFailed.status}, Data:`, JSON.stringify(profileUpdateDataInvoiceFailed));
        } catch (subError: any) {
          console.error(`Webhook Error (invoice.payment_failed): Failed to retrieve subscription ${failedInvoiceSubscriptionId}: ${subError.message}`);
          return NextResponse.json({ received: true, error: 'Failed to retrieve subscription for failed invoice.' }, { status: 500 });
        }
      } else {
         console.log(`Webhook: invoice.payment_failed ${failedInvoice.id} - not related to a subscription.`);
      }
      break;

    // ... handle other event types as needed

    default:
      console.log(`Webhook: Unhandled event type ${event.type}, ID: ${event.id}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  return NextResponse.json({ received: true });
} 