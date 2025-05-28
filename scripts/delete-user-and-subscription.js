// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey || !stripeSecretKey) {
  console.error('Missing required environment variables:');
  if (!supabaseUrl) console.error('- NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseServiceRoleKey) console.error('- SUPABASE_SERVICE_ROLE_KEY');
  if (!stripeSecretKey) console.error('- STRIPE_SECRET_KEY');
  console.error('');
  console.error('Make sure these are set in your .env.local file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const stripe = new Stripe(stripeSecretKey);

async function deleteUserAndSubscription(userEmail) {
  try {
    console.log(`Attempting to delete user ${userEmail} and their Stripe subscription...`);

    // 1. Get the user by email from Supabase Auth
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }
    const user = usersData.users.find(u => u.email === userEmail);
    if (!user) {
      throw new Error(`User with email ${userEmail} not found in Supabase Auth.`);
    }
    console.log(`Found user: ${user.id} (${user.email})`);

    // 2. Get the user's profile to find Stripe IDs
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116: "Searched item was not found"
        console.error('Error fetching profile:', profileError);
        throw new Error(`Failed to fetch profile for user ${user.id}: ${profileError.message}`);
    }
    
    if (!profile) {
        console.warn(`No profile found for user ${user.id}. Skipping Stripe cancellation. Proceeding with Supabase user deletion.`);
    } else {
        console.log(`Found profile for user ${user.id}. Stripe Customer ID: ${profile.stripe_customer_id}, Stripe Subscription ID: ${profile.stripe_subscription_id}`);
        
        // 3. Cancel Stripe Subscription
        if (profile.stripe_subscription_id) {
            try {
                const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
                if (subscription.status === 'active' || subscription.status === 'trialing' || subscription.status === 'past_due') {
                    console.log(`Attempting to cancel Stripe subscription ${profile.stripe_subscription_id} (status: ${subscription.status})...`);
                    await stripe.subscriptions.cancel(profile.stripe_subscription_id);
                    console.log(`✅ Stripe subscription ${profile.stripe_subscription_id} cancelled successfully.`);
                } else {
                    console.log(`Stripe subscription ${profile.stripe_subscription_id} is already in status: ${subscription.status}. No action needed.`);
                }
            } catch (stripeError) {
                if (stripeError.code === 'resource_missing') {
                    console.warn(`Stripe subscription ${profile.stripe_subscription_id} not found. It might have been deleted already.`);
                } else {
                    console.error('Error cancelling Stripe subscription:', stripeError);
                    // Decide if you want to throw or continue. For now, we'll log and continue to delete the Supabase user.
                    console.warn(`Proceeding with Supabase user deletion despite Stripe API error.`);
                }
            }
        } else {
            console.log('No Stripe subscription ID found in profile. Skipping Stripe subscription cancellation.');
            // Optional: If only customer_id exists, you might want to list and cancel all active subscriptions for that customer.
            // For now, we rely on stripe_subscription_id for a direct cancellation.
            if (profile.stripe_customer_id) {
                console.log(`User has a Stripe Customer ID: ${profile.stripe_customer_id}. If they have subscriptions not directly tracked by 'stripe_subscription_id' in your DB, those won't be cancelled by this script automatically.`);
            }
        }
    }

    // 4. Delete user from Supabase Auth (this should cascade to 'profiles' table)
    console.log(`Attempting to delete user ${user.id} from Supabase Auth...`);
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      throw new Error(`Failed to delete user ${user.id} from Supabase Auth: ${deleteUserError.message}`);
    }
    console.log(`✅ User ${userEmail} (ID: ${user.id}) and their profile (due to CASCADE) deleted successfully from Supabase.`);

    // 5. Verify deletion (optional)
    // You could try fetching the user or profile again here and expect a not found error.
    
    console.log('✅ Process completed successfully.');

  } catch (error) {
    console.error('❌ Error in deleteUserAndSubscription:', error.message);
    process.exit(1);
  }
}

// Get email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('Usage: node scripts/delete-user-and-subscription.js <email>');
  console.error('Example: node scripts/delete-user-and-subscription.js user@example.com');
  process.exit(1);
}

deleteUserAndSubscription(userEmail); 