# Specification: Strategy 1 - New User Signup & Pricing Flow

## 1. Overview

This document specifies the requirements for implementing the new user signup and pricing flow. The strategy focuses on a single paid tier (with monthly or annual billing options) and a 7-day free trial, utilizing Stripe for payment processing.

## 2. User Flow

1.  **Landing Page Visit**:
    *   User arrives at `app/page.tsx`.
    *   Primary CTA: "Start Free Trial" button in the header.
2.  **Initiate Signup**:
    *   User clicks "Start Free Trial".
    *   User navigates to `/signup`.
3.  **Provide Credentials & Select Billing**:
    *   User enters email and password on the `/signup` page.
    *   User selects a billing cycle (Monthly or Annual) on the same page.
    *   Client-side and server-side validation is performed.
4.  **Account Creation (Supabase)**:
    *   Backend receives signup info and billing cycle.
    *   New user record created in Supabase (e.g., `users` or `profiles` table) with `billing_cycle` (`'monthly'` or `'annual'`).
5.  **Stripe Checkout & 7-Day Trial**:
    *   User redirected to Stripe Checkout.
    *   Stripe subscription created with a 7-day free trial. No charge until trial ends.
    *   Cancellation before trial end prevents any charge.
    *   Successful subscription creation redirects user to the application dashboard or onboarding.
6.  **Confirmation & Onboarding**:
    *   User receives confirmation (e.g., email).
    *   User accesses the main application.

## 3. Detailed Implementation Steps

### 3.1. Landing Page Modifications (`app/page.tsx`)

*   **Header Navigation**:
    *   Update the existing "Get Started" button to "Start Free Trial".
    *   Link this button to the new signup page: `/signup`.
*   **"Join Waitlist" Form**:
    *   Consider removal or repurposing. For MVP, it can remain, but the "Start Free Trial" button is the primary signup path.
*   **Content**:
    *   Ensure the value proposition clearly encourages trial signups. Detailed billing comparison will be on `/signup`.

### 3.2. New Signup Page (`/signup`) Creation

*   **Purpose**: Centralized page for all new user registrations.
*   **Redirects**:
    *   The "Sign Up" link in any existing login modal should redirect to `/signup`.
*   **Page Structure & Content**:
    *   **Headline**: Clear CTA (e.g., "Start your 7-day free trial").
    *   **Signup Form Fields**:
        *   Email address (required).
        *   Password (required, with confirmation or show/hide option).
    *   **Integrated Billing Cycle Selection**:
        *   Visually distinct cards/sections for "Monthly" and "Annual" billing.
        *   **Monthly Card**: Title (e.g., "Monthly"), Price (e.g., "$X/month"), key features, selection mechanism (e.g., radio button/clickable card).
        *   **Annual Card**: Title (e.g., "Annual"), Price (e.g., "$Y/year" - showing discount vs. monthly), key features, selection mechanism.
        *   Explicit choice required (default pre-selection like "Monthly" can be considered).
    *   **Submit Button**: Single button (e.g., "Start Free Trial").
        *   **Action**: Creates user in Supabase Auth & `profiles` table (or equivalent) with the selected billing cycle.
        *   **Redirects**: To Stripe Checkout for payment details and trial setup.
    *   **Footer Links**: "Already have an account? Log In", Terms of Service, Privacy Policy.
*   **Validation**:
    *   Client-side and server-side for email and password.

### 3.3. Supabase Setup

*   **Database Schema**:
    *   Modify `users` table (or a related `profiles` table) to include:
        *   `billing_cycle`: `TEXT` (values: `'monthly'`, `'annual'`).
        *   `stripe_customer_id`: `TEXT` (nullable, to store Stripe Customer ID).
        *   `stripe_subscription_id`: `TEXT` (nullable).
        *   `subscription_status`: `TEXT` (e.g., `'trialing'`, `'active'`, `'canceled'`, `'past_due'`).
        *   `trial_start_date`: `TIMESTAMP WITH TIME ZONE` (nullable).
        *   `trial_end_date`: `TIMESTAMP WITH TIME ZONE` (nullable).
        *   `current_period_end`: `TIMESTAMP WITH TIME ZONE` (nullable, when the current subscription period ends/renews).
*   **Row Level Security (RLS)**:
    *   Implement appropriate RLS policies for user data protection.

### 3.4. Backend Logic

