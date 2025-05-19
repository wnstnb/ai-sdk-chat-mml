# New User Signup and Pricing Flow

This document outlines the planned flow for new user signups, focusing on a single paid tier (with monthly or annual billing options) and a 7-day free trial, using Stripe for payments.

## User Flow: Paid Tier Signup with Trial

1.  **Landing Page Visit**:
    *   User arrives at the application's landing page (`app/page.tsx`).
    *   The page presents the value proposition. The primary Call to Action (CTA) will be the "Start Free Trial" button in the header navigation.

2.  **Initiate Signup**:
    *   User clicks the "Start Free Trial" button in the header of `app/page.tsx`.
    *   This action navigates the user to a dedicated signup page (e.g., `/signup`).

3.  **Provide Credentials**:
    *   User is directed to a signup form.
    *   User enters necessary information (e.g., email address, password).
    *   Form validation is performed client-side and server-side.

4.  **Select Billing Option**:
    *   After successful credential submission (or as part of the signup form), the user is presented with the choice of billing cycles:
        *   **Monthly**: Clearly described with its price and features.
        *   **Annual**: Clearly described with its price (discounted vs. monthly) and features.
    *   User selects either "Monthly" or "Annual".

5.  **Account Creation (Supabase)**:
    *   The backend receives the signup information and the selected billing cycle.
    *   A new user record is created in the Supabase `users` table (or your designated user table).
    *   The user record should include an indicator of their chosen billing cycle (e.g., a column `billing_cycle` set to `'monthly'` or `'annual'`).

6.  **Stripe Checkout & 7-Day Trial**:
    *   User is redirected to Stripe Checkout to enter payment details.
    *   The Stripe subscription is created with a 7-day free trial period (see "Stripe Setup for Trials" below).
    *   User is not charged until the trial ends. If the user cancels before the trial ends, no payment is taken.
    *   On successful subscription creation, the user is redirected to the main application dashboard or onboarding sequence.

7.  **Confirmation & Onboarding**:
    *   User receives a confirmation (e.g., an email if email verification is part of the flow).
    *   User is redirected to the main application dashboard or an onboarding sequence.

## Considerations and Best Practices for a Single Paid Tier with Trial

*   **Simplicity**: With only one paid tier (monthly or annual), the flow is straightforward. The trial is a strong incentive for users to try the product.
*   **Database Design**:
    *   In Supabase, add a column to your `users` table (or a related `profiles` table) to store the billing cycle (e.g., `billing_cycle` as `'monthly'` or `'annual'`).
    *   Optionally, store the Stripe subscription ID and trial end date for reference.
*   **Stripe Setup for Trials**:
    *   In your Stripe dashboard, create two products/plans: one for monthly, one for annual billing.
    *   When creating the price for each plan, set the trial period to 7 days (Stripe allows you to specify a trial period per price).
    *   When creating a subscription via the API or Checkout, ensure the trial period is set (either via the price or by passing `trial_period_days: 7` in the API call).
    *   Example (Stripe API):
        ```js
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId }],
          trial_period_days: 7,
        });
        ```
    *   If using Stripe Checkout, configure the price with a 7-day trial in the Stripe dashboard, and pass the price ID to Checkout.
*   **Upgrade Path**:
    *   If you later add more tiers, you can expand the billing options and database structure accordingly.
*   **Feature Gating**:
    *   All users are on the paid tier (with trial or active subscription). Application logic should check the user's subscription status and trial end date to enable/disable access as needed.

## Next Steps / Implementation Details

1.  **Landing Page Design (`app/page.tsx`) Modifications**:
    *   The existing "Get Started" button in the header navigation should be updated to "Start Free Trial" and link to the new signup page (e.g., `/signup`).
    *   The "Join Waitlist" form at the bottom of the page should be considered for removal or repurposing once direct signup is fully functional. For the initial MVP, it can remain, but the primary signup flow will be through the "Start Free Trial" button.
    *   Ensure the overall value proposition on the landing page encourages users to click "Start Free Trial". Detailed billing comparison will occur on the `/signup` page or a subsequent step.
2.  **New Signup Page (`/signup`) Creation**:
    *   This page will host the signup form (email, password) and the billing cycle selection UI, integrated into a single step.
    *   This page will be the single, centralized point for all new user registrations.
    *   The "Sign Up" link within any existing login modal (e.g., if a user clicks "Login" but doesn't have an account) should also redirect to this `/signup` page to ensure a consistent user experience.
    *   **Page Structure & Content:**
        *   **Headline:** Clear CTA (e.g., "Start your 7-day free trial").
        *   **Signup Form Fields:**
            *   Email address (required).
            *   Password (required, with confirmation or show/hide option).
            *   (Consider OAuth options for future iteration).
        *   **Integrated Billing Cycle Selection:** Presented as part of the same form:
            *   Visually distinct cards/sections for "Monthly" and "Annual" billing.
            *   **Monthly Card:** Title (e.g., "Monthly"), Price (e.g., "$X/month"), key features, selection mechanism (e.g., radio button/clickable card).
            *   **Annual Card:** Title (e.g., "Annual"), Price (e.g., "$Y/year"), key features, selection mechanism.
            *   An explicit choice for a billing cycle should be required (no pre-selection or a default pre-selection like "Monthly" can be considered).
        *   **Submit Button:** Single button (e.g., "Start Free Trial").
            *   Action: Creates user in Supabase Auth & `profiles` table with selected billing cycle.
            *   Redirects: To Stripe Checkout for payment details and trial setup.
        *   **Footer Links:** "Already have an account? Log In", Terms of Service, Privacy Policy.

3.  **Signup Form Details (Consolidated into step 2)**:
    *   (This section is now largely covered by the "Page Structure & Content" under "New Signup Page (`/signup`) Creation". We can remove redundant points if any).
    *   Validation: Client-side and server-side for email and password.

4.  **Billing Cycle Selection UI (Consolidated into step 2)**:
    *   (This section is now largely covered by the "Integrated Billing Cycle Selection" details above).
    *   Clear presentation of features and price for each billing option is paramount.

5.  **Supabase Setup**:
    *   Modify `users` (or `profiles`) table to include the `billing_cycle` column (e.g., `TEXT` type: 'monthly', 'annual').
    *   Optionally, add columns for `stripe_subscription_id` and `trial_end`.
    *   Set up Row Level Security (RLS) policies for user data.

6.  **Backend Logic**:
    *   API endpoint for user signup (e.g., `/api/auth/signup`).
    *   Logic to:
        *   Create user in Supabase Auth.
        *   Create a corresponding record in your public `users`/`profiles` table, including the selected billing cycle.
        *   Initiate Stripe Checkout session for the selected plan with a 7-day trial.
        *   Store the Stripe subscription ID and trial end date in the user's record.

7.  **Stripe Integration for Trial**:
    *   Create two Stripe prices (monthly and annual) with a 7-day trial period.
    *   Use Stripe Checkout or the API to create subscriptions with the trial.
    *   Handle webhooks for subscription status changes (e.g., trial ending, payment success/failure, cancellation).

## Is this the best way for a single paid tier with trial?

Yes, for an initial launch with a single paid tier (monthly or annual) and a 7-day trial, this approach is simple, user-friendly, and quick to implement. Stripe's built-in trial management makes it easy to handle the trial period and billing transitions. You can always evolve the system if you introduce more tiers or more complex billing logic later. The key is to make the initial `billing_cycle` and Stripe subscription fields in your database easy to query and update. 