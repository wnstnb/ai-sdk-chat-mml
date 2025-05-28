# How Auth Should Work
## Signup Flow
### Email/Password Flow
1. User navigates to /signup
2. User enters email/password
3. User selects plan
4. User clicks button to Start 7-Day Trial (then starts the confirmation->redirect from Stripe)

### Social Login Flow
1. User navigates to /signup
2. User clicks either Google or Github
3. User gets directed to Auth through these providers, probably through popup
4. User successfully authenticates. Popup closes.
5. Visual indicator on button shows successful authentication
6. User selects plan
7. User clicks button to Start 7-Day Trial (then starts the confirmation->redirect from Stripe)

## Login Flow
### Password Flow
1. User navigates to /login
2. User enters email and password
3. User clicks login
4. User gets redirected to /launch

### Social Login
1. User navigates to /login
2. User clicks either Google or GitHub
3. User authenticates successfully
4. User gets redirected to /launch

### OTP Login (This works fine, no changes needed)
1. User navigates to /login
2. User clicks OTP tab
3. User enters email and clicks get OTP
4. User receives OTP and puts code in.
5. User logs in and gets redirected to /launch

## Implementation Steps

This section details the step-by-step instructions to implement the revised authentication flow, particularly focusing on the social signup process that requires plan selection and Stripe integration *after* social authentication but *before* final redirection.

### Frontend Changes (`app/signup/page.tsx`)

