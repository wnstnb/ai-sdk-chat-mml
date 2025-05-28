# Scripts

This directory contains utility scripts for managing the application.

## set-legacy-user.js

This script allows you to mark existing users as "legacy" users, giving them grandfathered access to the application without requiring a paid subscription.

### Usage

```bash
node scripts/set-legacy-user.js <email>
```

### Example

```bash
node scripts/set-legacy-user.js user@example.com
```

### Prerequisites

Before running this script, ensure you have the following environment variables set:

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (with admin permissions)

### What it does

1. Finds the user by email address
2. Updates their profile to set `stripe_subscription_status` to `'legacy'`
3. Verifies the update was successful

### Legacy Users

Legacy users are users who existed before subscription requirements were implemented. They have permanent access to the application without needing to subscribe.

The subscription verification system recognizes the `'legacy'` status and grants full access with the reason "Legacy user with grandfathered access".

### Security Note

This script requires service role permissions to update user profiles. Make sure to keep your service role key secure and only run this script in trusted environments. 

## delete-user-and-subscription.js

This script allows you to delete a user from Supabase (both Auth and their profile) and cancel their active Stripe subscription.

**WARNING: This is a destructive operation and cannot be easily undone. Use with extreme caution.**

### Usage

```bash
node scripts/delete-user-and-subscription.js <email>
```

### Example

```bash
node scripts/delete-user-and-subscription.js user@example.com
```

### Prerequisites

Before running this script, ensure you have the following environment variables set in your `.env.local` file:

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (with admin permissions)
- `STRIPE_SECRET_KEY` - Your Stripe secret API key (e.g., `sk_live_...` or `sk_test_...`)

And ensure the `stripe` npm package is installed:
```bash
npm install stripe
# or
yarn add stripe
```

### What it does

1.  Finds the user by email address in Supabase Auth.
2.  Retrieves the user's profile to get their `stripe_subscription_id`.
3.  If a `stripe_subscription_id` is found and the subscription is active, it cancels the subscription via the Stripe API.
4.  Deletes the user from Supabase Authentication.
    -   Due to `ON DELETE CASCADE` in the `profiles` table schema, the user's profile record in the `profiles` table will also be automatically deleted.
5.  Logs the outcome of each step.

### Important Considerations

-   **Order of Operations:** The script attempts to cancel the Stripe subscription *before* deleting the user from Supabase to avoid orphaning Stripe data or losing the subscription ID reference.
-   **Error Handling:** If an error occurs during Stripe cancellation, the script will log a warning but will still attempt to proceed with deleting the Supabase user. If deletion from Supabase Auth fails, the script will exit with an error.
-   **Data Integrity:** The script relies on the `stripe_subscription_id` in your `profiles` table to identify the correct subscription to cancel. If this ID is missing or incorrect, the Stripe cancellation step might be skipped or fail.
-   **Idempotency:** 
    -   If the Stripe subscription is already canceled or doesn't exist, the script will note this and proceed.
    -   If the Supabase user is already deleted, the script will fail when trying to find the user initially.

### Security Note

This script requires both Supabase service role permissions and your Stripe secret key. These are highly sensitive credentials. Ensure they are stored securely, never committed to version control, and that this script is run only in trusted environments by authorized personnel. 