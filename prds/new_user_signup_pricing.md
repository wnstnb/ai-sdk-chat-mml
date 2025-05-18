# New User Signup and Pricing Flow

This document outlines the planned flow for new user signups, focusing on the initial implementation with two tiers: Free and Paid.

## User Flow: Free Tier Signup

1.  **Landing Page Visit**:
    *   User arrives at the application's landing page (`app/page.tsx`).
    *   The page presents the value proposition. The primary Call to Action (CTA) will be the "Get Started" button in the header navigation.

2.  **Initiate Signup**:
    *   User clicks the "Get Started" button in the header of `app/page.tsx`.
    *   This action navigates the user to a dedicated signup page (e.g., `/signup`).

3.  **Provide Credentials**:
    *   User is directed to a signup form.
    *   User enters necessary information (e.g., email address, password).
    *   Form validation is performed client-side and server-side.

4.  **Tier Selection**:
    *   After successful credential submission (or as part of the signup form), the user is presented with the choice of tiers:
        *   **Free Tier**: Clearly described with its limitations/features.
        *   **Paid Tier**: Clearly described with its benefits/features and pricing.
    *   User selects the "Free Tier".

5.  **Account Creation (Supabase)**:
    *   The backend receives the signup information and the tier selection.
    *   A new user record is created in the Supabase `users` table (or your designated user table).
    *   The user record should include an indicator of their chosen tier (e.g., a column `account_tier` set to `'free'`).

6.  **Confirmation & Onboarding**:
    *   User receives a confirmation (e.g., an email if email verification is part of the flow).
    *   User is redirected to the main application dashboard or an onboarding sequence.

## Considerations and Best Practices for Two Tiers

This section addresses whether the proposed flow is the most effective for an application starting with two tiers.

*   **Simplicity**: For just two tiers (Free and Paid), the outlined flow is straightforward and efficient. Directly embedding the choice in the signup process is user-friendly.
*   **Database Design**:
    *   In Supabase, you can add a column to your `users` table (or a related `profiles` table if you follow Supabase best practices) to store the tier.
    *   Examples:
        *   A `text` column named `tier` with values like `'free'`, `'paid'`.
        *   An `enum` type (if your database setup supports it easily with Supabase) for `tier` for better data integrity.
        *   A `boolean` column like `is_premium` or `has_paid_tier`. For two tiers, this is very simple.
    *   For now, a `text` column `'tier'` or a boolean `is_premium` is likely sufficient.
*   **Scalability for Future Tiers**:
    *   If you anticipate adding more tiers or more complex subscription logic in the near future (e.g., different billing cycles, add-ons), you might consider a more robust setup from the start:
        *   A separate `subscriptions` table linked to the user.
        *   A `plans` or `tiers` table that defines the properties of each tier.
    *   However, for just two initial tiers, this adds complexity that might not be necessary yet. It's often better to start simple and refactor as needs evolve.
*   **Upgrade Path**:
    *   Consider the flow for a user upgrading from Free to Paid. This will involve:
        *   A clear CTA within the app for free users to upgrade.
        *   Integration with a payment processor (e.g., Stripe, Lemon Squeezy).
        *   Updating the user's `tier` status in Supabase upon successful payment.
*   **Feature Gating**:
    *   Your application logic will need to check the user's tier to enable/disable features accordingly. This check will typically query the `tier` status from the user's record in Supabase.

## Next Steps / Implementation Details

1.  **Landing Page Design (`app/page.tsx`) Modifications**:
    *   The existing "Get Started" button in the header navigation should be updated to link to the new signup page (e.g., `/signup`).
    *   The "Join Waitlist" form at the bottom of the page should be considered for removal or repurposing once direct signup is fully functional. For the initial MVP, it can remain, but the primary signup flow will be through the "Get Started" button.
    *   Ensure the overall value proposition on the landing page encourages users to click "Get Started". Detailed tier comparison will occur on the `/signup` page or a subsequent step.
2.  **New Signup Page (`/signup`) Creation**:
    *   This page will host the signup form (email, password) and the tier selection UI, integrated into a single step.
    *   This page will be the single, centralized point for all new user registrations.
    *   The "Sign Up" link within any existing login modal (e.g., if a user clicks "Login" but doesn't have an account) should also redirect to this `/signup` page to ensure a consistent user experience.
    *   **Page Structure & Content:**
        *   **Headline:** Clear CTA (e.g., "Create your Tuon Account").
        *   **Signup Form Fields:**
            *   Email address (required).
            *   Password (required, with confirmation or show/hide option).
            *   (Consider OAuth options for future iteration).
        *   **Integrated Tier Selection:** Presented as part of the same form:
            *   Visually distinct cards/sections for "Free Tier" and "Paid Tier".
            *   **Free Tier Card:** Title (e.g., "Free"), Price ("$0/month"), key features/limitations, selection mechanism (e.g., radio button/clickable card).
            *   **Paid Tier Card:** Title (e.g., "Pro"), Price (e.g., "$X/month"), key benefits, selection mechanism.
            *   An explicit choice for a tier should be required (no pre-selection or a default pre-selection like "Free" can be considered).
        *   **Submit Button:** Single button (e.g., "Create Account", "Sign Up").
            *   Action: Creates user in Supabase Auth & `profiles` table with selected tier.
            *   Redirects: To dashboard/onboarding (if Free) or to payment flow (if Paid).
        *   **Footer Links:** "Already have an account? Log In", Terms of Service, Privacy Policy.

3.  **Signup Form Details (Consolidated into step 2)**:
    *   (This section is now largely covered by the "Page Structure & Content" under "New Signup Page (`/signup`) Creation". We can remove redundant points if any).
    *   Validation: Client-side and server-side for email and password.

4.  **Tier Selection UI (Consolidated into step 2)**:
    *   (This section is now largely covered by the "Integrated Tier Selection" details above).
    *   Clear presentation of features and price for each tier is paramount.

5.  **Supabase Setup**:
    *   Modify `users` (or `profiles`) table to include the `tier` column (e.g., `TEXT` type: 'free', 'paid', or `BOOLEAN` type: `is_premium`).
    *   Set up Row Level Security (RLS) policies for user data.

6.  **Backend Logic**:
    *   API endpoint for user signup (e.g., `/api/auth/signup`).
    *   Logic to:
        *   Create user in Supabase Auth.
        *   Create a corresponding record in your public `users`/`profiles` table, including the selected tier.

7.  **Paid Tier (Future)**:
    *   Choose and integrate a payment processor.
    *   Webhook handling for subscription status changes.

## Is this the best way for two tiers?

Yes, for an initial launch with just two tiers, this approach is generally the best because:

*   **Low Complexity**: It's easy to implement and understand.
*   **User Experience**: The choice is presented upfront, which is transparent for the user.
*   **Development Speed**: Allows for quicker initial development to get your MVP out.

You can always evolve the system if you introduce more tiers or more complex billing logic later. The key is to make the initial `tier` field in your database easy to query and update. 