1.  **Modify Social Authentication Redirect Strategy:**
    *   **Objective:** Ensure that after a user authenticates with a social provider (Google/GitHub) on the signup page, they are redirected back to the signup page to complete plan selection, rather than directly to `/launch`.
    *   **Action:**
        *   In `app/signup/page.tsx`, locate the `<Auth>` component from `@supabase/auth-ui-react` used for social logins.
        *   Modify its `redirectTo` prop.
            *   Current (example pattern): `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=/launch`
            *   New: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=/signup?social_auth_pending=true`

2.  **Handle Post-Social Authentication State on Signup Page:**
    *   **Objective:** Detect when a user returns to the signup page after successful social authentication and update the UI and component state accordingly.
    *   **Action:**
        *   In `app/signup/page.tsx`, use a `useEffect` hook (triggered by router query params like `social_auth_pending`).
        *   If `social_auth_pending=true` is present:
            *   Verify active Supabase session: `const { data: { session } } = await supabase.auth.getSession();`.
            *   If session exists:
                *   Store `sociallyAuthenticatedUser = { email: session.user.email, id: session.user.id, provider: session.user.app_metadata.provider }`.
                *   Update UI:
                    *   Display message: "Successfully authenticated via [Provider] as [user.email]. Please choose your plan."
                    *   Change the specific social login button used (e.g., "Sign up with Google") to "Authenticated with Google ✓" and disable it. Disable other social login buttons.
                    *   Hide/disable email/password fields.
                    *   Ensure plan selection UI is active.
                *   Remove `social_auth_pending` from URL (e.g., `router.replace('/signup', undefined, { shallow: true })`).
            *   Else (no session), handle error.

3.  **Adapt "Start Free 7-Day Trial" Button Logic:**
    *   **Objective:** Modify `handleSubmit` for socially authenticated users.
    *   **Action:**
        *   In `handleSubmit`:
            *   If `sociallyAuthenticatedUser` state is populated:
                *   Retrieve `userId`, `email` from this state.
                *   **Skip local user creation call.**
                *   Call a new backend endpoint (e.g., `/api/auth/complete-social-signup`) with `{ selectedBillingCycle }`. The backend will derive `userId` and `email` from the authenticated session.
                    ```javascript
                    // const { userId, email } = sociallyAuthenticatedUser; // Not sent from client anymore
                    // const priceId = STRIPE_PRICE_IDS[selectedBillingCycle]; 

                    const response = await fetch('/api/auth/complete-social-signup', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        // userId, // Not sent from client
                        // email, // Not sent from client
                        billingCycle: selectedBillingCycle 
                      }),
                    });
                    const sessionData = await response.json();
                    if (!response.ok) throw new Error(sessionData.error);
                    // Redirect to Stripe using sessionData.sessionId
                    // ...
                    ```
            *   Else (Email/Password Signup): Current logic applies (call `/api/auth/signup-user`, then `/api/stripe/create-checkout-session`).
        *   **Error Handling for Stripe Redirect Failure:** If `stripe.redirectToCheckout` fails (for any signup type), display a clear message like "We couldn't connect to our payment system to start your trial. Please try again." The "Start Free 7-Day Trial" button should remain active for retry.

### Backend API Changes

1.  **New Endpoint: `/api/auth/complete-social-signup`**
    *   **Objective:** For socially authenticated users, update their profile with the selected billing cycle and then create a Stripe Checkout session for trial initiation. Relies on server-side session for user identification.
    *   **Actions (in a `POST` handler):**
        *   Receive `billingCycle` from the request body.
        *   **Identify User from Session:**
            *   Create a Supabase server-side client using request cookies/auth headers.
            *   Fetch the authenticated user: `const { data: { user }, error: authError } = await supabase.auth.getUser();`
            *   If `authError` or no `user`, return a 401 Unauthorized error.
            *   Use `user.id` and `user.email` for subsequent operations.
        *   **Update Profile:** Use the Supabase service role client (or the server-side client if it has sufficient privileges for 'profiles') to update the `profiles` table for `user.id`.
            ```javascript
            // const supabaseService = createSupabaseServiceRoleClient();
            // const { error: profileError } = await supabaseService
            //   .from('profiles')
            //   .update({ 
            //     billing_cycle: billingCycle,
            //     email: user.email, 
            //     updated_at: new Date().toISOString() 
            //   })
            //   .eq('id', user.id);
            // if (profileError) throw new Error(`Failed to update profile: ${profileError.message}`);
            ```
        *   **Create Stripe Checkout Session:**
            *   Determine `priceId` from `billingCycle`.
            *   Use `stripe.checkout.sessions.create` with:
                *   `customer_email: user.email`
                *   `client_reference_id: user.id` (Crucial for webhook mapping)
                *   `success_url: '${process.env.NEXT_PUBLIC_SITE_URL}/launch?signup=success'` (or similar)
                *   `cancel_url: '${process.env.NEXT_PUBLIC_SITE_URL}/signup?stripe_cancel=true'`
                *   `subscription_data: { trial_period_days: 7 }`
            *   Return `{ sessionId: stripeSession.id }`.

2.  **Existing Endpoint: `/api/auth/signup-user/route.ts` (Email/Password)**
    *   **Confirmation:** This endpoint uses `supabase.auth.signUp()`. The existing `handle_new_user` trigger in Supabase then automatically creates a corresponding entry in the `profiles` table. Subsequently, this API endpoint updates the newly created profile with the `billing_cycle`. This flow remains for email/password signups.
    *   The client will still call `/api/stripe/create-checkout-session` *after* this, as per the current `app/signup/page.tsx` logic for email/password. This could potentially be streamlined in the future so `/api/auth/signup-user` also returns the Stripe session ID, but for now, we focus on social signup changes.

3.  **Existing Endpoint: `/api/stripe/create-checkout-session`**
    *   This will primarily serve the email/password flow for now, as `/api/auth/complete-social-signup` handles Stripe session creation for social signups.
    *   Ensure it correctly sets `client_reference_id: userId` and `subscription_data: { trial_period_days: 7 }`.

4.  **Supabase Trigger: `handle_new_user` (Verified)**
    *   **Status:** Verified to exist and be active.
    *   **Function:** This trigger automatically creates a new entry in the `public.profiles` table (populating `id` from `auth.users.id` and `email` from `auth.users.email`) whenever a new user is added to `auth.users`. This applies to users created via email/password signup, social logins, or any other method that results in a new `auth.users` record.
    *   **Impact:** This is essential for both the email/password and social signup flows, ensuring a profile record exists before attempting to update it with `billing_cycle` or other details.

5.  **Stripe Webhook Handling (`/api/stripe/webhook`):**
    *   **Objective:** Robustly update user subscription status based on Stripe events.
    *   **Action:** Ensure the webhook handler for `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, etc., uses `client_reference_id` (which is the Supabase `userId`) to update the relevant user's record in your `profiles` table (or a dedicated `subscriptions` table) with their current plan, subscription status, trial end, period end, etc.