*   **API Endpoint**: Create an API endpoint for user signup (e.g., `/api/auth/signup`).
*   **Functionality**:
    1.  Receive email, password, and chosen `billing_cycle` from the `/signup` page.
    2.  Validate input.
    3.  Create user in Supabase Auth.
    4.  If Supabase Auth user creation is successful, create a corresponding record in the public `users`/`profiles` table, storing the `billing_cycle`.
    5.  Create a Stripe Customer if one doesn't exist for the email. Store `stripe_customer_id`.
    6.  Initiate a Stripe Checkout session:
        *   Pass the `stripe_customer_id`.
        *   Pass the Price ID for the selected billing cycle (configured with a 7-day trial in Stripe).
        *   Set `success_url` (e.g., to `/dashboard?session_id={CHECKOUT_SESSION_ID}`) and `cancel_url` (e.g., back to `/signup` or `/pricing`).
    7.  Return the Stripe Checkout session ID to the client for redirection.
*   **Webhook Handler**: Create an API endpoint to handle Stripe webhooks (e.g., `/api/stripe-webhooks`).
    *   **Events to Handle**:
        *   `checkout.session.completed`:
            *   Retrieve subscription details.
            *   Update user record with `stripe_subscription_id`, `subscription_status` (e.g., `'trialing'`), `trial_start_date`, `trial_end_date`, and `current_period_end`.
        *   `customer.subscription.updated`:
            *   Update `subscription_status`, `trial_end_date` (if trial converts to active), `current_period_end`.
        *   `customer.subscription.deleted`:
            *   Update `subscription_status` to `'canceled'`.
        *   `invoice.payment_succeeded`:
            *   Confirm active subscription, update `current_period_end`.
        *   `invoice.payment_failed`:
            *   Update `subscription_status` to `'past_due'` or similar. Implement retry logic notifications if necessary.

### 3.5. Stripe Integration

*   **Stripe Dashboard Setup**:
    *   Create two Products: one for the service, offered monthly, and one for the service, offered annually.
    *   For each Product, create a Price.
    *   Configure each Price with a 7-day trial period directly in the Stripe dashboard.
    *   Note the Price IDs for use in the backend.
*   **Checkout**:
    *   Use Stripe Checkout for collecting payment details and starting the trial subscription.
    *   Ensure the trial period is correctly applied (usually by selecting the Price pre-configured with a trial).
*   **Webhooks**:
    *   Set up a webhook endpoint in Stripe pointing to your backend webhook handler (`/api/stripe-webhooks`).
    *   Subscribe to necessary events (see Backend Logic section).

## 4. Success Criteria

*   A new user can visit the landing page and click "Start Free Trial".
*   User is directed to the `/signup` page.
*   User can successfully enter their email and password.
*   User can select either a monthly or annual billing plan.
*   Upon submission, a user account is created in Supabase Auth and a corresponding profile/user record is created with the selected billing cycle.
*   User is redirected to Stripe Checkout.
*   User can enter payment details (but is not charged immediately).
*   A 7-day trial subscription is created in Stripe.
*   User's record in the database is updated with Stripe customer ID, subscription ID, trial start/end dates, and status.
*   User is redirected to the application dashboard after successful Stripe interaction.
*   User receives a confirmation of trial start.
*   User can use the application during the 7-day trial.
*   If the user cancels within 7 days, they are not charged.
*   If the user does not cancel, they are automatically charged the selected plan's price after 7 days.
*   Stripe webhooks correctly update the user's subscription status in the database (e.g., trial ending, payment success/failure, cancellation).

## 5. Out of Scope / Future Considerations

*   **OAuth Signups** (e.g., Google, GitHub): To be considered for a future iteration.
*   **Multiple Paid Tiers/Freemium Model**: This spec focuses on a single paid tier with a trial.
*   **Advanced Coupon/Discount Code System**: Basic trial is covered; complex promo codes are out of scope for this initial implementation.
*   **Team/Organization Accounts**: Focus is on individual user signups.
*   **Detailed Usage-Based Billing**: The current model is flat-rate monthly/annually.
*   **In-app Subscription Management UI** (e.g., cancel, update payment method, switch plans): While webhooks will handle status, a full UI for users to manage their subscription from within the app is a future enhancement. Users would initially manage via Stripe's customer portal or by contacting support.
*   **Email Verification Flow**: While mentioned as a possibility for confirmation, the detailed implementation of a mandatory email verification step before trial activation is not detailed here but should be considered for security. 