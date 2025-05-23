// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('Make sure these are set in your .env.local file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function setLegacyUser(userEmail) {
  try {
    console.log(`Setting user ${userEmail} as legacy user...`);
    
    // First, get the user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }
    
    const user = users.users.find(u => u.email === userEmail);
    
    if (!user) {
      throw new Error(`User with email ${userEmail} not found`);
    }
    
    console.log(`Found user: ${user.id} (${user.email})`);
    
    // Check if profile exists first
    console.log('Checking if profile exists...');
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle(); // Use maybeSingle to avoid error if no rows found
    
    if (profileCheckError) {
      console.error('Error checking profile:', profileCheckError);
      throw new Error(`Failed to check profile: ${profileCheckError.message}`);
    }
    
    if (!existingProfile) {
      console.log('No profile found, creating one...');
      // Create a new profile for this user
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          stripe_subscription_status: 'legacy',
          updated_at: new Date().toISOString()
        })
        .select();
      
      if (createError) {
        console.error('Error creating profile:', createError);
        throw new Error(`Failed to create profile: ${createError.message}`);
      }
      
      console.log('✅ Successfully created profile with legacy status');
      console.log('New profile:', newProfile);
    } else {
      console.log('Profile exists, updating legacy status...');
      console.log('Current profile:', existingProfile);
      
      // Update the existing profile
      const { data, error } = await supabase
        .from('profiles')
        .update({
          stripe_subscription_status: 'legacy',
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select();
      
      if (error) {
        console.error('Error updating profile:', error);
        throw new Error(`Failed to update profile: ${error.message}`);
      }
      
      if (!data || data.length === 0) {
        throw new Error('Update operation completed but no rows were affected. This might be a permissions issue.');
      }
      
      console.log('✅ Successfully updated user as legacy user');
      console.log('Profile updated:', data);
    }
    
    // Verify the final state
    console.log('Verifying final state...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('profiles')
      .select('stripe_subscription_status, email, updated_at')
      .eq('id', user.id)
      .single();
    
    if (verifyError) {
      console.warn('Failed to verify update:', verifyError.message);
    } else {
      console.log('✅ Verification successful');
      console.log('Final status:', verifyData.stripe_subscription_status);
      console.log('Email:', verifyData.email);
      console.log('Last updated:', verifyData.updated_at);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('Usage: node set-legacy-user.js <email>');
  console.error('Example: node set-legacy-user.js user@example.com');
  process.exit(1);
}

setLegacyUser(userEmail); 