## Open Questions & Clarifications (Updated with Answers/Decisions)

1.  **User Profile/Data Synchronization for Social Signups:**
    *   **Q:** Do you maintain a separate public `profiles` table...? Does `/api/auth/signup-user` handle its creation/update?
    *   **A (Verified):** Yes, a `profiles` table is used. The active Supabase trigger `handle_new_user` automatically creates the profile entry (with `id` and `email`) upon `auth.users` insert. The `/api/auth/signup-user` endpoint *updates* this profile with `billing_cycle`.
    *   **Plan:** Social signups will also trigger `handle_new_user`. The new `/api/auth/complete-social-signup` endpoint will update the profile with `billing_cycle` for these users.

2.  **State Management for Partially Completed Social Signup:**
    *   **Q:** User authenticates socially, returns to `/signup`, but abandons before plan selection/payment. What happens if they later log in?
    *   **A/Plan:**
        *   If a user logs in (via `/login`) and their `profiles` record lacks a `billing_cycle` (or similar marker like `signup_completed = false`):
            *   Redirect them from `/login` success path to `/signup?step=complete_plan_selection`.
        *   The `/signup` page, when `step=complete_plan_selection` is detected (and user is authenticated):
            *   Fetch user email from session.
            *   Display: "Welcome back, [user.email]! Please complete your signup by selecting a plan to start your trial."
            *   Show only plan selection UI and the "Start Free 7-Day Trial" button.
            *   Hide email/password fields and social login buttons.
            *   The "Start Free 7-Day Trial" button will call `/api/auth/complete-social-signup` (as the user is already a Supabase auth user).

3.  **Details of `/api/auth/signup-user`:**
    *   **Q:** What does it do? Admin SDK or proxy? Other actions?
    *   **A (from analysis & trigger confirmation):** Uses `supabase.auth.signUp()` with service role. The `handle_new_user` trigger creates the profile; this endpoint then updates that profile with `billing_cycle`.
    *   **Plan:** No change needed to this endpoint for now, but its role and dependency on the trigger are clear.

4.  **`/auth/callback` Route Behavior:**
    *   **Q:** Default Supabase handling or custom logic?
    *   **A/Plan:** Assume default Supabase behavior for now. The `next=/signup?social_auth_pending=true` parameter will be passed through by Supabase to the final redirect URL.

5.  **Visual Indicator on Social Login Buttons:**
    *   **Q:** Button itself changes or general message?
    *   **A:** Button itself should change (e.g., "Authenticated with Google ✓") and be disabled. A general status message ("Authenticated as [user.email]. Please select your plan.") will also be shown. (Covered in Frontend Step 2.2.iv.b & a)

6.  **Error Handling for Stripe Redirect Failure:**
    *   **Q:** User has signed up and selected plan, but Stripe redirect fails. Users get a free 7-day trial.
    *   **A:** The "payment" is setting up the trial subscription. If `stripe.redirectToCheckout` fails, the user is on `/signup`, socially authenticated (if social), plan selected (in state). Their `profiles.billing_cycle` is NOT yet updated.
    *   **Plan:** Display clear error: "We couldn't connect to our payment system to start your trial. Please try again." "Start Trial" button remains active for retry. (Covered in Frontend Step 3.3)
