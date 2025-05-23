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